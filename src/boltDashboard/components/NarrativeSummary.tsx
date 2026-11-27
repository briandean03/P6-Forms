import { WidgetAst } from "@/boltDashboard/api/dashboardApi";
import { ThemeTokens, radius } from "@/boltDashboard/theme/designTheme";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>;

// WGT-007 narrative_summary: sections[] with prose narrative or bullets[]
// (text / activity / verified_achievement).
export function NarrativeSummary({ theme, ast }: { theme: ThemeTokens; ast: WidgetAst }) {
  const content = (ast.content ?? {}) as Rec;
  const sections = Array.isArray(content.sections) ? (content.sections as Rec[]) : [];

  if (!sections.length) {
    return (
      <p className="py-6 text-center text-[13px]" style={{ color: theme.colors.muted_text }}>
        No narrative provided for this reporting update.
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {sections.map((section, i) => {
        const metrics = Array.isArray(section.metrics) ? (section.metrics as Rec[]) : [];
        const bullets = Array.isArray(section.bullets) ? (section.bullets as Rec[]) : [];
        // Prose sections are split into sentence-level bullets so both section
        // shapes render as the same scannable list.
        const narrativeText = String(section.narrative ?? section.content ?? "").trim();
        const proseBullets =
          !bullets.length && narrativeText
            ? narrativeText
                .split(/(?<=[.!?])\s+(?=[A-Z])/)
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
        return (
          <div key={String(section.section_id ?? i)} className="min-w-0">
            <p className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide" style={{ color: theme.colors.text_secondary }}>
              {String(section.title ?? "")}
            </p>
            {bullets.length > 0 || proseBullets.length > 0 ? (
              <ul className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-2.5 md:grid-cols-2">
                {bullets.map((bullet, bi) => {
                  const activity = String(bullet.activity ?? "").trim();
                  const status = String(bullet.verified_achievement ?? bullet.planned_action ?? "").trim();
                  const text = String(bullet.text ?? bullet.narrative ?? bullet.content ?? "").trim();
                  return (
                    <li
                      key={String(bullet.activity ?? bi)}
                      className="flex gap-2.5 text-[13px] leading-6"
                      style={{ color: theme.colors.text_primary, overflowWrap: "anywhere" }}
                    >
                      <span
                        className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: theme.colors.planned }}
                      />
                      <span className="min-w-0">
                        <span className="font-semibold">{activity || text}</span>
                        {activity && status && (
                          <span style={{ color: theme.colors.text_secondary }}> — {status}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
                {proseBullets.map((sentence, bi) => (
                  <li
                    key={`prose-${bi}`}
                    className="flex gap-2.5 text-[13px] leading-6"
                    style={{ color: theme.colors.text_primary, overflowWrap: "anywhere" }}
                  >
                    <span
                      className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: theme.colors.planned }}
                    />
                    <span className="min-w-0 font-semibold">{sentence}</span>
                  </li>
                ))}
              </ul>
            ) : narrativeText ? (
              <p className="break-words text-[13px] leading-6" style={{ color: theme.colors.text_primary, overflowWrap: "anywhere" }}>
                {narrativeText}
              </p>
            ) : null}
            {metrics.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {metrics.map((metric, mi) => {
                  const display = String(metric.display_value ?? metric.value ?? "—");
                  const unit = metric.unit && !display.includes(String(metric.unit)) ? String(metric.unit) : null;
                  return (
                    <div
                      key={String(metric.metric_key ?? mi)}
                      className="flex min-w-0 flex-col px-3 py-2"
                      style={{ background: theme.colors.surface_secondary ?? "#F4F3F8", borderRadius: radius(theme, "radius_sm") }}
                    >
                      <span className="break-words text-[10px] font-medium uppercase tracking-wide" style={{ color: theme.colors.muted_text }}>
                        {String(metric.label ?? "")}
                      </span>
                      <span className="text-[14px] font-semibold tabular-nums" style={{ color: theme.colors.text_primary }}>
                        {display}
                        {unit && (
                          <span className="ml-0.5 text-[10px] font-medium" style={{ color: theme.colors.muted_text }}>
                            {unit}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
