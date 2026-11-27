import { WidgetAst } from "@/boltDashboard/api/dashboardApi";
import { radius, ThemeTokens } from "@/boltDashboard/theme/designTheme";
import { DataTable, TableColumn } from "@/boltDashboard/components/widgetPrimitives";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>;

// WGT-021 / WGT-024 / WGT-028 / WGT-050 exception_table: rows + columns where a
// severity or status column renders as a badge. WGT-021 (Key Risks & Areas of
// Concern) carries only long prose, so it renders as readable stacked cards
// instead of a table.
export function ExceptionTable({ theme, ast }: { theme: ThemeTokens; ast: WidgetAst }) {
  const content = (ast.content ?? {}) as Rec;
  const rows = Array.isArray(content.rows) ? (content.rows as Rec[]) : [];
  const columnDefs = Array.isArray(content.columns) ? (content.columns as Rec[]) : [];
  const columns = columnDefs.map(
    (col: Rec): TableColumn => ({
      key: String(col.key),
      label: String(col.label ?? col.key),
      alignment: col.alignment,
      data_type: col.data_type,
    })
  );
  const proseOnly = ast.widget_id === "WGT-021" || (rows.length > 0 && !columns.some((c) => c.key === "severity" || c.key === "status" || c.key === "exception_severity"));

  if (!rows.length) {
    return (
      <p className="py-8 text-center text-[13px]" style={{ color: theme.colors.muted_text }}>
        No exceptions recorded for this reporting update.
      </p>
    );
  }

  if (proseOnly) {
    return (
      <div className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <div
            key={String(r.activity_id ?? i)}
            className="p-4"
            style={{
              background: theme.colors.surface_secondary ?? "#F4F3F8",
              borderRadius: radius(theme, "radius_md"),
              borderLeft: `3px solid ${theme.colors.warning ?? "#D99A39"}`,
            }}
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <p className="text-[13px] font-semibold leading-5" style={{ color: theme.colors.text_primary }}>
                {String(r.activity_name ?? "")}
              </p>
              {r.exception_type ? (
                <span
                  className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                  style={{ background: theme.colors.warning_bg ?? "#FBF1DF", color: theme.colors.warning ?? "#D99A39" }}
                >
                  {String(r.exception_type)}
                </span>
              ) : null}
            </div>
            {r.activity_id ? (
              <p className="mt-1 font-mono text-[10px] tracking-wide" style={{ color: theme.colors.muted_text }}>
                {String(r.activity_id)}
              </p>
            ) : null}
            <p className="mt-2 text-[13px] leading-6 break-words" style={{ color: theme.colors.text_secondary, overflowWrap: "anywhere" }}>
              {String(r.description ?? "")}
            </p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <DataTable
      theme={theme}
      columns={columns}
      rows={rows as Record<string, unknown>[]}
      maxHeight={420}
    />
  );
}
