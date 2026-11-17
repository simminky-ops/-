// 36개월 현금흐름 엔진
//  - 실적월(기준월 이전): payments·debt_repayments(ACTUAL)·cashflow_actuals 로 자동 집계
//  - 예측월(기준월 이후): 기존계약 잔여 수납, 유예금 만기회수, 미분양 판매(시나리오), 임대수입,
//    채무 상환계획(+잉여현금 우선순위 상환), 사업비 예정액, 법률·하자 비용, 수기 예상 항목
//  - 기말현금 = 기초현금 + 유입 − 유출, 다음 달 기초현금으로 연결
import type { CashAccount, DebtType, ScenarioAssumptions, ScenarioKey } from "../types";
import type { ProjectData } from "./data";
import { calcAllContracts } from "./contracts";
import { addMonths, monthDiff, monthOf, sum } from "../format";

export const IN_LINES = ["deposit", "middle", "balance", "newSales", "deferral", "rent", "other"] as const;
export const OUT_LINES = ["tax", "construction", "finance", "salesCost", "opex", "legalDefect", "refund", "other"] as const;
export type InLine = (typeof IN_LINES)[number];
export type OutLine = (typeof OUT_LINES)[number];

export const IN_LABEL: Record<InLine, string> = {
  deposit: "계약금 수입",
  middle: "중도금 수입",
  balance: "잔금 회수",
  newSales: "미분양·재판매 판매 수입",
  deferral: "잔금유예금 회수",
  rent: "임대수입(사업주체 귀속)",
  other: "기타 자금유입",
};
export const OUT_LABEL: Record<OutLine, string> = {
  tax: "세금 납부",
  construction: "공사비 지급",
  finance: "금융원리금 상환",
  salesCost: "판매·광고비",
  opex: "인건비 및 운영비",
  legalDefect: "법률·하자 관련 비용",
  refund: "해지 환급금",
  other: "기타 지출",
};

export interface CashMonth {
  month: string;
  kind: "ACTUAL" | "FORECAST";
  opening: number;
  in: Record<InLine, number>;
  out: Record<OutLine, number>;
  inTotal: number;
  outTotal: number;
  net: number;
  ending: number;
  belowMin: boolean;
  shortage: number; // 기말현금 음수 금액
  debtPrincipalPaid: number;
  debtBalanceEnd: number;
  newUnits: number;
  newRevenue: number; // 신규 판매 계약액(발생주의)
  newDiscount: number; // 신규 판매 할인손실(최초 분양가 대비)
  details: { line: string; label: string; amount: number }[];
}

export interface CashflowResult {
  scenario: ScenarioKey;
  assumptions: ScenarioAssumptions;
  months: CashMonth[];
  startOpening: number;
  summary: {
    inTotal: number;
    outTotal: number;
    minEnding: number;
    minEndingMonth: string | null;
    shortageMonths: string[];
    belowMinMonths: string[];
    requiredFunding: number; // 기말현금 0 유지에 필요한 최소 추가자금
    requiredFundingMinCash: number; // 최소보유현금 유지에 필요한 추가자금
    endingCash: number;
    newSalesRevenue: number;
    newSalesUnits: number;
    newSalesDiscount: number;
    salesCollections: number; // 분양 관련 현금회수(계약금·중도금·잔금·판매·유예)
    debtBalanceStart: number;
    debtBalanceEnd: number;
    debtPayoffMonth: string | null;
    receivableEnd: number; // 기간 말 미회수 분양대금(기존+신규)
    uncollectible: number; // 회수율 가정상 미회수 처리분
    unsoldUnitsEnd: number;
    rentTotal: number;
    interestTotal: number;
  };
  debtEnd: { id: string; type: DebtType; creditor: string; start: number; end: number; paid: number }[];
  warnings: string[];
  /** 사업수지 연동용: 예측기간 계정별 비용성 유출(채무원금 상환 제외) */
  futureCostByLine: Record<OutLine, number>;
  futureDebtPrincipal: number;
  /** 사업수지 연동용: 예측기간 유입 분류 */
  futureIn: { existingNonResale: number; existingResale: number; newSales: number; rent: number; other: number; deferralInterest: number };
}

