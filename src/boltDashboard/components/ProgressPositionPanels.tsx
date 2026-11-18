import { WidgetAst } from "@/boltDashboard/api/dashboardApi";
import { ThemeTokens, radius } from "@/boltDashboard/theme/designTheme";
import { formatCellValue, StatusBadge, WidgetCard } from "@/boltDashboard/components/widgetPrimitives";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>;

function valueText(kpi: Rec): string {
  if (kpi.display_value != null) return String(kpi.display_value);
  if (kpi.data_type === "date") return String(kpi.value ?? "—");
  return formatCellValue(kpi.value, kpi.data_type);
}

function cardFill(theme: ThemeTokens, key: string, status?: string, semantic?: string): string {
  if (key === "cumulative_planned_progress") return theme.colors.surface_secondary ?? "#E7E3FA";
  if (key === "cumulative_actual_progress") return theme.colors.positive_bg ?? "#E6F5EF";
  if (status === "ahead" || semantic === "positive_variance") return theme.colors.positive_bg ?? "#E6F5EF";
  if (status === "behind" || status === "critical" || semantic === "negative_variance" || semantic === "critical") {
    return theme.colors.negative_bg ?? "#FBE9E5";
  }
  return theme.colors.surface_secondary ?? "#E7E3FA";
}

function DetailLine({ children, theme }: { children: React.ReactNode; theme: ThemeTokens }) {
  return (
    <p className="break-words text-[12px] leading-5" style={{ color: theme.colors.text_secondary, overflowWrap: "anywhere" }}>
      {children}
    </p>
  );
}

function ProgressKpiCard({ theme, kpi }: { theme: ThemeTokens; kpi: Rec }) {
  const previous = typeof kpi.comparison_value === "number" ? kpi.comparison_display_value ?? formatCellValue(kpi.comparison_value, kpi.data_type) : null;
  const variance = kpi.variance_display_value ?? (typeof kpi.variance === "number" ? `${kpi.variance.toFixed(2)} ${kpi.variance_unit ?? ""}`.trim() : null);
  return (
    <div
      className="flex min-w-0 flex-col gap-3 overflow-hidden p-5"
      style={{
        background: cardFill(theme, String(kpi.key), kpi.status, kpi.semantic_series),
        border: `1px solid ${theme.colors.subtle_border ?? "#D9D6E8"}`,
        borderRadius: radius(theme, "kpi_card"),
        minHeight: 248,
      }}
    >
      <span className="break-words text-[12px] font-semibold uppercase leading-4" style={{ color: theme.colors.text_secondary, letterSpacing: "0.04em" }}>
        {String(kpi.label ?? kpi.key ?? "")}
      </span>
      <span className="break-words text-[32px] font-semibold leading-9 tabular-nums" style={{ color: theme.colors.text_primary, overflowWrap: "anywhere" }}>
        {valueText(kpi)}
        {kpi.unit && kpi.data_type !== "date" && kpi.data_type !== "text" && !String(kpi.display_value ?? "").includes(String(kpi.unit)) ? (
          <span className="ml-1 text-[18px] font-medium" style={{ color: theme.colors.text_secondary }}>
            {String(kpi.unit)}
          </span>
        ) : null}
      </span>
      <div className="mt-auto flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: theme.colors.subtle_border ?? "#D9D6E8" }}>
        {previous && (
          <DetailLine theme={theme}>
            {String(kpi.comparison_label ?? "Previous reporting week")}: <strong>{previous}</strong>
          </DetailLine>
        )}
        {variance && (
          <DetailLine theme={theme}>
            <strong style={{ color: kpi.status === "ahead" ? theme.colors.success : kpi.status === "behind" ? theme.colors.critical : theme.colors.text_primary }}>
              {variance}
            </strong>
          </DetailLine>
        )}
        {kpi.status && (
          <StatusBadge theme={theme} status={String(kpi.status)} label={kpi.status_label ? String(kpi.status_label) : undefined} />
        )}
        {!previous && !variance && kpi.comparison_label && <DetailLine theme={theme}>{String(kpi.comparison_label)}</DetailLine>}
      </div>
    </div>
  );
}

