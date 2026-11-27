import { preferredWidgetSpan, widgetSpanClass } from '../utils/widgetLayout';
import { repeatsAcrossFloors } from '../utils/repeatingFloors';
import { MajorExceptionsPanel } from "./MajorExceptionsPanel";
import { EngineeringSubmissionsSummary } from "./EngineeringSubmissionsSummary";
import { HierarchicalTable } from './HierarchicalTable';
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { WidgetAst, WidgetRow } from "@/boltDashboard/api/dashboardApi";
import { ThemeTokens, radius } from "@/boltDashboard/theme/designTheme";
import { DataTable, StatusBadge, TableColumn, formatCellValue, WidgetCard } from "@/boltDashboard/components/widgetPrimitives";
import {
  ChartSeries,
  ChartDatum,
  DonutChart,
  TransmittalDonutChart,
  ResourceComparisonBarChart,
  GroupedBarChart,
  LineChart,
  StackedBarChart,
} from "@/boltDashboard/components/charts";
import { UnsupportedWidgetNotice } from "@/boltDashboard/components/UnsupportedWidgetNotice";
import { NarrativeSummary } from "@/boltDashboard/components/NarrativeSummary";
import { ExceptionTable } from "@/boltDashboard/components/ExceptionTable";
import { EngineeringSubmissionsTrend } from "@/boltDashboard/components/EngineeringSubmissionsTrend";
import { PositionWidget, SubmissionsKpiPanel } from "@/boltDashboard/components/ProgressPositionPanels";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>;

function contentOf(ast: WidgetAst): Rec {
  return (ast.content ?? {}) as Rec;
}

function seriesOf(c: Rec): ChartSeries[] {
  const arr = c.series;
  if (!Array.isArray(arr)) return [];
  return arr.map((s: Rec) => ({
    name: String(s.name ?? s.label ?? s.value_field ?? "Series"),
    value_field: String(s.value_field),
    color_token: s.color_token,
    semantic_series: s.semantic_series,
    unit: s.unit,
    display_order: s.display_order,
    stack: s.stack,
  }));
}

function columnsOf(c: Rec): TableColumn[] {
  const arr = c.columns;
  if (!Array.isArray(arr)) return [];
  return arr.map((col: Rec) => ({
    key: String(col.key),
    label: String(col.label ?? col.key),
    alignment: col.alignment,
    data_type: col.data_type,
  }));
}

function rowsOf(c: Rec): ChartDatum[] {
  const arr = c.rows;
  return Array.isArray(arr) ? (arr as ChartDatum[]) : [];
}

function roundNumbersDeep(value: unknown): unknown {
  if (typeof value === "number") return Math.round(value);
  if (Array.isArray(value)) return value.map(roundNumbersDeep);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Rec).map(([k, v]) => [k, roundNumbersDeep(v)]));
  }
  return value;
}

