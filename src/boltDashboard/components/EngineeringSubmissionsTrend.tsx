import type { ThemeTokens } from "@/boltDashboard/theme/designTheme";
import { radius, shadow } from "@/boltDashboard/theme/designTheme";
import type { ChartDatum, ChartSeries } from "@/boltDashboard/components/charts";
import { useMeasuredWidth } from "@/boltDashboard/components/useMeasuredWidth";
import { useInView } from "@/boltDashboard/components/useInView";

type TrendDefinition = {
  key: string;
  label: string;
  color: string;
  aliases: string[];
};

type TrendPoint = {
  x: number;
  y: number;
  value: number;
};

const TREND_DEFINITIONS: TrendDefinition[] = [
  {
    key: "prequalifications",
    label: "Prequalifications",
    color: "#3B82F6",
    aliases: ["prequalification", "prequalifications", "prequal", "pre-qualification"],
  },
  {
    key: "shop_drawings",
    label: "Shop Drawings",
    color: "#FF5B52",
    aliases: ["shop drawing", "shop drawings", "shopdrawing", "shop_drawings"],
  },
  {
    key: "materials",
    label: "Materials",
    color: "#31C48D",
    aliases: ["material", "materials"],
  },
];

function normalize(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function matchesDefinition(value: unknown, definition: TrendDefinition): boolean {
  const normalized = normalize(value);
  return definition.aliases.some((alias) => normalized.includes(normalize(alias)));
}

function formatValue(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function smoothPath(points: TrendPoint[]): string {
  if (points.length < 2) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const previous = points[i - 1] ?? points[i];
    const current = points[i];
    const next = points[i + 1];
    const following = points[i + 2] ?? next;
    const tension = 0.2;
    const firstControlX = current.x + (next.x - previous.x) * tension;
    const firstControlY = current.y + (next.y - previous.y) * tension;
    const secondControlX = next.x - (following.x - current.x) * tension;
    const secondControlY = next.y - (following.y - current.y) * tension;
    path += ` C ${firstControlX} ${firstControlY}, ${secondControlX} ${secondControlY}, ${next.x} ${next.y}`;
  }
  return path;
}

function seriesForDefinition(data: ChartDatum[], series: ChartSeries[], definition: TrendDefinition, categoryField: string): ChartSeries | null {
  const configured = series.find((item) => matchesDefinition(`${item.name} ${item.value_field}`, definition));
  if (configured) return configured;

  const candidate = Object.keys(data[0] ?? {}).find(
    (field) => field !== categoryField && matchesDefinition(field, definition) && data.some((row) => typeof row[field] === "number"),
  );
  return candidate ? { name: definition.label, value_field: candidate } : null;
}

function TrendCard({ theme, data, categoryField, definition, series }: { theme: ThemeTokens; data: ChartDatum[]; categoryField: string; definition: TrendDefinition; series: ChartSeries | null }) {
  const { ref, width: measured } = useMeasuredWidth<HTMLElement>(300);
  const { ref: inViewRef, inView } = useInView<HTMLElement>();
  const W = Math.max(280, Math.round(measured));
  const values = data
    .map((row, index) => ({ row, index, value: series ? row[series.value_field] : null }))
    .filter((point): point is { row: ChartDatum; index: number; value: number } => typeof point.value === "number" && Number.isFinite(point.value));
  const latest = values[values.length - 1]?.value ?? null;
  const rawValues = values.map((point) => point.value);
  const rawMin = rawValues.length ? Math.min(...rawValues) : 0;
  const rawMax = rawValues.length ? Math.max(...rawValues) : 1;
  // WGT-026: pad the scale 10% of the data range beyond the extremes;
  // the lower limit never dips below zero.
  const rawRange = rawMax - rawMin;
  const pad = rawRange > 0 ? rawRange * 0.1 : Math.abs(rawMax) * 0.1 || 1;
  const yMin = Math.max(0, rawMin - pad);
  const yMax = rawMax + pad;
  const H = 164;
  const M = { top: 34, right: 18, bottom: 22, left: 42 };
  const plotWidth = W - M.left - M.right;
  const plotHeight = H - M.top - M.bottom;
  const points = values.map((point, index) => ({
    x: M.left + (index / Math.max(1, values.length - 1)) * plotWidth,
    y: M.top + (1 - (point.value - yMin) / Math.max(1, yMax - yMin)) * plotHeight,
    value: point.value,
  }));
  const path = smoothPath(points);
  const gradientId = `${definition.key}-gradient`;
  const xLabels = values.map((point, plotIndex) => ({ ...point, plotIndex })).filter((_, index) => index === 0 || index === values.length - 1 || index % Math.max(1, Math.ceil(values.length / 5)) === 0);

  return (
    <article
      ref={(el) => {
        ref.current = el;
        inViewRef.current = el;
      }}
      className="min-w-0 overflow-hidden p-4"
      style={{ background: "#FFFFFF", border: "1px solid #DDE3EA", borderRadius: radius(theme, "kpi_card"), boxShadow: shadow(theme, "shadow_card") }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-[15px] font-semibold leading-5" style={{ color: "#172033" }}>
            {definition.label}
          </h4>
          <p className="mt-1 text-[11px] leading-4" style={{ color: "#667085" }}>
            Weekly submissions
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[24px] font-semibold leading-7 tabular-nums" style={{ color: "#172033" }}>
            {latest == null ? "—" : formatValue(latest)}
          </p>
          <p className="mt-1 text-[11px] leading-4" style={{ color: definition.color }}>
            This week
          </p>
        </div>
      </div>

      <div className="mt-3">
        {series && values.length > 1 ? (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" style={{ height: 164 }} role="img" aria-label={`${definition.label} weekly submission trend`}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={definition.color} stopOpacity="0.26" />
                <stop offset="100%" stopColor={definition.color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 0.5, 1].map((ratio) => {
              const y = M.top + ratio * plotHeight;
              const value = yMax - ratio * (yMax - yMin);
              return (
                <g key={ratio}>
                  <line x1={M.left} x2={W - M.right} y1={y} y2={y} stroke="#E4E8EE" strokeWidth="1" />
                  <text x={M.left - 7} y={y + 3} textAnchor="end" fontSize="9" fill="#667085">
                    {formatValue(value)}
                  </text>
                </g>
              );
            })}
            <path
              d={`${path} L ${points[points.length - 1].x} ${H - M.bottom} L ${points[0].x} ${H - M.bottom} Z`}
              fill={`url(#${gradientId})`}
              className={inView ? "chart-fill-enter" : undefined}
              style={{ opacity: inView ? undefined : 0 }}
            />
            <path
              d={path}
              fill="none"
              stroke={definition.color}
              strokeWidth="2.5"
              strokeLinecap="round"
              pathLength={1}
              className={inView ? "chart-line-enter" : undefined}
              style={{ filter: `drop-shadow(0 2px 3px ${definition.color}66)`, opacity: inView ? undefined : 0 }}
            />
            {points.map((point) => (
              <g
                key={`${point.x}-${point.value}`}
                className={inView ? "chart-fill-enter" : undefined}
                style={{ opacity: inView ? undefined : 0 }}
              >
                <circle cx={point.x} cy={point.y} r={3} fill={definition.color} />
                <text x={point.x} y={Math.max(M.top - 5, point.y - 8)} textAnchor={point.x < 58 ? "start" : point.x > W - 58 ? "end" : "middle"} fontSize="10" fontWeight={600} fill="#172033">
                  {formatValue(point.value)}
                </text>
              </g>
            ))}
            {xLabels.map((point) => {
              const label = String(point.row[categoryField] ?? point.row.period_end ?? "");
              return (
                <text key={`label-${point.index}`} x={points[point.plotIndex].x} y={H - 5} textAnchor="middle" fontSize="9" fill="#667085">
                  {label.length > 10 ? label.slice(0, 10) : label}
                </text>
              );
            })}
          </svg>
        ) : (
          <div className="flex h-[164px] items-center justify-center text-[12px]" style={{ color: "#667085" }}>
            No weekly data available
          </div>
        )}
      </div>
    </article>
  );
}

export function EngineeringSubmissionsTrend({ theme, data, series, categoryField }: { theme: ThemeTokens; data: ChartDatum[]; series: ChartSeries[]; categoryField: string }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
      {TREND_DEFINITIONS.map((definition) => (
        <TrendCard
          key={definition.key}
          theme={theme}
          data={data}
          categoryField={categoryField}
          definition={definition}
          series={seriesForDefinition(data, series, definition, categoryField)}
        />
      ))}
    </div>
  );
}
