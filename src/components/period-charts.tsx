"use client";
// 조회기간(월간·분기·누적) 선택을 따르는 차트들
import { BarsChart, CashComboChart, LinesChart, regroup, type SeriesDef } from "./charts";
import { usePrefs } from "./providers";

export function PeriodBars({ data, x, series, flow, stock = [], kind = "count", height }: { data: Record<string, unknown>[]; x: string; series: SeriesDef[]; flow: string[]; stock?: string[]; kind?: "money" | "count" | "pct"; height?: number }) {
  const { period } = usePrefs();
  return <BarsChart data={regroup(data, x, period, flow, stock)} x={x} series={series} kind={kind} height={height} />;
}

export function PeriodLines({ data, x, series, flow, stock = [], kind = "money", height, area }: { data: Record<string, unknown>[]; x: string; series: SeriesDef[]; flow: string[]; stock?: string[]; kind?: "money" | "count" | "pct"; height?: number; area?: boolean }) {
  const { period } = usePrefs();
  return <LinesChart data={regroup(data, x, period, flow, stock)} x={x} series={series} kind={kind} height={height} area={area} />;
}

export function PeriodCash({ data, minCash, height }: { data: { month: string; inflow: number; outflow: number; ending: number }[]; minCash?: number; height?: number }) {
  const { period } = usePrefs();
  const rows = regroup(data, "month", period === "cumulative" ? "month" : period, ["inflow", "outflow"], ["ending"]);
  return <CashComboChart data={rows} minCash={minCash} height={height} />;
}