function ScheduleKpiCard({ theme, kpi }: { theme: ThemeTokens; kpi: Rec }) {
  const dateComparison = kpi.data_type === "date" && kpi.comparison_value ? `${String(kpi.comparison_label ?? "Planned completion")}: ${String(kpi.comparison_value)}` : null;
  const variance = typeof kpi.variance === "number" && kpi.variance_unit ? `${Math.round(kpi.variance)} ${String(kpi.variance_unit)}` : null;
  const status = kpi.status === "behind" || kpi.status === "critical" ? "delayed" : kpi.status;
  return (
    <div
      className="flex min-w-0 flex-col gap-3 overflow-hidden p-5"
      style={{
        background: theme.colors.surface_secondary ?? "#E7E3FA",
        border: `1px solid ${theme.colors.subtle_border ?? "#D9D6E8"}`,
        borderRadius: radius(theme, "kpi_card"),
        minHeight: 190,
      }}
    >
      <span className="break-words text-[12px] font-semibold uppercase leading-4" style={{ color: theme.colors.text_secondary, letterSpacing: "0.04em" }}>
        {String(kpi.label ?? kpi.key ?? "")}
      </span>
      <span className="break-words text-[32px] font-semibold leading-9 tabular-nums" style={{ color: theme.colors.text_primary, overflowWrap: "anywhere" }}>
        {valueText(kpi)}
        {kpi.unit && kpi.data_type !== "date" && kpi.data_type !== "text" ? (
          <span className="ml-1 text-[18px] font-medium" style={{ color: theme.colors.text_secondary }}>
            {String(kpi.unit)}
          </span>
        ) : null}
      </span>
      {status && <StatusBadge theme={theme} status={status} label={status === "delayed" ? "delayed" : undefined} />}
      <div className="mt-auto flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: theme.colors.subtle_border ?? "#D9D6E8" }}>
        {variance && <DetailLine theme={theme}>{variance} beyond plan</DetailLine>}
        {dateComparison && <DetailLine theme={theme}>{dateComparison}</DetailLine>}
        {kpi.supporting_text && <DetailLine theme={theme}>{String(kpi.supporting_text)}</DetailLine>}
      </div>
    </div>
  );
}

export function ProgressPositionPanel({ theme, ast }: { theme: ThemeTokens; ast: WidgetAst }) {
  const content = (ast.content ?? {}) as Rec;
  const kpis = Array.isArray(content.kpis) ? (content.kpis as Rec[]) : [];
  const visible = kpis.filter((k) => ["cumulative_planned_progress", "cumulative_actual_progress", "planned_vs_actual_variance"].includes(String(k.key)));
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
      {visible.map((kpi) => <ProgressKpiCard key={String(kpi.key)} theme={theme} kpi={kpi} />)}
    </div>
  );
}

export function SchedulePositionPanel({ theme, ast }: { theme: ThemeTokens; ast: WidgetAst }) {
  const content = (ast.content ?? {}) as Rec;
  const items = Array.isArray(content.items) ? (content.items as Rec[]) : [];
  const indicators = Array.isArray(content.status_indicators) ? (content.status_indicators as Rec[]) : [];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((item) => <ScheduleKpiCard key={String(item.key)} theme={theme} kpi={item} />)}
      </div>
      {indicators.map((indicator) => (
        <div key={String(indicator.key)} className="break-words rounded-xl p-4 text-[12px] leading-5" style={{ background: theme.colors.warning_bg ?? "#FBF1DF", color: theme.colors.warning ?? "#D99A39" }}>
          {String(indicator.message ?? indicator.label ?? "")}
        </div>
      ))}
    </div>
  );
}

export function PositionWidget({ theme, ast, widgetId, title, widgetType, dataStatus, className }: { theme: ThemeTokens; ast: WidgetAst; widgetId: string; title: string; widgetType: string; dataStatus?: string; className?: string }) {
  const isSchedule = widgetId === "WGT-003";
  return (
    <WidgetCard
      theme={theme}
      title={title}
      widgetId={widgetId}
      dataStatus={dataStatus}
      className={className}
      eyebrow={`${widgetId} · ${widgetType}`}
      headerStatus={dataStatus === "partial" ? "partial" : undefined}
    >
      {isSchedule ? <SchedulePositionPanel theme={theme} ast={ast} /> : <ProgressPositionPanel theme={theme} ast={ast} />}
    </WidgetCard>
  );
}

