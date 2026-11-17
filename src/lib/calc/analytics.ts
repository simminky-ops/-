// 호실 상태·분양·임대·CRM·채무 집계 및 핵심 KPI 산출
import type { Asset, Lease, SaleContract } from "../types";
import type { ProjectData } from "./data";
import { calcAllContracts, type ContractCalc } from "./contracts";
import { addMonths, endOfMonth, monthOf, quarterOf, ratio, sum } from "../format";

export type SaleState = "UNSOLD" | "CONTRACTED" | "COMPLETED";
export type PayState = "NONE" | "NOT_DUE" | "NORMAL" | "DEFERRED" | "OVERDUE" | "PAID";
export type LeaseState = "NA" | "VACANT" | "NEGOTIATING" | "CONTRACTED" | "OPEN";

export const SALE_STATE_LABEL: Record<SaleState, string> = { UNSOLD: "미분양", CONTRACTED: "계약", COMPLETED: "완납" };
export const PAY_STATE_LABEL: Record<PayState, string> = {
  NONE: "-",
  NOT_DUE: "잔금 도래전",
  NORMAL: "정상",
  DEFERRED: "유예중",
  OVERDUE: "연체",
  PAID: "완납",
};
export const LEASE_STATE_LABEL: Record<LeaseState, string> = {
  NA: "-",
  VACANT: "공실",
  NEGOTIATING: "협상중",
  CONTRACTED: "임대계약",
  OPEN: "영업중",
};

export interface AssetView extends Asset {
  sale_state: SaleState;
  pay_state: PayState;
  lease_state: LeaseState;
  contract_id: string | null;
  supply_price: number | null;
  discount_amount: number | null;
  discount_rate: number | null;
  contract_date: string | null;
  contract_status: string | null;
  deposit_amount: number | null;
  middle_amount: number | null;
  balance_amount: number | null;
  paid_total: number;
  balance_unpaid: number;
  deferral_outstanding: number;
  deferral_maturity: string | null;
  late_fee: number;
  middle_loan_interest: number;
  middle_loan_maturity: string | null;
  overdue_days: number;
  terminated_count: number;
  is_resale: number;
  sales_manager: string | null;
  lease_id: string | null;
  tenant_industry: string | null;
}

export function isLeaseActive(l: Lease, asOf: string): boolean {
  return (
    (l.negotiation_status === "CONTRACTED" || l.negotiation_status === "OPEN") &&
    !!l.start_date &&
    l.start_date <= asOf &&
    (!l.end_date || l.end_date >= asOf)
  );
}

