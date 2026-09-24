"use client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { money, num, pct } from "@/lib/format";

export type Fmt = "currency" | "percent" | "number" | "hours" | "fte" | "months" | "minutes" | "raw";

export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)"];
// Hex fallbacks for SVG attributes that do not resolve CSS vars in all browsers.
export const SERIES_HEX = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
export const VS = { forecast: "#9ec5f4", target: "#eda100", actual: "#2a78d6", validated: "#1baf7a", realized: "#008300", sustained: "#0d366b" };
const GRID = "#e1e0d9";
const AXIS = "#898781";

export function formatValue(v: number, f: Fmt): string {
  switch (f) {
    case "currency":
      return money(v);
    case "percent":
      return pct(v, Math.abs(v) < 0.1 ? 1 : 0);
    case "hours":
      return `${num(v)} h`;
    case "fte":
      return `${num(v, 1)} FTE`;
    case "months":
      return `${num(v, 1)} mo`;
    case "minutes":
      return `${num(v, 1)} min`;
    case "raw":
      return String(v);
    default:
      return num(v, 1);
  }
}

const tick = { fontSize: 11, fill: AXIS };

function TooltipBox({ active, payload, label, fmt }: { active?: boolean; payload?: { name?: string; value?: number; color?: string; payload?: Record<string, unknown> }[]; label?: string; fmt: Fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md">
      {label !== undefined && <p className="mb-1 font-medium">{label}</p>}
      {payload
        .filter((p) => p.value !== undefined && p.name !== "__base")
        .map((p, i) => (
          <p key={i} className="flex items-center gap-2 tabular">
            <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="ml-auto font-medium">{formatValue(Number(p.value), fmt)}</span>
          </p>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Waterfall
// ---------------------------------------------------------------------------
export interface WaterfallStep {
  label: string;
  value: number;
  kind: "total" | "delta";
  color?: string;
}

export function WaterfallChart({ steps, height = 280, fmt = "currency" }: { steps: WaterfallStep[]; height?: number; fmt?: Fmt }) {
  let running = 0;
  const maxAbs = Math.max(1, ...steps.map((s) => Math.abs(s.value)));
  const data = steps.map((s) => {
    if (s.kind === "total") {
      running = s.value;
      return { label: s.label, __base: Math.min(0, s.value), bar: Math.abs(s.value), raw: s.value, lbl: formatValue(s.value, fmt), color: s.color ?? VS.actual };
    }
    const start = running;
    running += s.value;
    return {
      label: s.label,
      __base: Math.min(start, running),
      bar: Math.abs(s.value),
      raw: s.value,
      lbl: Math.abs(s.value) / maxAbs > 0.1 ? formatValue(s.value, fmt) : "",
      color: s.color ?? (s.value >= 0 ? "#0ca30c" : "#d03b3b"),
    };
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 18, right: 8, bottom: 4, left: 4 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={{ ...tick, fontSize: 10 }} interval={0} tickLine={false} axisLine={{ stroke: "#c3c2b7" }} height={54} angle={-20} textAnchor="end" />
        <YAxis tick={tick} tickFormatter={(v) => formatValue(v, fmt)} width={64} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: "rgba(0,0,0,0.03)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md">
                <p className="font-medium">{label}</p>
                <p className="tabular">{formatValue(Number(payload[0].payload.raw), fmt)}</p>
              </div>
            ) : null
          }
        />
        <ReferenceLine y={0} stroke="#c3c2b7" />
        <Bar dataKey="__base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="bar" stackId="w" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
          <LabelList dataKey="lbl" position="top" style={{ fontSize: 10, fill: "#52514e" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------
export interface SeriesDef {
  key: string;
  label: string;
  color?: string;
  dashed?: boolean;
}

export function BarsChart({
  data,
  xKey,
  series,
  height = 260,
  fmt = "currency",
  layout = "vertical-bars",
  stacked = false,
  colorBy,
  showLegend,
  labels,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  series: SeriesDef[];
  height?: number;
  fmt?: Fmt;
  layout?: "vertical-bars" | "horizontal-bars";
  stacked?: boolean;
  colorBy?: string; // data key holding a colour per row (single-series)
  showLegend?: boolean;
  labels?: boolean;
}) {
  const horizontal = layout === "horizontal-bars";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: labels ? 48 : 8, bottom: 4, left: 4 }} barCategoryGap="22%">
        <CartesianGrid horizontal={!horizontal} vertical={horizontal} stroke={GRID} />
        {/* Recharts does not traverse fragments — axes must be direct children. */}
        {horizontal ? (
          <XAxis type="number" tick={tick} tickFormatter={(v) => formatValue(v, fmt)} axisLine={false} tickLine={false} />
        ) : (
          <XAxis
            dataKey={xKey}
            tick={{ ...tick, fontSize: data.length > 5 ? 10 : 11 }}
            tickLine={false}
            axisLine={{ stroke: "#c3c2b7" }}
            interval={0}
            angle={data.length > 5 ? -30 : 0}
            textAnchor={data.length > 5 ? "end" : "middle"}
            height={data.length > 5 ? 60 : 30}
          />
        )}
        {horizontal ? (
          <YAxis type="category" dataKey={xKey} tick={{ ...tick, fill: "#52514e" }} width={150} axisLine={false} tickLine={false} />
        ) : (
          <YAxis tick={tick} tickFormatter={(v) => formatValue(v, fmt)} width={64} axisLine={false} tickLine={false} />
        )}
        <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} content={(p) => <TooltipBox {...(p as object)} fmt={fmt} />} />
        {(showLegend ?? series.length > 1) && <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" iconSize={8} />}
        <ReferenceLine {...(horizontal ? { x: 0 } : { y: 0 })} stroke="#c3c2b7" />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color ?? SERIES_HEX[i % 8]}
            stackId={stacked ? "s" : undefined}
            radius={stacked ? 0 : horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}
            maxBarSize={horizontal ? 18 : 42}
            isAnimationActive={false}
            stroke="#ffffff"
            strokeWidth={stacked ? 1 : 0}
          >
            {colorBy && data.map((d, k) => <Cell key={k} fill={(d[colorBy] as string) ?? s.color ?? SERIES_HEX[0]} />)}
            {labels && <LabelList dataKey={s.key} position={horizontal ? "right" : "top"} formatter={(v: number) => formatValue(v, fmt)} style={{ fontSize: 10, fill: "#52514e" }} />}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Trend (single y-axis — two measures of different scale go in two charts)
// ---------------------------------------------------------------------------
export function TrendChart({
  data,
  xKey,
  series,
  height = 240,
  fmt = "currency",
  area = false,
  bars,
  refX,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  series: SeriesDef[];
  height?: number;
  fmt?: Fmt;
  area?: boolean;
  bars?: SeriesDef[];
  refX?: { x: string; label: string };
}) {
  const Chart = bars?.length ? ComposedChart : area ? AreaChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} tick={tick} tickLine={false} axisLine={{ stroke: "#c3c2b7" }} minTickGap={16} />
        <YAxis tick={tick} tickFormatter={(v) => formatValue(v, fmt)} width={64} axisLine={false} tickLine={false} />
        <Tooltip content={(p) => <TooltipBox {...(p as object)} fmt={fmt} />} cursor={{ stroke: "#c3c2b7", strokeWidth: 1 }} />
        {(series.length + (bars?.length ?? 0)) > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" iconSize={12} />}
        {refX && <ReferenceLine x={refX.x} stroke="#898781" strokeDasharray="3 3" label={{ value: refX.label, fontSize: 10, fill: "#52514e", position: "insideTopLeft" }} />}
        {bars?.map((b, i) => <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color ?? SERIES_HEX[(i + 3) % 8]} maxBarSize={22} radius={[2, 2, 0, 0]} isAnimationActive={false} />)}
        {series.map((s, i) =>
          area && !bars?.length ? (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? SERIES_HEX[i % 8]}
              fill={s.color ?? SERIES_HEX[i % 8]}
              fillOpacity={0.12}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              dot={false}
              isAnimationActive={false}
            />
          ) : (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? SERIES_HEX[i % 8]}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls
            />
          ),
        )}
      </Chart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Bubble heatmap — complexity (x) vs value (y), bubble = investment
// ---------------------------------------------------------------------------
export interface BubblePoint {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  group: string;
  color: string;
  href?: string;
  meta?: string;
}

export function BubbleChart({
  points,
  height = 380,
  xLabel,
  yLabel,
  yFmt = "currency",
  groups,
}: {
  points: BubblePoint[];
  height?: number;
  xLabel: string;
  yLabel: string;
  yFmt?: Fmt;
  groups: { key: string; color: string }[];
}) {
  const midY = points.length ? [...points].sort((a, b) => a.y - b.y)[Math.floor(points.length / 2)].y : 0;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 16, right: 20, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" dataKey="x" name={xLabel} domain={[0.5, 5.5]} ticks={[1, 2, 3, 4, 5]} tick={tick} label={{ value: xLabel, position: "insideBottom", offset: -12, fontSize: 11, fill: "#52514e" }} />
        <YAxis type="number" dataKey="y" name={yLabel} tick={tick} tickFormatter={(v) => formatValue(v, yFmt)} width={70} label={{ value: yLabel, angle: -90, position: "insideLeft", fontSize: 11, fill: "#52514e", dy: 60 }} />
        <ZAxis type="number" dataKey="z" range={[60, 900]} />
        <ReferenceLine x={3} stroke="#c3c2b7" strokeDasharray="4 4" />
        <ReferenceLine y={midY} stroke="#c3c2b7" strokeDasharray="4 4" />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as BubblePoint;
            return (
              <div className="max-w-[240px] rounded-md border bg-card px-3 py-2 text-xs shadow-md">
                <p className="font-medium">{p.name}</p>
                <p className="text-muted-foreground">{p.group}</p>
                <p className="tabular">Value: {formatValue(p.y, yFmt)}</p>
                <p className="tabular">Investment: {money(p.z)}</p>
                <p className="tabular">Complexity: {p.x.toFixed(1)}</p>
                {p.meta && <p className="text-muted-foreground">{p.meta}</p>}
              </div>
            );
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} iconType="circle" iconSize={8} verticalAlign="bottom" />
        {groups.map((g) => (
          <Scatter
            key={g.key}
            name={g.key}
            data={points.filter((p) => p.group === g.key)}
            fill={g.color}
            fillOpacity={0.75}
            stroke="#ffffff"
            strokeWidth={2}
            isAnimationActive={false}
            onClick={(d: unknown) => {
              const href = (d as { href?: string; payload?: { href?: string } })?.payload?.href ?? (d as { href?: string })?.href;
              if (href) window.location.href = href;
            }}
            cursor="pointer"
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Radar (maturity)
// ---------------------------------------------------------------------------
export function RadarView({ data, series, height = 320 }: { data: Record<string, unknown>[]; series: SeriesDef[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke={GRID} />
        <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10, fill: "#52514e" }} />
        <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={{ fontSize: 9, fill: AXIS }} angle={90} />
        {series.map((s, i) => (
          <Radar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stroke={s.color ?? SERIES_HEX[i]}
            fill={s.color ?? SERIES_HEX[i]}
            fillOpacity={s.dashed ? 0 : 0.18}
            strokeWidth={2}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            isAnimationActive={false}
          />
        ))}
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
        <Tooltip content={(p) => <TooltipBox {...(p as object)} fmt="number" />} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
