import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'

export interface Suggestion {
  key: string
  label: string
  /** A second, quieter line: "Oregon, United States". */
  detail?: string
  onPick: () => void
}

export interface SuggestionGroup {
  /** "In this trip", "Cities": shown above the group's suggestions. */
  label: string
  items: Suggestion[]
}

type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  groups: SuggestionGroup[]
  /** A line under the suggestions: a credit, or why there are none. */
  note?: ReactNode
  hint?: ReactNode
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>

/**
 * A text field with suggestions as you type, which can always be ignored: anything typed is kept as
 * it is. Arrow keys and Enter pick with a keyboard. On a phone, the field moves to the top of the
 * screen so the suggestions fit above the keyboard.
 */
export function Combobox({ label, value, onChange, groups, note, hint, ...props }: Props) {
  const id = useId()
  const listId = `${id}-list`
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const items = groups.flatMap((g) => g.items)
  const current = active < items.length ? active : -1
  const shown = open && (items.length > 0 || Boolean(note))
  const optionId = (i: number) => `${listId}-${i}`

  useEffect(() => {
    if (current >= 0) document.getElementById(`${listId}-${current}`)?.scrollIntoView({ block: 'nearest' })
  }, [current, listId])

  const pick = (s: Suggestion) => {
    s.onPick()
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault()
      setOpen(true)
      setActive(Math.min(current + 1, items.length - 1))
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault()
      setActive(Math.max(current - 1, -1))
    } else if (e.key === 'Enter' && shown && current >= 0) {
      e.preventDefault()
      pick(items[current])
    } else if (e.key === 'Escape' && shown) {
      e.preventDefault()
      setOpen(false)
    }
  }

  let index = 0
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="combo">
        <input
          {...props}
          id={id}
          className="input"
          value={value}
          role="combobox"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={shown && current >= 0 ? optionId(current) : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={(e) => {
            setOpen(true)
            const input = e.currentTarget
            if (matchMedia('(pointer: coarse)').matches) setTimeout(() => input.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300)
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {shown && (
          // Keeps the focus in the field while a suggestion is tapped.
          <div className="combo-pop" onMouseDown={(e) => e.preventDefault()}>
            <div id={listId} role="listbox" aria-label={label}>
              {groups
                .filter((g) => g.items.length > 0)
                .map((g) => (
                  <div key={g.label} role="group" aria-label={g.label}>
                    <div className="combo-group" aria-hidden>
                      {g.label}
                    </div>
                    {g.items.map((s) => {
                      const i = index++
                      return (
                        <div key={s.key} id={optionId(i)} role="option" aria-selected={i === current} className="combo-option" onClick={() => pick(s)}>
                          <span>{s.label}</span>
                          {s.detail && <small>{s.detail}</small>}
                        </div>
                      )
                    })}
                  </div>
                ))}
            </div>
            {note && <div className="combo-note">{note}</div>}
          </div>
        )}
      </div>
      {hint && <small className="muted">{hint}</small>}
    </div>
  )
}
