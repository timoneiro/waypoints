import { compact, sameContent } from './actions'
import { db, newId, nowISO } from './db'
import type { AttachableTable, Attachment, AttachmentKind, OutboxEntry } from './types'

/*
 * Photos and documents. Their records are written here rather than in actions.ts: they go in the
 * outbox for the sync server, but never in the unsent list, since links don't carry them. Private
 * ones (kept only on this phone) go in neither.
 *
 * Their files are in db.files, apart from the records. A file is removed only with its attachment
 * (deleted here, or by someone else: see dropDeletedFiles) or with the whole trip.
 */

/** A file ready to add: a photo already made smaller, or a document as it is (see src/lib/files.ts). */
export interface NewFile {
  kind: AttachmentKind
  name: string
  type: string
  blob: Blob
  thumb?: Blob
  sha256: string
  width?: number
  height?: number
  takenAt?: string
}

/** What an attachment belongs to: one of the trip's items, or the whole trip (none). */
export interface AttachedTo {
  itemTable?: AttachableTable
  itemId?: string
  /** For a journey: also for the other journeys on its booking. */
  wholeBooking?: boolean
}

/** Where an attachment goes, as its record's fields: all three, so a move clears what no longer applies. */
const placed = (to: AttachedTo | undefined) =>
  to?.itemTable && to.itemId
    ? { itemTable: to.itemTable, itemId: to.itemId, wholeBooking: (to.itemTable === 'transports' && to.wholeBooking) || undefined }
    : { itemTable: undefined, itemId: undefined, wholeBooking: undefined }

/** The outbox entry an attachment needs: none if it stays on this phone. */
const outboxFor = (a: Attachment): OutboxEntry[] => (a.private ? [] : [{ table: 'attachments', id: a.id, tripId: a.tripId }])

export async function addAttachments(
  tripId: string,
  files: NewFile[],
  options: { to?: AttachedTo; private?: boolean; addedBy?: string; caption?: string } = {},
): Promise<string[]> {
  const now = nowISO()
  const records = files.map((f) =>
    compact<Attachment>({
      id: newId(),
      tripId,
      createdAt: now,
      updatedAt: now,
      kind: f.kind,
      name: f.name,
      caption: options.caption,
      type: f.type,
      size: f.blob.size,
      sha256: f.sha256,
      width: f.width,
      height: f.height,
      takenAt: f.takenAt,
      ...placed(options.to),
      addedBy: options.addedBy,
      private: options.private || undefined,
    }),
  )
  await db.transaction('rw', db.attachments, db.files, db.outbox, async () => {
    await db.attachments.bulkAdd(records)
    await db.files.bulkAdd(records.map((r, i) => compact({ id: r.id, tripId, blob: files[i].blob, thumb: files[i].thumb })))
    await db.outbox.bulkPut(records.flatMap(outboxFor))
  })
  return records.map((r) => r.id)
}

/** Renames it, changes its caption, or moves it to another item (or to the whole trip, or a whole booking). */
export async function updateAttachment(id: string, changes: { name: string; caption?: string } & AttachedTo) {
  await db.transaction('rw', db.attachments, db.outbox, async () => {
    const existing = await db.attachments.get(id)
    if (!existing || existing.deletedAt) return
    const next = compact<Attachment>({ ...existing, name: changes.name, caption: changes.caption, ...placed(changes), updatedAt: nowISO() })
    if (sameContent(next, existing)) return
    await db.attachments.put(next)
    await db.outbox.bulkPut(outboxFor(next))
  })
}

/** Deletes it for everyone (a tombstone that syncs), and its file from this phone. */
export async function deleteAttachment(id: string) {
  await db.transaction('rw', db.attachments, db.files, db.outbox, async () => {
    const existing = await db.attachments.get(id)
    if (!existing || existing.deletedAt) return
    const now = nowISO()
    await db.attachments.put({ ...existing, deletedAt: now, updatedAt: now })
    await db.files.delete(id)
    await db.outbox.bulkPut(outboxFor(existing))
  })
}

/** A private one is shared with the trip from now on: it goes up with the next sync. */
export async function shareAttachment(id: string) {
  await db.transaction('rw', db.attachments, db.outbox, async () => {
    const existing = await db.attachments.get(id)
    if (!existing || existing.deletedAt || !existing.private) return
    const next = compact<Attachment>({ ...existing, private: undefined, updatedAt: nowISO() })
    await db.attachments.put(next)
    await db.outbox.bulkPut(outboxFor(next))
  })
}

/**
 * Keeps a shared one only on this phone: it's deleted for everyone else (and from the server), and
 * this phone keeps a private copy under a new id, since a deleted record can't come back. Needs the
 * file on this phone. Returns the copy's id.
 */
export async function keepOnlyHere(id: string): Promise<string | undefined> {
  return db.transaction('rw', db.attachments, db.files, db.outbox, async () => {
    const existing = await db.attachments.get(id)
    const file = await db.files.get(id)
    if (!existing || existing.deletedAt || existing.private || !file?.blob) return undefined
    const now = nowISO()
    const copy: Attachment = { ...existing, id: newId(), updatedAt: now, private: true }
    await db.attachments.put({ ...existing, deletedAt: now, updatedAt: now })
    await db.attachments.add(copy)
    await db.files.delete(id)
    await db.files.add(compact({ id: copy.id, tripId: copy.tripId, blob: file.blob, thumb: file.thumb }))
    await db.outbox.bulkPut(outboxFor(existing))
    return copy.id
  })
}

/** After merging records from elsewhere: the files of attachments deleted there go too. Include db.files in the transaction. */
export async function dropDeletedFiles(attachments: Attachment[]) {
  const deleted = attachments.filter((a) => a.deletedAt).map((a) => a.id)
  if (deleted.length) await db.files.bulkDelete(deleted)
}
