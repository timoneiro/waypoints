import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { patchRecord } from '../../db/actions'
import type { Place, PlaceCategory } from '../../db/types'
import { SETTINGS } from '../../db/db'
import { isGoogleMapsUrl } from '../../domain/googleMaps'
import { mapQuery, safeHttpUrl } from '../../domain/links'
import { cityAt, reverseAddressOnline } from '../../lib/places'
import { GOOGLE_UNREACHABLE, lookUpGoogleMaps } from '../../sync/googleMaps'
import { DetailHead, EmptyState, Notice } from '../components/bits'
import { ChoiceChips, NotesField, TextField } from '../components/fields'
import { AddressField, CityField } from '../components/PlaceFields'
import { MapLinks, WebLink } from '../components/ItemLinks'
import { fmtDayTime, plural } from '../format'
import { usable, useServer, useSetting } from '../hooks'
import { labelOf, PLACE_CATEGORIES } from '../labels'
import { tripPath, useTrip } from '../tripData'
import { AttachmentsCard } from '../components/Attachments'
import { ReviewsCard } from '../components/Reviews'
import { ItemFooter, ItemForm, ItemGone } from './common'
import { opt, useSave } from './save'

const NO_CITY = ''

export function PlacesPage() {
  const t = useTrip()
  const [params, setParams] = useSearchParams()
  const city = params.get('city')
  const category = params.get('category')
  const hideVisited = params.get('visited') === 'hide'
  const setFilter = (key: string, value: string | null) =>
    setParams(
      (p) => {
        if (value === null) p.delete(key)
        else p.set(key, value)
        return p
      },
      { replace: true },
    )

  const cityOf = (p: Place) => p.city?.trim() ?? NO_CITY
  // A category from a newer version of the app counts as "other".
  const categoryOf = (p: Place): PlaceCategory => (p.category in PLACE_CATEGORIES ? p.category : 'other')
  const cities = [...new Set(t.places.map(cityOf))].sort((a, b) => (a === NO_CITY ? 1 : b === NO_CITY ? -1 : a.localeCompare(b)))
  const categories = (Object.keys(PLACE_CATEGORIES) as PlaceCategory[]).filter((c) => t.places.some((p) => categoryOf(p) === c))
  const shown = t.places.filter(
    (p) => (city === null || cityOf(p) === city) && (category === null || categoryOf(p) === category) && !(hideVisited && p.visited),
  )
  const visited = t.places.filter((p) => p.visited).length

  return (
    <>
      <div className="section-head">
        <h2>
          Places <span className="count">{t.places.length}</span>
        </h2>
        <Link className="btn btn-small btn-primary" to={tripPath(t.trip.id, 'places', 'new')}>
          + Place
        </Link>
      </div>
      {t.places.length === 0 ? (
        <EmptyState>
          <p className="big-emoji">📍</p>
          <p>Save the places you want to check out: sights, restaurants, bars, viewpoints.</p>
          <p className="muted small">Paste a Google or Apple Maps link to open them in one tap later.</p>
        </EmptyState>
      ) : (
        <>
          {cities.length > 1 && (
            <div className="chips" aria-label="City">
              <button className="toggle-chip" aria-pressed={city === null} onClick={() => setFilter('city', null)}>
                All cities
              </button>
              {cities.map((c) => (
                <button key={c} className="toggle-chip" aria-pressed={city === c} onClick={() => setFilter('city', city === c ? null : c)}>
                  {c || 'No city'}
                </button>
              ))}
            </div>
          )}
          {categories.length > 1 && (
            <div className="chips" aria-label="Category">
              {categories.map((c) => (
                <button key={c} className="toggle-chip" aria-pressed={category === c} onClick={() => setFilter('category', category === c ? null : c)}>
                  {PLACE_CATEGORIES[c].emoji} {PLACE_CATEGORIES[c].label}
                </button>
              ))}
            </div>
          )}
          {visited > 0 && (
            <label className="check small">
              <input type="checkbox" checked={hideVisited} onChange={(e) => setFilter('visited', e.target.checked ? 'hide' : null)} />
              <span>Hide the {plural(visited, 'place')} you've been to</span>
            </label>
          )}
          {cities
            .filter((c) => shown.some((p) => cityOf(p) === c))
            .map((c) => (
              <section key={c}>
                {cities.length > 1 && <h3 className="group-title">{c || 'No city'}</h3>}
                <ul className="list">
                  {shown
                    .filter((p) => cityOf(p) === c)
                    .sort((a, b) => Number(Boolean(a.visited)) - Number(Boolean(b.visited)) || Number(Boolean(b.mustSee)) - Number(Boolean(a.mustSee)) || a.name.localeCompare(b.name))
                    .map((p) => (
                      <PlaceRow key={p.id} place={p} />
                    ))}
                </ul>
              </section>
            ))}
          {shown.length === 0 && <p className="muted">No places match these filters.</p>}
        </>
      )}
    </>
  )
}

