import { HierarchicalTable } from './HierarchicalTable';
import { useState } from "react";
import { WidgetAst, WidgetRow } from "@/boltDashboard/api/dashboardApi";
import { ThemeTokens, radius } from "@/boltDashboard/theme/designTheme";
import { DataTable, StatusBadge, TableColumn, formatCellValue, WidgetCard } from "@/boltDashboard/components/widgetPrimitives";
import {
  ChartSeries,
  ChartDatum,
  DonutChart,
  TransmittalDonutChart,
  GroupedBarChart,
  LineChart,
  StackedBarChart,
} from "@/boltDashboard/components/charts";
import { UnsupportedWidgetNotice } from "@/boltDashboard/components/UnsupportedWidgetNotice";
import { EngineeringSubmissionsSummary } from "@/boltDashboard/components/EngineeringSubmissionsSummary";
import { EngineeringSubmissionsTrend } from "@/boltDashboard/components/EngineeringSubmissionsTrend";
import { PositionWidget, SubmissionsKpiPanel } from "@/boltDashboard/components/ProgressPositionPanels";
import { MajorExceptionsPanel } from "@/boltDashboard/components/MajorExceptionsPanel";

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

function KpiGrid({ theme, kpis, widgetId }: { theme: ThemeTokens; kpis: Rec[]; widgetId?: string }) {
  if (!Array.isArray(kpis) || !kpis.length) return null;
  const isWgt051 = widgetId === "WGT-051";
  return (
    <div
      className={`grid grid-cols-1 gap-3${isWgt051 ? " wgt-051-kpi-grid" : " sm:grid-cols-2 xl:grid-cols-4"}`}
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
                <span className="text-[12px] font-semibold ml-0.5" style={{ color: theme.colors.muted_text }}>
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
}: {
  theme: ThemeTokens;
  widget: WidgetRow;
  placement?: { column_span?: number };
  dataDate?: string;
  kpiSelection?: string[] | null;
  onKpiSelectionChange?: (kpis: string[]) => void;
}) {
  const ast = widget.widget_ast;
  const wholeNumbers = widget.widget_id === "WGT-034";
  const c = (wholeNumbers ? roundNumbersDeep(contentOf(ast)) : contentOf(ast)) as Rec;
  const type = widget.widget_type;
  const isKpiWidget =
    widget.widget_id === "WGT-038" || widget.widget_id === "WGT-039" || widget.widget_id === "WGT-040";
  // WGT-038 full width; WGT-039 and WGT-040 share the row beneath it, same size.
  const span =
    widget.widget_id === "WGT-051" ||
    widget.widget_id === "WGT-013" ||
    widget.widget_id === "WGT-026" ||
    widget.widget_id === "WGT-035" ||
    widget.widget_id === "WGT-038"
      ? 12
      : widget.widget_id === "WGT-039" || widget.widget_id === "WGT-040"
        ? 6
        : (placement?.column_span ?? 6);

  const kpiNames = isKpiWidget
    ? Array.from(new Set((Array.isArray(c.data) ? (c.data as Rec[]) : []).map(kpiNameOf).filter(Boolean)))
    : null;
  const activeKpis = kpiNames ? (kpiSelection ?? kpiNames) : null;
  const filterKpiRows = (rows: Rec[]): Rec[] =>
    activeKpis && isKpiWidget
      ? rows.filter((r) => activeKpis.includes(kpiNameOf(r)))
      : rows;

  const gridClass =
    span >= 12
      ? "md:col-span-12 min-w-0"
      : span >= 8
        ? "md:col-span-8 min-w-0"
        : span >= 6
          ? "md:col-span-6 min-w-0"
          : span >= 4
            ? "md:col-span-4 min-w-0"
            : "md:col-span-3 min-w-0";

  if (widget.widget_id === "WGT-021") {
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

  if (widget.widget_id === "WGT-002" || widget.widget_id === "WGT-003") {
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

  if (widget.widget_id === "WGT-007") {
    return (
      <WidgetCard
        theme={theme}
        title={widget.widget_title}
        widgetId={widget.widget_id}
        dataStatus={widget.data_status}
        eyebrow={`${widget.widget_id} · alert panel`}
        className="md:col-span-12 min-w-0"
      >
        <MajorExceptionsPanel theme={theme} ast={ast} />
      </WidgetCard>
    );
  }

  let body: JSX.Element | null = null;

  // WGT-038 hosts the shared KPI pills that drive WGT-039/040 too.
  const kpiPills = kpiNames ? (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide mr-1" style={{ color: theme.colors.text_secondary }}>
        KPIs:
      </span>
      {kpiNames.map((key) => {
        const on = (activeKpis ?? []).includes(key);
        const row = (Array.isArray(c.data) ? (c.data as Rec[]) : []).find((r) => kpiNameOf(r) === key);
        const label = String(row?.kpi_label ?? row?.kpi_name ?? key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (!onKpiSelectionChange) return;
              const current = new Set(activeKpis ?? []);
              if (current.has(key)) {
                current.delete(key);
              } else {
                current.add(key);
              }
              if (current.size > 0) onKpiSelectionChange(Array.from(current));
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
      body = <MetadataPanel theme={theme} c={c} />;
      break;

    case "kpi_group": {
      // ASTs ship two shapes: kpis[] (WGT-002, WGT-045, WGT-048, WGT-051) and
      // items[] (WGT-003, WGT-016, WGT-021, WGT-031). Render either.
      const kpis = Array.isArray(c.kpis) ? (c.kpis as Rec[]) : Array.isArray(c.items) ? (c.items as Rec[]) : [];
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
      if (widget.widget_id === "WGT-005") {
        body = <EngineeringSubmissionsSummary theme={theme} ast={ast} />;
        break;
      }
      // WGT-005 shape: kpis + components. WGT-047: metrics + table + distribution.
      // WGT-049: summary counts + movement groups + empty state.
      const kpis = Array.isArray(c.kpis) ? (c.kpis as Rec[]) : Array.isArray(c.metrics) ? (c.metrics as Rec[]) : Array.isArray(c.summary) ? (c.summary as Rec[]) : [];
      const components = Array.isArray(c.components) ? (c.components as Rec[]) : [];
      const tableObj = c.table as Rec | undefined;
      const distribution = c.distribution as Rec | undefined;
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
                Distribution by category
              </p>
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
                <DataTable theme={theme} columns={columnsOf(g)} rows={g.items as ChartDatum[]} maxHeight={260} />
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
      // and multi-component (components[] — WGT-006).
      const comps = Array.isArray(c.components) ? (c.components as Rec[]) : null;
      if (!comps) {
        const series = seriesOf(c);
        const valueField = String(c.value_field ?? series[0]?.value_field ?? "count");
        const center = (c.center_metric ?? c.central_metric) as { label: string; value: number | string } | undefined;
        const isTransmittalDonut = ["WGT-022", "WGT-023", "WGT-024"].includes(widget.widget_id);
        const Donut = isTransmittalDonut ? TransmittalDonutChart : DonutChart;
        body = (
          <div>
            <Donut
              height={isTransmittalDonut ? 280 : undefined}
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
      // WGT-008 shows values at each point. WGT-009 shows values with no dots,
      // clamped to 8 weeks before / 4 after the data date (default 3 / 1).
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

    case "grouped_bar_chart": {
      // WGT-013 renders as a full-width planned-vs-actual table: phases ordered
      // MI, EN, CO, AUH, TC, HO (GN excluded), with an ahead/behind status pill.
      if (widget.widget_id === "WGT-013") {
        const data = Array.isArray(c.data) ? (c.data as Rec[]) : [];
        const phaseOrder = ["MI", "EN", "CO", "AUH", "TC", "HO"];
        const columns: TableColumn[] = [
          { key: "phase_code", label: "Phase", alignment: "left" },
          { key: "phase_label", label: "Description", alignment: "left" },
          { key: "planned_percent_complete", label: "Planned %", alignment: "right", data_type: "percentage" },
          { key: "actual_percent_complete", label: "Actual %", alignment: "right", data_type: "percentage" },
          { key: "variance", label: "Variance (Actual - Planned)", alignment: "right", data_type: "percentage" },
          { key: "status", label: "Status", alignment: "center" },
        ];
        const tableRows = data
          .filter((d) => d.phase_code !== "GN")
          .map((d, i) => {
            const planned = typeof d.planned_percent_complete === "number" ? d.planned_percent_complete : null;
            const actual = typeof d.actual_percent_complete === "number" ? d.actual_percent_complete : null;
            const variance = planned != null && actual != null ? Number((actual - planned).toFixed(2)) : null;
            return {
              ...d,
              row_id: d.phase_code ?? i,
              variance,
              status: variance == null ? "—" : variance >= 0 ? "ahead" : "behind",
            } as Record<string, unknown>;
          })
          .sort((a, b) => {
            const rank = (r: Record<string, unknown>) => phaseOrder.indexOf(String(r.phase_code));
            return rank(a) - rank(b);
          });
        body = (
          <div>
            <DataTable theme={theme} columns={columns} rows={tableRows} maxHeight={420} />
            <Observations theme={theme} notes={Array.isArray(c.notes) ? (c.notes as string[]) : []} />
          </div>
        );
        break;
      }
      // WGT-009 renders as a smooth curve (line chart with no dots) instead of bars.
      if (widget.widget_id === "WGT-009") {
        const data = Array.isArray(c.data) ? (c.data as ChartDatum[]) : [];
        const series = seriesOf(c);
        body = series.length ? (
          <div className="min-w-0">
            <LineChart
              theme={theme}
              data={data}
              series={series}
              categoryField="period_end"
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
      // WGT-010 gains a computed third bar: planned minus actual variance (pp).
      if (widget.widget_id === "WGT-010") {
        const data = Array.isArray(c.data) ? (c.data as ChartDatum[]) : [];
        const series = seriesOf(c);
        const cat = String(c.category_field ?? "week_num");
        const varianceField = "variance_pp";
        const isoWeek = (dateStr: string) => {
          const d = new Date(dateStr);
          if (Number.isNaN(d.getTime())) return null;
          const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
          const day = t.getUTCDay() || 7;
          t.setUTCDate(t.getUTCDate() + 4 - day);
          const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
          return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
        };
        const varianceData = data.map((d) => ({
          ...d,
          week_num: typeof d.week_num === "number" ? d.week_num : isoWeek(String(d.period_end ?? "")),
          [varianceField]:
            typeof d.planned_variance_pp === "number" && typeof d.actual_variance_pp === "number"
              ? Number((d.planned_variance_pp - d.actual_variance_pp).toFixed(4))
              : null,
        }));
        series.push({
          name: "Variance (Planned - Actual)",
          value_field: varianceField,
          semantic_series: "negative_variance",
        });
        body = series.length ? (
          <div>
            <GroupedBarChart
              theme={theme}
              data={varianceData}
              series={series}
              categoryField={cat}
              categoryLabelField={CategoryLabel(cat, typeof c.category_label_field === "string" ? c.category_label_field : undefined)}
              valueAxisLabel={typeof c.value_axis_label === "string" ? c.value_axis_label : undefined}
              showValueLabels
              valueLabelSize={10}
              emphasizedField={varianceField}
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
      const data = filterKpiRows(Array.isArray(c.data) ? (c.data as ChartDatum[]) : []);
      const series = seriesOf(c);
      const cat = String(c.category_field ?? "week_num");
      const orientation = String(c.orientation ?? "vertical");
      const kpiVertical = widget.widget_id === "WGT-039" || widget.widget_id === "WGT-040";
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

    case "photo_gallery": {
      body = <PhotoGallery theme={theme} c={c} />;
      break;
    }

    case "exception_table":
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
      body = (
        <div>
          <DataTable
            theme={theme}
            columns={columnsOf(c)}
            rows={rowsOf(c)}
            totals={totals}
            maxHeight={420}
            dataDate={dataDate}
            purplePastDates={purplePastForecastDates}
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
      title={widget.widget_title}
      widgetId={widget.widget_id}
      dataStatus={widget.data_status}
      eyebrow={widget.widget_id === "WGT-005" ? `${widget.widget_id} · ${widget.widget_type}` : undefined}
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
