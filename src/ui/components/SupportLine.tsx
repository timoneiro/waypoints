import { LINKS } from '../../lib/links'

/** One quiet line asking for support; used on the trips list and in Settings → About. */
export function SupportLine({ className }: { className?: string }) {
  return (
    <p className={className ? `muted small ${className}` : 'muted small'}>
      ☕ Enjoying waypoints? It's free and always will be.{' '}
      <a className="link" href={LINKS.donate} target="_blank" rel="noreferrer">
        Support it on Ko-fi
      </a>
    </p>
  )
}
