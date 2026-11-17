"use client";
// PART A 사업계획서 전용 클라이언트 요소 — 금액/지수 모드 표시, 인쇄 버튼
import { Printer } from "lucide-react";
import { fmtNum } from "@/lib/format";
import { Money } from "./money";
import { usePrefs } from "./providers";

export type AmountMode = "amount" | "index";

/** 금액(내부) 또는 지수(외부, 총 공급예정금액=100) 표시 */
export function Amt({ v, mode, plain }: { v: number | null | undefined; mode: AmountMode; plain?: boolean }) {
  if (v === null || v === undefined) return <span>-</span>;
  if (mode === "index") return <span className="num">{fmtNum(v, 1)}{plain ? "" : "pt"}</span>;
  return <Money v={v} plain={plain} />;
}

export function AmtUnit({ mode }: { mode: AmountMode }) {
  const { unit } = usePrefs();
  if (mode === "index") return <>지수(총 공급예정금액=100)</>;
  return <>{{ WON: "원", MAN: "만원", EOK: "억원" }[unit]}</>;
}

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-bg2"
    >
      <Printer className="h-4 w-4" /> 인쇄 / PDF
    </button>
  );
}
