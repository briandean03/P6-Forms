import { ReactNode, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { AlertTriangle } from "lucide-react";
import type { ThemeTokens } from "@/boltDashboard/theme/designTheme";
import { radius, shadow, space } from "@/boltDashboard/theme/designTheme";

export function WidgetCard({
  theme,
  title,
  widgetId,
  dataStatus,
  children,
  className = "",
  eyebrow,
  headerStatus,
  compact = false,
}: {
  theme: ThemeTokens;
  title: string;
  widgetId: string;
  dataStatus?: string;
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  headerStatus?: string;
  compact?: boolean;
}) {
  const unavailable = dataStatus === "unavailable";
  const partial = dataStatus === "partial";

  return (
    <section
      className={`print-widget flex flex-col min-w-0 overflow-hidden ${className}`}
      style={{
        background: theme.colors.surface_primary ?? "#FFFFFF",
        border: `1px solid ${theme.colors.subtle_border ?? "#D9D6E8"}`,
        borderRadius: radius(theme, "widget_card"),
        boxShadow: shadow(theme, "shadow_card"),
        padding: compact ? 16 : space(theme, "widget_padding"),
      }}
      aria-label={title}
    >
      <header className={`${compact ? "mb-2" : "mb-4"} flex gap-1.5 ${eyebrow ? "flex-col" : "items-start justify-between"}`}>
        {eyebrow && (
          <span className="no-print text-[11px] font-medium leading-4" style={{ color: theme.colors.muted_text }}>
            {eyebrow}
          </span>
        )}
        <div className="flex min-w-0 items-start justify-between gap-3">
          <h3
            className="text-[14px] font-semibold leading-5 break-words"
            style={{ color: theme.colors.text_primary }}
          >
            {title}
          </h3>
          {!eyebrow && (
            <span className="no-print shrink-0 text-[10px] font-medium tracking-wide" style={{ color: theme.colors.muted_text }}>
              {widgetId}
            </span>
          )}
          {headerStatus && (
            <span
              className="no-print shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{ background: theme.colors.warning_bg ?? "#FBF1DF", color: theme.colors.warning ?? "#D99A39" }}
            >
              {headerStatus}
            </span>
          )}
        </div>
      </header>

      {unavailable ? (
        <div
          className="flex-1 flex flex-col items-center justify-center gap-2 py-10"
          style={{
            background: theme.colors.empty_data_bg ?? "#F4F3F8",
            borderRadius: radius(theme, "radius_md"),
          }}
        >
          <AlertTriangle size={20} style={{ color: theme.colors.unavailable ?? theme.colors.muted_text }} />
          <p className="text-[13px] font-medium" style={{ color: theme.colors.muted_text }}>
            Data unavailable for this reporting update
          </p>
        </div>
      ) : (
        <div className="flex-1 min-w-0">{children}</div>
      )}

      {partial && !unavailable && (
        <p
          className="mt-3 text-[11px] font-medium flex items-center gap-1.5"
          style={{ color: theme.colors.warning ?? "#D99A39" }}
        >
          <AlertTriangle size={12} className="shrink-0" />
          Partial data — some values may be incomplete for this update
        </p>
      )}
    </section>
  );
}

export function StatusBadge({
  theme,
  status,
  label,
}: {
  theme: ThemeTokens;
  status: string | null | undefined;
  label?: string;
}) {
  if (!status) return null;
  const map: Record<string, { bg: string; fg: string }> = {
    on_track: { bg: theme.colors.positive_bg ?? "#E6F5EF", fg: theme.colors.on_track ?? "#359D78" },
    success: { bg: theme.colors.positive_bg ?? "#E6F5EF", fg: theme.colors.success ?? "#359D78" },
    complete: { bg: theme.colors.positive_bg ?? "#E6F5EF", fg: theme.colors.success ?? "#359D78" },
    warning: { bg: theme.colors.warning_bg ?? "#FBF1DF", fg: theme.colors.warning ?? "#D99A39" },
    at_risk: { bg: theme.colors.warning_bg ?? "#FBF1DF", fg: theme.colors.warning ?? "#D99A39" },
    critical: { bg: theme.colors.negative_bg ?? "#FBE9E5", fg: theme.colors.critical ?? "#DB694F" },
    overdue: { bg: theme.colors.negative_bg ?? "#FBE9E5", fg: theme.colors.overdue ?? "#DB694F" },
    delayed: { bg: theme.colors.negative_bg ?? "#FBE9E5", fg: theme.colors.overdue ?? "#DB694F" },
    neutral: { bg: theme.colors.surface_secondary ?? "#F4F3F8", fg: theme.colors.text_secondary ?? "#6B6D7B" },
    received: { bg: theme.colors.positive_bg ?? "#E6F5EF", fg: theme.colors.success ?? "#359D78" },
    certified: { bg: theme.colors.alert_info_bg ?? "#E7E3FA", fg: theme.colors.planned ?? "#5741DF" },
    under_review: { bg: theme.colors.warning_bg ?? "#FBF1DF", fg: theme.colors.warning ?? "#D99A39" },
    in_progress: { bg: theme.colors.alert_info_bg ?? "#E7E3FA", fg: theme.colors.planned ?? "#5741DF" },
    ahead: { bg: theme.colors.positive_bg ?? "#E6F5EF", fg: theme.colors.success ?? "#359D78" },
    behind: { bg: theme.colors.negative_bg ?? "#FBE9E5", fg: theme.colors.overdue ?? "#DB694F" },
  };
  const key = status.toLowerCase().replace(/\s+/g, "_");
  const tone = map[key] ?? map.neutral;
  const text = label ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const dotColor = key === "ahead" ? theme.colors.success ?? "#359D78" : key === "behind" ? theme.colors.overdue ?? "#DB694F" : tone.fg;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {(key === "ahead" || key === "behind") && (
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
      )}
      {text}
    </span>
  );
}