// WGT-021 — submission KPIs in the WGT-002 card style. The total-transmittal
// card spans wider; the per-status cards (A/B/C/D/UR) sit in a narrower row.
function SubmissionsKpiCard({ theme, kpi, emphasized = false }: { theme: ThemeTokens; kpi: Rec; emphasized?: boolean }) {
  const previous = typeof kpi.comparison_value === "number" ? kpi.comparison_display_value ?? formatCellValue(kpi.comparison_value, kpi.data_type) : null;
  const variance = kpi.variance_display_value ?? (typeof kpi.variance === "number" ? `${kpi.variance.toFixed(2)} ${kpi.variance_unit ?? ""}`.trim() : null);
  return (
    <div
      className="flex min-w-0 flex-col gap-3 overflow-hidden p-5"
      style={{
        background: cardFill(theme, String(kpi.key), kpi.status, kpi.semantic_series),
        border: `1px solid ${theme.colors.subtle_border ?? "#D9D6E8"}`,
        borderRadius: radius(theme, "kpi_card"),
        minHeight: emphasized ? 248 : 190,
      }}
    >
      <span className="break-words text-[12px] font-semibold uppercase leading-4" style={{ color: theme.colors.text_secondary, letterSpacing: "0.04em" }}>
        {String(kpi.label ?? kpi.key ?? "")}
      </span>
      <span
        className={`break-words font-semibold tabular-nums ${emphasized ? "text-[32px] leading-9" : "text-[26px] leading-8"}`}
        style={{ color: theme.colors.text_primary, overflowWrap: "anywhere" }}
      >
        {valueText(kpi)}
        {kpi.unit && kpi.data_type !== "date" && kpi.data_type !== "text" && !String(kpi.display_value ?? "").includes(String(kpi.unit)) ? (
          <span className="ml-1 text-[18px] font-medium" style={{ color: theme.colors.text_secondary }}>
            {String(kpi.unit)}
          </span>
        ) : null}
      </span>
      <div className="mt-auto flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: theme.colors.subtle_border ?? "#D9D6E8" }}>
        {previous && (
          <DetailLine theme={theme}>
            {String(kpi.comparison_label ?? "Previous reporting week")}: <strong>{previous}</strong>
          </DetailLine>
        )}
        {variance && <DetailLine theme={theme}><strong>{variance}</strong></DetailLine>}
        {kpi.supporting_text && <DetailLine theme={theme}>{String(kpi.supporting_text)}</DetailLine>}
        {kpi.status && (
          <StatusBadge theme={theme} status={String(kpi.status)} label={kpi.status_label ? String(kpi.status_label) : undefined} />
        )}
      </div>
    </div>
  );
}

export function SubmissionsKpiPanel({ theme, ast }: { theme: ThemeTokens; ast: WidgetAst }) {
  const content = (ast.content ?? {}) as Rec;
  const items = Array.isArray(content.items) ? (content.items as Rec[]) : Array.isArray(content.kpis) ? (content.kpis as Rec[]) : [];
  const isTransmittal = (k: Rec) => /transmittal/i.test(String(k.key ?? "")) || /total/i.test(String(k.label ?? ""));
  const emphasized = items.filter(isTransmittal);
  const statusCards = items.filter((k) => !isTransmittal(k));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        {emphasized.map((kpi) => <SubmissionsKpiCard key={String(kpi.key)} theme={theme} kpi={kpi} emphasized />)}
      </div>
      {statusCards.length > 0 && (
        <div
          className="grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-3"
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(0, ${statusCards.length <= 5 ? "1fr" : "160px"}))` }}
        >
          {statusCards.map((kpi) => <SubmissionsKpiCard key={String(kpi.key)} theme={theme} kpi={kpi} />)}
        </div>
      )}
    </div>
  );
}
