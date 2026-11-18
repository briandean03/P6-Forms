import { HelpCircle } from "lucide-react";
import { ThemeTokens, radius } from "@/boltDashboard/theme/designTheme";

export function UnsupportedWidgetNotice({
  theme,
  widgetType,
  reason,
}: {
  theme: ThemeTokens;
  widgetType: string;
  reason?: string;
}) {
  return (
    <div
      className="flex items-start gap-2.5 p-3"
      style={{
        background: theme.colors.alert_warning_bg ?? theme.colors.warning_bg ?? "#FBF1DF",
        borderRadius: radius(theme, "radius_md"),
      }}
      role="status"
    >
      <HelpCircle size={16} className="shrink-0 mt-0.5" style={{ color: theme.colors.warning ?? "#D99A39" }} />
      <div>
        <p className="text-[12px] font-semibold" style={{ color: theme.colors.text_primary }}>
          Widget type "{widgetType}" is not yet supported
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: theme.colors.text_secondary }}>
          {reason ?? "This widget's data is loaded but no renderer exists for its type."}
        </p>
      </div>
    </div>
  );
}
