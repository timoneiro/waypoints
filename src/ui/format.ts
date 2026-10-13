import type { Day, Time } from '../db/types'
import { dayToDate } from '../domain/time'

/** "Wed 10 Mar", in the device's language. */
export const fmtDay = (day: Day) => dayToDate(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

export const fmtLongDay = (day: Day) =>
  dayToDate(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** "10–13 Mar 2027". */
export function fmtDayRange(start: Day, end: Day): string {
  const format = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  try {
    return format.formatRange(dayToDate(start), dayToDate(end))
  } catch {
    return `${format.format(dayToDate(start))} – ${format.format(dayToDate(end))}`
  }
}

/** "15:00" or "3:00 PM", following the device's clock setting. */
export function fmtTime(time: Time): string {
  const [h, m] = time.split(':').map(Number)
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
}

export const fmtDayTime = (day: Day, time?: Time) => (time ? `${fmtDay(day)}, ${fmtTime(time)}` : fmtDay(day))

const moneyFormats = new Map<string, Intl.NumberFormat>()

export function fmtMoney(amount: number, currency: string): string {
  let format = moneyFormats.get(currency)
  if (!format) {
    try {
      format = new Intl.NumberFormat(undefined, { style: 'currency', currency })
    } catch {
      format = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    moneyFormats.set(currency, format)
  }
  const text = format.format(amount)
  return format.resolvedOptions().style === 'currency' ? text : `${text} ${currency}`
}

/** A money amount for a small space, rounded: "€1,217", or "¥250K" from 10,000 up. */
export function fmtMoneyShort(amount: number, currency: string): string {
  try {
    const notation = amount >= 10_000 ? 'compact' : 'standard'
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, notation, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return fmtMoney(amount, currency)
  }
}

/** A number for an input box: up to `digits` decimals, no grouping ("1234.5"). */
export const fmtPlain = (value: number, digits = 2) => String(Math.round(value * 10 ** digits) / 10 ** digits)

/** "2h 35m". */
export function fmtDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}

/** "2026-10-08T…" → "8 Oct, 14:05". */
export const fmtTimestamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "820 KB", "2.4 MB". */
export function fmtBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  const mb = bytes / 1024 / 1024
  return `${mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb)} MB`
}

/** "2 new, 1 changed" for a merge. */
export const mergeSummary = ({ added, updated, removed }: { added: number; updated: number; removed: number }) =>
  [added && `${added} new`, updated && `${updated} changed`, removed && `${removed} deleted`].filter(Boolean).join(', ') || 'small updates'

export function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'currency' }).of(code) ?? code
  } catch {
    return code
  }
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** "2 minutes ago", "yesterday". */
export function fmtAgo(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000)
  if (minutes < 60) return relative.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  return hours < 48 ? relative.format(-hours, 'hour') : relative.format(-Math.round(hours / 24), 'day')
}