export function buildAssetViews(data: ProjectData, asOf: string, calcs?: ContractCalc[]): AssetView[] {
  const cc = calcs ?? calcAllContracts(data.contracts, data.payments, data.deferrals, asOf);
  const byAsset = new Map<string, ContractCalc[]>();
  for (const c of cc) {
    const arr = byAsset.get(c.contract.asset_id) ?? [];
    arr.push(c);
    byAsset.set(c.contract.asset_id, arr);
  }
  const leasesBy = new Map<string, Lease[]>();
  for (const l of data.leases) {
    const arr = leasesBy.get(l.asset_id) ?? [];
    arr.push(l);
    leasesBy.set(l.asset_id, arr);
  }
  return data.assets.map((a) => {
    const list = byAsset.get(a.id) ?? [];
    const active = list.find((x) => x.activeAsOf);
    const terminated = list.filter((x) => x.contract.status === "TERMINATED" && x.contract.terminated_at && x.contract.terminated_at <= asOf).length;
    let sale: SaleState = "UNSOLD";
    let pay: PayState = "NONE";
    if (active) {
      const done = active.outstanding <= 0;
      sale = done ? "COMPLETED" : "CONTRACTED";
      if (done) pay = "PAID";
      else if (active.overduePrincipal > 0) pay = "OVERDUE";
      else if (active.deferralNotMatured > 0) pay = "DEFERRED";
      else if (!active.contract.balance_due_date || active.contract.balance_due_date > asOf) pay = "NOT_DUE";
      else pay = "NORMAL";
    }
    let lease: LeaseState = "NA";
    let leaseRow: Lease | undefined;
    if (a.leasable) {
      const ls = leasesBy.get(a.id) ?? [];
      leaseRow = ls.find((l) => isLeaseActive(l, asOf));
      if (leaseRow) lease = leaseRow.negotiation_status === "OPEN" ? "OPEN" : "CONTRACTED";
      else {
        leaseRow = ls.find((l) => ["LEAD", "NEGOTIATING", "LOI"].includes(l.negotiation_status));
        lease = leaseRow ? "NEGOTIATING" : "VACANT";
      }
    }
    const c = active?.contract;
    return {
      ...a,
      sale_state: sale,
      pay_state: pay,
      lease_state: lease,
      contract_id: c?.id ?? null,
      supply_price: c?.supply_price ?? null,
      discount_amount: c?.discount_amount ?? null,
      discount_rate: c ? ratio(c.discount_amount, c.list_price_at_contract) : null,
      contract_date: c?.contract_date ?? null,
      contract_status: c?.status ?? null,
      deposit_amount: c?.deposit_amount ?? null,
      middle_amount: c?.middle_amount ?? null,
      balance_amount: c?.balance_amount ?? null,
      paid_total: active?.principalPaid ?? 0,
      balance_unpaid: active?.balanceUnpaid ?? 0,
      deferral_outstanding: active?.deferralOutstanding ?? 0,
      deferral_maturity: active?.deferrals.find((d) => d.status === "ACTIVE")?.maturity_date ?? null,
      late_fee: active?.lateFee.fee ?? 0,
      middle_loan_interest: c?.middle_loan_interest ?? 0,
      middle_loan_maturity: c?.middle_loan_maturity ?? null,
      overdue_days: active?.overdueDays ?? 0,
      terminated_count: terminated,
      is_resale: c?.is_resale ?? 0,
      sales_manager: c?.sales_manager ?? null,
      lease_id: leaseRow?.id ?? null,
      tenant_industry: leaseRow?.actual_industry ?? leaseRow?.desired_industry ?? null,
    };
  });
}

// ---------------- 분양 집계 ----------------
export function saleStats(views: AssetView[]) {
  const targets = views.filter((v) => v.is_sale_target);
  const byType = (t: string) => targets.filter((v) => v.facility_type === t);
  const sold = (arr: AssetView[]) => arr.filter((v) => v.sale_state !== "UNSOLD");
  const ot = byType("OFFICETEL");
  const rt = byType("RETAIL");
  const totalList = sum(targets, (v) => v.list_price);
  const contractedSupply = sum(sold(targets), (v) => v.supply_price ?? 0);
  return {
    total: targets.length,
    sold: sold(targets).length,
    saleRate: ratio(sold(targets).length, targets.length),
    amountRate: ratio(contractedSupply, totalList),
    totalList,
    contractedSupply,
    officetel: { total: ot.length, sold: sold(ot).length, rate: ratio(sold(ot).length, ot.length) },
    retail: { total: rt.length, sold: sold(rt).length, rate: ratio(sold(rt).length, rt.length) },
    unsoldRate: 100 - ratio(sold(targets).length, targets.length),
    unsoldValue: sum(targets.filter((v) => v.sale_state === "UNSOLD"), (v) => v.current_price),
  };
}

// ---------------- 잔금·미수 집계 ----------------
export function collectionStats(calcs: ContractCalc[]) {
  const act = calcs.filter((c) => c.activeAsOf);
  const billed = sum(act, (c) => c.balanceBilled);
  const collected = sum(act, (c) => c.balanceCollected);
  const unpaid = billed - collected;
  const overdue = sum(act, (c) => c.overduePrincipal);
  const deferred = sum(act, (c) => c.deferralNotMatured);
  return {
    billed,
    collected,
    unpaid,
    overdue,
    deferred,
    collectionRate: ratio(collected, billed),
    receivableRate: ratio(unpaid, billed),
    lateFee: sum(act, (c) => c.lateFee.fee),
    lateFeeUnpaid: sum(act, (c) => c.lateFeeUnpaid),
    overdueCount: act.filter((c) => c.overduePrincipal > 0).length,
    deferredCount: act.filter((c) => c.deferralNotMatured > 0).length,
    totalOutstanding: sum(act, (c) => c.outstanding),
  };
}

