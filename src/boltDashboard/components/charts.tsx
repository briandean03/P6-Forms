import { useId, useMemo, useState } from "react";
import type { ThemeTokens } from "@/boltDashboard/theme/designTheme";
import { semanticColor, radius } from "@/boltDashboard/theme/designTheme";
import { RangeSlider } from "@/boltDashboard/components/RangeSlider";
import { useMeasuredWidth } from "@/boltDashboard/components/useMeasuredWidth";
import { useInView } from "@/boltDashboard/components/useInView";

export interface ChartSeries {
  name: string;
  value_field: string;
  color_token?: string;
  semantic_series?: string;
  unit?: string;
  display_order?: number;
  stack?: string;
}

export interface ChartDatum {
  [key: string]: unknown;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const n = v / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * base;
}

function Tooltip({
  theme,
  x,
  y,
  lines,
  visible,
}: {
  theme: ThemeTokens;
  x: number;
  y: number;
  lines: string[];
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 px-2.5 py-1.5 text-[11px] leading-4 rounded-lg"
      style={{
        left: x,
        top: y,
        transform: "translate(-50%, -100%)",
        background: theme.colors.tooltip_bg ?? "#24252D",
        color: theme.colors.tooltip_text ?? "#FFFFFF",
      }}
    >
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

function Legend({
  theme,
  items,
}: {
  theme: ThemeTokens;
  items: { name: string; color: string; opacity?: number }[];
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
      {items.map((it) => (
        <span key={it.name} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: theme.colors.text_secondary }}>
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: it.color, opacity: it.opacity }} />
          {it.name}
        </span>
      ))}
    </div>
  );
}

