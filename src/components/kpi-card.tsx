"use client";
import { useState } from "react";
import { Info } from "lucide-react";
import { clsx } from "clsx";
import type { Kpi } from "@/lib/calc/analytics";
import { kpiStatus } from "@/lib/calc/analytics";
import { fmtMoney, fmtNum } from "@/lib/format";
import { usePrefs } from "./providers";
import { StatusBadge } from "./ui";

export function KpiCard({ k }: { k: Kpi }) {
  const { unit } = usePrefs();
  const [open, setOpen] = useState(false);
  const status = kpiStatus(k);
  const fmt = (v: number | null) => (v === null ? "-" : k.unit === "%" ? `${fmtNum(v, 1)}%` : fmtMoney(v, unit));
  let delta: React.ReactNode = <span className="text-ink3">전월 -</span>;
  if (k.prev !== null) {
    const d = k.unit === "%" ? k.value - k.prev : k.prev !== 0 ? ((k.value - k.prev) / Math.abs(k.prev)) * 100 : 0;
    const improving = k.higherIsBetter ? d > 0 : d < 0;
    const txt = k.unit === "%" ? `${d >= 0 ? "+" : ""}${fmtNum(d, 1)}%p` : `${d >= 0 ? "+" : ""}${fmtNum(d, 1)}%`;
    delta = (
      <span className={clsx("num font-semibold", Math.abs(d) < 0.05 ? "text-ink3" : improving ? "text-good" : "text-bad")}>
        {d > 0 ? "▲" : d < 0 ? "▼" : "–"} {txt}
      </span>
    );
  }
  return (
    <div className="relative rounded-lg border border-line bg-white p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[12.5px] font-medium text-ink2">{k.label}</div>
        <button onClick={() => setOpen(!open)} className="no-print text-ink3 hover:text-teal" aria-label={`${k.label} 산식 보기`}>
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="num mt-1.5 text-[22px] leading-tight font-bold text-ink">{fmt(k.value)}</div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[11.5px]">
        <span className="text-ink3">목표 {k.target === null ? "-" : fmt(k.target)}</span>
        {delta}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <StatusBadge status={status} />
        <span className="text-[10.5px] text-ink3">{k.higherIsBetter ? "높을수록 양호" : "낮을수록 양호"}</span>
      </div>
      {open && (
        <div className="absolute top-9 right-2 left-2 z-10 rounded-md border border-line bg-white p-3 text-[11.5px] leading-relaxed shadow-lg">
          <div className="font-semibold text-ink">산식</div>
          <div className="text-ink2">{k.formula}</div>
          <div className="mt-1.5 font-semibold text-ink">원천 데이터</div>
          <div className="text-ink2">{k.source}</div>
          <div className="mt-1.5 font-semibold text-ink">계산범위</div>
          <div className="text-ink2">{k.scope}</div>
        </div>
      )}
    </div>
  );
}
