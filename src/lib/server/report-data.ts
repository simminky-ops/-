import "server-only";
// PART A 사업계획서 전용 DTO — 서버에서 역할별로 비식별·지수화한 집계값만 생성
//  · 외부 보고자(EXTERNAL) + 금액공개 미승인: 모든 절대금액(원)을 지수(총 공급예정금액=100)로 변환
//  · 외부 보고자: 자산/계약 ID, 인명·임차인명, 채권자명, 행 단위 데이터 미포함 (집계만)
//  · 내부 사용자: 원 단위 금액(화면에서 원/만원/억원 전환)
import { getSnapshot } from "./snapshot";
import { canRead } from "../rbac";
import { kpiStatus } from "../calc/analytics";
import { IN_LABEL, OUT_LABEL, IN_LINES, OUT_LINES } from "../calc/cashflow";
import { DEBT_TYPE_LABEL, PRIORITY_LABEL, RISK_STATUS_LABEL, type ScenarioKey, type SessionUser } from "../types";
import { ENTITIES } from "../entities";
import { monthlySales } from "../calc/analytics";
import { monthOf, sum } from "../format";

export type AmountMode = "amount" | "index";
export const INDEX_LABEL = "지수(총 공급예정금액=100)";

const SC: ScenarioKey[] = ["CONS", "BASE", "OPT"];
const SC_LABEL: Record<ScenarioKey, string> = { CONS: "보수적", BASE: "기준", OPT: "낙관적" };

