import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'

export interface AppLocation<T extends string> {
  view: 'home' | 'app'
  activeTab: T
  selectedProjectId: string
  selectedSchemaName: string
}

function resetScroll() {
  window.scrollTo(0, 0)
  document.querySelector('main')?.scrollTo(0, 0)
}

export function readAppLocation<T extends string>(url: URL, tabs: readonly T[]): AppLocation<T> {
  const project = url.searchParams.get('project') ?? ''
  const requested = url.searchParams.get('tab')
  return {
    view: project || url.searchParams.get('view') === 'app' ? 'app' : 'home',
    activeTab: tabs.find(tab => tab === requested) ?? ('dashboard' as T),
    selectedProjectId: project,
    selectedSchemaName: project ? url.searchParams.get('schema') || 'public' : 'public',
  }
}

export function useAppNavigation<T extends string>(tabs: readonly T[]) {
  const [route, setRoute] = useState(() => readAppLocation(new URL(window.location.href), tabs))
  const current = useRef(route)
  const navigate = useCallback((patch: Partial<AppLocation<T>>) => {
    const next = { ...current.current, ...patch }
    if (Object.keys(next).every(key => next[key as keyof typeof next] === current.current[key as keyof typeof next])) return
    const url = new URL(window.location.href)
    for (const key of ['project', 'schema', 'tab', 'report', 'view']) url.searchParams.delete(key)
    url.hash = ''
    if (next.view === 'app') {
      url.searchParams.set('view', 'app')
      url.searchParams.set('tab', next.activeTab)
      if (next.selectedProjectId) {
        url.searchParams.set('project', next.selectedProjectId)
        url.searchParams.set('schema', next.selectedSchemaName)
      }
    }
    window.history.pushState(window.history.state, '', url)
    current.current = next
    setRoute(next)
    resetScroll()
  }, [])
  useEffect(() => {
    const restore = () => {
      const next = readAppLocation(new URL(window.location.href), tabs)
      current.current = next
      setRoute(next)
      if (!window.location.hash) resetScroll()
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [tabs])
  return { ...route, navigate }
}

// Keep real hrefs for copying/opening deep links, but section clicks replace the
// current report entry rather than inserting another browser Back step.
export function replaceSectionLink(event: MouseEvent<HTMLElement>) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]')
  if (!anchor || !event.currentTarget.contains(anchor) || anchor.target === '_blank') return
  const hash = anchor.getAttribute('href') ?? ''
  if (!/^#(?:section-.+|cover|toc)$/.test(hash)) return
  let id: string
  try { id = decodeURIComponent(hash.slice(1)) } catch { return }
  const target = document.getElementById(id)
  if (!target) return
  event.preventDefault()
  const url = new URL(window.location.href)
  url.hash = hash
  window.history.replaceState(window.history.state, '', url)
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
