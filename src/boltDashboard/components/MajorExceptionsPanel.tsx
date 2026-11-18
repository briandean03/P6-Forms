import { WidgetAst } from "@/boltDashboard/api/dashboardApi";
import { ThemeTokens, radius } from "@/boltDashboard/theme/designTheme";
import { formatCellValue } from "@/boltDashboard/components/widgetPrimitives";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>;

function statusTone(theme: ThemeTokens, status: string): { bg: string; fg: string } {
  const s = status.toLowerCase();
  if (s === "not started" || s === "overdue" || s === "c") {
    return { bg: theme.colors.negative_bg ?? "#FBE9E5", fg: theme.colors.critical ?? "#DB694F" };
  }
  if (s === "ur" || s === "unassigned" || s === "b") {
    return { bg: theme.colors.warning_bg ?? "#FBF1DF", fg: theme.colors.warning ?? "#D99A39" };
  }
  if (s === "opn" || s === "open") {
    return { bg: theme.colors.warning_bg ?? "#FBF1DF", fg: theme.colors.warning ?? "#D99A39" };
  }
  return { bg: theme.colors.surface_secondary ?? "#F4F3F8", fg: theme.colors.text_secondary ?? "#6B6D7B" };
}

function groupByDomain(rows: Rec[]): { domain: string; rows: Rec[] }[] {
  const order: string[] = [];
  const map = new Map<string, Rec[]>();
  for (const row of rows) {
    const d = String(row.domain ?? "Other");
    if (!map.has(d)) { map.set(d, []); order.push(d); }
    map.get(d)!.push(row);
  }
  return order.map((d) => ({ domain: d, rows: map.get(d)! }));
}

function domainAccent(theme: ThemeTokens, domain: string): string {
  const d = domain.toLowerCase();
  if (d.includes("engineering")) return theme.colors.planned ?? "#5741DF";
  if (d.includes("construction")) return theme.colors.warning ?? "#D99A39";
  if (d.includes("quality") || d.includes("hse")) return theme.colors.critical ?? "#DB694F";
  return theme.colors.muted_text ?? "#8A8C98";
}

function domainHeaderBg(theme: ThemeTokens, domain: string): string {
  const d = domain.toLowerCase();
  if (d.includes("engineering")) return theme.colors.alert_info_bg ?? "#E7E3FA";
  if (d.includes("construction")) return theme.colors.warning_bg ?? "#FBF1DF";
  if (d.includes("quality") || d.includes("hse")) return theme.colors.negative_bg ?? "#FBE9E5";
  return theme.colors.empty_data_bg ?? "#F4F3F8";
}

export function MajorExceptionsPanel({ theme, ast }: { theme: ThemeTokens; ast: WidgetAst }) {
  const content = (ast.content ?? {}) as Rec;
  const rows = Array.isArray(content.rows) ? (content.rows as Rec[]) : [];

  if (!rows.length) {
    return (
      <p className="py-8 text-center text-[13px]" style={{ color: theme.colors.muted_text }}>
        No exceptions for this reporting update.
      </p>
    );
  }

  const groups = groupByDomain(rows);

  return (
    <div
      className="major-exceptions-scroll print-collapse flex min-w-0 flex-col gap-5 overflow-y-scroll pr-2"
      style={{
        height: "min(560px, 65vh)",
        overflowY: "scroll",
        scrollbarGutter: "stable",
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "thin",
        scrollbarColor: "#7d7b8d transparent",
      }}
      aria-label="Scrollable exception list"
    >
      {groups.map(({ domain, rows: domainRows }) => {
        const accent = domainAccent(theme, domain);
        const headerBg = domainHeaderBg(theme, domain);
        return (
          <div
            key={domain}
            className="min-w-0 shrink-0 overflow-hidden"
            style={{
              border: `1px solid ${theme.colors.subtle_border ?? "#D9D6E8"}`,
              borderRadius: radius(theme, "kpi_card"),
            }}
          >
            {/* Domain group header */}
            <div
              className="flex items-center gap-2 px-4 py-2.5"
              style={{ background: headerBg, borderBottom: `1px solid ${theme.colors.subtle_border ?? "#D9D6E8"}` }}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: accent }}
              />
              <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
                {domain}
              </span>
              <span className="ml-auto text-[11px] font-medium" style={{ color: theme.colors.muted_text }}>
                {domainRows.length} {domainRows.length === 1 ? "exception" : "exceptions"}
              </span>
            </div>

            {/* Table */}
            <div>
              <table className="w-full table-fixed border-collapse text-[13px]">
                <colgroup>
                  <col style={{ width: "50%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                </colgroup>
                <thead>
                  <tr style={{ background: theme.colors.table_header_bg ?? "#F4F3F8" }}>
                    <th
                      className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: theme.colors.text_secondary }}
                    >
                      Exception
                    </th>
                    <th
                      className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap"
                      style={{ color: theme.colors.text_secondary }}
                    >
                      Status
                    </th>
                    <th
                      className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap"
                      style={{ color: theme.colors.text_secondary }}
                    >
                      Days Overdue / Open
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {domainRows.map((row, i) => {
                    const tone = statusTone(theme, String(row.status ?? ""));
                    const isLast = i === domainRows.length - 1;
                    const detailLine = [row.reference, row.exception_category, row.discipline]
                      .filter((value) => Boolean(value))
                      .map((value) => String(value))
                      .join(" · ");
                    return (
                      <tr
                        key={String(row.row_id ?? i)}
                        style={isLast ? undefined : { borderBottom: `1px solid ${theme.colors.subtle_border ?? "#ECEAF6"}` }}
                      >
                        {/* Description cell with one-line reference, category, and discipline metadata */}
                        <td className="px-4 py-3 align-top break-words">
                          <p className="break-words font-medium leading-5" style={{ color: theme.colors.text_primary }}>
                            {String(row.description ?? "—")}
                          </p>
                          {detailLine && (
                            <p
                              className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-4"
                              style={{ color: theme.colors.muted_text }}
                              title={detailLine}
                            >
                              {detailLine}
                            </p>
                          )}
                        </td>

                        {/* Status badge */}
                        <td className="px-4 py-3 align-top">
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                            style={{ background: tone.bg, color: tone.fg }}
                          >
                            {String(row.status ?? "—")}
                          </span>
                        </td>

                        {/* Age value */}
                        <td className="px-4 py-3 text-right align-top tabular-nums" style={{ color: theme.colors.text_primary }}>
                          <span className="text-[14px] font-semibold">
                            {typeof row.age_days === "number" ? formatCellValue(row.age_days, "count") : "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
