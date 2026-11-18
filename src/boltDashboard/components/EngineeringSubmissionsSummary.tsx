import { WidgetAst } from "@/boltDashboard/api/dashboardApi";
import { ThemeTokens, radius } from "@/boltDashboard/theme/designTheme";
import { formatCellValue } from "@/boltDashboard/components/widgetPrimitives";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>;

function countText(value: unknown): string {
  return formatCellValue(value, "count");
}

function toneForStatus(theme: ThemeTokens, status: string): { background: string; color: string } {
  if (status === "C") {
    return {
      background: theme.colors.warning_bg ?? "#FBF1DF",
      color: theme.colors.warning ?? "#D99A39",
    };
  }
  if (status === "D") {
    return {
      background: theme.colors.negative_bg ?? "#FBE9E5",
      color: theme.colors.critical ?? "#DB694F",
    };
  }
  return {
    background: theme.colors.positive_bg ?? "#E6F5EF",
    color: theme.colors.success ?? "#359D78",
  };
}

export function EngineeringSubmissionsSummary({
  theme,
  ast,
}: {
  theme: ThemeTokens;
  ast: WidgetAst;
}) {
  const content = (ast.content ?? {}) as Rec;
  const kpis = Array.isArray(content.kpis) ? (content.kpis as Rec[]) : [];
  const byKey = new Map(kpis.map((k) => [String(k.key), k]));
  const total = byKey.get("total_transmittals");
  const planned = byKey.get("planned_submissions_to_datadate");
  const submitted = byKey.get("submitted_to_datadate");
  const overdue = byKey.get("overdue_not_submitted");
  const underReview = byKey.get("under_review_over_14_days");
  const statusC = byKey.get("status_c_not_resubmitted_over_14_days");
  const statusComponent = (content.components as Rec[] | undefined)?.find(
    (component) => component.component_id === "submission_status_distribution",
  );
  const statusContent = (statusComponent?.content ?? {}) as Rec;
  const statuses = Array.isArray(statusContent.data) ? (statusContent.data as Rec[]) : [];
  const submittedShare =
    typeof submitted?.value === "number" && typeof planned?.value === "number" && planned.value !== 0
      ? `${((submitted.value / planned.value) * 100).toFixed(2)}%`
      : "—";

  const summaryCard = (kpi: Rec | undefined, background: string) => (
    <div
      className="flex min-w-0 flex-col justify-center gap-2 overflow-hidden p-5"
      style={{
        background,
        border: `1px solid ${theme.colors.subtle_border ?? "#D9D6E8"}`,
        borderRadius: radius(theme, "kpi_card"),
        minHeight: 116,
      }}
    >
      <span
        className="break-words text-[11px] font-semibold uppercase leading-4"
        style={{ color: theme.colors.text_secondary, letterSpacing: "0.04em" }}
      >
        {String(kpi?.label ?? "")}
      </span>
      <span className="break-words text-[28px] font-semibold leading-8 tabular-nums" style={{ color: theme.colors.text_primary }}>
        {countText(kpi?.value)}
        <span className="inline-block whitespace-nowrap ml-1 text-[18px] font-medium" style={{ color: theme.colors.text_secondary }}>
          {String(kpi?.unit ?? "")}
        </span>
      </span>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {total && (
        <div
          className="flex min-w-0 flex-col justify-center gap-2 overflow-hidden p-5"
          style={{
            background: theme.colors.empty_data_bg ?? "#F4F3F8",
            border: `1px solid ${theme.colors.subtle_border ?? "#D9D6E8"}`,
            borderRadius: radius(theme, "kpi_card"),
            minHeight: 116,
          }}
        >
          <span
            className="break-words text-[11px] font-semibold uppercase leading-4"
            style={{ color: theme.colors.text_secondary, letterSpacing: "0.04em" }}
          >
            {String(total.label)}
          </span>
          <span className="break-words text-[36px] font-semibold leading-10 tabular-nums" style={{ color: theme.colors.text_primary }}>
            {countText(total.value)}
            <span className="inline-block whitespace-nowrap ml-1 text-[18px] font-medium" style={{ color: theme.colors.text_secondary }}>
              {String(total.unit ?? "")}
            </span>
          </span>
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
        {summaryCard(planned, theme.colors.surface_secondary ?? "#E7E3FA")}
        {summaryCard(submitted, theme.colors.positive_bg ?? "#E6F5EF")}
        {summaryCard(overdue, theme.colors.negative_bg ?? "#FBE9E5")}
      </div>

      <div className="flex min-w-0 flex-col gap-3 pt-1">
        <p className="break-words text-[14px] leading-5" style={{ color: theme.colors.text_secondary }}>
          <strong style={{ color: theme.colors.text_primary }}>Submitted as Share of Planned:</strong> {submittedShare}
        </p>

        <div className="flex flex-wrap gap-2">
          {statuses.map((status, index) => {
            const code = String(status.status_code ?? status.status_label ?? index);
            const tone = toneForStatus(theme, code);
            return (
              <span
                key={code}
                className="inline-flex max-w-full items-center rounded-full px-3 py-1 text-[13px] font-semibold tabular-nums"
                style={{ background: tone.background, color: tone.color }}
              >
                {code}: {countText(status.count)}
              </span>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {[underReview, statusC].map((kpi) =>
            kpi ? (
              <span
                key={String(kpi.key)}
                className="inline-flex max-w-full items-center rounded-full px-3 py-1.5 text-[13px] font-semibold leading-5"
                style={{
                  background: theme.colors.warning_bg ?? "#FBF1DF",
                  color: theme.colors.warning ?? "#D99A39",
                }}
              >
                {String(kpi.label)}: {countText(kpi.value)}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
