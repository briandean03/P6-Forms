import { useId, useMemo, useState } from 'react'

interface Option { value: string; label: string }
interface Props { label: string; value: string; options: Option[]; onChange: (value: string) => void; disabled?: boolean }

export function SearchableSelect({ label, value, options, onChange, disabled }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const matches = useMemo(() => options.filter(option => option.label.toLowerCase().includes(query.trim().toLowerCase())), [options, query])
  // Keep a large engineering register from creating thousands of DOM options.
  const visible = matches.slice(0, 100)
  const selected = options.find(option => option.value === value)
  function choose(option: Option) { onChange(option.value); setOpen(false); setQuery(''); setActive(0) }
  return <div className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setQuery('') } }}>
    <input id={id} type="text" role="combobox" aria-label={label} aria-expanded={open} aria-controls={`${id}-options`} aria-autocomplete="list" aria-activedescendant={open && visible[active] ? `${id}-option-${active}` : undefined} autoComplete="off" disabled={disabled} className="block w-full px-3 py-2 mt-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" placeholder="Search transmittal reference…" value={open ? query : selected?.label ?? ''}
      onFocus={() => { setOpen(true); setQuery(''); setActive(0) }}
      onChange={event => { setOpen(true); setQuery(event.target.value); setActive(0); if (value) onChange('') }}
      onKeyDown={event => {
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); setQuery(''); return }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true)
          const next = Math.max(0, Math.min(visible.length - 1, open ? active + (event.key === 'ArrowDown' ? 1 : -1) : 0))
          setActive(next)
          document.getElementById(`${id}-option-${next}`)?.scrollIntoView({ block: 'nearest' })
        }
        if (event.key === 'Enter' && open) { event.preventDefault(); if (visible[active]) choose(visible[active]) }
      }} />
    {open && <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
      <ul id={`${id}-options`} role="listbox" aria-label={label} className="max-h-56 overflow-auto py-1">
        {visible.map((option, index) => <li key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={option.value === value} className={`px-3 py-2 text-sm cursor-pointer break-words ${index === active ? 'bg-blue-50 text-blue-800' : 'hover:bg-gray-50'}`} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(option)}>{option.label}</li>)}
        {!visible.length && <li role="presentation" className="px-3 py-3 text-sm text-gray-500">No matching transmittals</li>}
      </ul>
      {matches.length > visible.length && <p className="px-3 py-2 text-xs text-gray-500 border-t">Showing {visible.length} of {matches.length}. Type more to narrow the search.</p>}
    </div>}
  </div>
}
