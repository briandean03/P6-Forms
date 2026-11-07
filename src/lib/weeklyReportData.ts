export type ReportIndexRow = { report_id: string; week_num: number | null; data_date: string | null; report_type?: string }
export function weeklyReportOptions(calculations: ReportIndexRow[], sections: ReportIndexRow[]) {
  const sectionIds = new Set(sections.map(row => row.report_id))
  const reports = new Map<string, ReportIndexRow>()
  for (const row of [...sections, ...calculations]) {
    if (!row.report_id || (row.report_type && row.report_type.replace(/[\W_]/g, '').toLowerCase() !== 'weeklyprogressreport')) continue
    reports.set(row.report_id, row)
  }
  return [...reports.values()].sort((a, b) => (Date.parse(b.data_date ?? '') || 0) - (Date.parse(a.data_date ?? '') || 0) || (b.week_num ?? -1) - (a.week_num ?? -1) || a.report_id.localeCompare(b.report_id))
    .map(row => {
      const date = row.data_date ? new Date(row.data_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''
      const hasSections = sectionIds.has(row.report_id)
      return { ...row, hasSections, label: `Week ${row.week_num ?? '?'} — ${date}${hasSections ? '' : ' (sections not generated)'}` }
    })
}

export async function allWeeklyRows<T>(query: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> }, pageSize = 500) {
  const rows: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const result = await query().range(offset, offset + pageSize - 1)
    if (result.error) return { data: [] as T[], error: result.error }
    rows.push(...(result.data ?? []))
    if (!result.data || result.data.length < pageSize) return { data: rows, error: null }
  }
}

export function disciplineLookup(rows: { discipline_code: string | null; discipline_name: string | null }[]) {
  const names: Record<string, string> = {}
  const ambiguous = new Set<string>()
  for (const row of rows) {
    const code = row.discipline_code?.trim().toUpperCase(), name = row.discipline_name?.trim()
    if (!code || !name || ambiguous.has(code)) continue
    if (names[code] && names[code] !== name) { delete names[code]; ambiguous.add(code) }
    else names[code] = name
  }
  return names
}
