// 계약 단위 수납·미수·유예·연체료 계산 (기준일 시점)
import type { Deferral, Payment, SaleContract } from "../types";
import { daysBetween } from "../format";

export interface LateFeeInput {
  dueDate: string; // 납부기한 (연체 기산일 = 다음날)
  rate: number; // 연 이율(%)
  balance: number; // 잔금 청구액
  balancePayments: { date: string; amount: number }[]; // 잔금 납부
  deferrals: { amount: number; maturity: string; payments: { date: string; amount: number }[] }[];
  asOf: string;
  dayBasis?: 365 | 360;
}

export interface LateFeeResult {
  fee: number; // 누적 연체료(미납 여부 무관, 발생액)
  overduePrincipal: number; // 기준일 현재 연체원금
  overdueSince: string | null; // 현재 연체 시작일
  overdueDays: number;
  segments: { from: string; to: string; principal: number; days: number; fee: number }[];
}

/**
 * 연체료 = Σ(구간별 연체원금 × 연이율 × 일수 / 365)
 * - 연체원금 = 잔금 − 유예금(만기 전) − 납부액
 * - 유예금은 만기일 경과 시 미상환 잔액이 연체원금에 가산
 * - 납부일 당일부터 해당 금액은 연체원금에서 제외
 */
export function calcLateFee(inp: LateFeeInput): LateFeeResult {
  const basis = inp.dayBasis ?? 365;
  const segments: LateFeeResult["segments"] = [];
  if (inp.asOf <= inp.dueDate) return { fee: 0, overduePrincipal: 0, overdueSince: null, overdueDays: 0, segments };

  type Ev = { date: string; delta: number };
  const events: Ev[] = [];
  const deferredTotal = inp.deferrals.reduce((s, d) => s + d.amount, 0);
  let principal = inp.balance - deferredTotal;
  for (const p of inp.balancePayments) {
    if (p.date <= inp.dueDate) principal -= p.amount;
    else if (p.date <= inp.asOf) events.push({ date: p.date, delta: -p.amount });
  }
  for (const d of inp.deferrals) {
    let remainingAtMaturity = d.amount;
    for (const p of d.payments) {
      if (p.date <= d.maturity) remainingAtMaturity -= p.amount;
      else if (p.date <= inp.asOf) events.push({ date: p.date, delta: -p.amount });
    }
    if (d.maturity < inp.asOf && remainingAtMaturity > 0) events.push({ date: d.maturity, delta: remainingAtMaturity });
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  principal = Math.max(0, principal);
  let cursor = inp.dueDate;
  let fee = 0;
  let since: string | null = principal > 0 ? inp.dueDate : null;
  const accrue = (to: string) => {
    const days = daysBetween(cursor, to);
    if (days > 0 && principal > 0) {
      const f = (principal * (inp.rate / 100) * days) / basis;
      fee += f;
      segments.push({ from: cursor, to, principal, days, fee: Math.round(f) });
    }
    cursor = to;
  };
  for (const ev of events) {
    accrue(ev.date);
    const before = principal;
    principal = Math.max(0, principal + ev.delta);
    if (before <= 0 && principal > 0) since = ev.date;
    if (principal <= 0) since = null;
  }
  accrue(inp.asOf);
  return {
    fee: Math.round(fee),
    overduePrincipal: principal,
    overdueSince: since,
    overdueDays: since ? daysBetween(since, inp.asOf) : 0,
    segments,
  };
}

export interface ContractCalc {
  contract: SaleContract;
  activeAsOf: boolean; // 기준일 시점 유효계약(완납 포함)
  paidDeposit: number;
  paidMiddle: number;
  paidBalance: number;
  paidDeferral: number;
  lateFeePaid: number;
  refund: number;
  principalPaid: number;
  outstanding: number; // 공급금액 − 납부원금 (유효계약만)
  balanceBilled: number; // 잔금 청구확정액(납부기한 도래분)
  balanceCollected: number;
  balanceUnpaid: number; // 청구 잔금 중 미수(유예 포함)
  deferralOutstanding: number; // 유예 미상환 잔액(전체)
  deferralNotMatured: number;
  overduePrincipal: number;
  overdueDays: number;
  lateFee: LateFeeResult;
  lateFeeUnpaid: number;
  deferrals: Deferral[];
}

export function calcContract(
  c: SaleContract,
  paymentsOfContract: Payment[],
  deferralsOfContract: Deferral[],
  asOf: string,
): ContractCalc {
  const pays = paymentsOfContract.filter((p) => p.paid_date <= asOf);
  const sumType = (t: string) => pays.filter((p) => p.pay_type === t).reduce((s, p) => s + p.amount, 0);
  const paidDeposit = sumType("DEPOSIT");
  const paidMiddle = sumType("MIDDLE");
  const paidBalance = sumType("BALANCE");
  const paidDeferral = sumType("DEFERRAL");
  const lateFeePaid = sumType("LATE_FEE");
  const refund = sumType("REFUND");
  const principalPaid = paidDeposit + paidMiddle + paidBalance + paidDeferral;

  const activeAsOf = c.contract_date <= asOf && !(c.status === "TERMINATED" && c.terminated_at && c.terminated_at <= asOf);
  const defs = deferralsOfContract.filter((d) => d.status !== "CANCELLED" && d.start_date <= asOf);

  const defCalc = defs.map((d) => {
    const dp = pays.filter((p) => p.pay_type === "DEFERRAL" && p.deferral_id === d.id);
    const paid = dp.reduce((s, p) => s + p.amount, 0);
    return { d, paid, out: Math.max(0, d.deferred_amount - paid), payments: dp.map((p) => ({ date: p.paid_date, amount: p.amount })) };
  });
  const deferralOutstanding = defCalc.reduce((s, x) => s + x.out, 0);
  const deferralNotMatured = defCalc.filter((x) => x.d.maturity_date >= asOf).reduce((s, x) => s + x.out, 0);

  const billedNow = activeAsOf && !!c.balance_due_date && c.balance_due_date <= asOf;
  const balanceBilled = billedNow ? c.balance_amount : 0;
  const balanceCollected = billedNow ? Math.min(c.balance_amount, paidBalance + paidDeferral) : 0;
  const balanceUnpaid = balanceBilled - balanceCollected;

  const lateFee =
    activeAsOf && c.balance_due_date
      ? calcLateFee({
          dueDate: c.balance_due_date,
          rate: c.late_fee_rate,
          balance: c.balance_amount,
          balancePayments: pays.filter((p) => p.pay_type === "BALANCE").map((p) => ({ date: p.paid_date, amount: p.amount })),
          deferrals: defCalc.map((x) => ({ amount: x.d.deferred_amount, maturity: x.d.maturity_date, payments: x.payments })),
          asOf,
        })
      : { fee: 0, overduePrincipal: 0, overdueSince: null, overdueDays: 0, segments: [] };

  return {
    contract: c,
    activeAsOf,
    paidDeposit,
    paidMiddle,
    paidBalance,
    paidDeferral,
    lateFeePaid,
    refund,
    principalPaid,
    outstanding: activeAsOf ? Math.max(0, c.supply_price - principalPaid) : 0,
    balanceBilled,
    balanceCollected,
    balanceUnpaid,
    deferralOutstanding: activeAsOf ? deferralOutstanding : 0,
    deferralNotMatured: activeAsOf ? deferralNotMatured : 0,
    overduePrincipal: lateFee.overduePrincipal,
    overdueDays: lateFee.overdueDays,
    lateFee,
    lateFeeUnpaid: Math.max(0, lateFee.fee - lateFeePaid),
    deferrals: defs,
  };
}

export function agingBucket(days: number): string {
  if (days <= 0) return "정상";
  if (days <= 30) return "1~30일";
  if (days <= 90) return "31~90일";
  if (days <= 180) return "91~180일";
  return "180일 초과";
}
export const AGING_ORDER = ["정상", "1~30일", "31~90일", "91~180일", "180일 초과"];

/** 계약·수납·유예를 계약 ID로 묶어 일괄 계산 */
export function calcAllContracts(
  contracts: SaleContract[],
  payments: Payment[],
  deferrals: Deferral[],
  asOf: string,
): ContractCalc[] {
  const pBy = new Map<string, Payment[]>();
  for (const p of payments) {
    const arr = pBy.get(p.contract_id) ?? [];
    arr.push(p);
    pBy.set(p.contract_id, arr);
  }
  const dBy = new Map<string, Deferral[]>();
  for (const d of deferrals) {
    const arr = dBy.get(d.contract_id) ?? [];
    arr.push(d);
    dBy.set(d.contract_id, arr);
  }
  return contracts.map((c) => calcContract(c, pBy.get(c.id) ?? [], dBy.get(c.id) ?? [], asOf));
}
