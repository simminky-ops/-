"use client";
import { fmtMoney, fmtPct, UNIT_LABEL } from "@/lib/format";
import { usePrefs } from "./providers";

/** 원/만원/억원 단위 전환을 따르는 금액 표시 */
export function Money({ v, unit: fixed, plain }: { v: number | null | undefined; unit?: "WON" | "MAN" | "EOK"; plain?: boolean }) {
  const { unit } = usePrefs();
  const u = fixed ?? unit;
  return <span className="num">{fmtMoney(v, u, !plain)}</span>;
}

export function UnitLabel() {
  const { unit } = usePrefs();
  return <>{UNIT_LABEL[unit]}</>;
}

export function Pct({ v, digits = 1 }: { v: number | null | undefined; digits?: number }) {
  return <span className="num">{fmtPct(v, digits)}</span>;
}

export function useMoneyFmt() {
  const { unit } = usePrefs();
  return (v: number | null | undefined, withUnit = true) => fmtMoney(v, unit, withUnit);
}
