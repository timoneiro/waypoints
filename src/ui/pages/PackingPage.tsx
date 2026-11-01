import { useState } from 'react'
import { addRecords, deleteRecord, patchRecord, saveRecord } from '../../db/actions'
import type { PackingItem } from '../../db/types'
import { newFromTemplate, progress, sortedItems, TEMPLATES } from '../../domain/packing'
import { EmptyState } from '../components/bits'
import { TextField } from '../components/fields'
import { nameOf, useTrip, type TripData } from '../tripData'

const MAX_TEXT = 200

/** Who's bringing it: one of the trip's travellers (or whoever is already set, even if they've left). */
function BringerSelect({ t, value, onChange }: { t: TripData; value: string; onChange: (id: string) => void }) {
  const known = t.travellers.some((x) => x.id === value)
  return (
    <label className="field">
      <span>Who's bringing it</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Nobody yet</option>
        {value && !known && <option value={value}>{nameOf(t, value)}</option>}
        {t.travellers.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    </label>
  )
}

/** The trip's shared packing and to-do list. */
export function PackingPage() {
  const t = useTrip()
  const group = t.travellers.length > 1
  const items = sortedItems(t.packingItems)
  const { packed, total } = progress(t.packingItems)
  const [editing, setEditing] = useState<string>()
  const [text, setText] = useState('')
  const [bringer, setBringer] = useState('')

  const add = async () => {
    const clean = text.trim()
    if (!clean) return
    await saveRecord('packingItems', t.trip.id, { text: clean, bringer: bringer || undefined })
    setText('')
    setBringer('')
  }

  const fromTemplate = async (id: (typeof TEMPLATES)[number]['id']) => {
    const template = TEMPLATES.find((x) => x.id === id)!
    const texts = newFromTemplate(t.packingItems, template)
    if (!texts.length) return
    await addRecords(
      'packingItems',
      t.trip.id,
      texts.map((x) => ({ text: x })),
    )
  }

  return (
    <article className="stack">
      <h2>Packing & to-do</h2>

      {total === 0 ? (
        <EmptyState>
          <p className="big-emoji">🧳</p>
          <p>Nothing here yet</p>
        </EmptyState>
      ) : (
        <>
          <p className="muted">
            {packed} of {total} packed
          </p>
          <ul className="list">
            {items.map((item) =>
              editing === item.id ? (
                <EditRow key={item.id} item={item} t={t} group={group} onDone={() => setEditing(undefined)} />
              ) : (
                <li key={item.id} className="list-row">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={Boolean(item.packed)}
                      aria-label={`Packed: ${item.text}`}
                      onChange={(e) => void patchRecord('packingItems', item.id, { packed: e.target.checked })}
                    />
                  </label>
                  <button className="list-text" style={{ all: 'unset', cursor: 'pointer', flex: 1 }} onClick={() => setEditing(item.id)}>
                    <strong style={item.packed ? { textDecoration: 'line-through' } : undefined}>{item.text}</strong>
                    {item.bringer && <span className="muted small"> · {nameOf(t, item.bringer)}</span>}
                  </button>
                </li>
              ),
            )}
          </ul>
        </>
      )}

      <section className="stack">
        <h3 className="group-title">Add from a template</h3>
        <div className="chips">
          {TEMPLATES.map((x) => (
            <button key={x.id} className="btn btn-small" onClick={() => void fromTemplate(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
      </section>

      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <TextField label="Add an item" value={text} onChange={setText} maxLength={MAX_TEXT} />
        {group && <BringerSelect t={t} value={bringer} onChange={setBringer} />}
        <button className="btn btn-primary" type="submit" disabled={!text.trim()}>
          Add
        </button>
      </form>
    </article>
  )
}

function EditRow({ item, t, group, onDone }: { item: PackingItem; t: TripData; group: boolean; onDone: () => void }) {
  const [text, setText] = useState(item.text)
  const [bringer, setBringer] = useState(item.bringer ?? '')

  const save = async () => {
    const clean = text.trim()
    if (!clean) return
    await patchRecord('packingItems', item.id, { text: clean, bringer: bringer || undefined })
    onDone()
  }
  const remove = async () => {
    const others = group ? ' It will also be deleted for the others when you share the trip.' : ''
    if (!confirm(`Delete this item?${others}`)) return
    await deleteRecord('packingItems', item.id)
    onDone()
  }

  return (
    <li className="card stack">
      <TextField label="Item" value={text} onChange={setText} maxLength={MAX_TEXT} />
      {(group || item.bringer) && <BringerSelect t={t} value={bringer} onChange={setBringer} />}
      <div className="actions">
        <button className="btn btn-primary" disabled={!text.trim()} onClick={() => void save()}>
          Save
        </button>
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
        <button className="btn btn-danger" onClick={() => void remove()}>
          Delete
        </button>
      </div>
    </li>
  )
}
