import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { addRecords, patchRecord } from '../../db/actions'
import { SETTINGS } from '../../db/db'
import type { PlaceCategory } from '../../db/types'
import { isGoogleMapsUrl, markExisting, type GooglePlace } from '../../domain/googleMaps'
import { safeHttpUrl } from '../../domain/links'
import { cityAt, reverseAddressOnline } from '../../lib/places'
import { GOOGLE_UNREACHABLE, lookUpGoogleMaps } from '../../sync/googleMaps'
import { BackLink, Notice } from '../components/bits'
import { ChoiceChips, TextField } from '../components/fields'
import { plural } from '../format'
import { useSetting } from '../hooks'
import { PLACE_CATEGORIES } from '../labels'
import { tripPath, useTrip } from '../tripData'

type Found = { name: string; places: GooglePlace[]; towns: Map<string, string> }

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })

export function PlacesImportPage() {
  const t = useTrip()
  const navigate = useNavigate()
  const onlineAddresses = useSetting<boolean>(SETTINGS.addressSearch)?.value === true
  const [pasted, setPasted] = useState('')
  const [looking, setLooking] = useState(false)
  const [lookupError, setLookupError] = useState<string>()
  const [found, setFound] = useState<Found>()
  const [category, setCategory] = useState<string>('sight')
  const [unticked, setUnticked] = useState<Record<string, boolean>>({})
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState<number>()
  const [progress, setProgress] = useState<{ done: number; total: number }>()
  const abort = useRef<AbortController>(new AbortController())

  useEffect(() => {
    const controller = new AbortController()
    abort.current = controller
    return () => controller.abort()
  }, [])

  const rows = useMemo(() => (found ? markExisting(found.places, t.places) : []), [found, t.places])
  // Rows start ticked unless the trip has the place already; a tap flips that.
  const isTicked = (link: string, existing: boolean) => (link in unticked ? !unticked[link] : !existing)
  const ticked = rows.filter((r) => isTicked(r.place.link, r.existing))

  const lookUp = async () => {
    const url = pasted.trim()
    if (!url || looking) return
    setLookupError(undefined)
    if (!safeHttpUrl(url) || !isGoogleMapsUrl(url)) return setLookupError("That's not a Google Maps link.")
    setLooking(true)
    try {
      const answer = await lookUpGoogleMaps(url)
      if (answer.kind === 'place') return setLookupError("That's a single place: add it with + Place.")
      const towns = new Map<string, string>()
      await Promise.all(
        answer.places.map(async (p) => {
          const town = await cityAt(p.lat, p.lng).catch(() => undefined)
          if (town) towns.set(p.link, town)
        }),
      )
      setUnticked({})
      setFound({ name: answer.name, places: answer.places, towns })
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : GOOGLE_UNREACHABLE)
    } finally {
      setLooking(false)
    }
  }

  const add = async () => {
    if (!found || adding || ticked.length === 0) return
    setAdding(true)
    const signal = abort.current.signal
    const chosen = ticked.map((r) => r.place)
    const ids = await addRecords(
      'places',
      t.trip.id,
      chosen.map((p) => ({
        name: p.name,
        category: category as PlaceCategory,
        city: found.towns.get(p.link),
        address: p.address,
        link: p.link,
        notes: p.note,
        lat: p.lat,
        lng: p.lng,
      })),
    )
    setAdded(chosen.length)
    setAdding(false)
    if (!onlineAddresses) return
    const todo = chosen.map((p, i) => ({ p, id: ids[i] })).filter(({ p }) => !p.address)
    if (todo.length === 0) return
    setProgress({ done: 0, total: todo.length })
    for (let i = 0; i < todo.length; i++) {
      if (signal.aborted) return
      const { p, id } = todo[i]
      const address = await reverseAddressOnline(p.lat, p.lng).catch(() => undefined)
      if (signal.aborted) return
      if (address) await patchRecord('places', id, { address })
      setProgress({ done: i + 1, total: todo.length })
      if (i < todo.length - 1) await sleep(1000, signal)
    }
    setProgress(undefined)
  }

  const back = tripPath(t.trip.id, 'places')

  return (
    <div className="stack">
      <BackLink to={back}>Places</BackLink>
      <h2>Import a Google Maps list</h2>
      {added !== undefined ? (
        <>
          <Notice kind="ok">Added {plural(added, 'place')}.</Notice>
          {progress && (
            <p className="muted small">
              Finding addresses… {progress.done} of {progress.total}
            </p>
          )}
          <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => navigate(back)}>
            Done
          </button>
        </>
      ) : !found ? (
        <>
          <TextField
            label="Shared Google Maps list link"
            type="url"
            value={pasted}
            onChange={setPasted}
            placeholder="https://maps.app.goo.gl/…"
            maxLength={2000}
            hint="In Google Maps, open the list, tap Share → Copy link."
          />
          <button type="button" className="btn btn-small btn-primary" style={{ alignSelf: 'flex-start' }} disabled={looking || !pasted.trim()} onClick={() => void lookUp()}>
            Look it up
          </button>
          {looking && <p className="muted small">Looking it up…</p>}
          {lookupError && <Notice kind="warn">{lookupError}</Notice>}
        </>
      ) : (
        <>
          <h3>
            {found.name || 'Shared list'} <span className="count">{plural(rows.length, 'place')}</span>
          </h3>
          <ChoiceChips label="Kind" options={PLACE_CATEGORIES} value={category} onChange={setCategory} />
          <ul className="list">
            {rows.map(({ place, existing }) => {
              const on = isTicked(place.link, existing)
              const sub = [found.towns.get(place.link), place.note?.split('\n')[0]].filter(Boolean).join(' · ')
              return (
                <li key={place.link} className="list-row">
                  <label className="check">
                    <input type="checkbox" checked={on} onChange={() => setUnticked((u) => ({ ...u, [place.link]: on }))} />
                    <span>
                      {place.name}
                      {sub && <small>{sub}</small>}
                      {existing && <small>Already in the trip</small>}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <div className="actions">
            <button type="button" className="btn btn-primary" disabled={adding || ticked.length === 0} onClick={() => void add()}>
              Add {plural(ticked.length, 'place')}
            </button>
            <Link className="btn" to={back}>
              Cancel
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
