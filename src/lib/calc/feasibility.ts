// 사업수지(손익) 분석 — 현금흐름 엔진 결과와 연동하여 중복 집계를 방지
//  · 수입: 기수납(재판매 제외) / 재판매 / 미수금 회수예정 / 미분양 판매예정(발생주의) / 임대 / 기타
//  · 비용: 기집행(엑셀 기준 장부 + 현금흐름 실적) / 미지급(채무 잔액) / 향후 예정(현금흐름 예측의 비용성 유출)
//  · 금융채무(PF 등) 원금은 비용이 아니므로 제외하고 이자·가산금만 반영
import type { ExpenseCategory } from "../types";
import { DEBT_TO_EXPENSE, EXPENSE_CATEGORY_LABEL } from "../types";
import type { ProjectData } from "./data";
import type { CashflowResult, OutLine } from "./cashflow";
import { debtStats } from "./analytics";
import { monthOf, sum } from "../format";

const CASH_ACCOUNT_TO_EXPENSE: Record<string, ExpenseCategory> = {
  TAX: "TAX",
  CONSTRUCTION: "CONSTRUCTION",
  FINANCE: "FINANCE",
  SALES_COST: "AD",
  OPEX: "OPERATION",
  LEGAL_DEFECT: "LEGAL",
  OTHER_OUT: "OTHER",
};
const LINE_TO_EXPENSE: Record<OutLine, ExpenseCategory | null> = {
  tax: "TAX",
  construction: "CONSTRUCTION",
  finance: "FINANCE",
  salesCost: "AGENCY_FEE",
  opex: "OPERATION",
  legalDefect: "LEGAL",
  refund: null,
  other: "OTHER",
};

export interface FeasibilityRow {
  category: ExpenseCategory;
  label: string;
  budget: number;
  executed: number;
  unpaid: number;
  future: number;
  total: number;
  variance: number; // 계획 대비 증감 (total − budget)
}

export interface FeasibilityResult {
  revenue: { key: string; label: string; amount: number; note: string }[];
  revenueTotal: number;
  costs: FeasibilityRow[];
  costTotal: number;
  budgetTotal: number;
  profit: number;
  profitRate: number;
  discountLoss: number;
  cashVsProfit: { label: string; amount: number }[];
}

