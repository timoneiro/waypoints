import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/src/app.ts'
import { loadConfig, type Config } from '../../server/src/config.ts'
import { Store } from '../../server/src/store.ts'
import { emptyTables } from '../db/types.ts'
import { buildReport, readReport, reportId } from '../domain/report.ts'
import { reviewId } from '../domain/reviews.ts'
import type { Credentials, SyncResponse, TripChanges } from '../domain/serverProtocol.ts'
import { attachment, FILE, FILE_SHA256 } from '../test/fixtures.ts'

/*
 * End to end: the app's real sync client (on fake IndexedDB) against the real server. This phone is
 * Max's, the server's admin; Ana's phone talks to the server directly.
 */

let dir: string
let url: string
let config: Config
let store: Store
let close: () => void

beforeAll(async () => {
  await Dexie.delete('waypoints')
  dir = await mkdtemp(join(tmpdir(), 'waypoints-sync-'))
  config = await loadConfig({ DATA_DIR: dir })
  store = new Store(dir)
  await store.load()
  const server = createApp(config, store).listen(0)
  await new Promise((r) => server.once('listening', r))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  close = () => server.close()
})

afterAll(async () => {
  close()
  await rm(dir, { recursive: true, force: true })
})

async function post<T>(path: string, body: object, token?: string): Promise<T> {
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return (await res.json()) as T
}

const tripInput = { name: 'Lisbon & Porto', startDate: '2027-03-10', endDate: '2027-03-13', timeZone: 'Europe/Lisbon', currency: 'EUR' }
const later = (seconds = 1) => new Date(Date.now() + seconds * 1000).toISOString()