export interface TableColumn {
  key: string;
  label: string;
  alignment?: string;
  data_type?: string;
}

export function formatCellValue(value: unknown, dataType?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (dataType === "percentage" || dataType === "percentage_points") {
    const n = typeof value === "number" ? value : parseFloat(String(value));
    if (!isNaN(n)) return `${n.toFixed(1)}%`;
  }
  if (dataType === "currency" || dataType === "money") {
    const n = typeof value === "number" ? value : parseFloat(String(value));
    if (!isNaN(n)) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (dataType === "count" || dataType === "number" || dataType === "integer") {
    const n = typeof value === "number" ? value : parseFloat(String(value));
    if (!isNaN(n)) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (dataType === "date" && typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  }
  return String(value);
}

function MatrixPrintOnly({ children }: { children: ReactNode }) {
  const [printing, setPrinting] = useState(() => window.matchMedia('print').matches);
  useEffect(() => {
    const media = window.matchMedia('print');
    const update = () => setPrinting(media.matches);
    // Browser print snapshots need the tables mounted before beforeprint returns.
    const before = () => flushSync(() => setPrinting(true));
    media.addEventListener('change', update);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', update);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', update);
    };
  }, []);
  return <div className="bolt-matrix-print">{printing ? children : null}</div>;
}

export function DataTable({
  theme,
  columns,
  rows,
  maxHeight,
  totals,
  dataDate,
  purplePastDates = false,
  percentColor,
  printMatrix = false,
  matrixBand = false,
}: {
  theme: ThemeTokens;
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  maxHeight?: number;
  totals?: Record<string, unknown> | null;
  dataDate?: string;
  purplePastDates?: boolean;
  /** When set, percentage cells (e.g. "42.5%") render in this color. */
  percentColor?: string;
  printMatrix?: boolean;
  matrixBand?: boolean;
}) {
  if (!rows.length) {
    return (
      <p className="text-[13px] py-6 text-center" style={{ color: theme.colors.muted_text }}>
        No rows for this reporting update
      </p>
    );
  }

  // Keep the interactive matrix intact; print manageable floor bands with
  // the identity columns repeated, without copying empty floor-only rows.
  const levelColumns = columns.filter(col => col.key.startsWith('level:'));
  if (printMatrix && levelColumns.length) {
    const identity = columns.filter(col => !col.key.startsWith('level:'));
    const bands = [];
    for (let start = 0; start < levelColumns.length; start += 10) {
      const floors = levelColumns.slice(start, start + 10);
      const bandRows: Record<string, unknown>[] = [];
      let group: Record<string, unknown> | undefined;
      for (const row of rows) {
        if (row.__group === true) { group = row; continue; }
        if (!floors.some(col => (Array.isArray(row.__present_levels) && row.__present_levels.includes(col.key.slice('level:'.length))) ||
          (row[col.key] != null && !['', '—'].includes(String(row[col.key]))))) continue;
        if (group) { bandRows.push(group); group = undefined; }
        bandRows.push(row);
      }
      if (bandRows.length) bands.push({ floors, rows: bandRows });
    }
    const shared = { theme, totals, dataDate, purplePastDates, percentColor };
    return <>
      <div className="bolt-matrix-screen">
        <DataTable {...shared} columns={columns} rows={rows} maxHeight={maxHeight} />
      </div>
      <MatrixPrintOnly>
        {bands.map((band, index) => <section className="bolt-matrix-band" key={band.floors[0].key}>
          <p className="bolt-matrix-band-label">Activity progress by floor · {band.floors[0].label} – {band.floors[band.floors.length - 1].label} · Part {index + 1} of {bands.length}</p>
          <DataTable {...shared} matrixBand columns={[...identity, ...band.floors]} rows={band.rows} />
        </section>)}
      </MatrixPrintOnly>
    </>;
  }

  const alignFor = (col: TableColumn) =>
    col.alignment === "right" || col.alignment === "center" ? col.alignment : "left";

  const renderTotals = () => {
    if (!totals) return null;
    return (
      <tr style={{ borderTop: `2px solid ${theme.colors.border_strong ?? "#CBC5F2"}` }}>
        {columns.map((col) => (
          <td
            key={col.key}
            className="px-3 py-2.5 text-[12px] font-semibold whitespace-nowrap"
            style={{ textAlign: alignFor(col), color: theme.colors.text_primary }}
          >
            {formatCellValue(totals[col.key], col.data_type)}
          </td>
        ))}
      </tr>
    );
  };

  return (
    <div
      className="print-collapse overflow-x-auto"
      style={{ maxHeight: maxHeight ? `${maxHeight}px` : undefined, overflowY: maxHeight ? "auto" : undefined }}
    >
      <table className={`w-full border-collapse text-[13px]${matrixBand ? ' bolt-matrix-table' : ''}`}>
        {matrixBand && <colgroup>{columns.map(col => <col key={col.key} style={{ width: col.key === 'activity_name' ? '75mm' : col.key === 'serial_no' ? '10mm' : undefined }} />)}</colgroup>}
        <thead>
          <tr style={{ background: theme.colors.table_header_bg ?? "#F4F3F8" }}>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-3 py-2.5 text-[12px] font-semibold tracking-wide whitespace-nowrap first:rounded-l-md last:rounded-r-md"
                style={{
                  textAlign: alignFor(col),
                  color: theme.colors.text_secondary ?? "#6B6D7B",
                }}
              >
                {col.label}
                {purplePastDates && /forecast/i.test(col.label) && /start|finish/i.test(col.key) && (
                  <span
                    className="ml-1.5 font-medium"
                    style={{ color: theme.colors.planned ?? "#5741DF", fontSize: "10px" }}
                  >
                    (Actual)
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            // Group header rows (e.g. WGT-020 trade groups) span the full width.
            if ((row as Record<string, unknown>).__group === true) {
              return (
                <tr key={`group-${String((row as Record<string, unknown>).__label ?? i)}`} style={{ background: theme.colors.surface_secondary ?? "#F4F3F8" }}>
                  <td
                    colSpan={columns.length}
                    className="px-3 py-2 text-[12px] font-bold uppercase tracking-wide whitespace-nowrap"
                    style={{ color: theme.colors.text_primary }}
                  >
                    {String((row as Record<string, unknown>).__label ?? "")}
                  </td>
                </tr>
              );
            }
            return (
            <tr
              key={String(row.row_id ?? i)}
              style={{ borderBottom: `1px solid ${theme.colors.subtle_border ?? "#ECEAF6"}` }}
            >
              {columns.map((col) => {
                const raw = row[col.key];
                const isStatusKey = col.key === "status" || col.key.endsWith("_status") || col.key === "exception_severity";
                const statusVal =
                  isStatusKey && typeof raw === "string" ? raw : typeof raw === "string" && ["high", "critical", "medium", "low"].includes(raw.toLowerCase()) ? raw : null;
                const isDate = col.data_type === "date" || (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw));
                const actualized =
                  purplePastDates &&
                  dataDate &&
                  isDate &&
                  /start|finish/i.test(col.key) &&
                  typeof raw === "string" &&
                  new Date(raw).getTime() < new Date(dataDate).getTime();
                const isPercent =
                  percentColor != null &&
                  col.data_type === "percentage" &&
                  typeof raw === "string" &&
          /^\d+(\.\d+)?%$/.test(raw);
                return (
                  <td
                    key={col.key}
                    className="px-3 py-2.5 whitespace-nowrap"
                    style={{
                      textAlign: alignFor(col),
                      color: actualized
                        ? theme.colors.planned ?? "#5741DF"
                        : isPercent
                          ? percentColor
                          : theme.colors.text_primary,
                      fontWeight: actualized || isPercent ? 600 : undefined,
                    }}
                  >
                    {statusVal && typeof statusVal === "string" ? (
                      <StatusBadge theme={theme} status={statusVal} />
                    ) : (
                      formatCellValue(raw, col.data_type)
                    )}
                  </td>
                );
              })}
            </tr>
            );
          })}
          {renderTotals()}
        </tbody>
      </table>
    </div>
  );
}
