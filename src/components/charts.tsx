"use client";
// Recharts 래퍼 — 범주색 고정 순서(검증 팔레트), 단일 축, 얇은 마크, 툴팁 기본 제공
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney, fmtNum, quarterOf, type MoneyUnit } from "@/lib/format";
import { usePrefs, type PeriodMode } from "./providers";

export const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];
const AXIS = { fontSize: 11, fill: "#7b8899" };

export interface SeriesDef {
  key: string;
  label: string;
  color?: string;
  stack?: string;
  type?: "bar" | "line";
}

type ValueKind = "money" | "pct" | "count";

function fmtVal(v: number, kind: ValueKind, unit: MoneyUnit) {
  if (kind === "money") return fmtMoney(v, unit);
  if (kind === "pct") return `${fmtNum(v, 1)}%`;
  return fmtNum(v);
}
function fmtAxis(v: number, kind: ValueKind, unit: MoneyUnit) {
  if (kind === "money") return fmtMoney(v, unit, false);
  if (kind === "pct") return `${fmtNum(v, 0)}%`;
  return fmtNum(v);
}

/** 월간 데이터를 분기/누적으로 재집계 (flow=합산 항목, stock=기말값 항목) */
export function regroup<T extends Record<string, unknown>>(rows: T[], xKey: string, mode: PeriodMode, flowKeys: string[], stockKeys: string[] = []): T[] {
  if (mode === "month") return rows;
  if (mode === "quarter") {
    const m = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      const q = quarterOf(String(r[xKey]));
      const acc = m.get(q) ?? { [xKey]: q };
      for (const k of flowKeys) acc[k] = ((acc[k] as number) ?? 0) + ((r[k] as number) ?? 0);
      for (const k of stockKeys) acc[k] = r[k];
      m.set(q, acc);
    }
    return [...m.values()] as T[];
  }
  const run: Record<string, number> = {};
  return rows.map((r) => {
    const o: Record<string, unknown> = { ...r };
    for (const k of flowKeys) {
      run[k] = (run[k] ?? 0) + ((r[k] as number) ?? 0);
      o[k] = run[k];
    }
    return o as T;
  });
}

function ChartTooltip({ kind }: { kind: ValueKind }) {
  const { unit } = usePrefs();
  return (
    <Tooltip
      cursor={{ fill: "rgba(36,127,145,0.06)", stroke: "#c9d3dc" }}
      contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e2e6eb", boxShadow: "0 4px 12px rgba(0,0,0,.08)" }}
      formatter={(v) => fmtVal(Number(v), kind, unit)}
    />
  );
}

export function BarsChart({
  data,
  x,
  series,
  kind = "count",
  height = 260,
  horizontal = false,
  refLine,
}: {
  data: Record<string, unknown>[];
  x: string;
  series: SeriesDef[];
  kind?: ValueKind;
  height?: number;
  horizontal?: boolean;
  refLine?: { y: number; label: string };
}) {
  const { unit } = usePrefs();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, left: 4, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke="var(--grid)" vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={AXIS} tickFormatter={(v) => fmtAxis(v, kind, unit)} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey={x} tick={AXIS} width={90} axisLine={false} tickLine={false} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} tick={AXIS} axisLine={{ stroke: "#c9d3dc" }} tickLine={false} />
            <YAxis tick={AXIS} tickFormatter={(v) => fmtAxis(v, kind, unit)} axisLine={false} tickLine={false} width={56} />
          </>
        )}
        <ChartTooltip kind={kind} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" iconSize={10} />}
        {refLine && <ReferenceLine y={refLine.y} stroke="#7b8899" strokeDasharray="4 3" label={{ value: refLine.label, fontSize: 11, fill: "#4a5b70", position: "insideTopRight" }} />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color ?? SERIES[i % SERIES.length]}
            stackId={s.stack}
            radius={s.stack ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            maxBarSize={36}
            stroke="#fff"
            strokeWidth={s.stack ? 1 : 0}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LinesChart({
  data,
  x,
  series,
  kind = "money",
  height = 260,
  zeroLine,
  refLine,
  area,
}: {
  data: Record<string, unknown>[];
  x: string;
  series: SeriesDef[];
  kind?: ValueKind;
  height?: number;
  zeroLine?: boolean;
  refLine?: { y: number; label: string };
  area?: boolean;
}) {
  const { unit } = usePrefs();
  const Chart = area ? AreaChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey={x} tick={AXIS} axisLine={{ stroke: "#c9d3dc" }} tickLine={false} minTickGap={16} />
        <YAxis tick={AXIS} tickFormatter={(v) => fmtAxis(v, kind, unit)} axisLine={false} tickLine={false} width={56} />
        <ChartTooltip kind={kind} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />}
        {zeroLine && <ReferenceLine y={0} stroke="var(--bad)" strokeWidth={1} />}
        {refLine && <ReferenceLine y={refLine.y} stroke="#7b8899" strokeDasharray="4 3" label={{ value: refLine.label, fontSize: 11, fill: "#4a5b70", position: "insideTopRight" }} />}
        {series.map((s, i) =>
          area ? (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? SERIES[i]} fill={s.color ?? SERIES[i]} fillOpacity={0.12} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          ) : (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? SERIES[i]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          ),
        )}
      </Chart>
    </ResponsiveContainer>
  );
}

