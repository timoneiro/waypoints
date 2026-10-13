import { useMemo, useState, type ReactNode } from 'react'
import { allTimeZones, zoneCity } from '../../domain/time'
import { currencyName } from '../format'
import type { Label } from '../labels'

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  )
}

type TextProps = { label: string; value: string; onChange: (value: string) => void; hint?: ReactNode } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>

export function TextField({ label, value, onChange, hint, ...props }: TextProps) {
  return (
    <Field label={label} hint={hint}>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} {...props} />
    </Field>
  )
}

export function NotesField({ label = 'Notes', value, onChange, placeholder }: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Field label={label}>
      <textarea className="input" rows={3} value={value} maxLength={10_000} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

/** A date with an optional time. */
export function DateTimeField(props: {
  label: string
  date: string
  time: string
  onDate: (v: string) => void
  onTime: (v: string) => void
  required?: boolean
  hint?: ReactNode
}) {
  const { label, date, time, onDate, onTime, required, hint } = props
  return (
    <div className="field" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="row nowrap">
        <input className="input" type="date" value={date} required={required} aria-label={`${label}: date`} onChange={(e) => onDate(e.target.value)} />
        <input className="input input-time" type="time" value={time} aria-label={`${label}: time (optional)`} onChange={(e) => onTime(e.target.value)} />
      </div>
      {hint && <small className="muted">{hint}</small>}
    </div>
  )
}

/** Single choice shown as chips: kinds, modes, categories. */
export function ChoiceChips<K extends string>({ label, options, value, onChange }: { label: string; options: Record<K, Label>; value: string; onChange: (v: K) => void }) {
  return (
    <div className="field" role="radiogroup" aria-label={label}>
      <span>{label}</span>
      <div className="chips">
        {(Object.entries(options) as [K, Label][]).map(([key, { label: text, emoji }]) => (
          <button key={key} type="button" role="radio" aria-checked={value === key} className="toggle-chip" onClick={() => onChange(key)}>
            {emoji} {text}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Every time zone, with the ones this trip already uses on top. */
export function ZoneSelect({ value, onChange, suggestions, label }: { value: string; onChange: (v: string) => void; suggestions: string[]; label: string }) {
  const zones = useMemo(() => allTimeZones(), [])
  const top = [...new Set([...suggestions, value])].filter(Boolean)
  return (
    <select className="input" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      <optgroup label="Used in this trip">
        {top.map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, ' ')}
          </option>
        ))}
      </optgroup>
      <optgroup label="All time zones">
        {zones
          .filter((z) => !top.includes(z))
          .map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, ' ')}
            </option>
          ))}
      </optgroup>
    </select>
  )
}

/** "Times are in Lisbon time · Change": collapsed, since most trips have one time zone. */
export function ZoneField({ label = 'Times are local to', value, onChange, suggestions }: { label?: string; value: string; onChange: (v: string) => void; suggestions: string[] }) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <p className="small muted">
        {label} <strong>{zoneCity(value)}</strong>.{' '}
        <button type="button" className="link" onClick={() => setOpen(true)}>
          Change time zone
        </button>
      </p>
    )
  }
  return (
    <Field label={label}>
      <ZoneSelect value={value} onChange={onChange} suggestions={suggestions} label={label} />
    </Field>
  )
}

const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'BRL', 'CAD', 'AUD']

function allCurrencies(): string[] {
  try {
    return Intl.supportedValuesOf('currency')
  } catch {
    return COMMON_CURRENCIES
  }
}

/**
 * Currencies by code, with the ones this trip uses on top. `compact` shows just the code ("JPY ▾")
 * next to an amount; the list that opens still has the full names.
 */
export function CurrencySelect(props: { value: string; onChange: (v: string) => void; suggestions: string[]; label: string; compact?: boolean }) {
  const { value, compact } = props
  if (!compact) return <CurrencyOptions {...props} className="input" />
  return (
    <span className="input select-compact">
      <span aria-hidden>{value}</span>
      <span aria-hidden className="muted">
        ▾
      </span>
      <CurrencyOptions {...props} className="select-overlay" />
    </span>
  )
}

function CurrencyOptions({ value, onChange, suggestions, label, className }: { value: string; onChange: (v: string) => void; suggestions: string[]; label: string; className: string }) {
  const all = useMemo(() => allCurrencies().map((code) => [code, `${code} · ${currencyName(code)}`] as const), [])
  const top = [...new Set([...suggestions, value])].filter(Boolean)
  return (
    <select className={className} value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      <optgroup label="This trip">
        {top.map((code) => (
          <option key={code} value={code}>
            {code} · {currencyName(code)}
          </option>
        ))}
      </optgroup>
      <optgroup label="All currencies">
        {all
          .filter(([code]) => !top.includes(code))
          .map(([code, text]) => (
            <option key={code} value={code}>
              {text}
            </option>
          ))}
      </optgroup>
    </select>
  )
}

export function FormError({ error }: { error?: string }) {
  return error ? (
    <p className="notice notice-error" role="alert">
      {error}
    </p>
  ) : null
}