export function getReportData(user: SessionUser) {
  const snap = getSnapshot();
  const { data, values, kpis, cf, feas } = snap;
  const st = data.settings;
  const external = user.role === "EXTERNAL";
  const mode: AmountMode = external && !st.external_show_amounts ? "index" : "amount";
  const base = values.s.totalList || 1;
  /** 금액 변환: index 모드는 총 공급예정금액 대비 지수(소수 1자리) */
  const A = (v: number | null | undefined): number => {
    const n = Number(v ?? 0);
    if (mode === "amount") return Math.round(n);
    return Math.round((n / base) * 1000) / 10;
  };

  const s = values.s;
  const c = values.c;
  const l = values.l;
  const d = values.d;

  // ---------- KPI ----------
  const kpiList = kpis.map((k) => ({
    key: k.key,
    label: k.label,
    unit: k.unit,
    value: k.unit === "원" ? A(k.value) : Math.round(k.value * 10) / 10,
    prev: k.prev === null ? null : k.unit === "원" ? A(k.prev) : Math.round(k.prev * 10) / 10,
    target: k.target === null ? null : k.unit === "원" ? A(k.target) : k.target,
    status: kpiStatus(k),
    higherIsBetter: k.higherIsBetter,
    formula: k.formula,
  }));

  // ---------- 분양 ----------
  const unsoldUnits = s.total - s.sold;
  const sale = {
    total: s.total,
    sold: s.sold,
    unsoldUnits,
    saleRate: s.saleRate,
    amountRate: s.amountRate,
    unsoldRate: s.unsoldRate,
    officetel: s.officetel,
    retail: s.retail,
    totalList: A(s.totalList),
    contractedSupply: A(s.contractedSupply),
    unsoldValue: A(s.unsoldValue),
    discountTotal: A(sum(data.contracts.filter((x) => x.status !== "TERMINATED"), (x) => x.discount_amount)),
    resaleCount: data.contracts.filter((x) => x.is_resale && x.status !== "TERMINATED").length,
    terminatedCount: data.contracts.filter((x) => x.status === "TERMINATED").length,
    postCompletionSales: data.contracts.filter((x) => x.contract_date >= st.completion_date && !x.is_resale).length,
  };
  const views = values.views;
  const floorSale = [...new Set(views.map((v) => `${v.facility_type}|${v.floor}`))]
    .map((k) => {
      const [t, f] = k.split("|");
      const vs = views.filter((v) => v.facility_type === t && String(v.floor) === f);
      const sold = vs.filter((v) => v.sale_state !== "UNSOLD").length;
      return { type: t, floor: Number(f), units: vs.length, sold, rate: vs.length ? (sold / vs.length) * 100 : 0 };
    })
    .sort((a, b) => (a.type === b.type ? a.floor - b.floor : a.type === "RETAIL" ? -1 : 1));
  const otBands = [
    { name: "4~8층", min: 4, max: 8 },
    { name: "9~13층", min: 9, max: 13 },
    { name: "14~18층", min: 14, max: 18 },
  ].map((b) => {
    const rows = floorSale.filter((r) => r.type === "OFFICETEL" && r.floor >= b.min && r.floor <= b.max);
    const units = sum(rows, (r) => r.units);
    const sold = sum(rows, (r) => r.sold);
    return { name: `오피스텔 ${b.name}`, units, sold, rate: units ? (sold / units) * 100 : 0 };
  });
  const retailFloors = floorSale.filter((r) => r.type === "RETAIL").map((r) => ({ name: `근생 ${r.floor}층`, units: r.units, sold: r.sold, rate: r.rate }));
  const composition = (["OFFICETEL", "RETAIL"] as const).map((t) => {
    const as = data.assets.filter((a) => a.facility_type === t);
    const floors = as.map((a) => a.floor);
    return {
      type: t === "OFFICETEL" ? "오피스텔" : "근린생활시설",
      units: as.length,
      floors: as.length ? `${Math.min(...floors)}~${Math.max(...floors)}층` : "-",
      exArea: sum(as, (a) => a.exclusive_area),
      contractArea: sum(as, (a) => a.contract_area),
      avgEx: as.length ? sum(as, (a) => a.exclusive_area) / as.length : 0,
      listShare: (sum(as, (a) => a.list_price) / base) * 100,
      listTotal: A(sum(as, (a) => a.list_price)),
    };
  });
  const paySt = { OVERDUE: 0, DEFERRED: 0, NORMAL: 0, PAID: 0, NOT_DUE: 0 } as Record<string, number>;
  for (const v of views) if (v.pay_state in paySt) paySt[v.pay_state]++;

  const salesMonthly = monthlySales(data.contracts, "2026-01", monthOf(st.base_date)).map((r) => ({ period: r.period, newSale: r.newSale, resale: r.resale, terminated: r.terminated }));

  // ---------- 수납 ----------
  const collection = {
    billed: A(c.billed),
    collected: A(c.collected),
    unpaid: A(c.unpaid),
    overdue: A(c.overdue),
    deferred: A(c.deferred),
    lateFee: A(c.lateFee),
    totalOutstanding: A(c.totalOutstanding),
    collectionRate: c.collectionRate,
    receivableRate: c.receivableRate,
    overdueCount: c.overdueCount,
    deferredCount: c.deferredCount,
    payStates: paySt,
    collectedTotal: A(values.collectedTotal),
  };

  // ---------- 임대 ----------
  const lease = {
    leasable: l.leasable,
    leasedArea: l.leasedArea,
    rate: l.rate,
    vacancyRate: l.vacancyRate,
    byFloor: l.byFloor.map((f) => ({ floor: f.floor, area: f.area, leased: f.leased, rate: f.rate, units: f.units, leasedUnits: f.leasedUnits })),
    activeCount: l.activeCount,
    openCount: l.openCount,
    anchors: l.anchors,
    pipeline: l.pipeline,
    monthlyRent: A(l.monthlyRent),
    annualRent: A(l.annualRent),
    devAnnualRent: A(l.devAnnualRent),
    industryMix: l.industryMix.map((x) => ({ name: x.name, share: x.share })),
    expiringCount: l.expiring.length,
  };

  // ---------- 채무 ----------
  const byType = new Map<string, { type: string; principal: number; repaid: number; remaining: number; count: number }>();
  for (const r of d.rows) {
    const k = DEBT_TYPE_LABEL[r.debt.debt_type];
    const e = byType.get(k) ?? { type: k, principal: 0, repaid: 0, remaining: 0, count: 0 };
    e.principal += r.debt.principal + r.debt.interest_penalty;
    e.repaid += r.repaid;
    e.remaining += r.remaining;
    e.count++;
    byType.set(k, e);
  }
  const debt = {
    balance: A(d.balance),
    principal: A(d.principal),
    repaidPrincipal: A(d.repaidPrincipal),
    repayRate: d.repayRate,
    overdueCount: d.overdueCount,
    byType: [...byType.values()].map((x) => ({ type: x.type, principal: A(x.principal), repaid: A(x.repaid), remaining: A(x.remaining), count: x.count })).sort((a, b) => b.remaining - a.remaining),
    // 내부 전용: 채무별 상세(채권자는 이미 일반화된 명칭) / 외부: 미제공
    rows: external
      ? []
      : d.rows.map((r) => ({
          id: r.debt.id,
          type: DEBT_TYPE_LABEL[r.debt.debt_type],
          creditor: r.debt.creditor,
          priority: r.debt.priority,
          principal: A(r.debt.principal + r.debt.interest_penalty),
          repaid: A(r.repaid),
          remaining: A(r.remaining),
          due: r.debt.due_date,
          installment: r.debt.installment_status,
        })),
  };

  // ---------- 현금흐름 / 시나리오 ----------
  const scenarios = SC.map((k) => {
    const r = cf[k];
    const f = feas[k];
    const a = r.assumptions;
    return {
      key: k,
      label: SC_LABEL[k],
      assumptions: {
        officetelUnitsPerMonth: a.officetelUnitsPerMonth,
        retailUnitsPerMonth: a.retailUnitsPerMonth,
        discountRate: a.discountRate,
        deferralRate: a.deferralRate,
        deferralMonths: a.deferralMonths,
        collectionRate: a.collectionRate,
        collectionDelay: a.collectionDelay,
        leaseUpSqmPerMonth: a.leaseUpSqmPerMonth,
        salesStartDelay: a.salesStartDelay,
      },
      summary: {
        inTotal: A(r.summary.inTotal),
        outTotal: A(r.summary.outTotal),
        endingCash: A(r.summary.endingCash),
        minEnding: A(r.summary.minEnding),
        minEndingMonth: r.summary.minEndingMonth,
        shortageMonths: r.summary.shortageMonths,
        requiredFunding: A(r.summary.requiredFunding),
        newSalesRevenue: A(r.summary.newSalesRevenue),
        newSalesUnits: r.summary.newSalesUnits,
        newSalesDiscount: A(r.summary.newSalesDiscount),
        salesCollections: A(r.summary.salesCollections),
        debtBalanceStart: A(r.summary.debtBalanceStart),
        debtBalanceEnd: A(r.summary.debtBalanceEnd),
        debtPayoffMonth: r.summary.debtPayoffMonth,
        receivableEnd: A(r.summary.receivableEnd),
        uncollectible: A(r.summary.uncollectible),
        unsoldUnitsEnd: r.summary.unsoldUnitsEnd,
        rentTotal: A(r.summary.rentTotal),
        interestTotal: A(r.summary.interestTotal),
      },
      feas: {
        revenueTotal: A(f.revenueTotal),
        costTotal: A(f.costTotal),
        budgetTotal: A(f.budgetTotal),
        profit: A(f.profit),
        profitRate: f.profitRate,
        discountLoss: A(f.discountLoss),
      },
    };
  });

  const months = cf.BASE.months.map((m) => m.month);
  const endingSeries = cf.BASE.months.map((m, i) => ({
    month: m.month,
    CONS: A(cf.CONS.months[i]?.ending),
    BASE: A(m.ending),
    OPT: A(cf.OPT.months[i]?.ending),
  }));
  const debtSeries = cf.BASE.months.map((m, i) => ({
    month: m.month,
    CONS: A(cf.CONS.months[i]?.debtBalanceEnd),
    BASE: A(m.debtBalanceEnd),
    OPT: A(cf.OPT.months[i]?.debtBalanceEnd),
  }));
  // 기준 시나리오 연도별 요약
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const annual = years.map((y) => {
    const ms = cf.BASE.months.filter((m) => m.month.startsWith(y));
    const inn = Object.fromEntries(IN_LINES.map((k) => [k, A(sum(ms, (m) => m.in[k]))]));
    const out = Object.fromEntries(OUT_LINES.map((k) => [k, A(sum(ms, (m) => m.out[k]))]));
    return {
      year: y,
      months: ms.length,
      in: inn as Record<string, number>,
      out: out as Record<string, number>,
      inTotal: A(sum(ms, (m) => m.inTotal)),
      outTotal: A(sum(ms, (m) => m.outTotal)),
      ending: A(ms[ms.length - 1]?.ending),
      debtPaid: A(sum(ms, (m) => m.debtPrincipalPaid)),
    };
  });

  // ---------- 사업수지 (기준) ----------
  const fb = feas.BASE;
  const feasibility = {
    revenue: fb.revenue.map((r) => ({ label: r.label, amount: A(r.amount) })),
    costs: fb.costs.map((r) => ({ label: r.label, budget: A(r.budget), executed: A(r.executed), unpaid: A(r.unpaid), future: A(r.future), total: A(r.total), variance: A(r.variance) })),
    revenueTotal: A(fb.revenueTotal),
    costTotal: A(fb.costTotal),
    budgetTotal: A(fb.budgetTotal),
    profit: A(fb.profit),
    profitRate: fb.profitRate,
    discountLoss: A(fb.discountLoss),
    cashVsProfit: fb.cashVsProfit.map((x) => ({ label: x.label, amount: A(x.amount) })),
  };

  // ---------- 리스크 / 운영 (집계) ----------
  const seeConf = canRead(user.role, "risks_confidential");
  const riskTypeOpts = ENTITIES.legal_cases.fields.find((f) => f.key === "risk_type")!.options!;
  const openRisks = data.risks.filter((r) => r.status !== "CLOSED");
  const riskByType = Object.entries(
    openRisks.reduce<Record<string, number>>((acc, r) => {
      const k = riskTypeOpts[r.risk_type] ?? r.risk_type;
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([name, count]) => ({ name, count }));
  const risks = {
    open: openRisks.length,
    high: openRisks.filter((r) => r.priority === "HIGH").length,
    expectedCost: A(sum(openRisks, (r) => r.expected_cost)),
    byType: riskByType.sort((a, b) => b.count - a.count),
    // 내부 전용 상위 리스크 (기밀건은 권한자만)
    top: external
      ? []
      : openRisks
          .filter((r) => !r.confidential || seeConf)
          .sort((a, b) => ["HIGH", "MEDIUM", "LOW"].indexOf(a.priority) - ["HIGH", "MEDIUM", "LOW"].indexOf(b.priority))
          .slice(0, 8)
          .map((r) => ({ title: r.title, priority: PRIORITY_LABEL[r.priority], status: RISK_STATUS_LABEL[r.status], next: r.next_action_date, cost: A(r.expected_cost) })),
  };
  const openIssues = data.issues.filter((i) => i.stage !== "DONE");
  const ops = {
    issuesTotal: data.issues.length,
    issuesOpen: openIssues.length,
    defectsOpen: openIssues.filter((i) => i.issue_kind === "DEFECT").length,
    complaintsOpen: openIssues.filter((i) => i.issue_kind === "COMPLAINT").length,
    recurrence: data.issues.filter((i) => i.recurrence).length,
  };

  // ---------- CRM (집계) ----------
  const leads = data.leads;
  const valid = leads.filter((x) => x.valid);
  const contracted = leads.filter((x) => x.contracted);
  const crm = {
    leads: leads.length,
    valid: valid.length,
    visits: leads.filter((x) => x.visited).length,
    contracts: contracted.length,
    conversion: valid.length ? (contracted.length / valid.length) * 100 : 0,
    pipeline: leads.filter((x) => ["OFFER", "NEGOTIATE"].includes(x.stage)).length,
  };

  // ---------- 판매조건 정책 (비율만) ----------
  const policies = data.policies.map((p) => ({
    name: p.name,
    discount: p.discount_rate,
    deposit: p.deposit_rate,
    balance: p.balance_rate,
    deferral: p.deferral_rate,
    deferralMonths: p.deferral_months,
    agency: p.agency_fee_rate,
    status: p.status,
  }));

  return {
    mode,
    external,
    indexLabel: INDEX_LABEL,
    meta: {
      projectName: st.project_name,
      baseDate: st.base_date,
      completionDate: st.completion_date,
      dataVersion: snap.version,
      cashflowStart: cf.BASE.months[0]?.month ?? st.cashflow_start,
      cashflowEnd: cf.BASE.months[cf.BASE.months.length - 1]?.month ?? "",
      cashflowMonths: cf.BASE.months.length,
      minCash: A(st.min_cash),
      fundingRate: st.project_funding_rate,
    },
    kpis: kpiList,
    sale,
    composition,
    saleBands: [...retailFloors, ...otBands],
    salesMonthly,
    collection,
    lease,
    debt,
    scenarios,
    endingSeries,
    debtSeries,
    annual,
    inLabel: IN_LABEL,
    outLabel: OUT_LABEL,
    feasibility,
    risks,
    ops,
    crm,
    policies,
  };
}

export type ReportData = ReturnType<typeof getReportData>;