const zeroIn = (): Record<InLine, number> => ({ deposit: 0, middle: 0, balance: 0, newSales: 0, deferral: 0, rent: 0, other: 0 });
const zeroOut = (): Record<OutLine, number> => ({ tax: 0, construction: 0, finance: 0, salesCost: 0, opex: 0, legalDefect: 0, refund: 0, other: 0 });

const ACCOUNT_LINE: Record<CashAccount, { dir: "in" | "out"; line: InLine | OutLine }> = {
  RENT: { dir: "in", line: "rent" },
  OTHER_IN: { dir: "in", line: "other" },
  TAX: { dir: "out", line: "tax" },
  CONSTRUCTION: { dir: "out", line: "construction" },
  FINANCE: { dir: "out", line: "finance" },
  SALES_COST: { dir: "out", line: "salesCost" },
  OPEX: { dir: "out", line: "opex" },
  LEGAL_DEFECT: { dir: "out", line: "legalDefect" },
  OTHER_OUT: { dir: "out", line: "other" },
};

const DEBT_LINE: Record<DebtType, OutLine> = {
  NATIONAL_TAX: "tax",
  LOCAL_TAX: "tax",
  CONSTRUCTION: "construction",
  FINANCE: "finance",
  OPEX: "opex",
  OTHER: "other",
};

const EXPENSE_LINE: Record<string, OutLine> = {
  LAND: "other",
  CONSTRUCTION: "construction",
  DESIGN: "other",
  AGENCY_FEE: "salesCost",
  AD: "salesCost",
  FINANCE: "finance",
  TAX: "tax",
  OPERATION: "opex",
  BUILDING_MGMT: "opex",
  DEFECT: "legalDefect",
  LEGAL: "legalDefect",
  OTHER: "other",
};

export interface CashflowOptions {
  scenario: ScenarioKey;
  startMonth?: string;
  months?: number;
  assumptions?: Partial<ScenarioAssumptions>;
}