describe('sync client ↔ server', async () => {
  const { db, getSetting, SETTINGS } = await import('../db/db')
  const { createTrip, moveTripToServer, saveRecord, saveReport, saveReview, updateTrip } = await import('../db/actions')
  const { applyMerge, readTables } = await import('../db/backupIO')
  const { getServerConfig, setServerConfig } = await import('../db/serverState')
  const { runSync, SyncError } = await import('./client')
  const { createInvite, forgetServer, joinWithServerCode, leaveTrip, parseInvite } = await import('./account')
  const { addAttachments, deleteAttachment } = await import('../db/attachments')
  const { fetchFull, runFileSync } = await import('./files')

  let ana: Credentials
  let anaCursor = 0
  /** Ana's phone: sends changes to a trip, and gets back what changed. */
  const anaSync = async (trips: TripChanges[] = []) => post<SyncResponse>('/api/sync', { trips }, ana.token)
  const serverTrip = (id: string) => store.data.trips[id]
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])
  const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
  const anaGet = (id: string) => fetch(`${url}/api/files?trip=${onServer}&id=${id}`, { headers: { Authorization: `Bearer ${ana.token}` } })
  const anaPost = async (id: string, bytes: Uint8Array, thumb = false) => {
    const res = await fetch(`${url}/api/files?trip=${onServer}&id=${id}${thumb ? '&thumb=1' : ''}`, { method: 'POST', headers: { Authorization: `Bearer ${ana.token}` }, body: bytes as BodyInit })
    if (!res.ok) throw new Error(`upload: ${res.status} ${await res.text()}`)
  }
  const me = async () => (await getServerConfig())!.member

  let phoneOnly: string
  let onServer: string

  it('connects the admin without touching the trips already on the phone', async () => {
    phoneOnly = await createTrip({ ...tripInput, name: 'Japan' }, [{ name: 'Max' }, { name: 'Ana' }])
    await expect(joinWithServerCode(url, 'WRONG-CODE-0000', { name: 'Max' }, 'Pixel')).rejects.toBeInstanceOf(SyncError)
    expect(await getServerConfig()).toBeUndefined()

    await joinWithServerCode(url, config.serverCode, { name: 'Max' }, 'Pixel')
    const cfg = (await getServerConfig())!
    expect(cfg.member).toMatchObject({ name: 'Max', admin: true })
    expect(cfg.lastSyncAt).toBeDefined()
    expect(await db.snapshots.count()).toBe(1)
    // Phone-only trips stay on the phone until someone puts them on the server.
    expect(store.data.trips).toEqual({})
    expect(await db.trips.get(phoneOnly)).toBeDefined()
  })

  it("shows the server's reason when it turns a Google Maps link away", async () => {
    const { lookUpGoogleMaps } = await import('./googleMaps')
    await expect(lookUpGoogleMaps('https://example.com/maps')).rejects.toThrow("That's not a Google Maps link.")
  })

  it('invites Ana with a link', async () => {
    const invite = await createInvite()
    expect(parseInvite(`Join me on waypoints: ${invite.link}`)).toEqual({ code: invite.code, server: url })
    ana = await post<Credentials>('/api/register', { inviteCode: invite.code, name: 'Ana', deviceLabel: 'iPhone' })
    await runSync()
    expect((await getServerConfig())!.members.map((m) => m.name)).toEqual(['Ana', 'Max'])
  })

  it('creates a trip on the server that reaches Ana by itself', async () => {
    onServer = await createTrip(tripInput, [{ name: 'Max', memberId: (await me()).id }, { name: 'Ana', memberId: ana.member.id }, { name: 'Dee' }], { onServer: true })
    await saveRecord('stays', onServer, { name: 'Casa Azul', kind: 'apartment', checkInDate: '2027-03-10', checkOutDate: '2027-03-12', timeZone: 'Europe/Lisbon' })
    await runSync()

    expect(await db.serverTrips.get(onServer)).toMatchObject({ uploaded: true, cursor: 5 })
    expect(await db.outbox.where('tripId').equals(onServer).count()).toBe(0)
    // Dee isn't on the server: the trip still has changes to send her in a link.
    expect(await db.unsent.where('tripId').equals(onServer).count()).toBe(5)

    const res = await anaSync()
    const forAna = res.trips.find((t) => t.id === onServer)!
    expect(forAna.records.stays).toHaveLength(1)
    expect(res.trips.map((t) => t.id)).toEqual([onServer])
    anaCursor = forAna.cursor
  })

  it("brings Ana's changes in, without counting them as this phone's", async () => {
    const [stay] = (await readTables(onServer)).stays
    const res = await anaSync([{ id: onServer, cursor: anaCursor, records: { stays: [{ ...stay, name: 'Casa Verde', updatedAt: later() }] } }])
    anaCursor = res.trips[0].cursor
    await db.unsent.clear()

    await runSync()
    expect((await db.stays.get(stay.id))!.name).toBe('Casa Verde')
    expect(await db.outbox.where('tripId').equals(onServer).count()).toBe(0)
    expect(await db.unsent.count()).toBe(0)
  })

  it("sends this phone's reviews, and brings in Ana's next to them", async () => {
    const [stay] = (await readTables(onServer)).stays
    const travellers = await db.travellers.where('tripId').equals(onServer).toArray()
    const max = travellers.find((t) => t.name === 'Max')!
    const anaT = travellers.find((t) => t.name === 'Ana')!
    await saveReview(onServer, { table: 'stays', id: stay.id }, max.id, { stars: 4, note: 'Good beds' })
    await runSync()
    expect(Object.values(serverTrip(onServer).records.reviews ?? {}).map((s) => s.rec)).toMatchObject([{ by: max.id, stars: 4, note: 'Good beds' }])

    const anas = { id: await reviewId(onServer, stay.id, anaT.id), tripId: onServer, itemTable: 'stays', itemId: stay.id, by: anaT.id, missed: true, createdAt: later(), updatedAt: later() }
    const res = await anaSync([{ id: onServer, cursor: anaCursor, records: { reviews: [anas] } }])
    expect(res.rejected).toEqual([])
    expect(res.trips[0].records.reviews).toMatchObject([{ by: max.id, stars: 4 }])
    anaCursor = res.trips[0].cursor

    await runSync()
    const here = await db.reviews.where('tripId').equals(onServer).toArray()
    expect(here.map((r) => r.by).sort()).toEqual([anaT.id, max.id].sort())
    expect(here.find((r) => r.by === anaT.id)).toMatchObject({ missed: true })
    expect(await db.outbox.where('tripId').equals(onServer).count()).toBe(0)
  })

  it("keeps this phone's trip report for everyone, and brings in the one Ana makes again", async () => {
    const tables = await readTables(onServer)
    const max = tables.travellers.find((t) => t.name === 'Max')!
    const anaT = tables.travellers.find((t) => t.name === 'Ana')!
    const names = new Map(tables.travellers.map((t) => [t.id, t.name]))
    const made = buildReport({ ...tables, trip: tables.trips[0], names, photos: [] }, Date.now())
    await saveReport(onServer, made, max.id)
    await runSync()
    const id = await reportId(onServer)
    expect(Object.values(serverTrip(onServer).records.reports ?? {}).map((s) => s.rec)).toMatchObject([{ id, madeBy: max.id }])

    // Ana's phone makes it again: the same report, newer.
    const again = { id, tripId: onServer, data: { ...made, madeAt: later() }, madeBy: anaT.id, createdAt: later(), updatedAt: later() }
    const res = await anaSync([{ id: onServer, cursor: anaCursor, records: { reports: [again] } }])
    expect(res.rejected).toEqual([])
    anaCursor = res.trips[0].cursor

    await runSync()
    const here = await db.reports.where('tripId').equals(onServer).toArray()
    expect(here).toHaveLength(1)
    expect(here[0]).toMatchObject({ id, madeBy: anaT.id })
    expect(readReport(here[0].data)?.trip.name).toBe('Lisbon & Porto')
    expect(await db.outbox.where('tripId').equals(onServer).count()).toBe(0)
  })

  it('sends photos and documents with their files, apart from those kept on the phone', async () => {
    const photo = { kind: 'photo' as const, name: 'Fado.jpg', type: 'image/jpeg', blob: new Blob([FILE], { type: 'image/jpeg' }), thumb: new Blob([JPEG]), sha256: FILE_SHA256 }
    const [shared] = await addAttachments(onServer, [photo])
    const [mine] = await addAttachments(onServer, [photo], { private: true })
    await runSync()
    await runFileSync()

    expect(Object.keys(serverTrip(onServer).records.attachments ?? {})).toEqual([shared])
    expect(await readdir(join(dir, 'trips', onServer))).toEqual([shared, `${shared}.thumb`])
    expect((await db.serverTrips.get(onServer))!.files).toEqual([{ id: shared, thumb: true }])
    const forAna = await anaGet(shared)
    expect(new Uint8Array(await forAna.arrayBuffer())).toEqual(FILE)
    expect((await anaGet(mine)).status).toBe(404)
  })

  it("fetches the others' documents in full and their photos as previews, and lets deleted ones go", async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7 tickets')
    const now = new Date(Date.now() - 60_000).toISOString()
    const doc = attachment({ id: 'ana-doc-0001', tripId: onServer, kind: 'document', name: 'Tickets.pdf', type: 'application/pdf', size: pdf.length, sha256: sha256(pdf), createdAt: now, updatedAt: now })
    const photo = attachment({ id: 'ana-photo-01', tripId: onServer, createdAt: now, updatedAt: now })
    const res = await anaSync([{ id: onServer, cursor: anaCursor, records: { attachments: [doc, photo] } }])
    anaCursor = res.trips.find((t) => t.id === onServer)!.cursor
    await anaPost(doc.id, pdf)
    await anaPost(photo.id, FILE)
    await anaPost(photo.id, JPEG, true)

    await runSync()
    await runFileSync()
    const docFile = (await db.files.get(doc.id))!
    expect(new Uint8Array(await docFile.blob!.arrayBuffer())).toEqual(pdf)
    expect(docFile.blob!.type).toBe('application/pdf')
    const photoFile = (await db.files.get(photo.id))!
    expect(photoFile.blob).toBeUndefined()
    expect(new Uint8Array(await photoFile.thumb!.arrayBuffer())).toEqual(JPEG)

    // Opened: in full, and kept.
    expect(new Uint8Array(await (await fetchFull(photo.id)).arrayBuffer())).toEqual(FILE)
    expect((await db.files.get(photo.id))!.blob).toBeDefined()

    // Ana deletes the document; this phone deletes a photo.
    const gone = later(2)
    anaCursor = (await anaSync([{ id: onServer, cursor: anaCursor, records: { attachments: [{ ...doc, deletedAt: gone, updatedAt: gone }] } }])).trips[0].cursor
    await deleteAttachment(photo.id)
    await runSync()
    expect(await db.files.get(doc.id)).toBeUndefined()
    const left = await readdir(join(dir, 'trips', onServer))
    expect(left.filter((f) => f.startsWith('ana-'))).toEqual([])
  })

  it("passes on a link from Dee, who isn't on the server", async () => {
    const fromDee = await readTables(onServer)
    const now = later()
    fromDee.places = [{ id: 'place-from-dee', tripId: onServer, name: 'Livraria Lello', category: 'sight', createdAt: now, updatedAt: now }]
    await applyMerge(fromDee, 'test')
    await runSync()
    expect(serverTrip(onServer).records.places?.['place-from-dee']).toBeDefined()
  })

  it('puts Dee on the trip when she joins the server, as the traveller she already was', async () => {
    const dee = await post<Credentials>('/api/register', { inviteCode: (await createInvite()).code, name: 'Dee', deviceLabel: 'Pixel' })
    const deeSync = (trips: TripChanges[] = []) => post<SyncResponse>('/api/sync', { trips }, dee.token)
    expect((await deeSync()).trips).toEqual([])

    // Joining the server doesn't let her claim a traveller herself, even knowing the trip.
    const deeTraveller = (await db.travellers.where('tripId').equals(onServer).toArray()).find((t) => t.name === 'Dee')!
    const claim = await deeSync([{ id: onServer, cursor: 0, records: { travellers: [{ ...deeTraveller, memberId: dee.member.id, linkedAt: later(), updatedAt: later() }] } }])
    expect(claim.gone).toEqual([onServer])
    expect(serverTrip(onServer).records.travellers?.[deeTraveller.id].rec.memberId).toBeUndefined()

    // Someone on the trip links her: she gets it as that traveller, expenses and all.
    await runSync()
    const travellers = await db.travellers.where('tripId').equals(onServer).sortBy('createdAt')
    await updateTrip(onServer, (await db.trips.get(onServer))!, travellers.map((t) => ({ id: t.id, name: t.name, memberId: t.id === deeTraveller.id ? dee.member.id : t.memberId })))
    await runSync()
    const forDee = (await deeSync()).trips.find((t) => t.id === onServer)!
    expect(forDee.records.travellers!.find((t) => t.memberId === dee.member.id)!.id).toBe(deeTraveller.id)
  })

  it("doesn't let a link change who's on a trip on the server", async () => {
    const anaTraveller = (await db.travellers.where('tripId').equals(onServer).toArray()).find((t) => t.name === 'Ana')!
    // Renamed on a copy from before Ana was linked: she stays on the trip.
    const { memberId: _drop, linkedAt: _dropToo, ...unlinked } = anaTraveller
    await applyMerge({ ...emptyTables(), travellers: [{ ...unlinked, name: 'Ana M.', updatedAt: later(2) }] }, 'test')
    // A crafted link pointing her traveller at someone else changes nothing either.
    await applyMerge({ ...emptyTables(), travellers: [{ ...anaTraveller, name: 'Ana M.', memberId: 'someone-else', linkedAt: later(3), updatedAt: later(3) }] }, 'test')
    await runSync()

    const stored = serverTrip(onServer).records.travellers![anaTraveller.id].rec
    expect(stored).toMatchObject({ name: 'Ana M.', memberId: ana.member.id, linkedAt: anaTraveller.linkedAt })
    expect((await anaSync()).trips.map((t) => t.id)).toContain(onServer)
  })

  it('moves a phone-only trip to the server, with the same id', async () => {
    const [max, anaTraveller] = await db.travellers.where('tripId').equals(phoneOnly).sortBy('createdAt')
    await moveTripToServer(phoneOnly, { [max.id]: (await me()).id, [anaTraveller.id]: ana.member.id })
    await runSync()
    expect(Object.keys(serverTrip(phoneOnly).records.travellers ?? {})).toHaveLength(2)
    expect((await anaSync([{ id: onServer, cursor: anaCursor, records: {} }])).trips.map((t) => t.id)).toContain(phoneOnly)
  })

  it('keeps the trip on the phone when Ana takes Max off it', async () => {
    const res = await anaSync()
    const travellers = res.trips.find((t) => t.id === phoneOnly)!.records.travellers!
    const max = travellers.find((t) => t.memberId !== ana.member.id)!
    await anaSync([{ id: phoneOnly, cursor: 0, records: { travellers: [{ ...max, memberId: undefined, updatedAt: later() }] } }])

    await runSync()
    expect(await db.serverTrips.get(phoneOnly)).toBeUndefined()
    expect(await db.trips.get(phoneOnly)).toBeDefined()
    expect(await getSetting(SETTINGS.serverGone(phoneOnly))).toBeDefined()
  })

  it('sends everything again when the server lost a trip (restored from an older backup)', async () => {
    delete store.data.trips[onServer]
    await runSync()
    expect(serverTrip(onServer).records.places?.['place-from-dee']).toBeDefined()
    expect(await db.serverTrips.get(onServer)).toMatchObject({ uploaded: true })
  })

  it('keeps changes waiting while the server is unreachable', async () => {
    const cfg = (await getServerConfig())!
    await setServerConfig({ ...cfg, url: 'http://127.0.0.1:9' })
    await saveRecord('places', onServer, { name: 'Torre de Belém', category: 'sight' })
    await expect(runSync()).rejects.toBeInstanceOf(SyncError)
    expect((await getServerConfig())!.lastError).toContain("Couldn't reach")
    expect(await db.outbox.where('tripId').equals(onServer).count()).toBe(1)

    await setServerConfig({ ...(await getServerConfig())!, url })
    await runSync()
    expect(await db.outbox.where('tripId').equals(onServer).count()).toBe(0)
    expect((await getServerConfig())!.lastError).toBeUndefined()
  })

  it('leaves a trip: unlinked on the server, removed from the phone', async () => {
    await leaveTrip(onServer)
    expect(await db.trips.get(onServer)).toBeUndefined()
    const memberIds = Object.values(serverTrip(onServer).records.travellers ?? {}).map((t) => t.rec.memberId)
    expect(memberIds).not.toContain((await me()).id)
    expect(memberIds).toContain(ana.member.id)
  })

  it('stops syncing when this phone is disconnected on the server, keeping its trips', async () => {
    const cfg = (await getServerConfig())!
    await post('/api/devices/remove', { deviceId: cfg.deviceId }, cfg.token)
    await expect(runSync()).rejects.toMatchObject({ status: 401 })
    expect(await runSync()).toBe(false) // no more tries after that
    await forgetServer()
    expect(await getServerConfig()).toBeUndefined()
    expect(await db.trips.get(phoneOnly)).toBeDefined()
  })
})