function KpiGrid({ theme, kpis, widgetId, twoColumn }: { theme: ThemeTokens; kpis: Rec[]; widgetId?: string; twoColumn?: boolean }) {
  if (!Array.isArray(kpis) || !kpis.length) return null;
  const isWgt051 = widgetId === "WGT-051";
  return (
    <div
      className={`grid gap-3${isWgt051 ? " wgt-051-kpi-grid" : widgetId === "WGT-016" ? " grid-cols-4" : widgetId === "WGT-031" ? " grid-cols-2 md:grid-cols-4" : twoColumn ? " sm:grid-cols-2" : " sm:grid-cols-2 xl:grid-cols-4"}`}
      style={isWgt051 ? ({ "--kpi-count": kpis.length } as React.CSSProperties) : undefined}
    >
      {kpis.map((k, idx) => {
        const variance = k.variance;
        const varianceFavorable =
          typeof variance === "number"
            ? k.variance_direction
              ? k.variance_direction === "favorable"
              : k.semantic
                ? String(k.semantic).includes("positive")
                : variance >= 0
            : null;
        const display = k.display as Rec | undefined;
        const label = String(k.label ?? k.key ?? "").toLowerCase();
        const isOutstanding = isWgt051 && label.includes("outstanding");
        const isOverdue = isWgt051 && label.includes("overdue");
        const cardPadding = isWgt051 ? "p-3" : "p-4";
        const cardBackground = isOutstanding
          ? theme.colors.positive_bg ?? "#E6F5EF"
          : isOverdue
            ? theme.colors.warning_bg ?? "#FBF1DF"
            : theme.colors.surface_primary ?? "#FFFFFF";
        const cardBorder = isOutstanding
          ? theme.colors.success ?? "#359D78"
          : isOverdue
            ? theme.colors.warning ?? "#D99A39"
            : theme.colors.subtle_border ?? "#D9D6E8";
        return (
          <div
            key={String(k.key ?? idx)}
            className={`flex flex-col gap-1 ${cardPadding} min-w-0 overflow-hidden`}
            style={{
              background: cardBackground,
              border: `1px solid ${cardBorder}`,
              borderRadius: radius(theme, "kpi_card"),
              boxShadow: theme.shadows.shadow_card,
              minHeight: isWgt051 ? 68 : 96,
            }}
          >
            <span
              className="text-[11px] font-semibold uppercase leading-4 break-words"
              style={{ color: theme.colors.text_secondary, letterSpacing: "0.04em" }}
            >
              {String(k.label ?? k.key ?? "")}
            </span>
            <span
              className={`font-semibold tabular-nums break-words ${isWgt051 ? "text-[24px] leading-7" : "text-[28px] leading-8"}`}
              style={{ color: theme.colors.text_primary, letterSpacing: "-0.02em", overflowWrap: "anywhere" }}
            >
              {String(k.display_value ?? display?.value ?? formatCellValue(k.value, k.data_type))}
              {k.unit && !k.display_value && !display?.value && k.unit !== "%" ? (
                <span className="inline-block whitespace-nowrap text-[12px] font-semibold ml-0.5" style={{ color: theme.colors.muted_text }}>
                  {k.unit}
                </span>
              ) : null}
            </span>
            {/* Preformatted variance from the source AST takes precedence */}
            {display?.variance ? (
              <span
                className="text-[12px] font-medium tabular-nums"
                style={{
                  color:
                    k.semantic && String(k.semantic).includes("positive")
                      ? theme.colors.success
                      : k.semantic && String(k.semantic).includes("negative")
                        ? theme.colors.critical
                        : k.semantic && String(k.semantic).includes("warning")
                          ? theme.colors.warning
                          : theme.colors.text_secondary,
                }}
              >
                {String(display.variance)}
              </span>
            ) : (
              typeof variance === "number" && (
                <span
                  className="text-[11px] font-semibold tabular-nums"
                  style={{
                    color:
                      varianceFavorable == null
                        ? theme.colors.muted_text
                        : varianceFavorable
                          ? theme.colors.success
                          : theme.colors.critical,
                  }}
                >
                  {variance >= 0 ? "+" : ""}
                  {k.variance_unit === "days"
                    ? `${Math.round(variance)} days`
                    : `${variance.toFixed(2)}${k.variance_unit === "pp" ? " pp" : k.variance_unit === "%" ? "%" : k.variance_unit ? ` ${k.variance_unit}` : ""}`}
                  {varianceFavorable != null ? (varianceFavorable ? " · favorable" : " · unfavorable") : ""}
                </span>
              )
            )}
            {/* Supporting text / comparison supplied by the AST — wrapped, readable blocks */}
            {k.supporting_text && (
              <span className="text-[11px] leading-4 break-words" style={{ color: theme.colors.muted_text, overflowWrap: "anywhere" }}>
                {String(k.supporting_text)}
              </span>
            )}
            {typeof k.comparison_value === "number" && !display?.comparison_value && (
              <span className="text-[11px] font-medium tabular-nums leading-4 break-words" style={{ color: theme.colors.text_secondary }}>
                {String(k.comparison_label ?? "Previous")}{" "}
                {String(k.comparison_display_value ?? formatCellValue(k.comparison_value, k.data_type))}
              </span>
            )}
            {display?.comparison_value && (
              <span className="text-[11px] font-medium tabular-nums leading-4 break-words" style={{ color: theme.colors.text_secondary }}>
                {String(k.comparison_label ?? "Previous")} {String(display.comparison_value)}
              </span>
            )}
            {k.status && (
              <span className="mt-auto pt-1">
                <StatusBadge
                  theme={theme}
                  status={String(k.status)}
                  label={k.status_label ? String(k.status_label) : undefined}
                />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MetadataPanel({ theme, c }: { theme: ThemeTokens; c: Rec }) {
  const primary = c.primary_identity as Rec | undefined;
  const secondary = c.secondary_identity as Rec | undefined;
  const fields = Array.isArray(c.fields) ? (c.fields as Rec[]) : [];

  return (
    <div className="flex flex-col gap-4">
      {(primary || secondary) && (
        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-1">
          {primary && (
            <span className="text-[18px] font-bold leading-6" style={{ color: theme.colors.text_primary }}>
              {String(primary.value ?? "")}
            </span>
          )}
          {secondary && (
            <span className="text-[13px] font-medium" style={{ color: theme.colors.text_secondary }}>
              {String(secondary.value ?? "")}
            </span>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2.5">
        {fields.map((f) => (
          <div key={String(f.key)} className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide font-medium" style={{ color: theme.colors.muted_text }}>
              {String(f.label ?? f.key)}
            </span>
            <span className="text-[12px] font-medium break-words" style={{ color: theme.colors.text_primary }}>
              {formatCellValue(f.value, f.data_type)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Observations({ theme, notes }: { theme: ThemeTokens; notes: string[] }) {
  if (!notes.length) return null;
  return (
    <ul className="mt-4 flex flex-col gap-2">
      {notes.map((n, i) => (
        <li
          key={i}
          className="text-[12px] leading-5 flex gap-2 break-words"
          style={{ color: theme.colors.text_secondary, overflowWrap: "anywhere" }}
        >
          <span className="shrink-0" style={{ color: theme.colors.planned }}>
            •
          </span>
          <span className="min-w-0">{n}</span>
        </li>
      ))}
    </ul>
  );
}

// WGT-022/023/024 ship three different AST shapes for the same two-ring
// transmittal donut; this helper pulls the planned-to-date total out of
// whichever variant is present.
function plannedCountOf(c: Rec): number | null {
  const p = c.planned_inner_ring as Rec | undefined;
  if (p && typeof p.planned_count === "number") return p.planned_count as number;
  const progress = (c.submission_progress ?? {}) as Rec;
  if (typeof progress.planned_submissions_to_datadate === "number") {
    return progress.planned_submissions_to_datadate as number;
  }
  return null;
}

function CategoryLabel(field: string, categoryLabelField?: string) {
  return categoryLabelField ?? (field === "week_num" ? "week_label" : field);
}

// WGT-038/039/040 share one KPI selection, picked via pills in WGT-038.
// Rows in all three carry kpi_key (unique per KPI+unit) plus kpi_name/kpi_label.
const kpiNameOf = (r: Rec): string => String(r.kpi_key ?? r.kpi_name ?? r.kpi_label ?? r.kpi ?? r.label ?? r.key ?? "");

export function WidgetRenderer({
  theme,
  widget,
  placement,
  dataDate,
  kpiSelection,
  onKpiSelectionChange,
  allWidgets,
}: {
  theme: ThemeTokens;
  widget: WidgetRow;
  placement?: { column_span?: number };
  dataDate?: string;
  kpiSelection?: string[] | null;
  onKpiSelectionChange?: (kpis: string[]) => void;
  allWidgets?: WidgetRow[];
}) {
  const ast = widget.widget_ast;
  const wholeNumbers = widget.widget_id === "WGT-034";
  // WGT-020: planned/actual progress toggle for the level columns.
  const [wgt20Mode, setWgt20Mode] = useState<"planned" | "actual">("actual");
  const c = (wholeNumbers ? roundNumbersDeep(contentOf(ast)) : contentOf(ast)) as Rec;
  const type = widget.widget_type;
  const isKpiWidget =
    widget.widget_id === "WGT-038" || widget.widget_id === "WGT-039" || widget.widget_id === "WGT-040";
  const span = preferredWidgetSpan(widget, placement?.column_span);

  const kpiNames = isKpiWidget
    ? Array.from(new Set((Array.isArray(c.data) ? (c.data as Rec[]) : []).map(kpiNameOf).filter(Boolean)))
    : null;
  const activeKpis = kpiNames ? (kpiSelection ?? kpiNames) : null;
  const filterKpiRows = (rows: Rec[]): Rec[] =>
    activeKpis && isKpiWidget
      ? rows.filter((r) => activeKpis.includes(kpiNameOf(r)))
      : rows;

  const gridClass = widgetSpanClass(span);

  if (widget.widget_id === "WGT-021" && ["kpi_group", "kpi_grid", "status_summary"].includes(type)) {
    return (
      <WidgetCard
        theme={theme}
        title={widget.widget_title}
        widgetId={widget.widget_id}
        dataStatus={widget.data_status}
        eyebrow={`${widget.widget_id} · ${widget.widget_type}`}
        className={gridClass}
      >
        <SubmissionsKpiPanel theme={theme} ast={ast} />
      </WidgetCard>
    );
  }

  if (widget.widget_id === "WGT-003") {
    return (
      <PositionWidget
        theme={theme}
        ast={ast}
        widgetId={widget.widget_id}
        title={widget.widget_title}
        widgetType={widget.widget_type}
        dataStatus={widget.data_status}
        className={gridClass}
      />
    );
  }

  if (widget.widget_id === "WGT-015") {
    // Status-per-transmittal-type table, sourced from WGT-025's hierarchy rows
    // (the only place all four types carry status counts in this update).
    const wgt25 = (allWidgets ?? []).find((w) => w.widget_id === "WGT-025");
    const w25Rows = Array.isArray(wgt25?.widget_ast.content?.rows)
      ? (wgt25.widget_ast.content.rows as Rec[])
      : [];
    const typeLabels: Record<string, string> = {
      PRQ: "Prequalification",
      DWG: "Shop Drawings",
      MAT: "Material Submittals",
      MST: "Method Statements",
    };
    const typeOrder = ["PRQ", "DWG", "MAT", "MST"];
    const typeRows = w25Rows.filter((r) => r.row_type === "transmittal_type");
    const tableRows = typeOrder
      .map((code) => {
        const r = typeRows.find((x) => String(x.row_id) === `transmittal_type:${code}`);
        if (!r) return null;
        const total = typeof r.total_transmittals === "number" ? (r.total_transmittals as number) : 0;
        const submitted = (["A", "B", "C", "D", "UR"] as const).reduce(
          (acc, s) => acc + (typeof r[s] === "number" ? (r[s] as number) : 0),
          0,
        );
        return { code, label: typeLabels[code] ?? code, total, submitted, balance: Math.max(0, total - submitted) };
      })
      .filter((r): r is { code: string; label: string; total: number; submitted: number; balance: number } => r !== null);
    return (
      <WidgetCard
        theme={theme}
        title="Engineering Submissions Status by Transmittal Type"
        widgetId={widget.widget_id}
        dataStatus={widget.data_status}
        className={gridClass}
      >
        {tableRows.length ? (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr style={{ background: theme.colors.table_header_bg ?? "#F4F3F8" }}>
                {["Transmittal Type", "Total Transmittals", "Submitted (A+B+C+D+UR)", "Balance to be Submitted"].map((h, hi) => (
                  <th
                    key={h}
                    className={`px-3 py-2.5 text-[12px] font-semibold tracking-wide ${hi === 0 ? "text-left" : "text-right"} first:rounded-l-md last:rounded-r-md`}
                    style={{ color: theme.colors.text_secondary ?? "#6B6D7B" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.code} style={{ borderBottom: `1px solid ${theme.colors.subtle_border ?? "#ECEAF6"}` }}>
                  <td className="px-3 py-2.5 text-[13px] font-medium" style={{ color: theme.colors.text_primary }}>
                    {r.label}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: theme.colors.text_primary }}>
                    {r.total.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: theme.colors.success ?? "#359D78" }}>
                    {r.submitted.toLocaleString()}
                  </td>
                  <td
                    className="px-3 py-2.5 text-right tabular-nums font-semibold"
                    style={{ color: r.balance > 0 ? theme.colors.warning ?? "#D99A39" : theme.colors.text_secondary }}
                  >
                    {r.balance.toLocaleString()}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: `2px solid ${theme.colors.border_strong ?? "#CBC5F2"}` }}>
                <td className="px-3 py-2.5 text-[12px] font-semibold" style={{ color: theme.colors.text_primary }}>
                  Total
                </td>
                <td className="px-3 py-2.5 text-right text-[12px] font-semibold tabular-nums" style={{ color: theme.colors.text_primary }}>
                  {tableRows.reduce((a, r) => a + r.total, 0).toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-right text-[12px] font-semibold tabular-nums" style={{ color: theme.colors.success ?? "#359D78" }}>
                  {tableRows.reduce((a, r) => a + r.submitted, 0).toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-right text-[12px] font-semibold tabular-nums" style={{ color: theme.colors.warning ?? "#D99A39" }}>
                  {tableRows.reduce((a, r) => a + r.balance, 0).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="py-6 text-center text-[13px]" style={{ color: theme.colors.muted_text }}>
            Transmittal-type status data is not available for this reporting update.
          </p>
        )}
        {Array.isArray(c.notes) && (c.notes as string[]).length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {(c.notes as string[]).map((n, i) => (
              <li key={i} className="text-[12px] leading-5 flex gap-2" style={{ color: theme.colors.text_secondary }}>
                <span className="shrink-0" style={{ color: theme.colors.planned }}>•</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        )}
      </WidgetCard>
    );
  }

  if (widget.widget_id === "WGT-026") {
    return (
      <WidgetCard
        theme={theme}
        title="Engineering Submissions - Weekly Trend"
        widgetId={widget.widget_id}
        dataStatus={widget.data_status}
        className={gridClass}
      >
        <EngineeringSubmissionsTrend
          theme={theme}
          data={Array.isArray(c.data) ? (c.data as ChartDatum[]) : []}
          series={seriesOf(c)}
          categoryField={String(c.category_field ?? "period_end")}
        />
      </WidgetCard>
    );
  }

  if ((widget.widget_id === "WGT-007" && type !== "narrative_summary") ||
      (widget.widget_id === "WGT-005" && type === "status_summary" && Array.isArray(c.kpis))) {
    return <WidgetCard theme={theme} title={widget.widget_title} widgetId={widget.widget_id} dataStatus={widget.data_status} className={gridClass}>
      {widget.widget_id === "WGT-007" ? <MajorExceptionsPanel theme={theme} ast={ast} /> : <EngineeringSubmissionsSummary theme={theme} ast={ast} />}
    </WidgetCard>;
  }

  if (widget.widget_type === "narrative_summary") {
    return (
      <WidgetCard
        theme={theme}
        title={widget.widget_title}
        widgetId={widget.widget_id}
        dataStatus={widget.data_status}
        eyebrow={`${widget.widget_id} · narrative summary`}
        className={gridClass}
      >
        <NarrativeSummary theme={theme} ast={ast} />
      </WidgetCard>
    );
  }

  let body: JSX.Element | null = null;

  // WGT-005 in early updates is typed composite (donut + discipline table).
  if (widget.widget_id === "WGT-005" && type === "composite") {
    const donutComp = (Array.isArray(c.components) ? (c.components as Rec[]) : []).find(
      (comp) => comp.component_type === "donut_chart",
    );
    const donutContent = (donutComp?.content ?? donutComp ?? {}) as Rec;
    const submissionAnnotation = (donutComp?.submission_annotation ?? {}) as Rec;
    const annotationCards: [string, string][] = [
      ["planned_submissions_to_datadate", "Planned submissions to data date"],
      ["submitted_to_datadate", "Submitted to data date"],
      ["overdue_not_submitted", "Overdue — not submitted"],
      ["under_review_over_14_days", "Under review over 14 days"],
      ["status_c_not_resubmitted_over_14_days", "Status C not resubmitted over 14 days"],
    ];
    body = (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-3">
          <p className="text-[12px] font-semibold mb-2" style={{ color: theme.colors.text_secondary }}>
            {String(donutComp?.title ?? "")}
          </p>
          <DonutChart
            height={340}
            theme={theme}
            data={(donutContent.data ?? []) as ChartDatum[]}
            categoryField={String(donutContent.category_field ?? "status_code")}
            valueField={String(donutContent.value_field ?? "count")}
            centerMetric={
              typeof donutContent.center_total === "number"
                ? { label: String(donutContent.center_label ?? "Total"), value: donutContent.center_total as number }
                : ((donutContent.center_metric as { label: string; value: number } | undefined) ?? null)
            }
          />
        </div>
        <div className="lg:col-span-2 grid grid-cols-1 gap-2.5">
          {annotationCards.map(([key, label]) => (
            <div
              key={key}
              className="flex items-baseline justify-between gap-3 px-3.5 py-2.5"
              style={{ background: theme.colors.surface_secondary ?? "#F4F3F8", borderRadius: radius(theme, "kpi_card") }}
            >
              <span className="text-[11px] font-medium leading-4" style={{ color: theme.colors.text_secondary }}>
                {label}
              </span>
              <span className="shrink-0 text-[15px] font-semibold tabular-nums" style={{ color: theme.colors.text_primary }}>
                {typeof submissionAnnotation[key] === "number" ? (submissionAnnotation[key] as number).toLocaleString() : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
    return (
      <WidgetCard
        theme={theme}
        title={widget.widget_title}
        widgetId={widget.widget_id}
        dataStatus={widget.data_status}
        className={gridClass}
      >
        {body}
      </WidgetCard>
    );
  }

  // status_list (WGT-036/047 in early updates): flagged items with severity
  // badges plus a summary.
  if (type === "status_list") {
    const items = Array.isArray(c.items) ? (c.items as Rec[]) : [];
    const summaryBySeverity = Array.isArray(c.summary?.by_severity) ? (c.summary.by_severity as Rec[]) : [];
    const severityColor = (sev: string) =>
      sev === "critical"
        ? theme.colors.critical ?? "#DB694F"
        : sev === "warning"
          ? theme.colors.warning ?? "#D99A39"
          : theme.colors.text_secondary;
    body = (
      <div className="flex flex-col gap-3">
        {typeof c.subtitle === "string" && (
          <p className="text-[12px] leading-5" style={{ color: theme.colors.text_secondary }}>
            {c.subtitle}
          </p>
        )}
        {summaryBySeverity.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {summaryBySeverity.map((s) => (
              <span
                key={String(s.severity)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold"
                style={{ background: theme.colors.surface_secondary ?? "#F4F3F8", color: severityColor(String(s.severity)) }}
              >
                {String(s.severity_label ?? s.severity)}: {Number(s.count ?? 0)}
              </span>
            ))}
          </div>
        )}
        {items.map((item, i) => (
          <div
            key={String(item.item_id ?? i)}
            className="p-4"
            style={{ background: theme.colors.surface_secondary ?? "#F4F3F8", borderRadius: radius(theme, "radius_md"), borderLeft: `3px solid ${severityColor(String(item.severity))}` }}
          >
            <p className="text-[12px] font-semibold" style={{ color: theme.colors.text_primary }}>
              {String(item.label ?? "")}
              {item.affected_area ? (
                <span className="ml-2 font-medium" style={{ color: theme.colors.muted_text }}>
                  {String(item.affected_area)}
                </span>
              ) : null}
            </p>
            {item.detail && (
              <p className="mt-1 text-[12px] leading-5" style={{ color: theme.colors.text_secondary }}>
                {String(item.detail)}
              </p>
            )}
          </div>
        ))}
        {typeof c.summary?.summary_label === "string" && (
          <p className="text-[11px] leading-4" style={{ color: theme.colors.muted_text }}>
            {String(c.summary.summary_label)}
          </p>
        )}
        {typeof c.reporting_context === "string" && (
          <p className="text-[11px] leading-4" style={{ color: theme.colors.muted_text }}>
            {String(c.reporting_context)}
          </p>
        )}
      </div>
    );
    return (
      <WidgetCard
        theme={theme}
        title={widget.widget_title}
        widgetId={widget.widget_id}
        dataStatus={widget.data_status}
        className={gridClass}
      >
        {body}
      </WidgetCard>
    );
  }

  // WGT-038 hosts the shared KPI pills that drive WGT-039/040 too.
  const kpiPills = kpiNames ? (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide mr-1" style={{ color: theme.colors.text_secondary }}>
        KPIs:
      </span>
      <button type="button" className="px-2 py-1 text-[11px] rounded border" onClick={() => onKpiSelectionChange?.(kpiNames)}>Select all</button>
      <button type="button" className="px-2 py-1 text-[11px] rounded border" onClick={() => onKpiSelectionChange?.([])}>Clear all</button>
      {!activeKpis?.length && <span role="status" className="text-xs">Select KPIs to compare.</span>}
      {kpiNames.map((key) => {
        const on = (activeKpis ?? []).includes(key);
        const row = (Array.isArray(c.data) ? (c.data as Rec[]) : []).find((r) => kpiNameOf(r) === key);
        const label = String(row?.kpi_label ?? row?.kpi_name ?? key);
        return (
          <button
            key={key}
            aria-pressed={on}
            type="button"
            onClick={() => {
              if (!onKpiSelectionChange) return;
              const current = new Set(activeKpis ?? []);
              if (current.has(key)) {
                current.delete(key);
              } else {
                current.add(key);
              }
              onKpiSelectionChange(Array.from(current));
            }}
            className="px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors"
            style={{
              background: on ? theme.colors.primary : theme.colors.surface_primary ?? "#FFFFFF",
              color: on ? "#FFFFFF" : theme.colors.text_secondary,
              borderColor: on ? theme.colors.primary : theme.colors.subtle_border ?? "#D9D6E8",
              cursor: "pointer",
            }}
            title={label}
          >
            {label}
          </button>
        );
      })}
    </div>
  ) : null;

  switch (type) {
    case "metadata_panel":
    // WGT-001 is typed kpi_group but carries identity fields; render the
    // identity strip either way.
    // "composite" (WGT-005 in older updates) carries components[] and is
    // handled by the WGT-005 branch below.
    case "composite":
    case "kpi_group": {
      if (widget.widget_id === "WGT-001" || type === "metadata_panel") {
        body = <MetadataPanel theme={theme} c={c} />;
        break;
      }
      if (widget.widget_id === "WGT-022") {
        // Rendered through the shared two-ring transmittal donut (PAGE-004 row).
        body = (
          <TransmittalDonutChart
            theme={theme}
            data={(Array.isArray(c.status_ring?.data) ? c.status_ring.data : (Array.isArray(c.data) ? c.data : [])) as ChartDatum[]}
            categoryField="status"
            valueField="count"
            centerMetric={
              typeof c.total_transmittals === "number"
                ? { label: String(c.center_label ?? "Total Transmittals"), value: c.total_transmittals as number }
                : typeof c.center_total === "number"
                  ? { label: String(c.center_label ?? "Total Transmittals"), value: c.center_total as number }
                  : null
            }
            plannedCount={plannedCountOf(c)}
            height={340}
          />
        );
        break;
      }
      // WGT-002 ships two shapes over successive updates: kpis[] keyed by
      // `key` and components[] keyed by component_id. Render both. Cards are
      // grouped into planned-vs-actual pairs on violet/green tinted panels;
      // the standalone variance card is folded into the cumulative pair.
      if (widget.widget_id === "WGT-002") {
        const comps = Array.isArray(c.components) ? (c.components as Rec[]) : [];
        const notes = Array.isArray(c.observations) ? (c.observations as string[]) : [];
        const source: Rec[] = comps.length
          ? comps
          : Array.isArray(c.kpis)
            ? (c.kpis as Rec[])
            : [];
        const idOf = (k: Rec) => String(k.component_id ?? k.key ?? "");
        const findKpi = (id: string) => source.find((k) => idOf(k) === id);
        const planned = findKpi("cumulative_planned_progress");
        const actual = findKpi("cumulative_actual_progress");
        const variance = findKpi("planned_vs_actual_variance");
        const prevPlanned = findKpi("previous_week_cumulative_planned_progress");
        const prevActual = findKpi("previous_week_cumulative_actual_progress");
        const curPlanned = findKpi("current_week_planned_increment");
        const curActual = findKpi("current_week_actual_increment");
        // Elapsed vs remaining project duration (older updates ship a
        // project_duration card with a duration_bar definition).
        const durationBar = (source.find((k) => k.duration_bar && Array.isArray(k.duration_bar.segments))?.duration_bar ?? null) as Rec | null;
        const seg = (key: string) => (durationBar ? (durationBar.segments as Rec[]).find((s) => s.key === key) : undefined);

        const plannedColor = theme.colors.planned ?? "#5741DF";
        const actualColor = theme.colors.success ?? "#359D78";
        const wgt003Bg = theme.colors.surface_secondary ?? "#E7E3FA";
        const actualBg = theme.colors.positive_bg ?? "#E6F5EF";

        const pairPanel = (
          title: string,
          a: Rec | undefined,
          b: Rec | undefined,
          bg: string,
        ) => {
          if (!a && !b) return null;
          const cell = (k: Rec | undefined) =>
            k ? (
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide leading-4 break-words" style={{ color: theme.colors.text_secondary }}>
                  {String(k.label ?? "")}
                </span>
                <span
                  className="text-[26px] leading-8 font-semibold tabular-nums break-words"
                  style={{ color: theme.colors.text_primary, letterSpacing: "-0.02em", overflowWrap: "anywhere" }}
                >
                  {String(k.display_value ?? formatCellValue(k.value, k.data_type))}
                </span>
                {k.status && (
                  <span>
                    <StatusBadge theme={theme} status={String(k.status)} label={k.status_label ? String(k.status_label) : undefined} />
                  </span>
                )}
              </div>
            ) : null;
          const varianceLine =
            variance && title.startsWith("Cumulative") && typeof variance.value === "number" ? (
              <p
                className="text-[12px] font-semibold tabular-nums"
                style={{ color: (variance.value as number) >= 0 ? actualColor : theme.colors.critical ?? "#DB694F" }}
              >
                {String(
                  variance.display_value ??
                    `${Number(variance.value).toFixed(2)} ${String(variance.variance_unit ?? "pp")}`,
                )}{" "}
                <span className="font-medium" style={{ color: theme.colors.text_secondary }}>
                  vs plan
                </span>
              </p>
            ) : !variance && title.startsWith("Cumulative") && actual && typeof actual.variance === "number" ? (
              <p
                className="text-[12px] font-semibold tabular-nums"
                style={{ color: (actual.variance as number) >= 0 ? actualColor : theme.colors.critical ?? "#DB694F" }}
              >
                {String(
                  actual.variance_display_value ??
                    `${(actual.variance as number).toFixed(2)} ${String(actual.variance_unit ?? "pp")}`,
                )}{" "}
                <span className="font-medium" style={{ color: theme.colors.text_secondary }}>
                  vs plan
                </span>
              </p>
            ) : null;
          return (
            <div
              className="flex min-w-0 flex-col gap-2.5 p-4"
              style={{ background: bg, borderRadius: radius(theme, "kpi_card"), border: `1px solid ${theme.colors.subtle_border ?? "#D9D6E8"}` }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: theme.colors.text_secondary }}>
                {title}
              </p>
              <div className="grid grid-cols-2 gap-4">
                {cell(a)}
                {cell(b)}
              </div>
              {varianceLine}
            </div>
          );
        };

        const bars: { label: string; value: number; display: string; color: string }[] = [];
        if (typeof planned?.value === "number") {
          bars.push({ label: "Cumulative Planned", value: planned.value as number, display: String(planned.display_value ?? `${planned.value}%`), color: plannedColor });
        }
        if (typeof actual?.value === "number") {
          bars.push({ label: "Cumulative Actual", value: actual.value as number, display: String(actual.display_value ?? `${actual.value}%`), color: actualColor });
        }

        body = (
          <div>
            <div className="grid grid-cols-1 gap-3">
              {pairPanel("Cumulative Progress", planned, actual, wgt003Bg)}
              {pairPanel("Previous Week Progress", prevPlanned, prevActual, wgt003Bg)}
              {pairPanel("Current Week Increment", curPlanned, curActual, actualBg)}
            </div>
            {bars.length > 0 && (
              <div className="mt-4 flex flex-col gap-2.5">
                {bars.map((bar) => (
                  <div key={bar.label} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 text-[11px] font-medium" style={{ color: theme.colors.text_secondary }}>
                      {bar.label}
                    </span>
                    <div className="h-5 flex-1 overflow-hidden" style={{ background: theme.colors.empty_data_bg ?? "#F4F3F8", borderRadius: radius(theme, "radius_sm") }}>
                      <div
                        className="h-full transition-[width] duration-700 ease-out"
                        style={{ width: `${Math.min(100, bar.value)}%`, background: bar.color, borderRadius: radius(theme, "radius_sm") }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-[12px] font-semibold tabular-nums" style={{ color: theme.colors.text_primary }}>
                      {bar.display}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Observations theme={theme} notes={notes} />
            {durationBar && (
              <div className="mt-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  {durationBar.segments && (durationBar.segments as Rec[]).map((s) => (
                    <span key={String(s.key)} className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: theme.colors.text_secondary }}>
                      <span
                        className="inline-block h-2 w-2 shrink-0"
                        style={{ background: s.semantic_color === "primary" ? theme.colors.planned ?? "#5741DF" : theme.colors.empty_data_bg ?? "#D9D6E8", borderRadius: 2 }}
                      />
                      {String(s.label ?? s.key)}: {Number(s.days ?? 0).toLocaleString()} days ({Number(s.percent ?? 0).toFixed(1)}%)
                    </span>
                  ))}
                </div>
                <div
                  className="mt-1.5 flex h-2.5 overflow-hidden"
                  style={{ background: theme.colors.empty_data_bg ?? "#D9D6E8", borderRadius: radius(theme, "radius_sm") }}
                  role="img"
                  aria-label="Elapsed vs remaining project duration"
                >
                  {seg("elapsed") && (
                    <div
                      className="h-full transition-[width] duration-700 ease-out"
                      style={{ width: `${Number(seg("elapsed")?.percent ?? 0)}%`, background: theme.colors.planned ?? "#5741DF" }}
                    />
                  )}
                  {seg("remaining") && (
                    <div
                      className="h-full transition-[width] duration-700 ease-out"
                      style={{ width: `${Number(seg("remaining")?.percent ?? 0)}%`, background: theme.colors.subtle_border ?? "#D9D6E8" }}
                    />
                  )}
                </div>
                <div className="mt-1 flex items-baseline justify-between text-[10px] font-medium tabular-nums" style={{ color: theme.colors.muted_text }}>
                  <span>{String(durationBar.start_marker_label ?? "")}</span>
                  <span>Data date: {String(durationBar.data_date_marker_label ?? "")}</span>
                  <span>{String(durationBar.end_marker_label ?? "")}</span>
                </div>
              </div>
            )}
            {typeof c.summary === "string" && (
              <p className="mt-3 text-[12px] leading-5" style={{ color: theme.colors.text_secondary }}>
                {c.summary}
              </p>
            )}
          </div>
        );
        break;
      }
      // WGT-005 has shipped two shapes: components[] (donut + discipline
      // table) and a status_summary style (summary_metrics + status_distribution).
      if (widget.widget_id === "WGT-005") {
        const comps = Array.isArray(c.components) ? (c.components as Rec[]) : [];
        const donutComp = comps.find((comp) => comp.component_type === "donut_chart");
        const tableComp = comps.find((comp) => comp.component_type === "data_table" && Array.isArray(comp.rows) && Array.isArray(comp.columns));
        const notSubmitted = donutComp?.not_submitted as Rec | undefined;
        const distribution = !donutComp ? (c.status_distribution as Rec | undefined) : undefined;
        const summaryKpis = !donutComp && !tableComp && Array.isArray(c.summary_metrics) ? (c.summary_metrics as Rec[]) : [];
        body = (
          <div className="flex flex-col gap-5">
            {comps.length ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {donutComp && Array.isArray(donutComp.data) && (
                  <div>
                    <p className="text-[12px] font-semibold mb-2" style={{ color: theme.colors.text_secondary }}>
                      {String(donutComp.title ?? "")}
                    </p>
                    <DonutChart
                      theme={theme}
                      data={donutComp.data as ChartDatum[]}
                      categoryField={String(donutComp.category_field ?? "status_code")}
                      valueField={String(donutComp.value_field ?? "count")}
                      centerMetric={
                        typeof donutComp.center_total === "number"
                          ? { label: String(donutComp.center_label ?? "Total"), value: donutComp.center_total as number }
                          : null
                      }
                    />
                    {notSubmitted && typeof notSubmitted.count === "number" && (
                      <p className="mt-3 text-[12px] font-medium flex items-center gap-1.5" style={{ color: theme.colors.warning ?? "#D99A39" }}>
                        <AlertTriangle size={13} className="shrink-0" />
                        {String(notSubmitted.label ?? "Not submitted")}: {(notSubmitted.count as number).toLocaleString()}
                        {typeof notSubmitted.unit === "string" ? ` ${notSubmitted.unit}` : ""}
                      </p>
                    )}
                  </div>
                )}
                {tableComp && (
                  <div>
                    <p className="text-[12px] font-semibold mb-2" style={{ color: theme.colors.text_secondary }}>
                      {String(tableComp.title ?? "")}
                    </p>
                    <DataTable
                      theme={theme}
                      columns={columnsOf(tableComp)}
                      rows={(tableComp.rows as ChartDatum[]).filter((r) => r.row_id !== tableComp.totals_row?.row_id)}
                      totals={(tableComp.totals_row as Record<string, unknown>) ?? null}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                <div className={distribution ? "lg:col-span-3" : "lg:col-span-5"}>
                  <KpiGrid theme={theme} kpis={summaryKpis} widgetId={widget.widget_id} twoColumn />
                </div>
                {distribution && Array.isArray(distribution.data) && (
                  <div className="lg:col-span-2">
                    <p className="text-[12px] font-semibold mb-2" style={{ color: theme.colors.text_secondary }}>
                      {String(distribution.title ?? "Status distribution")}
                    </p>
                    <DonutChart
                      height={360}
                      theme={theme}
                      data={distribution.data as ChartDatum[]}
                      categoryField={String(distribution.category_field ?? "status_code")}
                      valueField="count"
                      centerMetric={
                        typeof distribution.status_count_total === "number"
                          ? { label: "Submitted documents", value: distribution.status_count_total as number }
                          : null
                      }
                    />
                  </div>
                )}
              </div>
            )}
            {typeof c.chart_summary_text === "string" && (
              <p className="text-[11px] leading-5" style={{ color: theme.colors.muted_text }}>
                {c.chart_summary_text}
              </p>
            )}
          </div>
        );
        break;
      }
      // WGT-008 in older updates is a kpi_group of cards[] rather than a line
      // chart; render the cards through the shared KPI grid.
      if (widget.widget_id === "WGT-008" && Array.isArray(c.cards)) {
        // One full-width summary strip instead of separate cards: planned %,
        // actual % and the variance in pp, all at 2 decimal places.
        const findCard = (id: string) => (c.cards as Rec[]).find((card) => String(card.card_id ?? "") === id);
        const plannedCard = findCard("cumulative_planned_progress");
        const actualCard = findCard("cumulative_actual_progress");
        const varianceCard = findCard("source_reported_variance");
        const pct2 = (v: unknown) => (typeof v === "number" ? `${v.toFixed(2)}%` : "—");
        const pp2 = (v: unknown) => (typeof v === "number" ? `${v >= 0 ? "+" : ""}${v.toFixed(2)} pp` : "—");
        // The source leaves the variance card null; derive it as actual − planned.
        const varianceValue =
          typeof varianceCard?.value === "number"
            ? (varianceCard.value as number)
            : typeof plannedCard?.value === "number" && typeof actualCard?.value === "number"
              ? (actualCard.value as number) - (plannedCard.value as number)
              : null;
        // Older updates deliver WGT-008 as summary cards with no weekly series.
        // Reuse WGT-009's cumulative planned/actual rows from the same update,
        // aggregated to month-end points so the scale reads in months.
        const wgt9 = (allWidgets ?? []).find((w) => w.widget_id === "WGT-009");
        const wgt9c = ((wgt9?.widget_ast.content ?? {}) as Rec);
        const weeklyRows = Array.isArray(wgt9c.data) ? (wgt9c.data as Rec[]) : [];
        const monthKey = (iso: string) => String(iso ?? "").slice(0, 7);
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        // The source rows hold weekly increments. Group them by month, then
        // accumulate across months so each point is the true cumulative
        // position at that month's end.
        const weeksByMonth = new Map<string, Rec[]>();
        for (const row of weeklyRows) {
          const end = String(row.period_end ?? "");
          if (!/^\d{4}-\d{2}/.test(end)) continue;
          (weeksByMonth.get(monthKey(end)) ?? weeksByMonth.set(monthKey(end), []).get(monthKey(end))!).push(row);
        }
        const monthly = [...weeksByMonth.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, weeks]): Rec => {
            const last = weeks[weeks.length - 1] ?? {};
            return {
              ...last,
              month_label: `${monthNames[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`,
            };
          });
        let cumPlanned = 0;
        let cumActual = 0;
        for (const row of monthly) {
          for (const week of weeksByMonth.get(String(row.period_end ?? "").slice(0, 7)) ?? []) {
            cumPlanned += typeof week.planned_pp === "number" ? week.planned_pp : 0;
            cumActual += typeof week.actual_pp === "number" ? week.actual_pp : 0;
          }
          row.planned_pp = cumPlanned;
          row.actual_pp = cumActual;
        }
        const monthlySeries = (Array.isArray(wgt9c.series) ? seriesOf(wgt9c) : []).map((s) =>
          s.value_field === "planned_pp"
            ? { ...s, name: "Cumulative Planned Progress" }
            : s.value_field === "actual_pp"
              ? { ...s, name: "Cumulative Actual Progress" }
              : s,
        );
        // Extend the curve to project completion: WGT-003's forecast
        // completion KPI is the source of truth, with WGT-002's duration bar
        // end marker as fallback. Planned continues to 100% (the baseline
        // plan completes the project); actual stays empty past the data date.
        const wgt3 = (allWidgets ?? []).find((w) => w.widget_id === "WGT-003");
        const wgt3Items = Array.isArray(wgt3?.widget_ast.content?.items)
          ? (wgt3.widget_ast.content.items as Rec[])
          : [];
        const forecastCompletion = wgt3Items.find((it) => it.key === "forecast_completion_date");
        const wgt2 = (allWidgets ?? []).find((w) => w.widget_id === "WGT-002");
        const wgt2Source = Array.isArray(wgt2?.widget_ast.content?.source)
          ? (wgt2.widget_ast.content.source as Rec[])
          : [];
        const durationBar = wgt2Source.find((s) => s.duration_bar?.segments)?.duration_bar as Rec | undefined;
        const projectEnd = String(
          forecastCompletion?.value ?? durationBar?.end_marker_label ?? "",
        ).slice(0, 10);
        const last = monthly[monthly.length - 1] as Rec | undefined;
        const lastEnd = String(last?.period_end ?? "");
        if (/^\d{4}-\d{2}/.test(lastEnd) && /^\d{4}-\d{2}/.test(projectEnd) && projectEnd.slice(0, 7) > lastEnd.slice(0, 7)) {
          const placeholders: Rec[] = [];
          const cursor = new Date(`${lastEnd.slice(0, 7)}-01T00:00:00`);
          for (let guard = 0; guard < 120; guard++) {
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
            const key = cursor.toISOString().slice(0, 7);
            const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
            placeholders.push({
              period_end: monthEnd.toISOString().slice(0, 10),
              month_label: `${monthNames[cursor.getUTCMonth()]} ${key.slice(0, 4)}`,
              planned_pp: null,
              actual_pp: null,
            });
            if (key >= projectEnd.slice(0, 7)) break;
          }
          const startPlanned = cumPlanned;
          const target = Math.max(100, startPlanned);
          placeholders.forEach((p, i) => {
            p.planned_pp = startPlanned + (target - startPlanned) * ((i + 1) / placeholders.length);
          });
          monthly.push(...placeholders);
        }
        body = (
          <div>
            <div
              className="grid grid-cols-3 items-baseline gap-4 px-5 py-4"
              style={{ background: theme.colors.surface_secondary ?? "#F4F3F8", border: `1px solid ${theme.colors.subtle_border ?? "#D9D6E8"}`, borderRadius: radius(theme, "kpi_card") }}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide leading-4" style={{ color: theme.colors.text_secondary }}>
                  Planned
                </span>
                <span className="text-[24px] font-semibold tabular-nums leading-7" style={{ color: theme.colors.planned ?? "#5741DF" }}>
                  {pct2(plannedCard?.value)}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-1 border-l pl-4" style={{ borderColor: theme.colors.subtle_border ?? "#D9D6E8" }}>
                <span className="text-[10px] font-semibold uppercase tracking-wide leading-4" style={{ color: theme.colors.text_secondary }}>
                  Actual
                </span>
                <span className="text-[24px] font-semibold tabular-nums leading-7" style={{ color: theme.colors.success ?? "#359D78" }}>
                  {pct2(actualCard?.value)}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-1 border-l pl-4" style={{ borderColor: theme.colors.subtle_border ?? "#D9D6E8" }}>
                <span className="text-[10px] font-semibold uppercase tracking-wide leading-4" style={{ color: theme.colors.text_secondary }}>
                  Variance
                </span>
                <span
                  className="text-[24px] font-semibold tabular-nums leading-7"
                  style={{
                    color:
                      varianceValue != null
                        ? varianceValue >= 0
                          ? theme.colors.success ?? "#359D78"
                          : theme.colors.critical ?? "#DB694F"
                        : theme.colors.muted_text,
                  }}
                >
                  {pp2(varianceValue)}
                </span>
              </div>
            </div>
            {monthly.length > 2 && monthlySeries.length > 0 ? (
              <div className="mt-5">
                <p className="text-[12px] font-semibold mb-2" style={{ color: theme.colors.text_secondary }}>
                  Cumulative progress by month
                </p>
                <LineChart
                  theme={theme}
                  data={monthly as ChartDatum[]}
                  series={monthlySeries}
                  categoryField="period_end"
                  categoryLabelField="month_label"
                  showPointLabels
                  showDots={false}
                  pointLabelSize={10}
                  defaultBefore={3}
                  defaultAfter={1}
                  dataDate={dataDate}
                />
              </div>
            ) : null}
            <Observations theme={theme} notes={Array.isArray(c.notes) ? (c.notes as string[]) : []} />
          </div>
        );
        break;
      }
      // WGT-045/046 (Safety widgets): compact stat strips instead of full KPI
      // cards — dense tiles with the YTD value prominent and the inception
      // figure as a small sub-line, grouped under section headings.
      if (widget.widget_id === "WGT-045" || widget.widget_id === "WGT-046") {
        const statTile = (label: string, value: string, unit: string, sub: string | null, si: number) => (
          <div
            key={`${label}-${si}`}
            className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5"
            style={{
              background: theme.colors.surface_secondary ?? "#F4F3F8",
              borderRadius: radius(theme, "radius_sm"),
              borderLeft: `3px solid ${theme.colors.planned ?? "#5741DF"}`,
            }}
          >
            <span className="truncate text-[10px] font-semibold uppercase tracking-wide leading-4" style={{ color: theme.colors.text_secondary }} title={label}>
              {label}
            </span>
            <span className="text-[18px] font-semibold tabular-nums leading-6" style={{ color: theme.colors.text_primary }}>
              {value}
              {unit && unit !== "count" && (
                <span className="whitespace-nowrap inline-block ml-1 text-[10px] font-medium" style={{ color: theme.colors.muted_text }}>
                  {unit}
                </span>
              )}
            </span>
            {sub && (
              <span className="text-[10px] font-medium leading-4" style={{ color: theme.colors.muted_text }}>
                {sub}
              </span>
            )}
          </div>
        );
        const fmtNum = (v: unknown) =>
          typeof v === "number" ? v.toLocaleString() : String(v ?? "—");
        if (widget.widget_id === "WGT-046" && Array.isArray(c.sections)) {
          body = (
            <div className="flex flex-col gap-4">
              {(c.sections as Rec[]).map((section, si) => (
                <div key={String(section.section_id ?? si)}>
                  {section.title ? (
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: theme.colors.text_secondary }}>
                      {String(section.title)}
                    </p>
                  ) : null}
                  <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-3">
                    {(Array.isArray(section.cards) ? (section.cards as Rec[]) : []).map((card, ci) =>
                      statTile(
                        String(card.label ?? ""),
                        String(card.value_display ?? fmtNum(card.value)),
                        String(card.unit ?? ""),
                        Array.isArray(card.supporting_metrics) && card.supporting_metrics.length
                          ? `ITD ${String(card.supporting_metrics[0].value_display ?? fmtNum(card.supporting_metrics[0].value))}`
                          : null,
                        ci,
                      ),
                    )}
                  </div>
                </div>
              ))}
              {typeof c.footnote === "string" && (
                <p className="text-[10px] leading-4" style={{ color: theme.colors.muted_text }}>
                  {c.footnote}
                </p>
              )}
            </div>
          );
          break;
        }
        if (widget.widget_id === "WGT-045" && Array.isArray(c.kpis)) {
          const available = (c.kpis as Rec[]).filter((k) => k.status !== "unavailable" || k.value != null);
          body = (
            <div>
              <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-3">
                {available.map((k, ki) =>
                  statTile(
                    String(k.label ?? ""),
                    fmtNum(k.value),
                    String(k.unit ?? ""),
                    k.comparison_value != null ? `ITD ${fmtNum(k.comparison_value)}` : null,
                    ki,
                  ),
                )}
              </div>
              {typeof c.footnote === "string" && (
                <p className="mt-2 text-[10px] leading-4" style={{ color: theme.colors.muted_text }}>
                  {c.footnote}
                </p>
              )}
            </div>
          );
          break;
        }
      }
      // WGT-046 (Safety Performance Indicators) nests its cards inside
      // sections[] with titles; render each section as its own KPI grid.
      if (widget.widget_id === "WGT-046" && Array.isArray(c.sections)) {
        body = (
          <div>
            {(c.sections as Rec[]).map((section, si) => (
              <div key={String(section.section_id ?? si)} className={si > 0 ? "mt-5" : undefined}>
                {section.title ? (
                  <p className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide" style={{ color: theme.colors.text_secondary }}>
                    {String(section.title)}
                  </p>
                ) : null}
                <KpiGrid
                  theme={theme}
                  kpis={
                    (Array.isArray(section.cards) ? (section.cards as Rec[]) : []).map((card) => ({
                      ...card,
                      key: card.card_id,
                      display_value: card.value_display ?? card.display_value,
                      supporting_text: Array.isArray(card.supporting_metrics)
                        ? card.supporting_metrics
                            .map((m: Rec) => `${String(m.label ?? "")}: ${String(m.value_display ?? m.value ?? "—")}`)
                            .join(" · ")
                        : card.status_label,
                      status: undefined,
                    }))
                  }
                  widgetId={widget.widget_id}
                />
              </div>
            ))}
            {typeof c.footnote === "string" && (
              <p className="mt-3 text-[11px] leading-4" style={{ color: theme.colors.muted_text }}>
                {c.footnote}
              </p>
            )}
          </div>
        );
        break;
      }
      // ASTs ship two shapes: kpis[] (WGT-045, WGT-048, WGT-051) and
      // items[] (WGT-003, WGT-016, WGT-031). Render either.
      // WGT-031 drops the Planned Manpower and Manpower Variance % cards; the
      // remaining four lay out one per row cell (grid-cols-4 via KpiGrid).
      const kpis = (Array.isArray(c.kpis)
        ? (c.kpis as Rec[])
        : Array.isArray(c.cards)
          ? (c.cards as Rec[])
          : Array.isArray(c.items)
            ? (c.items as Rec[])
            : []
      ).filter(
        (k) =>
          !(
            widget.widget_id === "WGT-031" &&
            ["planned manpower", "manpower variance %"].includes(String(k.label ?? "").trim().toLowerCase())
          ),
      );
      const notes = Array.isArray(c.observations) ? (c.observations as string[]) : [];
      const footnote = typeof c.footnote === "string" ? c.footnote : null;
      const summary = typeof c.summary === "string" ? c.summary : null;
      body = (
        <div>
          <KpiGrid theme={theme} kpis={kpis} widgetId={widget.widget_id} />
          <Observations theme={theme} notes={notes} />
          {footnote && (
            <p className="mt-3 text-[11px] leading-4" style={{ color: theme.colors.muted_text }}>
              {footnote}
            </p>
          )}
          {summary && !footnote && (
            <p className="mt-3 text-[12px] leading-5" style={{ color: theme.colors.text_secondary }}>
              {summary}
            </p>
          )}
        </div>
      );
      break;
    }

    case "status_summary": {
      // WGT-047: metrics + table + distribution.
      // WGT-049: summary counts + movement groups + empty state.
      // WGT-005: summary_metrics + status_distribution donut.
      const isWgt5 = widget.widget_id === "WGT-005";
      const kpis = Array.isArray(c.kpis) ? (c.kpis as Rec[]) : Array.isArray(c.metrics) ? (c.metrics as Rec[]) : Array.isArray(c.summary) ? (c.summary as Rec[]) : isWgt5 && Array.isArray(c.summary_metrics) ? (c.summary_metrics as Rec[]) : [];
      const components = Array.isArray(c.components) ? (c.components as Rec[]) : [];
      const tableObj = c.table as Rec | undefined;
      const distribution = (c.distribution ?? (isWgt5 ? c.status_distribution : undefined)) as Rec | undefined;
      const movementGroups = Array.isArray(c.movement_groups) ? (c.movement_groups as Rec[]) : [];
      const emptyState = c.empty_state as Rec | undefined;
      body = (
        <div className="flex flex-col gap-4">
          <KpiGrid theme={theme} kpis={kpis} />
          {tableObj && Array.isArray(tableObj.rows) && Array.isArray(tableObj.columns) && (
            <div>
              <p className="text-[12px] font-semibold mb-2" style={{ color: theme.colors.text_secondary }}>
                Status counts
              </p>
              <DataTable theme={theme} columns={columnsOf(tableObj)} rows={rowsOf(tableObj)} maxHeight={280} />
            </div>
          )}
          {distribution && Array.isArray(distribution.data) && (
            <div>
              <p className="text-[12px] font-semibold mb-2" style={{ color: theme.colors.text_secondary }}>
                {String(distribution.title ?? "Distribution by category")}
              </p>
              {isWgt5 ? (
                <DonutChart
                  theme={theme}
                  data={distribution.data as ChartDatum[]}
                  categoryField={String(distribution.category_field ?? "status_code")}
                  valueField="count"
                  centerMetric={
                    typeof distribution.status_count_total === "number"
                      ? { label: "Submitted documents", value: distribution.status_count_total as number }
                      : null
                  }
                />
              ) : (
              <StackedBarChart
                theme={theme}
                data={distribution.data as ChartDatum[]}
                series={[
                  { name: "Open", value_field: "open", semantic_series: "overdue" },
                  { name: "Closed", value_field: "closed", semantic_series: "on_track" },
                ]}
                categoryField="category_code"
                categoryLabelField="category_label"
                horizontal
              />
              )}
            </div>
          )}
          {components.map((comp) => {
            const cc = (comp.content ?? {}) as Rec;
            const ct = String(comp.component_type ?? "");
            if (ct === "donut_chart" && Array.isArray(cc.data)) {
              return (
                <div key={String(comp.component_id)}>
                  <p className="text-[12px] font-semibold mb-2" style={{ color: theme.colors.text_secondary }}>
                    {String(comp.title ?? "")}
                  </p>
                  <DonutChart
                    theme={theme}
                    data={cc.data as ChartDatum[]}
                    categoryField={String(cc.category_field ?? "status")}
                    valueField={String(cc.value_field ?? (cc.series as Rec[] | undefined)?.[0]?.value_field ?? "count")}
                    centerMetric={(cc.center_metric as { label: string; value: number } | undefined) ?? null}
                  />
                </div>
              );
            }
            if (ct === "data_table" || (Array.isArray(cc.rows) && Array.isArray(cc.columns))) {
              return (
                <div key={String(comp.component_id)}>
                  <p className="text-[12px] font-semibold mb-2" style={{ color: theme.colors.text_secondary }}>
                    {String(comp.title ?? "")}
                  </p>
                  <DataTable theme={theme} columns={columnsOf(cc)} rows={rowsOf(cc)} />
                </div>
              );
            }
            if (ct === "status_distribution" && Array.isArray(cc.data)) {
              return (
                <div key={String(comp.component_id)}>
                  <p className="text-[12px] font-semibold mb-2" style={{ color: theme.colors.text_secondary }}>
                    {String(comp.title ?? "")}
                  </p>
                  <DonutChart
                    theme={theme}
                    data={cc.data as ChartDatum[]}
                    categoryField={String(cc.category_field ?? "status")}
                    valueField={String(cc.value_field ?? "count")}
                    centerMetric={(cc.center_metric as { label: string; value: number } | undefined) ?? null}
                  />
                </div>
              );
            }
            return null;
          })}
          {typeof c.chart_summary_text === "string" && (
            <p className="text-[12px] leading-5" style={{ color: theme.colors.text_secondary }}>
              {c.chart_summary_text}
            </p>
          )}
          {typeof c.basis_note === "string" && (
            <p className="text-[11px] leading-4" style={{ color: theme.colors.muted_text }}>
              {c.basis_note}
            </p>
          )}
          {movementGroups.map((g) =>
            Array.isArray(g.items) && g.items.length > 0 && Array.isArray(g.columns) ? (
              <div key={String(g.title)}>
                <p className="text-[12px] font-semibold mb-2" style={{ color: theme.colors.text_secondary }}>
                  {String(g.title ?? "")} ({Number(g.count ?? 0)})
                </p>
                {/* WGT-049: no height cap — columns use the full widget height. */}
                <DataTable
                  theme={theme}
                  columns={columnsOf(g)}
                  rows={g.items as ChartDatum[]}
                  maxHeight={widget.widget_id === "WGT-049" ? undefined : 260}
                />
              </div>
            ) : null,
          )}
          {emptyState && movementGroups.every((g) => !Array.isArray(g.items) || g.items.length === 0) && (
            <div
              className="p-4 text-[12px] leading-5"
              style={{ background: theme.colors.empty_data_bg ?? "#F4F3F8", borderRadius: radius(theme, "radius_md"), color: theme.colors.text_secondary }}
            >
              {String(emptyState.message ?? "No movements in this reporting period.")}
            </div>
          )}
        </div>
      );
      break;
    }

    case "donut_chart": {
      // Two shapes: flat (data + series + center/central metric — WGT-022/023/024)
      // and multi-component (components[]).
      const comps = Array.isArray(c.components) ? (c.components as Rec[]) : null;
      if (!comps) {
        const series = seriesOf(c);
        const valueField = String(c.value_field ?? series[0]?.value_field ?? "count");
        const center = (c.center_metric ?? c.central_metric) as { label: string; value: number | string } | undefined;
        const isTransmittalDonut =
          widget.widget_id === "WGT-022" || widget.widget_id === "WGT-023" || widget.widget_id === "WGT-024";
        if (isTransmittalDonut) {
          const total =
            typeof c.total_transmittals === "number"
              ? (c.total_transmittals as number)
              : typeof c.center_total === "number"
                ? (c.center_total as number)
                : typeof center?.value === "number"
                  ? center.value
                  : undefined;
          const ringRows: ChartDatum[] = Array.isArray(c.status_ring?.data)
            ? (c.status_ring.data as ChartDatum[])
            : (Array.isArray(c.data) ? (c.data as ChartDatum[]) : []);
          body = (
            <TransmittalDonutChart
              theme={theme}
              height={340}
              data={ringRows}
              categoryField={
                ringRows.length && ringRows[0].status_code != null
                  ? "status_code"
                  : String(c.category_field ?? "status")
              }
              valueField={valueField}
              centerMetric={total != null ? { label: String(c.center_label ?? "Total Transmittals"), value: total } : null}
              plannedCount={plannedCountOf(c)}
            />
          );
          break;
        }
        body = (
          <div>
            <DonutChart
              theme={theme}
              data={Array.isArray(c.data) ? (c.data as ChartDatum[]) : []}
              categoryField={String(c.category_field ?? "status")}
              valueField={valueField}
              centerMetric={center ?? null}
            />
            {typeof c.chart_summary_text === "string" && (
              <p className="mt-3 text-[12px] leading-5" style={{ color: theme.colors.text_secondary }}>
                {c.chart_summary_text}
              </p>
            )}
            {typeof c.summary === "string" && (
              <p className="mt-3 text-[12px] leading-5" style={{ color: theme.colors.text_secondary }}>
                {c.summary}
              </p>
            )}
          </div>
        );
        break;
      }
      body = (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {comps.map((comp) => {
            const cc = (comp.content ?? {}) as Rec;
            const ct = String(comp.component_type ?? "donut_chart");
            if (ct === "donut_chart" && Array.isArray(cc.data)) {
              return (
                <div key={String(comp.component_id)}>
                  <p className="text-[12px] font-semibold mb-2" style={{ color: theme.colors.text_secondary }}>
                    {String(comp.title ?? "")}
                  </p>
                  <DonutChart
                    height={280}
                    theme={theme}
                    data={cc.data as ChartDatum[]}
                    categoryField={String(cc.category_field ?? "status")}
                    valueField={String(cc.value_field ?? "count")}
                    centerMetric={(cc.center_metric as { label: string; value: number } | undefined) ?? null}
                  />
                </div>
              );
            }
            if (Array.isArray(cc.rows) && Array.isArray(cc.columns)) {
              return (
                <div key={String(comp.component_id)}>
                  <p className="text-[12px] font-semibold mb-2" style={{ color: theme.colors.text_secondary }}>
                    {String(comp.title ?? "")}
                  </p>
                  <DataTable theme={theme} columns={columnsOf(cc)} rows={rowsOf(cc)} maxHeight={260} />
                </div>
              );
            }
            return null;
          })}
        </div>
      );
      break;
    }

    case "line_chart": {
      const data = Array.isArray(c.data) ? (c.data as ChartDatum[]) : [];
      const series = seriesOf(c);
      const cat = String(c.category_field ?? "period_end");
      // WGT-009 renders as a smooth curve (no dots), clamped to 8 weeks before /
      // 4 after the data date (default 3 / 1).
      const isWgt9 = widget.widget_id === "WGT-009";
      body = series.length ? (
        <div className="min-w-0">
          <LineChart
            theme={theme}
            data={data}
            series={series}
            categoryField={isWgt9 ? "period_end" : cat}
            showPointLabels={widget.widget_id === "WGT-008" || isWgt9}
            showDots={!isWgt9}
            pointLabelSize={isWgt9 ? 10 : undefined}
            defaultBefore={isWgt9 ? 3 : 12}
            defaultAfter={isWgt9 ? 1 : 4}
            maxBefore={isWgt9 ? 8 : undefined}
            maxAfter={isWgt9 ? 4 : undefined}
            dataDate={dataDate}
          />
          <Observations theme={theme} notes={Array.isArray(c.observations) ? (c.observations as string[]) : []} />
        </div>
      ) : null;
      break;
    }

    case "bar_chart":
    // "bar_chart" is the same grouped/planned-vs-actual shape as
    // "grouped_bar_chart"; render both through one path.
    case "grouped_bar_chart": {
      const data = filterKpiRows(Array.isArray(c.data) ? (c.data as ChartDatum[]) : []);
      const series = seriesOf(c);
      const cat = String(c.category_field ?? "week_num");
      const orientation = String(c.orientation ?? "vertical");
      const kpiVertical = widget.widget_id === "WGT-039" || widget.widget_id === "WGT-040";
      // WGT-009 is typed grouped_bar_chart in recent updates but must render as
      // a smooth curve: no dots, value labels, slider clamped to 8 weeks before
      // / 4 after the data date (default 3 / 1).
      // WGT-010: weekly variances derived from WGT-009's cumulative progress
      // history — each week's planned/actual gain vs the previous week, plus
      // their difference.
      if (widget.widget_id === "WGT-032") {
        body = (
          <ResourceComparisonBarChart
            theme={theme}
            data={Array.isArray(c.data) ? (c.data as ChartDatum[]) : []}
          />
        );
        break;
      }
      if (widget.widget_id === "WGT-029") {
        // QA/QC discipline breakdown ships a rows[] array (not data[]) plus a
        // totals block; the series entries carry no value_field. Normalize the
        // rows and append a "Total" category carrying the closed-items count
        // (the only closed figure in the data — per-discipline counts don't
        // exist in this update).
        const wgt29Rows: ChartDatum[] = (Array.isArray(c.rows) ? (c.rows as Rec[]) : []).map((r) => ({
          discipline_code: String(r.discipline_code ?? ""),
          discipline_name: String(r.discipline_name ?? r.discipline_code ?? ""),
          open_items_count: typeof r.open_items_count === "number" ? (r.open_items_count as number) : 0,
          overdue_items_count: typeof r.overdue_items_count === "number" ? (r.overdue_items_count as number) : 0,
        }));
        const totals29 = (c.totals ?? {}) as Rec;
        if (typeof totals29.closed_items_count === "number" && wgt29Rows.length) {
          wgt29Rows.push({
            discipline_code: "ALL",
            discipline_name: "Total",
            open_items_count: 0,
            overdue_items_count: 0,
            closed_items_count: totals29.closed_items_count as number,
          } as ChartDatum);
        }
        const wgt29Series: ChartSeries[] = [
          { name: "Open Items", value_field: "open_items_count", semantic_series: "warning", unit: "documents" },
          { name: "Open Over 14 Days", value_field: "overdue_items_count", semantic_series: "overdue", unit: "documents" },
          { name: "Closed Items", value_field: "closed_items_count", semantic_series: "on_track", unit: "documents" },
        ];
        body = wgt29Rows.length ? (
          <div className="min-w-0">
            <GroupedBarChart
              theme={theme}
              data={wgt29Rows}
              series={wgt29Series}
              categoryField="discipline_code"
              categoryLabelField="discipline_name"
              valueAxisLabel="Items"
              showValueLabels
              wholeNumbers
              dataDate={dataDate}
            />
            <Observations theme={theme} notes={Array.isArray(c.notes) ? (c.notes as string[]) : []} />
          </div>
        ) : null;
        break;
      }
      if (widget.widget_id === "WGT-010") {
        const wgt9v = (allWidgets ?? []).find((w) => w.widget_id === "WGT-009");
        const wgt9vc = (wgt9v?.widget_ast.content ?? {}) as Rec;
        const weekly = Array.isArray(wgt9vc.data) ? (wgt9vc.data as Rec[]) : [];
        let prevCp = 0;
        let prevCa = 0;
        const r4 = (v: number) => Math.round(v * 10000) / 10000;
        const varianceRows: ChartDatum[] = weekly.map((r) => {
          const cp = prevCp + (typeof r.planned_pp === "number" ? r.planned_pp : 0);
          const ca = prevCa + (typeof r.actual_pp === "number" ? r.actual_pp : 0);
          const plannedVar = r4(cp - prevCp);
          const actualVar = r4(ca - prevCa);
          const row = {
            week_label: String(r.week_label ?? ""),
            period_label: String(r.period_label ?? r.week_label ?? ""),
            period_end: String(r.period_end ?? ""),
            planned_variance_pp: plannedVar,
            actual_variance_pp: actualVar,
            weekly_variance_pp: r4(actualVar - plannedVar),
          };
          prevCp = cp;
          prevCa = ca;
          return row as ChartDatum;
        });
        const varianceSeries: ChartSeries[] = [
          { name: "Planned Variance", value_field: "planned_variance_pp", semantic_series: "planned", unit: "pp" },
          { name: "Actual Variance", value_field: "actual_variance_pp", semantic_series: "actual", unit: "pp" },
          { name: "Weekly Variance", value_field: "weekly_variance_pp", semantic_series: "warning", unit: "pp" },
        ];
        body = varianceRows.length ? (
          <div className="min-w-0">
            <GroupedBarChart
              theme={theme}
              data={varianceRows}
              series={varianceSeries}
              categoryField="period_end"
              categoryLabelField="period_label"
              valueAxisLabel="Weekly change in cumulative progress (pp)"
              defaultBefore={4}
              defaultAfter={0}
              dataDate={dataDate}
            />
            <Observations theme={theme} notes={Array.isArray(c.notes) ? (c.notes as string[]) : []} />
          </div>
        ) : null;
        break;
      }
      if (widget.widget_id === "WGT-009") {
        body = series.length ? (
          <div className="min-w-0">
            <LineChart
              theme={theme}
              data={data}
              series={series}
              categoryField={cat}
              showPointLabels
              showDots={false}
              pointLabelSize={10}
              defaultBefore={3}
              defaultAfter={1}
              maxBefore={8}
              maxAfter={4}
              dataDate={dataDate}
            />
            <Observations theme={theme} notes={Array.isArray(c.notes) ? (c.notes as string[]) : []} />
          </div>
        ) : null;
        break;
      }
      body = series.length ? (
        <div className="min-w-0">
          {widget.widget_id === "WGT-038" && kpiPills}
          {orientation === "horizontal" ? (
            <StackedBarChart
              theme={theme}
              data={data}
              series={series}
              categoryField={cat}
              categoryLabelField={CategoryLabel(cat, typeof c.category_label_field === "string" ? c.category_label_field : undefined)}
              horizontal
              wholeNumbers={wholeNumbers}
              verticalLabels={kpiVertical}
            />
          ) : (
            <GroupedBarChart
              theme={theme}
              data={data}
              series={series}
              categoryField={cat}
              categoryLabelField={CategoryLabel(cat, typeof c.category_label_field === "string" ? c.category_label_field : undefined)}
              valueAxisLabel={typeof c.value_axis_label === "string" ? c.value_axis_label : undefined}
              height={kpiVertical ? 286 : undefined}
              showValueLabels={isKpiWidget}
              valueLabelSize={isKpiWidget ? 8.5 : undefined}
              wholeNumbers={wholeNumbers}
              verticalLabels={kpiVertical}
            />
          )}
          <Observations theme={theme} notes={Array.isArray(c.notes) ? (c.notes as string[]) : []} />
        </div>
      ) : null;
      break;
    }

    case "stacked_bar_chart": {
      const data = filterKpiRows(Array.isArray(c.data) ? (c.data as Rec[]) : []) as ChartDatum[];
      const series = seriesOf(c);
      const cat = String(c.category_field ?? "discipline_code");
      body = series.length ? (
        <div>
          <StackedBarChart
            theme={theme}
            data={data}
            series={series}
            categoryField={cat}
            categoryLabelField={CategoryLabel(cat, typeof c.category_label_field === "string" ? c.category_label_field : undefined)}
            wholeNumbers={wholeNumbers}
            verticalLabels={widget.widget_id === "WGT-039" || widget.widget_id === "WGT-040"}
          />
          <Observations theme={theme} notes={Array.isArray(c.notes) ? (c.notes as string[]) : []} />
        </div>
      ) : null;
      break;
    }

    case "horizontal_bar_chart": {
      const data = filterKpiRows(Array.isArray(c.data) ? (c.data as Rec[]) : []) as ChartDatum[];
      const series = seriesOf(c);
      const cat = String(c.category_field ?? "trade_code");
      body = series.length ? (
        <div>
          <StackedBarChart
            theme={theme}
            data={data}
            series={series}
            categoryField={cat}
            categoryLabelField={CategoryLabel(cat, typeof c.category_label_field === "string" ? c.category_label_field : undefined)}
            horizontal
            wholeNumbers={wholeNumbers}
          />
          {typeof c.chart_summary_text === "string" && (
            <p className="mt-3 text-[12px] leading-5" style={{ color: theme.colors.text_secondary }}>
              {c.chart_summary_text}
            </p>
          )}
        </div>
      ) : null;
      break;
    }

    case "trade_schedule_gantt": {
      body = <GanttView theme={theme} c={c} />;
      break;
    }

    case "photo_gallery":
    case "progress_photo_gallery": {
      body = <PhotoGallery theme={theme} c={c} />;
      break;
    }

    case "narrative_summary":
      body = <NarrativeSummary theme={theme} ast={ast} />;
      break;

    case "exception_table":
      body = <ExceptionTable theme={theme} ast={ast} />;
      break;

    case "data_table":
    case "milestone_table":
    case "lookahead_table":
    case "resource_table":
    case "financial_status_table": {
      // WGT-043 ships column_totals rather than a totals row.
      const totals = (c.totals as Rec) ?? (c.column_totals as Rec) ?? null;
      const notes = Array.isArray(c.notes) ? (c.notes as string[]) : [];
      // WGT-017/019: forecast dates that fall before the data date have actually
      // happened, so they render in the planned/actual purple.
      const purplePastForecastDates =
        widget.widget_id === "WGT-017" || widget.widget_id === "WGT-019" || widget.widget_id === "WGT-020";
      // WGT-020 stores each activity's progress in a nested
      // progress_by_level[level_code] map; flatten it into the level:<code>
      // cells the generic table expects. A planned/actual toggle picks which
      // percentage each level cell shows. Activities are grouped under bold
      // trade-name header rows, ordered by the feed's trade display order.
      const wgt20Rows: ChartDatum[] | null =
        widget.widget_id === "WGT-020" && Array.isArray(c.rows) && Array.isArray(c.columns)
          ? (() => {
              const flatten = (r: Rec, i: number): Rec => {
                const out: Rec = {
                  row_id: r.row_id,
                  serial_no: r.serial_no ?? i + 1,
                  activity_name:
                    r.row_status === "conflict" ? `⚠ ${String(r.activity_name ?? "")}` : String(r.activity_name ?? ""),
                };
                const byLevel = (r.progress_by_level ?? {}) as Rec;
                out.__present_levels = Object.keys(byLevel);
                for (const col of c.columns as Rec[]) {
                  if (col.value_source !== "progress_by_level") continue;
                  const cell = (byLevel[String(col.level_code)] ?? {}) as Rec;
                  const v = wgt20Mode === "actual" ? cell.actual_percent : cell.planned_percent;
                  out[String(col.key)] = typeof v === "number" ? `${v.toFixed(1)}%` : "—";
                }
                return out;
              };
              const byTrade = new Map<string, { order: number; label: string; rows: Rec[] }>();
              (c.rows as Rec[]).filter(repeatsAcrossFloors).forEach((r, i) => {
                const key = String(r.trade_group_key ?? r.trade_code ?? r.trade_label ?? "unclassified");
                const label = String(r.trade_label ?? r.trade_name ?? key);
                const order = typeof r.trade_display_order === "number" ? (r.trade_display_order as number) : 9999;
                if (!byTrade.has(key)) byTrade.set(key, { order, label, rows: [] });
                byTrade.get(key)!.rows.push(flatten(r, i));
              });
              const out: Rec[] = [];
              for (const [key, group] of [...byTrade.entries()].sort((a, b) => a[1].order - b[1].order)) {
                out.push({ __group: true, __label: group.label, row_id: `trade-group:${key}` });
                out.push(...group.rows);
              }
              return out as ChartDatum[];
            })()
          : null;
      const wgt20Toggle =
        widget.widget_id === "WGT-020" ? (
          <div className="mb-3 inline-flex items-center rounded-full border p-0.5" style={{ borderColor: theme.colors.subtle_border ?? "#D9D6E8", background: theme.colors.surface_secondary ?? "#F4F3F8" }}>
            {(["planned", "actual"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setWgt20Mode(m)}
                className="px-3.5 py-1.5 text-[12px] font-semibold rounded-full transition-colors"
                style={{
                  background: wgt20Mode === m ? theme.colors.surface_primary ?? "#FFFFFF" : "transparent",
                  color:
                    wgt20Mode === m
                      ? m === "planned"
                        ? theme.colors.planned ?? "#5741DF"
                        : theme.colors.success ?? "#359D78"
                      : theme.colors.text_secondary,
                  cursor: "pointer",
                }}
              >
                {m === "planned" ? "Planned %" : "Actual %"}
              </button>
            ))}
          </div>
        ) : null;
      // WGT-035 names its columns header/column_id/value_field instead of
      // label/key; normalize so the generic table can read them.
      const wgt35Cols: TableColumn[] | null =
        widget.widget_id === "WGT-035" && Array.isArray(c.columns)
          ? (c.columns as Rec[]).map((col) => ({
              key: String(col.column_id ?? col.value_field ?? col.key),
              label: String(col.header ?? col.label ?? col.column_id ?? col.key),
              alignment: col.alignment,
              data_type: col.data_type,
            }))
          : null;
      const wgt35Totals: Rec | null =
        widget.widget_id === "WGT-035" && c.totals && typeof c.totals === "object"
          ? Object.fromEntries(
              Object.entries(c.totals as Rec).map(([k, v]) => [k, typeof v === "number" ? Math.round(v) : v]),
            )
          : null;
      body = (
        <div>
          {wgt20Toggle}
          <DataTable
            theme={theme}
            columns={
              wgt35Cols ??
              (widget.widget_id === "WGT-020"
                ? columnsOf(c).filter((col) => col.key !== "trade_label")
                : columnsOf(c))
            }
            printMatrix={widget.widget_id === "WGT-020"}
            rows={wgt20Rows ?? rowsOf(c)}
            totals={wgt35Totals ?? totals}
            maxHeight={420}
            dataDate={dataDate}
            purplePastDates={purplePastForecastDates}
            percentColor={
              widget.widget_id === "WGT-020"
                ? wgt20Mode === "planned"
                  ? theme.colors.planned ?? "#5741DF"
                  : theme.colors.success ?? "#359D78"
                : undefined
            }
          />
          {typeof c.summary === "string" && (
            <p className="mt-3 text-[12px] leading-5" style={{ color: theme.colors.text_secondary }}>
              {c.summary}
            </p>
          )}
          {typeof c.snapshot_qualification === "string" && (
            <p className="mt-2 text-[11px] leading-4" style={{ color: theme.colors.muted_text }}>
              {c.snapshot_qualification}
            </p>
          )}
          <Observations theme={theme} notes={notes} />
        </div>
      );
      break;
    }

    case "hierarchical_table":
      body = <HierarchicalTable theme={theme} c={c} />;
      break;

    default:
      body = <UnsupportedWidgetNotice theme={theme} widgetType={type} />;
      break;
  }

  if (body === null) {
    body = <UnsupportedWidgetNotice theme={theme} widgetType={type} reason="The widget structure could not be rendered from the supplied AST." />;
  }

  return (
    <WidgetCard
      theme={theme}
      title={widget.widget_id === "WGT-032" ? "Planned vs Actual Manpower by Resource - Current Week" : widget.widget_title}
      widgetId={widget.widget_id}
      // WGT-020 is flagged "unavailable" in the feed but ships a full table;
      // ignore the flag so the data renders.
      dataStatus={widget.widget_id === "WGT-020" ? undefined : widget.data_status}
      className={gridClass}
      compact={widget.widget_id === "WGT-051"}
    >
      {body}
    </WidgetCard>
  );
}

import { readStoredStrings, writeStoredStrings, useDashboardStorage } from "@/boltDashboard/utils/storedSelection";


function GanttView({ theme, c }: { theme: ThemeTokens; c: Rec }) {
  const TRADE_SELECTION_STORAGE_KEY = `${useDashboardStorage()}:trades`;
  const data = Array.isArray(c.data) ? (c.data as Rec[]) : [];
  const axis = (c.time_axis ?? {}) as Rec;
  const start = axis.start ? new Date(String(axis.start)).getTime() : null;
  const end = axis.end ? new Date(String(axis.end)).getTime() : null;
  const dataDate = axis.data_date_reference ? new Date(String(axis.data_date_reference)).getTime() : null;
  const [selectedTrades, setSelectedTrades] = useState<string[] | null>(() => readStoredStrings(TRADE_SELECTION_STORAGE_KEY));
  const toggle = (code: string) => {
    const next = new Set(active);
    if (next.has(code)) {
      if (next.size > 1) next.delete(code);
    } else {
      next.add(code);
    }
    const values = Array.from(next);
    setSelectedTrades(values);
    writeStoredStrings(TRADE_SELECTION_STORAGE_KEY, values);
  };
  if (!start || !end || !data.length) return null;
  const span = end - start;

  const fmt = (t: number) =>
    new Date(t).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

  const allTrades = Array.from(new Set(data.map((r) => String(r.trade_code ?? r.row_id ?? "")))).filter(Boolean);
  const DEFAULT_TRADES = ["ST", "MS", "PS", "PL", "TL", "FC", "CW", "WD", "HV", "EL"];
  const active = selectedTrades ?? DEFAULT_TRADES.filter((t) => allTrades.includes(t));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide mr-1" style={{ color: theme.colors.text_secondary }}>
          Trades:
        </span>
        {allTrades.map((code) => {
          const on = active.includes(code);
          const label = String(data.find((r) => String(r.trade_code ?? r.row_id ?? "") === code)?.trade_label ?? code);
          return (
            <button
              key={code}
              type="button"
              onClick={() => toggle(code)}
              className="px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors"
              style={{
                background: on ? theme.colors.primary : theme.colors.surface_primary ?? "#FFFFFF",
                color: on ? "#FFFFFF" : theme.colors.text_secondary,
                borderColor: on ? theme.colors.primary : theme.colors.subtle_border ?? "#D9D6E8",
              }}
              title={label !== code ? `${code} — ${label}` : code}
            >
              {code}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2 overflow-x-auto">
        <div className="flex flex-col gap-2 min-w-[560px]">
          {data.filter((r) => active.includes(String(r.trade_code ?? r.row_id ?? ""))).map((row) => {
            const ps = row.planned_start ? new Date(String(row.planned_start)).getTime() : start;
            const pf = row.planned_finish ? new Date(String(row.planned_finish)).getTime() : end;
            const as = row.actual_start ? new Date(String(row.actual_start)).getTime() : null;
            const af = row.actual_finish ? new Date(String(row.actual_finish)).getTime() : null;
            const label = String(row.trade_label ?? row.trade_code ?? row.row_id ?? "");
            const status = String(row.trade_status ?? "");
            const actualEnd = af ?? Math.min(dataDate ?? end, end);
            return (
              <div key={String(row.row_id)} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[11px] font-medium" style={{ color: theme.colors.text_secondary }} title={label}>
                  {label}
                </span>
                <div className="relative flex-1 py-0.5" style={{ background: theme.colors.empty_data_bg ?? "#F4F3F8", borderRadius: radius(theme, "radius_sm") }}>
                  <div className="relative flex flex-col gap-0.5 py-1">
                    {/* Planned bar */}
                    <div className="relative h-3">
                      <div
                        className="absolute top-0 h-3 opacity-35"
                        style={{
                          left: `${((ps - start) / span) * 100}%`,
                          width: `${Math.max(0.5, ((pf - ps) / span) * 100)}%`,
                          background: theme.colors.semantic_planned ?? theme.colors.primary,
                          borderRadius: radius(theme, "radius_xs"),
                        }}
                        title={`Planned: ${fmt(ps)} → ${fmt(pf)}`}
                      />
                    </div>
                    {/* Actual bar */}
                    <div className="relative h-3">
                      {as && (
                        <div
                          className="absolute top-0 h-3"
                          style={{
                            left: `${((as - start) / span) * 100}%`,
                            width: `${Math.max(0.5, ((actualEnd - as) / span) * 100)}%`,
                            background:
                              status === "complete"
                                ? theme.colors.semantic_on_track ?? theme.colors.success
                                : theme.colors.semantic_actual ?? theme.colors.mint,
                            borderRadius: radius(theme, "radius_xs"),
                          }}
                          title={`Actual: ${as ? fmt(as) : "not started"} → ${af ? fmt(af) : `${fmt(actualEnd)} (to data date)`}`}
                        />
                      )}
                    </div>
                  </div>
                  {dataDate && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5"
                      style={{ left: `${((dataDate - start) / span) * 100}%`, background: theme.colors.charcoal ?? "#24252D" }}
                      title={`Data date: ${fmt(dataDate)}`}
                    />
                  )}
                </div>
                <span className="w-40 shrink-0 text-[10px] leading-3 tabular-nums" style={{ color: theme.colors.muted_text }}>
                  <span className="block" title={`Planned: ${fmt(ps)} → ${fmt(pf)}`}>
                    P: {fmt(ps)} – {fmt(pf)}
                  </span>
                  <span className="block" title={as ? `Actual: ${fmt(as)} → ${af ? fmt(af) : `${fmt(actualEnd)} (to data date)`}` : "Not started"}>
                    A: {as ? `${fmt(as)} – ${af ? fmt(af) : `${fmt(actualEnd)} (dd)`}` : "not started"}
                  </span>
                </span>
                <StatusBadge theme={theme} status={status} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {[
          { name: "Planned window", color: theme.colors.semantic_planned ?? theme.colors.primary, opacity: 0.35 },
          { name: "Actual to data date", color: theme.colors.semantic_actual ?? theme.colors.mint, opacity: 1 },
          { name: "Complete", color: theme.colors.semantic_on_track ?? theme.colors.success, opacity: 1 },
        ].map((l) => (
          <span key={l.name} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: theme.colors.text_secondary }}>
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color, opacity: l.opacity }} />
            {l.name}
          </span>
        ))}
      </div>
      {Array.isArray(c.legend) && typeof c.legend === "object" && (
        <p className="text-[11px]" style={{ color: theme.colors.muted_text }}>
          {(c.legend as Rec[]).map((l) => String(l.label ?? l.name ?? "")).filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

function PhotoGallery({ theme, c }: { theme: ThemeTokens; c: Rec }) {
  const photos = Array.isArray(c.photos) ? (c.photos as Rec[]) : [];
  const empty = (c.empty_state ?? {}) as Rec;

  if (!photos.length) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 py-10"
        style={{ background: theme.colors.empty_data_bg ?? "#F4F3F8", borderRadius: radius(theme, "radius_md") }}
      >
        <p className="text-[13px] font-medium" style={{ color: theme.colors.text_secondary }}>
          {String(empty.message ?? "No site photos for this reporting update")}
        </p>
        {empty.detail && (
          <p className="text-[11px]" style={{ color: theme.colors.muted_text }}>
            {String(empty.detail)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      {typeof c.total_photo_count === "number" && (
        <p className="mb-3 text-[12px]" style={{ color: theme.colors.text_secondary }}>
          {c.total_photo_count} site photos
          {typeof c.reporting_week === "number" ? ` · reporting week ${c.reporting_week}` : ""}
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {photos.map((p, i) => (
          <figure key={String(p.record_identifier ?? i)} className="flex flex-col gap-1.5">
            <img
              src={String(p.photo_url ?? "")}
              alt={String(p.filename ?? `Site photo ${i + 1}`)}
              loading="lazy"
              className="w-full h-28 object-cover"
              style={{ borderRadius: radius(theme, "radius_sm"), background: theme.colors.empty_data_bg }}
            />
            <figcaption className="text-[10px]" style={{ color: theme.colors.muted_text }}>
              {formatCellValue(p.photo_date, "date")}
              {p.location_or_area ? ` · ${String(p.location_or_area)}` : ""}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
