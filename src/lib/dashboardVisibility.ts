// Presentation policy applies to all reporting weeks, without deleting source data.
const hiddenWidgets = new Set(['WGT-011', 'WGT-012', 'WGT-036', 'WGT-037'])
export const isDashboardWidgetVisible = (id: string | null | undefined) => !hiddenWidgets.has(id ?? '')

export function visibleDashboardRegions<T extends { widget_ids: string[] }>(regions: T[]): T[] {
  return regions.map(region => ({ ...region, widget_ids: region.widget_ids.filter(isDashboardWidgetVisible) }))
    .filter((region, index) => !regions[index].widget_ids.length || region.widget_ids.length > 0)
}