export function runCashflow(data: ProjectData, opts: CashflowOptions): CashflowResult {
  const st = data.settings;
  const asOf = st.base_date;
  const baseMonth = monthOf(asOf);
  const A: ScenarioAssumptions = { ...st.scenarios[opts.scenario], ...(opts.assumptions ?? {}) };
  const startMonth = opts.startMonth ?? st.cashflow_start;
  const count = Math.max(1, Math.min(120, opts.months ?? st.cashflow_months));
  const endMonth = addMonths(startMonth, count - 1);
  const warnings: string[] = [];

  // 엔진 계산 범위: 기초현금 기준월부터 종료월까지 (시작월 이전 구간은 결과에서 제외)
  let engineStart = st.opening_cash_month;
  if (startMonth < engineStart) {
    warnings.push(`조회 시작월(${startMonth})이 기초현금 기준월(${engineStart})보다 빠릅니다. ${engineStart}부터 계산합니다.`);
  }
  if (endMonth < engineStart) engineStart = startMonth;
  const total = monthDiff(engineStart, endMonth) + 1;
  const months: CashMonth[] = [];
  const idx = new Map<string, number>();
  for (let i = 0; i < total; i++) {
    const m = addMonths(engineStart, i);
    idx.set(m, i);
    months.push({
      month: m,
      kind: m < baseMonth ? "ACTUAL" : "FORECAST",
      opening: 0,
      in: zeroIn(),
      out: zeroOut(),
      inTotal: 0,
      outTotal: 0,
      net: 0,
      ending: 0,
      belowMin: false,
      shortage: 0,
      debtPrincipalPaid: 0,
      debtBalanceEnd: 0,
      newUnits: 0,
      newRevenue: 0,
      newDiscount: 0,
      details: [],
    });
  }
  const at = (m: string) => {
    const i = idx.get(m);
    return i === undefined ? undefined : months[i];
  };
  const addIn = (m: string, line: InLine, amt: number, label?: string) => {
    const row = at(m);
    if (!row || !amt) return;
    row.in[line] += amt;
    if (label) row.details.push({ line, label, amount: amt });
  };
  const addOut = (m: string, line: OutLine, amt: number, label?: string) => {
    const row = at(m);
    if (!row || !amt) return;
    row.out[line] += amt;
    if (label) row.details.push({ line, label, amount: -amt });
  };
  const clampFuture = (m: string) => (m < baseMonth ? baseMonth : m);

  const futureIn = { existingNonResale: 0, existingResale: 0, newSales: 0, rent: 0, other: 0, deferralInterest: 0 };
  const postCompletion = (date: string) => date >= st.completion_date;
  const contractById = new Map(data.contracts.map((c) => [c.id, c]));

  // ---------- 1) 수납 실적 (기준일까지) ----------
  for (const p of data.payments) {
    if (p.paid_date > asOf) continue;
    const m = monthOf(p.paid_date);
    const c = contractById.get(p.contract_id);
    const isNew = !!c && (c.is_resale === 1 || postCompletion(c.contract_date));
    switch (p.pay_type) {
      case "DEPOSIT":
        addIn(m, isNew ? "newSales" : "deposit", p.amount);
        break;
      case "MIDDLE":
        addIn(m, isNew ? "newSales" : "middle", p.amount);
        break;
      case "BALANCE":
        addIn(m, isNew ? "newSales" : "balance", p.amount);
        break;
      case "DEFERRAL":
        addIn(m, "deferral", p.amount);
        break;
      case "LATE_FEE":
        addIn(m, "other", p.amount);
        break;
      case "REFUND":
        addOut(m, "refund", -p.amount);
        break;
    }
  }
  // 수기 실적 (기준월 포함 이전)
  for (const e of data.cfActuals) {
    if (e.month > baseMonth) continue;
    const map = ACCOUNT_LINE[e.account];
    if (map.dir === "in") addIn(e.month, map.line as InLine, e.amount);
    else addOut(e.month, map.line as OutLine, e.amount);
  }

  // ---------- 2) 기존 계약 잔여 수납 예측 ----------
  const calcs = calcAllContracts(data.contracts, data.payments, data.deferrals, asOf);
  const recByContract = new Map(data.receivables.filter((r) => r.status === "OPEN").map((r) => [r.contract_id, r]));
  let uncollectible = 0;
  const rate = Math.max(0, Math.min(100, A.collectionRate)) / 100;
  const pendingByMonth = new Map<string, number>(); // 기간 말 미회수 계산용
  const scheduleExisting = (m: string, line: InLine, amt: number, resale: boolean, label: string) => {
    if (amt <= 0) return;
    if (m > endMonth) {
      pendingByMonth.set(m, (pendingByMonth.get(m) ?? 0) + amt);
      return;
    }
    addIn(m, line, amt, label);
    if (resale) futureIn.existingResale += amt;
    else futureIn.existingNonResale += amt;
  };
  for (const cc of calcs) {
    if (!cc.activeAsOf || cc.outstanding <= 0) continue;
    const c = cc.contract;
    const isNew = c.is_resale === 1 || postCompletion(c.contract_date);
    const resale = c.is_resale === 1;
    // 계약금·중도금 미납분
    const depUnpaid = Math.max(0, c.deposit_amount - cc.paidDeposit);
    const midUnpaid = Math.max(0, c.middle_amount - cc.paidMiddle);
    if (depUnpaid > 0) scheduleExisting(addMonths(baseMonth, A.collectionDelay), isNew ? "newSales" : "deposit", depUnpaid, resale, `${c.id} 계약금 미납분`);
    if (midUnpaid > 0) scheduleExisting(addMonths(baseMonth, A.collectionDelay), isNew ? "newSales" : "middle", midUnpaid, resale, `${c.id} 중도금 미납분`);

    // 유예금
    const deferredTotal = sum(cc.deferrals, (d) => d.deferred_amount);
    for (const d of cc.deferrals) {
      const paid = sum(
        data.payments.filter((p) => p.deferral_id === d.id && p.paid_date <= asOf),
        (p) => p.amount,
      );
      const out = Math.max(0, d.deferred_amount - paid);
      if (out <= 0) continue;
      const mm = monthOf(d.maturity_date);
      const interest = Math.round((out * (d.interest_rate / 100) * Math.max(0, monthDiff(monthOf(d.start_date), mm))) / 12);
      if (mm >= baseMonth) {
        const target = addMonths(mm, Math.max(0, A.collectionDelay - 1));
        scheduleExisting(target, "deferral", out, resale, `${c.id} 유예금 만기회수`);
        if (interest > 0 && target <= endMonth) {
          addIn(target, "other", interest, `${c.id} 유예이자`);
          futureIn.deferralInterest += interest;
        }
      } else {
        // 만기 경과 미상환 → 연체 미수와 동일하게 회수율·분산 적용
        const coll = Math.round(out * rate);
        uncollectible += out - coll;
        spread(coll, "deferral", resale, `${c.id} 만기경과 유예금`);
      }
    }

    // 잔금(유예분 제외)
    const balUnpaid = Math.max(0, c.balance_amount - deferredTotal - cc.paidBalance);
    if (balUnpaid <= 0) continue;
    const line: InLine = isNew ? "newSales" : "balance";
    const dueFuture = !!c.balance_due_date && c.balance_due_date > asOf;
    if (dueFuture) {
      // 납부기한 미도래: 약정 일정대로 회수(보수 시나리오는 지연 반영)
      const m = clampFuture(addMonths(monthOf(c.balance_due_date!), Math.max(0, A.collectionDelay - 1)));
      scheduleExisting(m, line, balUnpaid, resale, `${c.id} 잔금(약정)`);
      continue;
    }
    const rec = recByContract.get(c.id);
    let remaining = balUnpaid;
    if (rec && rec.expected_amount > 0 && rec.expected_date) {
      const planned = Math.min(rec.expected_amount, remaining);
      const m = clampFuture(addMonths(monthOf(rec.expected_date), A.collectionDelay));
      const coll = Math.round(planned * Math.max(rate, 0.9)); // 약정분은 회수 확률 가중(최소 90%)
      uncollectible += planned - coll;
      scheduleExisting(m, line, coll, resale, `${c.id} 납부약정`);
      remaining -= planned;
    }
    if (remaining > 0) {
      const coll = Math.round(remaining * rate);
      uncollectible += remaining - coll;
      spread(coll, line, resale, `${c.id} 연체잔금 분산회수`);
    }
  }
  function spread(amount: number, line: InLine, resale: boolean, label: string) {
    const n = Math.max(1, A.unplannedCollectionMonths);
    const first = addMonths(baseMonth, 1 + A.collectionDelay);
    let left = amount;
    for (let i = 0; i < n; i++) {
      const amt = i === n - 1 ? left : Math.round(amount / n);
      left -= amt;
      scheduleExisting(addMonths(first, i), line, amt, resale, i === 0 ? label : "");
    }
  }

  // ---------- 3) 미분양 판매 (시나리오) ----------
  const activeAssetIds = new Set(calcs.filter((c) => c.activeAsOf).map((c) => c.contract.asset_id));
  const unsold = data.assets.filter((a) => a.is_sale_target && !activeAssetIds.has(a.id)).sort((a, b) => a.id.localeCompare(b.id));
  const queues = {
    OFFICETEL: unsold.filter((a) => a.facility_type === "OFFICETEL"),
    RETAIL: unsold.filter((a) => a.facility_type === "RETAIL"),
  };
  const soldMonthByAsset = new Map<string, string>();
  let newSalesRevenue = 0;
  let newSalesUnits = 0;
  let newSalesDiscount = 0;
  let newSalesPendingEnd = 0;
  const salesStart = addMonths(baseMonth, A.salesStartDelay);
  for (const [type, perMonth] of [
    ["OFFICETEL", A.officetelUnitsPerMonth],
    ["RETAIL", A.retailUnitsPerMonth],
  ] as const) {
    const q = queues[type];
    let soldCount = 0;
    for (let i = 0; monthDiff(salesStart, addMonths(salesStart, i)) >= 0; i++) {
      const m = addMonths(salesStart, i);
      if (m > endMonth || soldCount >= q.length) break;
      const target = Math.min(q.length, Math.floor(perMonth * (i + 1) + 1e-9));
      while (soldCount < target) {
        const a = q[soldCount++];
        const price = Math.round(a.current_price * (1 - A.discountRate / 100));
        const dep = Math.round(price * (A.depositRate / 100));
        const def = Math.round(price * (A.deferralRate / 100));
        const bal = price - dep - def;
        const balMonth = addMonths(m, A.balanceLagMonths);
        const defMonth = addMonths(balMonth, A.deferralMonths);
        soldMonthByAsset.set(a.id, m);
        newSalesRevenue += price;
        newSalesUnits++;
        newSalesDiscount += a.list_price - price;
        const row = at(m)!;
        row.newUnits++;
        row.newRevenue += price;
        row.newDiscount += a.list_price - price;
        addIn(m, "newSales", dep, `${a.id} 신규판매 계약금`);
        futureIn.newSales += dep;
        if (balMonth <= endMonth) {
          addIn(balMonth, "newSales", bal, `${a.id} 신규판매 잔금`);
          futureIn.newSales += bal;
        } else newSalesPendingEnd += bal;
        if (def > 0) {
          if (defMonth <= endMonth) {
            addIn(defMonth, "deferral", def, `${a.id} 신규판매 유예금`);
            futureIn.newSales += def;
          } else newSalesPendingEnd += def;
        }
        addOut(m, "salesCost", Math.round(price * (A.agencyFeeRate / 100)), `${a.id} 분양대행수수료`);
      }
    }
  }
  const unsoldUnitsEnd = unsold.length - newSalesUnits;
  // 광고비: 재고가 남아있는 판매기간 동안
  {
    let remaining = unsold.length;
    for (const row of months) {
      if (row.kind !== "FORECAST" || row.month < salesStart) continue;
      if (remaining > 0) addOut(row.month, "salesCost", A.monthlyAdCost);
      remaining -= row.newUnits;
    }
  }

  // ---------- 4) 임대수입 (사업주체 귀속) ----------
  const devLeases = data.leases.filter(
    (l) => l.income_recipient === "DEVELOPER" && (l.negotiation_status === "CONTRACTED" || l.negotiation_status === "OPEN") && l.start_date,
  );
  for (const row of months) {
    if (row.kind !== "FORECAST") continue;
    if (row.month === baseMonth && data.cfActuals.some((e) => e.month === baseMonth && e.account === "RENT")) continue;
    let rent = 0;
    for (const l of devLeases) {
      const startM = monthOf(l.start_date!);
      const rentStart = addMonths(startM, l.rent_free_months);
      const endM = l.end_date ? monthOf(l.end_date) : "9999-12";
      const soldM = soldMonthByAsset.get(l.asset_id);
      if (row.month >= rentStart && row.month <= endM && (!soldM || row.month <= soldM)) rent += l.monthly_rent;
    }
    if (rent) {
      addIn(row.month, "rent", rent);
      futureIn.rent += rent;
    }
  }
  // 신규 임대(보유 공실)
  {
    const leasedIds = new Set(
      data.leases.filter((l) => ["CONTRACTED", "OPEN"].includes(l.negotiation_status)).map((l) => l.asset_id),
    );
    const ownedVacant = unsold.filter((a) => a.leasable && !leasedIds.has(a.id));
    const leasedHist: number[] = [];
    let leased = 0;
    let fi = 0;
    for (const row of months) {
      if (row.kind !== "FORECAST") continue;
      const vacantArea = sum(
        ownedVacant.filter((a) => {
          const sm = soldMonthByAsset.get(a.id);
          return !sm || sm > row.month;
        }),
        (a) => a.exclusive_area,
      );
      leased = Math.min(vacantArea, leased + A.leaseUpSqmPerMonth);
      leasedHist.push(leased);
      const rentArea = fi - A.rentFreeMonths >= 0 ? Math.min(leasedHist[fi - A.rentFreeMonths], vacantArea) : 0;
      const rent = Math.round(rentArea * A.rentPerSqm);
      if (rent > 0) {
        addIn(row.month, "rent", rent, "보유 공실 신규임대(가정)");
        futureIn.rent += rent;
      }
      fi++;
    }
  }

  // ---------- 5) 운영비·사업비 예정·법률/하자·수기 예상 ----------
  // 기준월에 수기 실적이 이미 입력된 계정은 예측을 중복 반영하지 않음
  const baseActualAccounts = new Set(data.cfActuals.filter((e) => e.month === baseMonth).map((e) => e.account));
  for (const row of months) {
    if (row.kind !== "FORECAST") continue;
    if (row.month === baseMonth && baseActualAccounts.has("OPEX")) continue;
    addOut(row.month, "opex", A.monthlyOpex);
  }
  for (const e of data.expenses) {
    if (e.planned_amount > 0) {
      const m = clampFuture(e.planned_month ?? baseMonth);
      addOut(m, EXPENSE_LINE[e.category] ?? "other", e.planned_amount, `사업비 예정: ${e.item}`);
    }
  }
  for (const r of data.risks) {
    if (r.status === "CLOSED" || r.expected_cost <= 0) continue;
    const m = clampFuture(r.cost_month ?? (r.next_action_date ? monthOf(r.next_action_date) : addMonths(baseMonth, 1)));
    addOut(m, "legalDefect", r.expected_cost, `${r.id} ${r.title}`);
  }
  for (const i of data.issues) {
    if (i.cost_bearer !== "DEVELOPER" || i.stage === "DONE" || i.cost <= 0) continue;
    const m = clampFuture(i.planned_date ? monthOf(i.planned_date) : addMonths(baseMonth, 1));
    addOut(m, "legalDefect", i.cost, `${i.id} 하자보수(사업주체 부담)`);
  }
  for (const f of data.cfForecasts) {
    if (f.month < baseMonth) continue;
    if (f.scenario && f.scenario !== "ALL" && f.scenario !== opts.scenario) continue;
    const map = ACCOUNT_LINE[f.account];
    if (map.dir === "in") {
      addIn(f.month, map.line as InLine, f.amount, f.note ?? "수기 예상");
      futureIn.other += map.line === "rent" ? 0 : f.amount;
      if (map.line === "rent") futureIn.rent += f.amount;
    } else addOut(f.month, map.line as OutLine, f.amount, f.note ?? "수기 예상");
  }

  // ---------- 6) 채무 상환 ----------
  type DebtState = { id: string; type: DebtType; creditor: string; priority: number; rate: number; remaining: number; principalLeft: number; start: number; paid: number; plans: Map<string, number> };
  const debts: DebtState[] = data.debts.map((d) => {
    const reps = data.repayments.filter((r) => r.debt_id === d.id);
    const total = d.principal + d.interest_penalty;
    const plans = new Map<string, number>();
    for (const r of reps.filter((r) => r.kind === "PLAN")) plans.set(r.month, (plans.get(r.month) ?? 0) + r.amount);
    return { id: d.id, type: d.debt_type, creditor: d.creditor, priority: d.priority, rate: d.interest_rate, remaining: total, principalLeft: d.principal, start: 0, paid: 0, plans };
  });
  const debtById = new Map(debts.map((d) => [d.id, d]));
  // 실적 상환 반영
  const actualRepByMonth = new Map<string, { debt: DebtState; amount: number }[]>();
  for (const r of data.repayments) {
    if (r.kind !== "ACTUAL") continue;
    const d = debtById.get(r.debt_id);
    if (!d) continue;
    if (r.month > baseMonth) continue;
    const arr = actualRepByMonth.get(r.month) ?? [];
    arr.push({ debt: d, amount: r.amount });
    actualRepByMonth.set(r.month, arr);
  }
  // 엔진 시작 이전 실적은 잔액에서만 차감
  for (const [m, arr] of actualRepByMonth) {
    if (m < engineStart) for (const x of arr) applyPay(x.debt, x.amount);
  }
  function applyPay(d: DebtState, amt: number) {
    d.remaining = Math.max(0, d.remaining - amt);
    d.principalLeft = Math.max(0, d.principalLeft - amt);
  }
  // 월·계정별 채무 상환액(원금·가산금) — 사업수지 비용 산정 시 제외
  const principalByLine: Record<string, Record<OutLine, number>> = {};
  for (const row of months) principalByLine[row.month] = zeroOut();
  const repayOut = (m: string, d: DebtState, amt: number, label?: string) => {
    addOut(m, DEBT_LINE[d.type], amt, label);
    principalByLine[m][DEBT_LINE[d.type]] += amt;
    applyPay(d, amt);
  };

  const minCash = st.min_cash ?? 0;
  let opening = st.opening_cash;
  let debtBalanceStart = 0;
  let debtPayoffMonth: string | null = null;
  let interestTotal = 0;
  let futureDebtPrincipal = 0;

  for (const row of months) {
    row.opening = opening;
    if (row.month === baseMonth) debtBalanceStart = sum(debts, (d) => d.remaining);
    // 실적 상환
    for (const x of actualRepByMonth.get(row.month) ?? []) {
      repayOut(row.month, x.debt, x.amount);
      row.debtPrincipalPaid += x.amount;
    }
    if (row.kind === "FORECAST") {
      // 이자 (금융채무 잔여원금 × 연이율/12) — 기준월 이후
      for (const d of debts) {
        if (d.rate > 0 && d.principalLeft > 0) {
          const interest = Math.round((d.principalLeft * d.rate) / 100 / 12);
          addOut(row.month, "finance", interest, `${d.id} 이자`);
          interestTotal += interest;
        }
      }
      // 상환계획 (기준월은 이미 실적 처리된 금액만큼 차감)
      for (const d of debts) {
        let plan = d.plans.get(row.month) ?? 0;
        if (row.month === baseMonth) plan = Math.max(0, plan - sum(actualRepByMonth.get(row.month)?.filter((x) => x.debt === d) ?? [], (x) => x.amount));

        const pay = Math.min(plan, d.remaining);
        if (pay > 0) {
          repayOut(row.month, d, pay, `${d.id} 상환계획`);
          row.debtPrincipalPaid += pay;
          futureDebtPrincipal += pay;
        }
      }
    }
    const inTotal = sum(IN_LINES as unknown as InLine[], (k) => row.in[k]);
    let outTotal = sum(OUT_LINES as unknown as OutLine[], (k) => row.out[k]);
    // 잉여현금 우선순위 자동상환
    if (row.kind === "FORECAST" && A.autoRepay) {
      // 향후 3개월 상환계획액은 유보 후 잉여분만 우선순위 상환
      let reserve = 0;
      for (const d of debts) for (let k = 1; k <= 3; k++) reserve += Math.min(d.plans.get(addMonths(row.month, k)) ?? 0, d.remaining);
      let surplus = opening + inTotal - outTotal - minCash - reserve;
      if (surplus > 0) {
        for (const d of [...debts].sort((a, b) => a.priority - b.priority)) {
          if (surplus <= 0) break;
          if (d.remaining <= 0) continue;
          const pay = Math.min(d.remaining, surplus);
          repayOut(row.month, d, pay, `${d.id} 잉여현금 우선상환`);
          row.debtPrincipalPaid += pay;
          futureDebtPrincipal += pay;
          surplus -= pay;
        }
        outTotal = sum(OUT_LINES as unknown as OutLine[], (k) => row.out[k]);
      }
    }
    row.inTotal = inTotal;
    row.outTotal = outTotal;
    row.net = inTotal - outTotal;
    row.ending = opening + row.net;
    row.belowMin = row.ending < minCash;
    row.shortage = row.ending < 0 ? -row.ending : 0;
    row.debtBalanceEnd = sum(debts, (d) => d.remaining);
    if (row.kind === "FORECAST" && debtPayoffMonth === null && row.debtBalanceEnd <= 0) debtPayoffMonth = row.month;
    opening = row.ending;
  }

  // 사업수지 연동용 비용성 유출 = 예측월 유출 − 채무 상환액(미지급 채무로 이미 계상) − 해지환급(수입 차감 항목)
  const futureCostByLine = zeroOut();
  for (const row of months) {
    if (row.kind !== "FORECAST") continue;
    for (const k of OUT_LINES) futureCostByLine[k] += row.out[k] - principalByLine[row.month]?.[k];
  }
  futureCostByLine.refund = 0;

  const view = months.filter((m) => m.month >= startMonth && m.month <= endMonth);
  const startOpening = view[0]?.opening ?? st.opening_cash;
  const forecastView = view.filter((m) => m.kind === "FORECAST");
  let minEnding = Infinity;
  let minEndingMonth: string | null = null;
  for (const m of view) {
    if (m.ending < minEnding) {
      minEnding = m.ending;
      minEndingMonth = m.month;
    }
  }
  if (!Number.isFinite(minEnding)) minEnding = 0;

  const receivableExisting = sum([...pendingByMonth.values()], (v) => v);
  const unplannedDebts = debts.filter((d) => d.remaining > 0);
  if (unplannedDebts.length) warnings.push(`기간 말 미상환 채무 ${unplannedDebts.length}건 (잔액 합계 ${Math.round(sum(unplannedDebts, (d) => d.remaining) / 1e8).toLocaleString()}억원)`);
  if (minEnding < 0) warnings.push(`현금부족 발생: 최저 기말현금 ${Math.round(minEnding / 1e8).toLocaleString()}억원 (${minEndingMonth})`);

  return {
    scenario: opts.scenario,
    assumptions: A,
    months: view,
    startOpening,
    summary: {
      inTotal: sum(forecastView, (m) => m.inTotal),
      outTotal: sum(forecastView, (m) => m.outTotal),
      minEnding,
      minEndingMonth,
      shortageMonths: view.filter((m) => m.ending < 0).map((m) => m.month),
      belowMinMonths: view.filter((m) => m.belowMin).map((m) => m.month),
      requiredFunding: Math.max(0, -minEnding),
      requiredFundingMinCash: Math.max(0, minCash - minEnding),
      endingCash: view[view.length - 1]?.ending ?? 0,
      newSalesRevenue,
      newSalesUnits,
      newSalesDiscount,
      salesCollections: sum(forecastView, (m) => m.in.deposit + m.in.middle + m.in.balance + m.in.newSales + m.in.deferral),
      debtBalanceStart,
      debtBalanceEnd: sum(debts, (d) => d.remaining),
      debtPayoffMonth,
      receivableEnd: receivableExisting + newSalesPendingEnd,
      uncollectible,
      unsoldUnitsEnd,
      rentTotal: sum(forecastView, (m) => m.in.rent),
      interestTotal,
    },
    debtEnd: debts.map((d) => {
      const orig = data.debts.find((x) => x.id === d.id)!;
      return { id: d.id, type: d.type, creditor: d.creditor, start: orig.principal + orig.interest_penalty, end: d.remaining, paid: orig.principal + orig.interest_penalty - d.remaining };
    }),
    warnings,
    futureCostByLine,
    futureDebtPrincipal,
    futureIn,
  };
}

export function runAllScenarios(data: ProjectData, opts: Omit<CashflowOptions, "scenario"> = {}) {
  return (["CONS", "BASE", "OPT"] as ScenarioKey[]).map((s) => runCashflow(data, { ...opts, scenario: s }));
}