// ---------------- 임대 집계 ----------------
export function leaseStats(data: ProjectData, asOf: string) {
  const retail = data.assets.filter((a) => a.leasable);
  const leasable = sum(retail, (a) => a.exclusive_area);
  const active = data.leases.filter((l) => isLeaseActive(l, asOf));
  const activeIds = new Set(active.map((l) => l.asset_id));
  const leasedArea = sum(retail.filter((a) => activeIds.has(a.id)), (a) => a.exclusive_area);
  const floors = [...new Set(retail.map((a) => a.floor))].sort((a, b) => a - b);
  const byFloor = floors.map((f) => {
    const fa = retail.filter((a) => a.floor === f);
    const area = sum(fa, (a) => a.exclusive_area);
    const leased = sum(fa.filter((a) => activeIds.has(a.id)), (a) => a.exclusive_area);
    return { floor: `${f}층`, area, leased, rate: ratio(leased, area), units: fa.length, leasedUnits: fa.filter((a) => activeIds.has(a.id)).length };
  });
  const areaById = new Map(retail.map((a) => [a.id, a.exclusive_area]));
  const monthlyRent = sum(active, (l) => l.monthly_rent);
  const devRent = sum(active.filter((l) => l.income_recipient === "DEVELOPER"), (l) => l.monthly_rent);
  const industryArea = new Map<string, number>();
  for (const l of active) {
    const k = l.actual_industry || "미분류";
    industryArea.set(k, (industryArea.get(k) ?? 0) + (areaById.get(l.asset_id) ?? 0));
  }
  const expiring = active.filter((l) => l.end_date && l.end_date <= addMonths(monthOf(asOf), 12) + "-31");
  return {
    leasable,
    leasedArea,
    rate: ratio(leasedArea, leasable),
    vacancyRate: 100 - ratio(leasedArea, leasable),
    byFloor,
    activeCount: active.length,
    openCount: active.filter((l) => l.negotiation_status === "OPEN").length,
    monthlyRent,
    annualRent: monthlyRent * 12,
    devAnnualRent: devRent * 12,
    rentPerSqm: leasedArea > 0 ? monthlyRent / leasedArea : 0,
    anchors: active.filter((l) => l.is_anchor).length,
    pipeline: data.leases.filter((l) => ["LEAD", "NEGOTIATING", "LOI"].includes(l.negotiation_status)).length,
    industryMix: [...industryArea.entries()].map(([name, area]) => ({ name, area, share: ratio(area, leasedArea) })).sort((a, b) => b.area - a.area),
    expiring,
  };
}

// ---------------- 채무 집계 ----------------
export function debtStats(data: ProjectData, asOf: string) {
  const asOfMonth = monthOf(asOf);
  const rows = data.debts.map((d) => {
    const reps = data.repayments.filter((r) => r.debt_id === d.id);
    const repaid = sum(reps.filter((r) => r.kind === "ACTUAL" && (r.pay_date ? r.pay_date <= asOf : r.month <= asOfMonth)), (r) => r.amount);
    const total = d.principal + d.interest_penalty;
    const remaining = Math.max(0, total - repaid);
    const plannedFuture = sum(reps.filter((r) => r.kind === "PLAN" && r.month >= asOfMonth), (r) => r.amount);
    const overdue = !!d.due_date && d.due_date < asOf && remaining > 0 && d.installment_status !== "AGREED";
    return { debt: d, repaid, repaidPrincipal: Math.min(repaid, d.principal), remaining, plannedFuture, overdue, unplanned: Math.max(0, remaining - plannedFuture) };
  });
  const principal = sum(rows, (r) => r.debt.principal);
  const repaidPrincipal = sum(rows, (r) => r.repaidPrincipal);
  return {
    rows,
    principal,
    repaidPrincipal,
    balance: sum(rows, (r) => r.remaining),
    repayRate: ratio(repaidPrincipal, principal),
    overdueCount: rows.filter((r) => r.overdue).length,
  };
}

