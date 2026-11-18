import { useMemo, useState } from 'react'
import type { ThemeTokens } from '../theme/designTheme'
import { formatCellValue } from './widgetPrimitives'

type Row = Record<string, unknown>
export function HierarchicalTable({ theme, c }: { theme: ThemeTokens; c: Record<string, unknown> }) {
  const rows = useMemo(() => {
    const source = c.rows ?? c.data ?? c.items
    return Array.isArray(source) ? source.filter((row): row is Row => !!row && typeof row === 'object') : []
  }, [c])
  const config = (c.hierarchy ?? {}) as Row
  const idField = String(config.row_id_field ?? 'row_id')
  const parentField = String(config.parent_id_field ?? 'parent_id')
  const levelField = String(config.level_field ?? 'hierarchy_level')
  const expandField = String(config.expandable_field ?? 'is_expandable')
  const defaultLevel = Number(config.default_expand_level ?? 1)
  const idOf = (row: Row) => String(row[idField] ?? rows.indexOf(row))
  const levelOf = (row: Row) => Math.max(0, Number(row[levelField]) || 0)
  const byId = new Map(rows.map(row => [idOf(row), row]))
  // Support both explicit parent IDs and reports represented by ordered levels.
  const parents = new Map<string, string>()
  const stack: Row[] = []
  for (const row of rows) {
    while (stack.length && levelOf(stack[stack.length - 1]) >= levelOf(row)) stack.pop()
    const parent = row[parentField]
    if (parent != null && String(parent) !== '') parents.set(idOf(row), String(parent))
    else if (!(parentField in row) && stack.length) parents.set(idOf(row), idOf(stack[stack.length - 1]))
    stack.push(row)
  }
  const parentIds = new Set(parents.values())
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const isOpen = (id: string) => overrides[id] ?? (byId.has(id) && levelOf(byId.get(id)!) < defaultLevel)
  const visible = (row: Row) => {
    const visited = new Set([idOf(row)])
    let parent = parents.get(idOf(row))
    while (parent != null && byId.has(parent)) {
      if (visited.has(parent)) return true // malformed cycles must not hang the page
      visited.add(parent)
      if (!isOpen(parent)) return false
      parent = parents.get(parent)
    }
    return true
  }
  const columns = (Array.isArray(c.columns) && c.columns.length ? c.columns : Object.keys(rows[0] ?? {}).filter(key => ![idField, parentField, levelField, expandField].includes(key))).map(column => {
    if (typeof column === 'string') return { key: column, label: column, alignment: 'left', data_type: undefined }
    const col = column as Row
    return { key: String(col.key), label: String(col.label ?? col.key), alignment: col.alignment, data_type: typeof col.data_type === 'string' ? col.data_type : undefined }
  })
  if (!rows.length) return <p className="text-sm p-3">No hierarchy data available.</p>
  return <div className="print-collapse overflow-auto" style={{ maxHeight: 420 }}>
    <table className="w-full border-collapse text-[12px]">
      <thead><tr style={{ background: theme.colors.table_header_bg ?? '#F4F3F8' }}>{columns.map(col => <th key={col.key} className="px-3 py-2 text-left whitespace-nowrap">{col.label}</th>)}</tr></thead>
      <tbody>{rows.map(row => {
        const id = idOf(row), open = isOpen(id)
        const expandable = parentIds.has(id) || row[expandField] === true
        return <tr key={id} className={visible(row) ? '' : 'bolt-hierarchy-hidden'} style={{ borderBottom: `1px solid ${theme.colors.subtle_border ?? '#ECEAF6'}` }}>
          {columns.map((col, index) => <td key={col.key} className="px-3 py-2 whitespace-nowrap" style={{ textAlign: col.alignment === 'right' ? 'right' : 'left', color: theme.colors.text_primary, fontWeight: levelOf(row) === 0 ? 700 : 400 }}>
            <span className="inline-flex items-center gap-1" style={{ paddingLeft: index === 0 ? levelOf(row) * 16 : 0 }}>
              {index === 0 && expandable && <button type="button" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${String(row[col.key] ?? id)}`} className="no-print p-1 rounded hover:bg-gray-100" onClick={() => setOverrides(previous => ({ ...previous, [id]: !open }))}>{open ? '▾' : '▸'}</button>}
              <span>{formatCellValue(row[col.key], col.data_type)}</span>
            </span>
          </td>)}
        </tr>
      })}</tbody>
    </table>
  </div>
}