export function LineChart({
  theme,
  data,
  series,
  categoryField,
  categoryLabelField,
  height = 220,
  showPointLabels = false,
  showDots = true,
  pointLabelSize = 8,
  defaultBefore = 12,
  defaultAfter = 4,
  maxBefore,
  maxAfter,
  dataDate,
}: {
  theme: ThemeTokens;
  data: ChartDatum[];
  series: ChartSeries[];
  categoryField: string;
  categoryLabelField?: string;
  height?: number;
  showPointLabels?: boolean;
  showDots?: boolean;
  pointLabelSize?: number;
  defaultBefore?: number;
  defaultAfter?: number;
  maxBefore?: number;
  maxAfter?: number;
  dataDate?: string;
}) {
  const uid = useId();
  const [hover, setHover] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const { ref, width: measured } = useMeasuredWidth();
  const { ref: inViewRef, inView } = useInView<HTMLDivElement>();
  const W = Math.round(measured);
  const H = height;
  const M = { top: 16, right: 16, bottom: 24, left: 40 };

  // Window the series around the data date (defaults from props); the slider
  // is clamped to maxBefore/maxAfter weeks around it when provided.
  const dataDateIdx = useMemo(() => {
    if (!dataDate) return null;
    const target = new Date(dataDate).getTime();
    if (Number.isNaN(target)) return null;
    let best: { idx: number; diff: number } | null = null;
    for (let i = 0; i < data.length; i++) {
      const t = new Date(String(data[i][categoryField] ?? data[i].period_end ?? "")).getTime();
      if (Number.isNaN(t)) continue;
      const diff = Math.abs(t - target);
      if (!best || diff < best.diff) best = { idx: i, diff };
    }
    return best ? best.idx : null;
  }, [data, dataDate, categoryField]);

  const anchor = dataDateIdx ?? data.length - 1;
  const defaultWindow = { start: Math.max(0, anchor - defaultBefore), end: Math.min(data.length - 1, anchor + defaultAfter) };
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const clampWindow = (w: { start: number; end: number }) => {
    let { start, end } = w;
    if (dataDateIdx != null) {
      if (maxBefore != null) start = Math.max(start, dataDateIdx - maxBefore);
      if (maxAfter != null) end = Math.min(end, dataDateIdx + maxAfter);
    }
    end = Math.max(start, end);
    return { start, end };
  };
  const active = data.length > 6 && (dataDateIdx != null || data.length > 16) ? (range ?? defaultWindow) : null;
  const view = useMemo(
    () => (active ? data.slice(active.start, active.end + 1) : data),
    [data, active],
  );

  const { pts, yMax, xLabels } = useMemo(() => {
    let max = 0;
    for (const d of view)
      for (const s of series) {
        const v = typeof d[s.value_field] === "number" ? (d[s.value_field] as number) : null;
        if (v != null && v > max) max = v;
      }
    const yMax = niceMax(max * 1.08);
    const pts = view.map((d, i) => {
      const x = M.left + (i / Math.max(1, view.length - 1)) * (W - M.left - M.right);
      const seriesVals: Record<string, number | null> = {};
      for (const s of series) {
        const v = typeof d[s.value_field] === "number" ? (d[s.value_field] as number) : null;
        seriesVals[s.value_field] = v == null ? null : M.top + (1 - v / yMax) * (H - M.top - M.bottom);
      }
      return { x, y: seriesVals, raw: d };
    });
    const labelEvery = Math.ceil(view.length / 8);
    const xLabels = view
      .map((d, i) => {
        const label = String(d[categoryLabelField ?? categoryField] ?? d.period_end ?? "");
        const weekNum = typeof d.week_num === "number" ? d.week_num : null;
        return { i, label, weekNum };
      })
      .filter((_, i) => i % labelEvery === 0);
    return { pts, yMax, xLabels };
  }, [view, series, categoryField, categoryLabelField, H, M.left, M.right, M.top, M.bottom]);

  const gridlines = 4;

  return (
    <div className="relative min-w-0" ref={inViewRef}>
      <div className="relative min-w-0" ref={ref}>
      <Legend theme={theme} items={series.map((s) => ({ name: s.name, color: semanticColor(theme, s.semantic_series ?? s.color_token) }))} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" style={{ height }}>
        {Array.from({ length: gridlines + 1 }, (_, i) => {
          const y = M.top + (i / gridlines) * (H - M.top - M.bottom);
          const val = (yMax * (1 - i / gridlines)).toFixed(0);
          return (
            <g key={i}>
              <line x1={M.left} x2={W - M.right} y1={y} y2={y} stroke={theme.colors.chart_gridline ?? "#ECEAF6"} strokeWidth="1" />
              <text x={M.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill={theme.colors.chart_axis_label ?? theme.colors.muted_text}>
                {val}
              </text>
            </g>
          );
        })}
        {xLabels.map(({ i, label }) => (
          <text
            key={i}
            x={pts[i]?.x ?? M.left}
            y={H - 12}
            textAnchor="middle"
            fontSize="9"
            fill={theme.colors.chart_axis_label ?? theme.colors.muted_text}
          >
            {label.length > 10 ? label.slice(0, 10) : label}
          </text>
        ))}
        {xLabels.map(({ i, weekNum }) =>
          weekNum != null ? (
            <text
              key={`wk-${i}`}
              x={pts[i]?.x ?? M.left}
              y={H - 2}
              textAnchor="middle"
              fontSize="8"
              fontWeight={600}
              fill={theme.colors.chart_axis_label ?? theme.colors.muted_text}
            >
              {`W${weekNum}`}
            </text>
          ) : null,
        )}
        {series.map((s) => {
          const color = semanticColor(theme, s.semantic_series ?? s.color_token);
          const segments = splitOnNull(pts, s.value_field);
          const gradId = `${uid}-grad-${s.value_field}`.replace(/:/g, "");
          const labelEvery = Math.max(1, Math.ceil(view.length / 30));
          return (
            <g key={`${uid}-${s.value_field}`}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              {segments.map((seg, si) => {
                const path = smoothPath(seg, s.value_field);
                if (!path) return null;
                const first = seg[0];
                const last = seg[seg.length - 1];
                const baseY = H - M.bottom;
                return (
                  <g key={si}>
                    <path
                      d={`${path} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`}
                      fill={`url(#${gradId})`}
                      className={inView ? "chart-fill-enter" : undefined}
                      style={{ opacity: inView ? undefined : 0 }}
                    />
                    <path
                      d={path}
                      fill="none"
                      stroke={color}
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      pathLength={1}
                      className={inView ? "chart-line-enter" : undefined}
                      style={{ filter: `drop-shadow(0 2px 3px ${color}66)`, opacity: inView ? undefined : 0 }}
                    />
                    {seg.map((p, pi) => {
                      const py = p.y[s.value_field] as number;
                      const v = p.raw[s.value_field];
                      const anchor = p.x < 56 ? "start" : p.x > W - 56 ? "end" : "middle";
                      return (
                        <g
                          key={pi}
                          className={inView ? "chart-fill-enter" : undefined}
                          style={{ opacity: inView ? undefined : 0 }}
                        >
                          {showDots && <circle cx={p.x} cy={py} r={view.length > 40 ? 1.5 : 3} fill={color} />}
                          {showPointLabels && pi % labelEvery === 0 && typeof v === "number" && (
                            <text
                              x={p.x}
                              y={py - 7}
                              textAnchor={anchor}
                              fontSize={pointLabelSize}
                              fontWeight={600}
                              fill={color}
                            >
                              {Number.isInteger(v) ? String(v) : v.toFixed(1)}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          );
        })}
        {pts.map((p, i) => (
          <rect
            key={i}
            x={p.x - (W - M.left - M.right) / Math.max(1, data.length * 2)}
            y={M.top}
            width={(W - M.left - M.right) / Math.max(1, data.length)}
            height={H - M.top - M.bottom}
            fill="transparent"
            onMouseEnter={() =>
              setHover({
                x: p.x,
                y: Math.min(...Object.values(p.y).filter((v): v is number => v != null)),
                lines: [
                  String(p.raw[categoryField] ?? p.raw.period_end ?? ""),
                  ...series.map((s) => {
                    const v = p.raw[s.value_field];
                    return `${s.name}: ${typeof v === "number" ? v.toFixed(2) : "—"}`;
                  }),
                ],
              })
            }
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hover && <Tooltip theme={theme} x={hover.x} y={hover.y - 6} lines={hover.lines} visible />}
      {active && (
        <RangeSlider
          theme={theme}
          total={data.length}
          window={active}
          onChange={(w) => setRange(clampWindow(w))}
          labelFor={(i) => {
            const d = data[i];
            return String(d?.[categoryLabelField ?? categoryField] ?? d?.period_end ?? `#${i + 1}`);
          }}
        />
      )}
      </div>
    </div>
  );
}

function smoothPath(seg: { x: number; y: Record<string, number | null>; raw: ChartDatum }[], field: string): string {
  const p = seg.map((pt) => ({ x: pt.x, y: pt.y[field] as number }));
  if (p.length < 2) return "";
  let d = `M ${p[0].x} ${p[0].y}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const t = 0.2;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function splitOnNull(pts: { x: number; y: Record<string, number | null>; raw: ChartDatum }[], field: string) {
  const segs: { x: number; y: Record<string, number | null>; raw: ChartDatum }[][] = [[]];
  for (const p of pts) {
    if (p.y[field] == null) {
      if (segs[segs.length - 1].length) segs.push([]);
    } else {
      segs[segs.length - 1].push(p);
    }
  }
  return segs.filter((s) => s.length > 1);
}

function fmtBarValue(v: number, whole = false): string {
  if (whole) return String(Math.round(v));
  if (Math.abs(v) >= 10) return v.toFixed(0);
  if (Math.abs(v) >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

export function GroupedBarChart({
  theme,
  data,
  series,
  categoryField,
  categoryLabelField,
  valueAxisLabel,
  height = 220,
  showValueLabels = false,
  valueLabelSize = 7.5,
  showWeekNumbers = false,
  wholeNumbers = false,
  emphasizedField,
  verticalLabels = false,
  defaultBefore,
  defaultAfter,
  maxBefore,
  maxAfter,
  dataDate,
}: {
  theme: ThemeTokens;
  data: ChartDatum[];
  series: ChartSeries[];
  categoryField: string;
  categoryLabelField?: string;
  valueAxisLabel?: string;
  height?: number;
  showValueLabels?: boolean;
  valueLabelSize?: number;
  showWeekNumbers?: boolean;
  wholeNumbers?: boolean;
  emphasizedField?: string;
  verticalLabels?: boolean;
  defaultBefore?: number;
  defaultAfter?: number;
  maxBefore?: number;
  maxAfter?: number;
  dataDate?: string;
}) {
  const [hover, setHover] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const { ref, width: measured } = useMeasuredWidth();
  const { ref: inViewRef, inView } = useInView<HTMLDivElement>();
  const W = Math.round(measured);
  const H = height;
  const M = { top: 14, right: 12, bottom: verticalLabels ? 92 : showWeekNumbers ? 34 : 24, left: 40 };

  // Window the series around the data date with a slider, same conditions as LineChart.
  const dataDateIdx = useMemo(() => {
    if (!dataDate) return null;
    const target = new Date(dataDate).getTime();
    if (Number.isNaN(target)) return null;
    let best: { idx: number; diff: number } | null = null;
    for (let i = 0; i < data.length; i++) {
      const t = new Date(String(data[i][categoryField] ?? data[i].period_end ?? "")).getTime();
      if (Number.isNaN(t)) continue;
      const diff = Math.abs(t - target);
      if (!best || diff < best.diff) best = { idx: i, diff };
    }
    return best ? best.idx : null;
  }, [data, dataDate, categoryField]);

  const anchor = dataDateIdx ?? data.length - 1;
  const defaultWindow = {
    start: Math.max(0, anchor - (defaultBefore ?? 12)),
    end: Math.min(data.length - 1, anchor + (defaultAfter ?? 4)),
  };
  const clampWindow = (w: { start: number; end: number }) => {
    let { start, end } = w;
    if (dataDateIdx != null) {
      if (maxBefore != null) start = Math.max(start, dataDateIdx - maxBefore);
      if (maxAfter != null) end = Math.min(end, dataDateIdx + maxAfter);
    }
    end = Math.max(start, end);
    return { start, end };
  };
  const active = data.length > 6 && (dataDateIdx != null || data.length > 16) ? (range ?? defaultWindow) : null;
  const view = useMemo(
    () => (active ? data.slice(active.start, active.end + 1) : data),
    [data, active],
  );

  const { yMax, yMin, bands, yZero } = useMemo(() => {
    let max = 0;
    let minMag = 0;
    for (const d of view)
      for (const s of series) {
        const v = typeof d[s.value_field] === "number" ? (d[s.value_field] as number) : 0;
        if (v > max) max = v;
        if (v < 0 && -v > minMag) minMag = -v;
      }
    const yMax = max > 0 ? niceMax(max * 1.08) : 1;
    const yMin = minMag > 0 ? -niceMax(minMag * 1.08) : 0;
    const plotH = H - M.top - M.bottom;
    const yZero = M.top + (yMax / (yMax - yMin)) * plotH;
    const bandW = (W - M.left - M.right) / Math.max(1, view.length);
    const bands = view.map((d, i) => {
      const x0 = M.left + i * bandW;
      const label = String(d[categoryLabelField ?? categoryField] ?? "");
      const bars = series.map((s, si) => {
        const v = typeof d[s.value_field] === "number" ? (d[s.value_field] as number) : 0;
        const h = Math.abs((Math.abs(v) / (yMax - yMin)) * plotH);
        const top = v >= 0 ? yZero - h : yZero;
        const w = (bandW * 0.7) / series.length;
        const opacity = emphasizedField ? (s.value_field === emphasizedField ? 1 : 0.35) : 1;
        return {
          x: x0 + bandW * 0.15 + si * w,
          y: top,
          w: w - 2,
          h,
          color: semanticColor(theme, s.semantic_series ?? s.color_token),
          name: s.name,
          value: v,
          opacity,
        };
      });
      return { x0, bandW, label, bars, raw: d, weekNum: typeof d.week_num === "number" ? d.week_num : null };
    });
    return { yMax, yMin, bands, yZero };
  }, [view, series, categoryField, categoryLabelField, H, W, theme, emphasizedField, M.top, M.bottom, M.left, M.right]);

  const gridlines = 4;
  const plotH = H - M.top - M.bottom;

  return (
    <div className="relative min-w-0" ref={inViewRef}>
      <div className="relative min-w-0" ref={ref}>
      <Legend
        theme={theme}
        items={series.map((s) => ({
          name: s.name,
          color: semanticColor(theme, s.semantic_series ?? s.color_token),
          opacity: emphasizedField ? (s.value_field === emphasizedField ? 1 : 0.35) : 1,
        }))}
      />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" style={{ height }}>
        {Array.from({ length: gridlines + 1 }, (_, i) => {
          const y = M.top + (i / gridlines) * plotH;
          const val = yMax - (i / gridlines) * (yMax - yMin);
          return (
            <g key={i}>
              <line x1={M.left} x2={W - M.right} y1={y} y2={y} stroke={theme.colors.chart_gridline ?? "#ECEAF6"} strokeWidth="1" />
              <text x={M.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill={theme.colors.chart_axis_label ?? theme.colors.muted_text}>
                {val.toFixed(0)}
              </text>
            </g>
          );
        })}
        <line x1={M.left} x2={W - M.right} y1={yZero} y2={yZero} stroke={theme.colors.border_strong ?? theme.colors.chart_axis_label ?? "#8A8C98"} strokeWidth="1.25" />
        {bands.map((b, bi) => (
          <g key={bi}>
            {b.bars.map((bar, si) => (
              <g key={si}>
                <rect
                  x={bar.x}
                  y={bar.y}
                  width={Math.max(1, bar.w)}
                  height={Math.max(bar.value !== 0 ? 1.5 : 0, bar.h)}
                  fill={bar.color}
                  fillOpacity={bar.opacity}
                  rx={2}
                  className={inView ? "chart-bar-enter" : undefined}
                  style={{ opacity: inView ? undefined : 0, animationDelay: `${bi * 0.04}s` }}
                />
                {showValueLabels && bar.value !== 0 && (
                  <text
                    x={bar.x + bar.w / 2}
                    y={bar.value >= 0 ? bar.y - 3 : bar.y + bar.h + 8}
                    textAnchor="middle"
                    fontSize={valueLabelSize}
                    fontWeight={600}
                    fill={bar.color}
                    fillOpacity={bar.opacity}
                  >
                    {fmtBarValue(bar.value, wholeNumbers)}
                  </text>
                )}
              </g>
            ))}
            <text
              x={b.x0 + b.bandW / 2}
              y={verticalLabels ? H - M.bottom + 10 : H - (showWeekNumbers ? 20 : 6)}
              textAnchor={verticalLabels ? "end" : "middle"}
              fontSize="9"
              transform={verticalLabels ? `rotate(-90 ${b.x0 + b.bandW / 2} ${H - M.bottom + 10})` : undefined}
              fill={theme.colors.chart_axis_label ?? theme.colors.muted_text}
            >
              {verticalLabels
                ? b.label.length > 12
                  ? `${b.label.slice(0, 12)}…`
                  : b.label
                : b.label.length > 8
                  ? b.label.slice(0, 8)
                  : b.label}
            </text>
            {showWeekNumbers && b.weekNum != null && (
              <text x={b.x0 + b.bandW / 2} y={verticalLabels ? H - 2 : H - 8} textAnchor="middle" fontSize="8" fontWeight={600} fill={theme.colors.chart_axis_label ?? theme.colors.muted_text}>
                {`W${b.weekNum}`}
              </text>
            )}
            <rect
              x={b.x0}
              y={M.top}
              width={b.bandW}
              height={plotH}
              fill="transparent"
              onMouseEnter={() =>
                setHover({
                  x: b.x0 + b.bandW / 2,
                  y: M.top + 10,
                  lines: [b.label, ...b.bars.map((bar) => `${bar.name}: ${wholeNumbers ? String(Math.round(bar.value)) : bar.value.toFixed(2)}`)],
                })
              }
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
      </svg>
      {hover && <Tooltip theme={theme} x={hover.x} y={hover.y} lines={hover.lines} visible />}
      {valueAxisLabel && (
        <p className="mt-1 text-[10px]" style={{ color: theme.colors.muted_text }}>
          {valueAxisLabel}
        </p>
      )}
      {active && (
        <RangeSlider
          theme={theme}
          total={data.length}
          window={active}
          onChange={(w) => setRange(clampWindow(w))}
          labelFor={(i) => {
            const d = data[i];
            return String(d?.[categoryLabelField ?? categoryField] ?? d?.period_end ?? `#${i + 1}`);
          }}
        />
      )}
      </div>
    </div>
  );
}

export function StackedBarChart({
  theme,
  data,
  series,
  categoryField,
  categoryLabelField,
  height = 220,
  horizontal = false,
  wholeNumbers = false,
  verticalLabels = false,
}: {
  theme: ThemeTokens;
  data: ChartDatum[];
  series: ChartSeries[];
  categoryField: string;
  categoryLabelField?: string;
  height?: number;
  horizontal?: boolean;
  wholeNumbers?: boolean;
  verticalLabels?: boolean;
}) {
  const { ref: inViewRef, inView } = useInView<HTMLDivElement>();
  const ordered = [...series].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  const rows = data.map((d) => {
    const parts = ordered.map((s) => {
      const v = typeof d[s.value_field] === "number" ? (d[s.value_field] as number) : 0;
      return { name: s.name, v, color: semanticColor(theme, s.semantic_series ?? s.color_token) };
    });
    const total = parts.reduce((a, p) => a + p.v, 0);
    return { label: String(d[categoryLabelField ?? categoryField] ?? ""), parts, total, raw: d };
  });
  const max = niceMax(Math.max(...rows.map((r) => r.total), 1));

  if (horizontal) {
    return (
      <div className="flex flex-col gap-2.5" ref={inViewRef}>
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-[11px]" style={{ color: theme.colors.text_secondary }} title={r.label}>
              {r.label}
            </span>
            <div className="flex-1 h-5 rounded overflow-hidden flex" style={{ background: theme.colors.empty_data_bg ?? "#F4F3F8" }}>
              {r.parts.map((p, pi) => (
                <div
                  key={pi}
                  style={{
                    width: `${(p.v / max) * 100}%`,
                    background: p.color,
                    transformOrigin: "left",
                    transition: `transform 0.7s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.04}s`,
                    transform: inView ? "scaleX(1)" : "scaleX(0)",
                  }}
                  title={`${p.name}: ${fmtBarValue(p.v, wholeNumbers)}`}
                />
              ))}
            </div>
            <span className="w-10 text-right text-[11px] tabular-nums" style={{ color: theme.colors.text_primary }}>
              {fmtBarValue(r.total, wholeNumbers)}
            </span>
          </div>
        ))}
        <Legend theme={theme} items={ordered.map((s) => ({ name: s.name, color: semanticColor(theme, s.semantic_series ?? s.color_token) }))} />
      </div>
    );
  }

  const W = 640;
  const H = height;
  const M = { top: 12, right: 12, bottom: verticalLabels ? 92 : 24, left: 40 };
  const bandW = (W - M.left - M.right) / Math.max(1, rows.length);

  return (
    <div ref={inViewRef}>
      <Legend theme={theme} items={ordered.map((s) => ({ name: s.name, color: semanticColor(theme, s.semantic_series ?? s.color_token) }))} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        {rows.map((r, i) => {
          let acc = 0;
          const x0 = M.left + i * bandW;
          return (
            <g key={i}>
              {r.parts.map((p, pi) => {
                const h = (p.v / max) * (H - M.top - M.bottom);
                const y = H - M.bottom - acc - h;
                acc += h;
                return (
                  <rect
                    key={pi}
                    x={x0 + bandW * 0.2}
                    y={y}
                    width={bandW * 0.6}
                    height={h}
                    fill={p.color}
                    rx={2}
                    className={inView ? "chart-bar-enter" : undefined}
                    style={{ opacity: inView ? undefined : 0, animationDelay: `${i * 0.05}s` }}
                  />
                );
              })}
              <text
                x={x0 + bandW / 2}
                y={verticalLabels ? H - M.bottom + 10 : H - 6}
                textAnchor={verticalLabels ? "end" : "middle"}
                fontSize="9"
                transform={verticalLabels ? `rotate(-90 ${x0 + bandW / 2} ${H - M.bottom + 10})` : undefined}
                fill={theme.colors.chart_axis_label ?? theme.colors.muted_text}
              >
                {verticalLabels
                  ? r.label.length > 12
                    ? `${r.label.slice(0, 12)}…`
                    : r.label
                  : r.label.length > 8
                    ? r.label.slice(0, 8)
                    : r.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function ResourceComparisonBarChart({
  theme,
  data,
  height = 32,
}: {
  theme: ThemeTokens;
  data: ChartDatum[];
  height?: number;
}) {
  const { ref: inViewRef, inView } = useInView<HTMLDivElement>();
  const rows = data
    .map((row) => {
      const planned = typeof row.planned_manpower === "number" ? row.planned_manpower : 0;
      const actual = typeof row.actual_manpower === "number" ? row.actual_manpower : 0;
      return {
        label: String(row.resource_name ?? ""),
        planned,
        actual,
        total: planned + actual,
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
  const maxTotal = Math.max(...rows.map((row) => row.total), 1);
  const plannedColor = semanticColor(theme, "planned");
  const actualColor = semanticColor(theme, "actual");

  return (
    <div ref={inViewRef} className="min-w-0">
      <Legend
        theme={theme}
        items={[
          { name: "Planned Manpower", color: plannedColor },
          { name: "Actual Manpower", color: actualColor },
        ]}
      />
      <div className="flex flex-col gap-2.5">
        {rows.map((row, index) => (
          <div
            key={row.label}
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[11rem_minmax(10rem,1fr)_8.5rem]"
          >
            <span
              className="col-span-2 min-w-0 truncate text-[13px] leading-5 sm:col-span-1"
              style={{ color: theme.colors.text_secondary }}
              title={row.label}
            >
              {row.label}
            </span>
            <div
              className="flex w-full min-w-0 overflow-hidden rounded-md"
              style={{ height, background: theme.colors.empty_data_bg ?? "#F4F3F8" }}
              role="img"
              aria-label={`${row.label}: planned ${row.planned.toFixed(3)}, actual ${row.actual.toFixed(3)}`}
            >
              <div
                className="bolt-resource-bar h-full shrink-0 transition-[width] duration-700 ease-out"
                style={{
                  width: `${(row.planned / maxTotal) * 100}%`,
                  background: plannedColor,
                  opacity: inView ? 1 : 0,
                  transitionDelay: `${index * 35}ms`,
                }}
              />
              <div
                className="bolt-resource-bar h-full shrink-0 transition-[width] duration-700 ease-out"
                style={{
                  width: `${(row.actual / maxTotal) * 100}%`,
                  background: actualColor,
                  opacity: inView ? 1 : 0,
                  transitionDelay: `${index * 35 + 70}ms`,
                }}
              />
            </div>
            <span className="flex shrink-0 items-center justify-end gap-2.5 text-[13px] tabular-nums">
              <span className="inline-flex items-center gap-1" style={{ color: plannedColor }}>
                <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: plannedColor }} />
                {row.planned.toFixed(1)}
              </span>
              <span className="inline-flex items-center gap-1" style={{ color: actualColor }}>
                <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: actualColor }} />
                {row.actual.toFixed(1)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DonutChart({
  theme,
  data,
  categoryField,
  valueField,
  centerMetric,
  height = 150,
}: {
  theme: ThemeTokens;
  data: ChartDatum[];
  categoryField: string;
  valueField: string;
  centerMetric?: { label: string; value: number | string } | null;
  height?: number;
}) {
  const total = data.reduce((a, d) => a + (typeof d[valueField] === "number" ? (d[valueField] as number) : 0), 0);
  const palette = [
    theme.colors.semantic_on_track ?? theme.colors.success,
    theme.colors.semantic_overdue ?? theme.colors.critical,
    theme.colors.semantic_warning ?? theme.colors.warning,
    theme.colors.semantic_planned ?? theme.colors.primary,
    theme.colors.chart_neutral,
    theme.colors.scenario_alt_1 ?? theme.colors.primary_light ?? theme.colors.mint,
    theme.colors.scenario_alt_2 ?? theme.colors.chart_highlight ?? theme.colors.muted_text,
    theme.colors.scenario_alt_3 ?? theme.colors.border_strong,
  ];

  let acc = 0;
  const R = 60;
  const C = 2 * Math.PI * R;
  const arcs = data.map((d, i) => {
    const v = typeof d[valueField] === "number" ? (d[valueField] as number) : 0;
    const frac = total > 0 ? v / total : 0;
    const arc = {
      color: palette[i % palette.length],
      dash: `${frac * C} ${C - frac * C}`,
      offset: -acc * C,
      label: String(d[categoryField] ?? ""),
      value: v,
      frac,
    };
    acc += frac;
    return arc;
  });

  return (
    <div className="flex items-center gap-5 flex-wrap" style={{ minHeight: height }}>
      <svg viewBox="0 0 160 160" style={{ width: height, height }} className="shrink-0">
        <g transform="rotate(-90 80 80)">
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth="20"
              strokeDasharray={a.dash}
              strokeDashoffset={a.offset}
            />
          ))}
        </g>
        {centerMetric && (
          <>
            <text x="80" y="76" textAnchor="middle" fontSize="18" fontWeight="700" fill={theme.colors.text_primary}>
              {typeof centerMetric.value === "number" ? centerMetric.value.toLocaleString() : centerMetric.value}
            </text>
            <text x="80" y="94" textAnchor="middle" fontSize="9" fill={theme.colors.muted_text}>
              {centerMetric.label}
            </text>
          </>
        )}
      </svg>
      <div className="flex flex-col gap-1.5 min-w-[120px]">
        {arcs.map((a, i) => (
          <span key={i} className="inline-flex items-center gap-2 text-[12px]" style={{ color: theme.colors.text_secondary }}>
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: a.color }} />
            <span className="truncate">{a.label}</span>
            <span className="tabular-nums font-medium" style={{ color: theme.colors.text_primary }}>
              {a.value.toLocaleString()}
            </span>
            <span className="tabular-nums text-[11px]">{(a.frac * 100).toFixed(0)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// WGT-022/023/024 — a full gray circle stands for all transmittals; the
// category arcs (A/B/C/D/UR) stack over it, so the remaining gray is the
// not-yet-submitted share. B and D colors are swapped per spec.
export function TransmittalDonutChart({
  theme,
  data,
  categoryField,
  valueField,
  centerMetric,
  plannedCount,
  height = 280,
}: {
  theme: ThemeTokens;
  data: ChartDatum[];
  categoryField: string;
  valueField: string;
  centerMetric?: { label: string; value: number | string } | null;
  /** Planned (to date) transmittals drawn as the inner purple ring. */
  plannedCount?: number | null;
  height?: number;
}) {
  const submitted = data.reduce((a, d) => a + (typeof d[valueField] === "number" ? (d[valueField] as number) : 0), 0);
  const totalTransmittals = typeof centerMetric?.value === "number" ? centerMetric.value : submitted;

  // Outer base ring: the full transmittal total, semi-transparent gray.
  const baseRing = "rgba(120, 122, 138, 0.22)";
  // Inner approved ring: single light transparent purple.
  const innerRing = theme.colors.planned ?? "#5741DF";
  // Status A reads orange, B green; C/D/UR keep their semantic palette.
  const statusColor = (label: string): string => {
    const semantic: Record<string, string> = {
      A: "#E07B39",
      B: theme.colors.success ?? "#359D78",
      C: theme.colors.semantic_warning ?? theme.colors.warning ?? "#D99A39",
      D: theme.colors.semantic_overdue ?? theme.colors.critical ?? "#DB694F",
      UR: theme.colors.semantic_neutral ?? theme.colors.chart_neutral ?? "#8A8C98",
    };
    const key = label.trim().toUpperCase();
    return semantic[key] ?? semanticColor(theme, undefined);
  };
  const cats = data.map((d) => ({
    label: String(d[categoryField] ?? ""),
    value: typeof d[valueField] === "number" ? (d[valueField] as number) : 0,
    color: statusColor(String(d[categoryField] ?? "")),
  }));

  const R = 70;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = cats.map((cat) => {
    const frac = totalTransmittals > 0 ? cat.value / totalTransmittals : 0;
    const arc = { ...cat, frac, dash: `${frac * C} ${C - frac * C}`, offset: -acc * C };
    acc += frac;
    return arc;
  });

  // Inner ring: planned (to date) as a single partial ring; the incomplete
  // part stays empty (no track underneath).
  const rInner = 50;
  const cInner = 2 * Math.PI * rInner;
  const plannedFrac =
    plannedCount != null && totalTransmittals > 0
      ? Math.max(0, Math.min(1, plannedCount / totalTransmittals))
      : null;
  const plannedDash =
    plannedFrac != null && plannedFrac > 0
      ? `${plannedFrac * cInner} ${cInner - plannedFrac * cInner}`
      : undefined;

  return (
    <div className="flex items-center gap-5 flex-wrap" style={{ minHeight: height }}>
      <svg
        viewBox="0 0 160 160"
        style={{ width: "100%", maxWidth: height, height: "auto" }}
        className="shrink-0"
      >
        <circle cx="80" cy="80" r={R} fill="none" stroke={baseRing} strokeWidth="16" />
        <g transform="rotate(-90 80 80)">
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth="16"
              strokeDasharray={a.dash}
              strokeDashoffset={a.offset}
            />
          ))}
        </g>
        {plannedDash != null && (
          <g transform="rotate(-90 80 80)">
            <circle
              cx="80"
              cy="80"
              r={rInner}
              fill="none"
              stroke={innerRing}
              strokeWidth="10"
              strokeOpacity={0.35}
              strokeDasharray={plannedDash}
            />
          </g>
        )}
        {centerMetric && (
          <>
            <text x="80" y="76" textAnchor="middle" fontSize="18" fontWeight="700" fill={theme.colors.muted_text}>
              {typeof centerMetric.value === "number" ? centerMetric.value.toLocaleString() : centerMetric.value}
            </text>
            <text x="80" y="94" textAnchor="middle" fontSize="9" fill={theme.colors.muted_text}>
              {centerMetric.label}
            </text>
          </>
        )}
      </svg>
      <div className="flex flex-col gap-1.5 min-w-[130px] flex-1">
        {arcs.map((a, i) => (
          <span key={i} className="inline-flex items-center gap-2 text-[12px]" style={{ color: theme.colors.text_secondary }}>
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: a.color }} />
            <span className="truncate">{a.label}</span>
            <span className="tabular-nums font-medium" style={{ color: theme.colors.text_primary }}>
              {a.value.toLocaleString()}
            </span>
            <span className="tabular-nums text-[11px]">{(a.frac * 100).toFixed(0)}%</span>
          </span>
        ))}
        {plannedCount != null && plannedFrac != null && (
          <span className="inline-flex items-center gap-2 text-[12px]" style={{ color: theme.colors.text_secondary }}>
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: innerRing, opacity: 0.35 }} />
            <span className="truncate">Planned (to date)</span>
            <span className="tabular-nums font-medium" style={{ color: theme.colors.text_primary }}>
              {plannedCount.toLocaleString()}
            </span>
            <span className="tabular-nums text-[11px]">{((plannedFrac ?? 0) * 100).toFixed(0)}%</span>
          </span>
        )}
        {(() => {
          const notSubmitted = Math.max(0, totalTransmittals - submitted);
          if (notSubmitted <= 0) return null;
          return (
            <span className="inline-flex items-center gap-2 text-[12px]" style={{ color: theme.colors.text_secondary }}>
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: baseRing }} />
              <span className="truncate">Not submitted</span>
              <span className="tabular-nums font-medium" style={{ color: theme.colors.text_primary }}>
                {notSubmitted.toLocaleString()}
              </span>
            </span>
          );
        })()}
      </div>
    </div>
  );
}

export function ProgressBar({
  theme,
  value,
  max = 100,
  color,
  trackColor,
  height = 8,
  label,
}: {
  theme: ThemeTokens;
  value: number;
  max?: number;
  color: string;
  trackColor?: string;
  height?: number;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div>
      {label && (
        <p className="text-[11px] mb-1" style={{ color: theme.colors.text_secondary }}>
          {label}
        </p>
      )}
      <div
        className="w-full overflow-hidden"
        style={{ height, background: trackColor ?? theme.colors.empty_data_bg ?? "#F4F3F8", borderRadius: radius(theme, "radius_pill") }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: radius(theme, "radius_pill") }} />
      </div>
    </div>
  );
}