/** 막대(유입/유출) + 선(잔액) — 같은 금액 단위의 단일 축 */
export function CashComboChart({ data, height = 280, minCash }: { data: { month: string; inflow: number; outflow: number; ending: number }[]; height?: number; minCash?: number }) {
  const { unit } = usePrefs();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="month" tick={AXIS} axisLine={{ stroke: "#c9d3dc" }} tickLine={false} minTickGap={12} />
        <YAxis tick={AXIS} tickFormatter={(v) => fmtAxis(v, "money", unit)} axisLine={false} tickLine={false} width={56} />
        <ChartTooltip kind="money" />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={0} stroke="var(--bad)" />
        {minCash !== undefined && <ReferenceLine y={minCash} stroke="#7b8899" strokeDasharray="4 3" label={{ value: "최소보유현금", fontSize: 11, fill: "#4a5b70", position: "insideTopLeft" }} />}
        <Bar dataKey="inflow" name="현금유입" fill="var(--s1)" radius={[3, 3, 0, 0]} maxBarSize={18} />
        <Bar dataKey="outflow" name="현금유출" fill="var(--s2)" radius={[3, 3, 0, 0]} maxBarSize={18} />
        <Line dataKey="ending" name="기말현금" stroke="var(--navy)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, kind = "money", height = 240 }: { data: { name: string; value: number }[]; kind?: ValueKind; height?: number }) {
  const { unit } = usePrefs();
  const total = data.reduce((s, d) => s + d.value, 0);
  const shown = data.length > 5 ? [...data.slice(0, 4), { name: "기타", value: data.slice(4).reduce((s, d) => s + d.value, 0) }] : data;
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <div style={{ width: 200, height }} className="shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={shown} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={1} stroke="#fff" strokeWidth={2}>
              {shown.map((_, i) => (
                <Cell key={i} fill={i < 5 ? SERIES[i] : "#b8c2cc"} />
              ))}
            </Pie>
            <ChartTooltip kind={kind} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-1.5 text-xs">
        {shown.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: i < 5 ? SERIES[i] : "#b8c2cc" }} />
            <span className="flex-1 text-ink2">{d.name}</span>
            <span className="num font-semibold text-ink">{fmtVal(d.value, kind, unit)}</span>
            <span className="num w-12 text-right text-ink3">{total ? fmtNum((d.value / total) * 100, 1) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 진행률 막대 (목표 대비) */
export function ProgressBar({ value, target, label }: { value: number; target?: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div>
      {label && (
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-ink2">{label}</span>
          <span className="num font-semibold">{fmtNum(value, 1)}%</span>
        </div>
      )}
      <div className="relative h-2 rounded-full bg-bg2">
        <div className="h-2 rounded-full bg-teal" style={{ width: `${v}%` }} />
        {target !== undefined && <div className="absolute -top-1 h-4 w-0.5 bg-navy" style={{ left: `${Math.min(100, target)}%` }} title={`목표 ${target}%`} />}
      </div>
    </div>
  );
}
