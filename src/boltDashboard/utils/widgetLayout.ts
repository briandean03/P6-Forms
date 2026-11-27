import type { StructureWidgetPlacement, WidgetRow } from '../api/dashboardApi';

type LayoutWidget = Pick<WidgetRow, 'widget_id' | 'widget_type' | 'widget_ast'>;
const FULL_WIDTH_IDS = new Set(['WGT-005', 'WGT-007', 'WGT-014', 'WGT-015', 'WGT-016', 'WGT-018', 'WGT-021', 'WGT-026', 'WGT-038', 'WGT-045', 'WGT-046', 'WGT-051']);
const HALF_WIDTH_IDS = new Set(['WGT-013', 'WGT-032', 'WGT-033', 'WGT-039', 'WGT-040']);

function hasWideTable(content: unknown): boolean {
  if (!content || typeof content !== 'object') return false;
  const value = content as Record<string, unknown>;
  if (Array.isArray(value.columns) && value.columns.length >= 5) return true;
  if (value.table && hasWideTable(value.table)) return true;
  return Array.isArray(value.components) && value.components.some(component => {
    if (!component || typeof component !== 'object') return false;
    return hasWideTable(component) || hasWideTable((component as Record<string, unknown>).content);
  });
}

/** JSON spans are preferences, with frontend minimums for content readability. */
export function preferredWidgetSpan(widget: LayoutWidget, requested?: number): number {
  if (FULL_WIDTH_IDS.has(widget.widget_id) ||
      ['trade_schedule_gantt', 'lookahead_table', 'narrative_summary'].includes(widget.widget_type) ||
      hasWideTable(widget.widget_ast?.content)) return 12;
  const valid = Number.isFinite(requested) && Number(requested) > 0;
  const span = valid ? Math.max(3, Math.min(12, Math.round(Number(requested)))) : 6;
  return HALF_WIDTH_IDS.has(widget.widget_id) ? Math.max(6, span) : span;
}

/** Pack in report order and share spare columns within each row. No DOM reads. */
export function resolveWidgetSpans(widgets: LayoutWidget[], placements: StructureWidgetPlacement[]): number[] {
  const requested = new Map(placements.map(p => [p.widget_id, p.grid]));
  const spans = widgets.map(widget => {
    const grid = requested.get(widget.widget_id);
    return preferredWidgetSpan(widget, grid?.preferred_width === 'full' ? 12 : grid?.column_span);
  });
  let row: number[] = [], used = 0;
  const fillRow = () => {
    // Grow the narrowest card first so partial rows remain balanced.
    while (used < 12 && row.length) {
      const next = row.reduce((smallest, index) => spans[index] < spans[smallest] ? index : smallest);
      spans[next]++;
      used++;
    }
    row = [];
    used = 0;
  };
  spans.forEach((span, index) => {
    if (used + span > 12) fillRow();
    row.push(index);
    used += span;
    if (used === 12) fillRow();
  });
  fillRow();
  return spans;
}

const SPAN_CLASSES: Record<number, string> = {
  3: 'md:col-span-3', 4: 'md:col-span-4', 5: 'md:col-span-5',
  6: 'md:col-span-6', 7: 'md:col-span-7', 8: 'md:col-span-8',
  9: 'md:col-span-9', 10: 'md:col-span-10', 11: 'md:col-span-11', 12: 'md:col-span-12',
};
export function widgetSpanClass(span: number): string {
  return `${SPAN_CLASSES[span] ?? SPAN_CLASSES[12]} min-w-0`;
}