function PlaceRow({ place }: { place: Place }) {
  const t = useTrip()
  const category = labelOf(PLACE_CATEGORIES, place.category)
  return (
    <li className={`list-row${place.visited ? ' done' : ''}`}>
      <Link to={tripPath(t.trip.id, 'places', place.id)} className="row-link">
        <span className="list-emoji" aria-hidden>
          {category.emoji}
        </span>
        <span className="list-text">
          <strong>{place.name}</strong>
          <span className="muted small">{[place.mustSee && '⭐ Must see', place.notes?.split('\n')[0] || place.address || category.label].filter(Boolean).join(' · ')}</span>
        </span>
      </Link>
      <button
        type="button"
        className="icon-btn"
        aria-pressed={Boolean(place.visited)}
        aria-label={place.visited ? `Mark ${place.name} as not visited` : `Mark ${place.name} as visited`}
        onClick={() => void patchRecord('places', place.id, { visited: place.visited ? undefined : true })}
      >
        <span className="tick" aria-hidden>
          ✓
        </span>
      </button>
    </li>
  )
}

export function PlaceFormPage() {
  const t = useTrip()
  const { itemId } = useParams()
  const existing = itemId ? t.places.find((p) => p.id === itemId) : undefined
  if (itemId && !existing) return <ItemGone backTo={tripPath(t.trip.id, 'places')} />
  return <PlaceForm key={itemId ?? 'new'} existing={existing} />
}

