type ActivityRow = Record<string, unknown>;

/** Presence on distinct floors, independent of planned/actual progress mode. */
export function repeatsAcrossFloors(row: ActivityRow): boolean {
  if (row.is_single_level_activity === true) return false;
  const progress = row.progress_by_level;
  if (progress && typeof progress === 'object' && !Array.isArray(progress)) {
    const floors = Object.entries(progress).filter(([level, raw]) => {
      // "All" is a project-wide bucket, not an additional physical floor.
      if (level.trim().toLowerCase() === 'all' || !raw || typeof raw !== 'object') return false;
      const cell = raw as ActivityRow;
      if (['unavailable', 'missing', 'not_applicable'].includes(String(cell.data_status))) return false;
      return (Array.isArray(cell.source_activity_ids) && cell.source_activity_ids.length > 0) ||
        typeof cell.actual_percent === 'number' || typeof cell.planned_percent === 'number' ||
        ['available', 'partial', 'conflict'].includes(String(cell.data_status));
    });
    return floors.length >= 2;
  }
  // Older report shapes may provide only the generated level count.
  return typeof row.level_count === 'number' && row.level_count >= 2;
}
