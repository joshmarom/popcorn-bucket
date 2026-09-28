import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { Film, Layers, Tv } from 'lucide-react'
import type { AutocompleteSuggestion } from '@shared/discovery'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const DEBOUNCE_MS = 250

const TYPE_LABEL: Record<AutocompleteSuggestion['contentType'], string> = {
  movie: 'Movie',
  show: 'TV show',
  collection: 'Collection'
}

function TypeIcon({ type }: { type: AutocompleteSuggestion['contentType'] }): ReactElement {
  const Icon = type === 'show' ? Tv : type === 'collection' ? Layers : Film
  return <Icon aria-hidden className="size-3" />
}

/**
 * The home search box with TorrentClaw suggestions. Typing still drives the TMDB search below;
 * picking a suggestion jumps straight to its page. If TorrentClaw fails, no dropdown appears.
 */
export function SearchAutocomplete({
  value,
  onChange,
  placeholder,
  className
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}): ReactElement {
  const navigate = useNavigate()
  const listId = useId()
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [resolving, setResolving] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const pickedRef = useRef<string | null>(null)

  useEffect(() => {
    const q = value.trim()
    if (q.length < 2 || pickedRef.current === value) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const t = window.setTimeout(() => {
      window.api.discover
        .autocomplete(q)
        .then((res) => {
          if (cancelled) return
          setSuggestions(res.ok ? res.suggestions : [])
          setActive(-1)
        })
        .catch(() => {
          if (!cancelled) setSuggestions([])
        })
    }, DEBOUNCE_MS)
    return (): void => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [value])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return (): void => document.removeEventListener('mousedown', onDown)
  }, [])

  const pick = async (s: AutocompleteSuggestion): Promise<void> => {
    setOpen(false)
    setResolving(true)
    try {
      const res = await window.api.discover.resolveSuggestion(s)
      if (res.ok) {
        navigate(res.route, { state: { from: 'home' } })
        return
      }
    } catch {
      // Falls through to a TMDB search for the title.
    } finally {
      setResolving(false)
    }
    pickedRef.current = s.title
    onChange(s.title)
  }

  const showList = open && suggestions.length > 0

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (!showList) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      void pick(suggestions[active]!)
    } else if (e.key === 'Escape' || e.key === 'Enter') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Input
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          pickedRef.current = null
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {resolving ? (
        <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-xs">
          Opening…
        </span>
      ) : null}
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="bg-popover text-popover-foreground absolute top-full right-0 left-0 z-30 mt-1 max-h-[26rem] overflow-y-auto rounded-md border p-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.contentType}-${s.id}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5',
                i === active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
              )}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void pick(s)}
            >
              <div className="bg-muted h-12 w-8 shrink-0 overflow-hidden rounded-sm">
                {s.posterUrl ? (
                  <img src={s.posterUrl} alt="" className="size-full object-cover" loading="lazy" />
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{s.title}</p>
                <p className="text-muted-foreground flex items-center gap-1 text-xs">
                  <TypeIcon type={s.contentType} />
                  {TYPE_LABEL[s.contentType]}
                  {s.year != null ? ` · ${s.year}` : ''}
                  {s.contentType === 'collection' && s.movieCount
                    ? ` · ${s.movieCount} movies`
                    : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