function PlaceForm({ existing }: { existing?: Place }) {
  const [searchParams] = useSearchParams()
  const [name, setName] = useState(existing?.name ?? '')
  const [category, setCategory] = useState<string>(existing?.category ?? 'sight')
  const [city, setCity] = useState(existing?.city ?? searchParams.get('city') ?? '')
  const [address, setAddress] = useState(existing?.address ?? '')
  const [link, setLink] = useState(existing?.link ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [mustSee, setMustSee] = useState(existing?.mustSee ?? false)
  const [lat, setLat] = useState(existing?.lat)
  const [lng, setLng] = useState(existing?.lng)
  const [pasted, setPasted] = useState('')
  const [looking, setLooking] = useState(false)
  const [lookupError, setLookupError] = useState<string>()
  const { save, busy, error, setError } = useSave('places', existing?.id)
  const server = usable(useServer())
  const onlineAddresses = useSetting<boolean>(SETTINGS.addressSearch)?.value === true

  const fillIn = async (input: string) => {
    const url = input.trim()
    if (!url || looking) return
    setLookupError(undefined)
    if (!safeHttpUrl(url) || !isGoogleMapsUrl(url)) return setLookupError("That's not a Google Maps link.")
    setLooking(true)
    try {
      const answer = await lookUpGoogleMaps(url)
      if (answer.kind === 'list') return setLookupError("That's a list, not a place.")
      const { place } = answer
      setName(place.name)
      setLink(place.link)
      setLat(place.lat)
      setLng(place.lng)
      if (place.address) setAddress((a) => a || place.address!)
      else if (onlineAddresses) {
        const found = await reverseAddressOnline(place.lat, place.lng).catch(() => undefined)
        if (found) setAddress((a) => a || found)
      }
      const town = await cityAt(place.lat, place.lng).catch(() => undefined)
      if (town) setCity((c) => c || town)
    } catch (err) {
      const message = err instanceof Error ? err.message : GOOGLE_UNREACHABLE
      setLookupError(message)
      setLink((l) => l || url)
    } finally {
      setLooking(false)
    }
  }

  const onSubmit = () => {
    if (!name.trim()) return setError('Give the place a name.')
    if (link.trim() && !safeHttpUrl(link)) return setError('The link should be a web address, like a Google Maps link.')
    void save({
      name: name.trim(),
      category: category as PlaceCategory,
      city: opt(city),
      address: opt(address),
      link: opt(link),
      notes: opt(notes),
      mustSee: mustSee || undefined,
      visited: existing?.visited,
      lat,
      lng,
    })
  }

  return (
    <ItemForm title={existing ? 'Edit place' : 'New place'} error={error} busy={busy} onSubmit={onSubmit}>
      {!existing && server && (
        <div className="stack">
          <TextField
            label="Paste a Google Maps link"
            type="url"
            value={pasted}
            onChange={setPasted}
            onPaste={(e) => {
              if (pasted.trim()) return
              const text = e.clipboardData.getData('text')
              setPasted(text)
              e.preventDefault()
              void fillIn(text)
            }}
            placeholder="https://maps.app.goo.gl/…"
            maxLength={2000}
            hint="In Google Maps, tap Share → Copy link."
          />
          <button type="button" className="btn btn-small" style={{ alignSelf: 'flex-start' }} disabled={looking || !pasted.trim()} onClick={() => void fillIn(pasted)}>
            Fill in
          </button>
          {looking && <p className="muted small">Looking it up…</p>}
          {lookupError && <Notice kind="warn">{lookupError}</Notice>}
        </div>
      )}
      <TextField label="Name" value={name} onChange={setName} placeholder="Livraria Lello, Time Out Market…" maxLength={200} autoFocus={!existing} />
      <ChoiceChips label="Kind" options={PLACE_CATEGORIES} value={category} onChange={setCategory} />
      <CityField value={city} onChange={setCity} />
      <AddressField
        value={address}
        onChange={setAddress}
        city={city}
        onPlace={(p) => {
          if (!city.trim()) setCity(p.city)
        }}
      />
      <TextField
        label="Link"
        type="url"
        value={link}
        onChange={setLink}
        placeholder="https://maps.app.goo.gl/…"
        maxLength={2000}
        hint="In Google or Apple Maps, tap Share → Copy link, then paste it here. Or the place's website."
      />
      <NotesField value={notes} onChange={setNotes} placeholder="Why go, what to order, opening hours…" />
      <label className="check">
        <input type="checkbox" checked={mustSee} onChange={(e) => setMustSee(e.target.checked)} />
        <span>
          ⭐ Must see
          <small>Shown first in the list.</small>
        </span>
      </label>
    </ItemForm>
  )
}

export function PlacePage() {
  const t = useTrip()
  const { itemId } = useParams()
  const place = t.places.find((p) => p.id === itemId)
  const back = tripPath(t.trip.id, 'places')
  if (!place) return <ItemGone backTo={back} />
  const category = labelOf(PLACE_CATEGORIES, place.category)
  const visits = t.activities.filter((a) => a.placeId === place.id).sort((a, b) => a.date.localeCompare(b.date))
  const link = safeHttpUrl(place.link)
  return (
    <article className="stack">
      <DetailHead emoji={category.emoji} title={place.name} subtitle={[category.label, place.city].filter(Boolean).join(' · ')} />
      <div className="actions">
        <button type="button" className="toggle-chip" aria-pressed={Boolean(place.mustSee)} onClick={() => void patchRecord('places', place.id, { mustSee: place.mustSee ? undefined : true })}>
          ⭐ Must see
        </button>
        <button type="button" className="toggle-chip" aria-pressed={Boolean(place.visited)} onClick={() => void patchRecord('places', place.id, { visited: place.visited ? undefined : true })}>
          ✅ Been there
        </button>
      </div>
      <section className="card">
        {place.address && <p className="prewrap">{place.address}</p>}
        <div className="actions">
          {link && /maps|goo\.gl|maps\.apple/i.test(link) ? <WebLink url={link}>Open saved map link</WebLink> : <WebLink url={link}>Website</WebLink>}
        </div>
        <MapLinks query={mapQuery(place.name, place.address ?? place.city)} />
      </section>
      {place.notes && (
        <section className="card">
          <h3>Notes</h3>
          <p className="prewrap">{place.notes}</p>
        </section>
      )}
      <ReviewsCard target={{ table: 'places', record: place }} />
      <section className="card">
        <h3>Plan a visit</h3>
        {visits.length > 0 && (
          <ul className="list">
            {visits.map((a) => (
              <li key={a.id}>
                <Link className="link" to={tripPath(t.trip.id, 'activities', a.id)}>
                  🎟️ {fmtDayTime(a.date, a.startTime)}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link className="btn btn-small" style={{ alignSelf: 'flex-start' }} to={`${tripPath(t.trip.id, 'activities', 'new')}?place=${place.id}`}>
          🗓️ Add to the plan
        </Link>
      </section>
      <AttachmentsCard table="places" id={place.id} />
      <ItemFooter table="places" id={place.id} what="place" backTo={back} />
    </article>
  )
}
