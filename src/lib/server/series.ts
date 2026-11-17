import "server-only";
// 대시보드·보고서 공용 시계열 산출
import type { Snapshot } from "./snapshot";
import { calcAllContracts } from "../calc/contracts";
import { monthlySales } from "../calc/analytics";
import { runCashflow } from "../calc/cashflow";
import { addMonths, endOfMonth, monthDiff, monthOf, sum } from "../format";
import { DEBT_TYPE_LABEL } from "../types";

export function salesSeries(snap: Snapshot, from = "2026-01") {
  return monthlySales(snap.data.contracts, from, monthOf(snap.data.settings.base_date));
}

/** 월말 기준 잔금 미수(연체·유예)와 월중 회수액 */
export function receivableSeries(snap: Snapshot, from = "2026-05") {
  const { data } = snap;
  const base = monthOf(data.settings.base_date);
  const out: { month: string; overdue: number; deferred: number; collected: number }[] = [];
  for (let m = from; m <= base; m = addMonths(m, 1)) {
    const asOf = m === base ? data.settings.base_date : endOfMonth(m);
    const calcs = calcAllContracts(data.contracts, data.payments, data.deferrals, asOf).filter((c) => c.activeAsOf);
    out.push({
      month: m,
      overdue: sum(calcs, (c) => c.overduePrincipal),
      deferred: sum(calcs, (c) => c.deferralNotMatured),
      collected: sum(
        data.payments.filter((p) => (p.pay_type === "BALANCE" || p.pay_type === "DEFERRAL") && monthOf(p.paid_date) === m && p.paid_date <= data.settings.base_date),
        (p) => p.amount,
      ),
    });
  }
  return out;
}

/** 실적(기초현금월~) + 향후 12개월 월별 유입·유출 */
export function cashHistorySeries(snap: Snapshot, aheadMonths = 12) {
  const st = snap.data.settings;
  const n = monthDiff(st.opening_cash_month, monthOf(st.base_date)) + aheadMonths;
  const cf = runCashflow(snap.data, { scenario: "BASE", startMonth: st.opening_cash_month, months: n });
  return cf.months.map((m) => ({ month: m.month, kind: m.kind, inflow: m.inTotal, outflow: m.outTotal, ending: m.ending }));
}

export function endingCashSeries(snap: Snapshot) {
  const { CONS, BASE, OPT } = snap.cf;
  return BASE.months.map((m, i) => ({ month: m.month, CONS: CONS.months[i]?.ending ?? null, BASE: m.ending, OPT: OPT.months[i]?.ending ?? null }));
}

export function debtMix(snap: Snapshot) {
  const by = new Map<string, number>();
  for (const r of snap.values.d.rows) {
    const k = DEBT_TYPE_LABEL[r.debt.debt_type];
    by.set(k, (by.get(k) ?? 0) + r.remaining);
  }
  return [...by.entries()].map(([name, value]) => ({ name, value })).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
}