// ---------------- 월별 분양실적 ----------------
export function monthlySales(contracts: SaleContract[], fromMonth: string, toMonth: string, mode: "month" | "quarter" = "month") {
  const key = (m: string) => (mode === "quarter" ? quarterOf(m) : m);
  const map = new Map<string, { period: string; newSale: number; resale: number; terminated: number; amount: number }>();
  for (let m = fromMonth; m <= toMonth; m = addMonths(m, 1)) {
    const k = key(m);
    if (!map.has(k)) map.set(k, { period: k, newSale: 0, resale: 0, terminated: 0, amount: 0 });
  }
  for (const c of contracts) {
    const m = monthOf(c.contract_date);
    if (m >= fromMonth && m <= toMonth) {
      const row = map.get(key(m))!;
      if (c.is_resale) row.resale++;
      else row.newSale++;
      row.amount += c.supply_price;
    }
    if (c.terminated_at) {
      const tm = monthOf(c.terminated_at);
      if (tm >= fromMonth && tm <= toMonth) map.get(key(tm))!.terminated++;
    }
  }
  return [...map.values()];
}

// ---------------- CRM ----------------
export function crmStats(data: ProjectData, from?: string, to?: string) {
  const leads = data.leads.filter((l) => (!from || l.consult_date >= from) && (!to || l.consult_date <= to));
  const valid = leads.filter((l) => l.valid);
  const contracted = leads.filter((l) => l.contracted);
  const byGroup = (f: (l: (typeof leads)[number]) => string) => {
    const m = new Map<string, { name: string; leads: number; visits: number; contracts: number; amount: number }>();
    for (const l of leads) {
      const k = f(l) || "-";
      const r = m.get(k) ?? { name: k, leads: 0, visits: 0, contracts: 0, amount: 0 };
      r.leads++;
      if (l.visited) r.visits++;
      if (l.contracted) {
        r.contracts++;
        r.amount += l.contract_amount;
      }
      m.set(k, r);
    }
    return [...m.values()].map((r) => ({ ...r, conversion: ratio(r.contracts, r.leads) }));
  };
  const funnelOrder = ["INFLOW", "CONSULT", "VISIT", "OFFER", "NEGOTIATE", "CONTRACTED"];
  const reached = (stage: string) => {
    const idx = funnelOrder.indexOf(stage);
    return leads.filter((l) => {
      const li = funnelOrder.indexOf(l.stage);
      const effective = l.stage === "DROPPED" ? (l.visited ? 2 : 1) : li >= 0 ? li : l.contracted ? 5 : 1;
      return effective >= idx;
    }).length;
  };
  return {
    leads: leads.length,
    valid: valid.length,
    visits: leads.filter((l) => l.visited).length,
    visitRate: ratio(leads.filter((l) => l.visited).length, valid.length),
    contracts: contracted.length,
    conversion: ratio(contracted.length, valid.length),
    resaleContracts: contracted.filter((l) => l.is_resale).length,
    byManager: byGroup((l) => l.manager ?? "-"),
    byChannel: byGroup((l) => l.channel),
    funnel: funnelOrder.map((s) => ({ stage: s, count: reached(s) })),
    upcoming: data.leads.filter((l) => l.next_date && l.stage !== "DROPPED" && !l.contracted).sort((a, b) => String(a.next_date).localeCompare(String(b.next_date))),
  };
}

// ---------------- KPI ----------------
export interface Kpi {
  key: string;
  label: string;
  value: number;
  prev: number | null;
  target: number | null;
  unit: "%" | "원";
  higherIsBetter: boolean;
  formula: string;
  source: string;
  scope: string;
}

export function kpiStatus(k: Pick<Kpi, "value" | "target" | "higherIsBetter">): "good" | "warn" | "bad" | "none" {
  if (k.target === null || k.target === undefined) return "none";
  if (k.higherIsBetter) {
    if (k.value >= k.target) return "good";
    if (k.value >= k.target * 0.9) return "warn";
    return "bad";
  }
  if (k.value <= k.target) return "good";
  if (k.value <= k.target * 1.15) return "warn";
  return "bad";
}