export function runFeasibility(data: ProjectData, cf: CashflowResult): FeasibilityResult {
  const asOf = data.settings.base_date;
  const baseMonth = monthOf(asOf);
  const contractById = new Map(data.contracts.map((c) => [c.id, c]));
  const paid = data.payments.filter((p) => p.paid_date <= asOf);
  // 엔진의 예측구간은 항상 기준월부터 시작 — 기준월 이전 = 실적, 기준월 당월 수납도 수입에 포함(중복 없음)
  const isPrincipal = (t: string) => ["DEPOSIT", "MIDDLE", "BALANCE", "DEFERRAL", "REFUND"].includes(t);
  const forecastStart = baseMonth;
  const before = paid.filter((p) => monthOf(p.paid_date) < forecastStart);
  const inForecastMonthActual = paid.filter((p) => monthOf(p.paid_date) >= forecastStart);

  const collectedNonResale = sum(before.filter((p) => isPrincipal(p.pay_type) && !contractById.get(p.contract_id)?.is_resale), (p) => p.amount);
  const collectedResale = sum(before.filter((p) => isPrincipal(p.pay_type) && contractById.get(p.contract_id)?.is_resale), (p) => p.amount);
  const lateFees = sum(before.filter((p) => p.pay_type === "LATE_FEE"), (p) => p.amount);
  const curMonthNonResale = sum(inForecastMonthActual.filter((p) => isPrincipal(p.pay_type) && !contractById.get(p.contract_id)?.is_resale), (p) => p.amount);
  const curMonthResale = sum(inForecastMonthActual.filter((p) => isPrincipal(p.pay_type) && contractById.get(p.contract_id)?.is_resale), (p) => p.amount);
  const curMonthLate = sum(inForecastMonthActual.filter((p) => p.pay_type === "LATE_FEE"), (p) => p.amount);

  const rentActual = sum(data.cfActuals.filter((e) => e.account === "RENT" && e.month < forecastStart), (e) => e.amount);
  const otherActual = sum(data.cfActuals.filter((e) => e.account === "OTHER_IN" && e.month < forecastStart), (e) => e.amount);
  const fi = cf.futureIn;

  // 발생주의: 신규판매는 계약금액 전액(현금 미회수분 포함)을 수익으로 인식
  const revenue = [
    { key: "collected", label: "기수납 분양대금(재판매 제외)", amount: collectedNonResale + curMonthNonResale, note: "payments 순수납(해지환급 차감), 당월 수납 포함" },
    { key: "resale", label: "재판매 수입", amount: collectedResale + curMonthResale + fi.existingResale, note: "재판매 계약 기수납 + 회수예정" },
    { key: "receivable", label: "미수금 회수예정액", amount: fi.existingNonResale, note: `회수율 ${cf.assumptions.collectionRate}% 가정, 미회수 ${Math.round(cf.summary.uncollectible / 1e8)}억원 제외` },
    { key: "newSales", label: "미분양 판매예정액", amount: cf.summary.newSalesRevenue, note: `${cf.summary.newSalesUnits}호, 할인율 ${cf.assumptions.discountRate}% (계약금액 기준)` },
    { key: "rent", label: "임대수입(사업주체 귀속)", amount: rentActual + fi.rent, note: "실적 + 예측기간" },
    { key: "other", label: "기타 수입", amount: lateFees + curMonthLate + otherActual + fi.other + fi.deferralInterest, note: "연체료·유예이자·기타유입" },
  ];
  // 미분양 판매예정은 계약액 전액을 인식하므로, 같은 신규판매의 현금유입(fi.newSales)은 중복 인식하지 않음
  const revenueTotal = sum(revenue, (r) => r.amount);

  // ---------- 비용 ----------
  const ds = debtStats(data, asOf);
  const cats = Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[];
  const rows: FeasibilityRow[] = cats.map((cat) => {
    const ex = data.expenses.filter((e) => e.category === cat);
    const budget = sum(ex, (e) => e.budget_amount);
    // 기집행 = 장부 기집행(기초현금 기준월 이전) + 현금흐름 실적 유출(기초월~예측 시작 전) + 채무 상환실적(금융 원금 제외)
    const cashActual = sum(
      data.cfActuals.filter((e) => e.month < forecastStart && CASH_ACCOUNT_TO_EXPENSE[e.account] === cat),
      (e) => e.amount,
    );
    let debtPaid = 0;
    let unpaid = 0;
    for (const r of ds.rows) {
      if (DEBT_TO_EXPENSE[r.debt.debt_type] !== cat) continue;
      const repsBefore = sum(
        data.repayments.filter((x) => x.debt_id === r.debt.id && x.kind === "ACTUAL" && x.month < forecastStart),
        (x) => x.amount,
      );
      const total = r.debt.principal + r.debt.interest_penalty;
      const remainingAtForecast = Math.max(0, total - repsBefore);
      if (r.debt.debt_type === "FINANCE") {
        // 차입원금은 비용 아님 — 이자·가산금 미지급분만 비용
        unpaid += Math.max(0, r.debt.interest_penalty - Math.max(0, repsBefore - r.debt.principal));
      } else {
        debtPaid += repsBefore;
        unpaid += remainingAtForecast;
      }
    }
    const executed = sum(ex, (e) => e.executed_amount) + cashActual + debtPaid;
    let future = 0;
    for (const [line, c] of Object.entries(LINE_TO_EXPENSE)) if (c === cat) future += cf.futureCostByLine[line as OutLine] ?? 0;
    const total = executed + unpaid + future;
    return { category: cat, label: EXPENSE_CATEGORY_LABEL[cat], budget, executed, unpaid, future, total, variance: total - budget };
  });
  const costTotal = sum(rows, (r) => r.total);
  const budgetTotal = sum(rows, (r) => r.budget);
  const profit = revenueTotal - costTotal;

  const discountLoss =
    sum(data.contracts.filter((c) => c.status !== "TERMINATED" && c.contract_date <= asOf), (c) => c.discount_amount) + cf.summary.newSalesDiscount;

  return {
    revenue,
    revenueTotal,
    costs: rows,
    costTotal,
    budgetTotal,
    profit,
    profitRate: revenueTotal > 0 ? (profit / revenueTotal) * 100 : 0,
    discountLoss,
    cashVsProfit: [
      { label: "기간 말 미회수 분양대금(손익 인식, 현금 미유입)", amount: cf.summary.receivableEnd },
      { label: "회수율 가정상 미회수(손익·현금 모두 제외)", amount: cf.summary.uncollectible },
      { label: "기간 말 미상환 채무(현금 유출 미발생)", amount: cf.summary.debtBalanceEnd },
      { label: "누적 할인손실(최초 분양가 대비)", amount: discountLoss },
    ],
  };
}
