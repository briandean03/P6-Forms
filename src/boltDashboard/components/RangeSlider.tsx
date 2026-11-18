import { useMemo } from "react";
import { ThemeTokens, radius } from "@/boltDashboard/theme/designTheme";

export interface RangeSliderProps {
  theme: ThemeTokens;
  total: number;
  window: { start: number; end: number };
  onChange: (w: { start: number; end: number }) => void;
  labelFor: (index: number) => string;
}

/**
 * Dual-handle range selector over the chart's point indices. Handles are
 * free-range: either can be dragged anywhere, so the window can span the
 * whole series. Handles cross-clamp only to keep start <= end.
 */
export function RangeSlider({ theme, total, window, onChange, labelFor }: RangeSliderProps) {
  const handleStart = (e: React.ChangeEvent<HTMLInputElement>, which: "start" | "end") => {
    const v = Number(e.target.value);
    if (which === "start") {
      onChange({ start: Math.min(v, window.end), end: window.end });
    } else {
      onChange({ start: window.start, end: Math.max(v, window.start) });
    }
  };

  const windowSize = window.end - window.start + 1;
  const summary = useMemo(() => {
    if (total === 0) return "";
    const a = labelFor(window.start);
    const b = labelFor(window.end);
    return a === b ? a : `${a} → ${b}`;
  }, [total, window.start, window.end, labelFor]);

  if (total <= 1) return null;

  return (
    <div className="no-print mt-2 select-none">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-medium" style={{ color: theme.colors.text_secondary }}>
          {summary}
        </span>
        <span className="text-[11px] tabular-nums" style={{ color: theme.colors.muted_text }}>
          {windowSize} of {total} points
        </span>
      </div>
      <div className="relative h-6">
        <div
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5"
          style={{ background: theme.colors.empty_data_bg ?? "#F4F3F8", borderRadius: radius(theme, "radius_pill") }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5"
          style={{
            left: `${(window.start / Math.max(1, total - 1)) * 100}%`,
            width: `${((window.end - window.start) / Math.max(1, total - 1)) * 100}%`,
            background: theme.colors.primary ?? "#5741DF",
            borderRadius: radius(theme, "radius_pill"),
          }}
        />
        <input
          type="range"
          min={0}
          max={total - 1}
          value={window.start}
          onChange={(e) => handleStart(e, "start")}
          className="range-thumb-start absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:cursor-grab"
          aria-label="Range start"
        />
        <input
          type="range"
          min={0}
          max={total - 1}
          value={window.end}
          onChange={(e) => handleStart(e, "end")}
          className="range-thumb-end absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:cursor-grab"
          aria-label="Range end"
        />
        <style>{`
          .range-thumb-start::-webkit-slider-thumb { background: ${theme.colors.primary ?? "#5741DF"}; border-color: #fff; box-shadow: 0 1px 3px rgba(36,37,45,.3); }
          .range-thumb-start::-moz-range-thumb { background: ${theme.colors.primary ?? "#5741DF"}; border: 2px solid #fff; width: 16px; height: 16px; border-radius: 9999px; }
          .range-thumb-end::-webkit-slider-thumb { background: ${theme.colors.charcoal ?? "#24252D"}; border-color: #fff; box-shadow: 0 1px 3px rgba(36,37,45,.3); }
          .range-thumb-end::-moz-range-thumb { background: ${theme.colors.charcoal ?? "#24252D"}; border: 2px solid #fff; width: 16px; height: 16px; border-radius: 9999px; }
        `}</style>
      </div>
    </div>
  );
}