export function computeKpiValues(data: ProjectData, asOf: string) {
  const calcs = calcAllContracts(data.contracts, data.payments, data.deferrals, asOf);
  const views = buildAssetViews(data, asOf, calcs);
  const s = saleStats(views);
  const c = collectionStats(calcs);
  const l = leaseStats(data, asOf);
  const d = debtStats(data, asOf);
  const collectedTotal = sum(
    data.payments.filter((p) => p.paid_date <= asOf),
    (p) => p.amount,
  );
  return { calcs, views, s, c, l, d, collectedTotal };
}

export function buildKpis(data: ProjectData, asOf: string, endingCash: number, prevEndingCash: number | null): Kpi[] {
  const t = data.settings.targets ?? {};
  const cur = computeKpiValues(data, asOf);
  const prevDate = endOfMonth(addMonths(monthOf(asOf), -1));
  const prev = computeKpiValues(data, prevDate);
  const base = `기준일 ${asOf} · 전월값 ${prevDate}`;
  const mk = (key: string, label: string, value: number, pv: number | null, unit: "%" | "원", hib: boolean, formula: string, source: string, scope = base): Kpi => ({
    key,
    label,
    value,
    prev: pv,
    target: t[key] ?? null,
    unit,
    higherIsBetter: hib,
    formula,
    source,
    scope,
  });
  return [
    mk("sale_rate", "전체 분양률", cur.s.saleRate, prev.s.saleRate, "%", true, "유효 분양계약 호실 수 ÷ 전체 분양대상 호실 수 × 100", "assets, sale_contracts (해지 제외, 완납 포함)"),
    mk("amount_sale_rate", "금액기준 분양률", cur.s.amountRate, prev.s.amountRate, "%", true, "유효 계약 공급금액(할인후) ÷ 전체 공급예정금액(최초 분양가 합계) × 100", "assets.list_price, sale_contracts.supply_price"),
    mk("officetel_rate", "오피스텔 분양률", cur.s.officetel.rate, prev.s.officetel.rate, "%", true, "오피스텔 유효계약 호실 ÷ 오피스텔 분양대상 호실 × 100", "assets, sale_contracts"),
    mk("retail_rate", "근린생활시설 분양률", cur.s.retail.rate, prev.s.retail.rate, "%", true, "근생 유효계약 호실 ÷ 근생 분양대상 호실 × 100", "assets, sale_contracts"),
    mk("unsold_rate", "전체 미분양 비율", cur.s.unsoldRate, prev.s.unsoldRate, "%", false, "100 − 전체 분양률", "assets, sale_contracts"),
    mk("collection_rate", "잔금 회수율", cur.c.collectionRate, prev.c.collectionRate, "%", true, "잔금 수납액(잔금+유예금 회수) ÷ 잔금 청구 확정액(납부기한 도래, 유효계약) × 100", "sale_contracts, payments"),
    mk("receivable", "잔금 미수금", cur.c.unpaid, prev.c.unpaid, "원", false, "잔금 청구 확정액 − 잔금 수납액 (연체원금 + 만기 전 유예금)", "sale_contracts, payments, deferrals"),
    mk("lease_rate", "근생 임대율", cur.l.rate, prev.l.rate, "%", true, "계약 임대면적(전용) ÷ 임대 가능면적(전용) × 100", "assets(leasable), leases(계약완료·영업중, 기간 내)"),
    mk("collected", "누적 자금 회수액", cur.collectedTotal, prev.collectedTotal, "원", true, "분양대금 수납 누계(계약금·중도금·잔금·유예금·연체료) − 해지 환급", "payments"),
    mk("debt_balance", "총 채무 잔액", cur.d.balance, prev.d.balance, "원", false, "Σ(발생원금 + 이자·가산금 − 상환실적)", "debts, debt_repayments(ACTUAL)"),
    mk("repay_rate", "채무 상환율", cur.d.repayRate, prev.d.repayRate, "%", true, "누적 상환원금 ÷ 상환계획 대상 원금 × 100", "debts, debt_repayments(ACTUAL)"),
    mk("ending_cash", "당월 예상 기말현금", endingCash, prevEndingCash, "원", true, "기초현금 + 현금유입 − 현금유출 (기준 시나리오, 당월)", "36개월 현금흐름 엔진(B07)", `${monthOf(asOf)} 기준 시나리오 · 전월값 = 전월 실적 기말현금`),
  ];
}
