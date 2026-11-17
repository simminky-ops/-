import "server-only";
// 보고서 정의 — 동일한 구조로 화면(A4 인쇄/PDF)과 Excel 출력을 모두 생성
import type { Snapshot } from "./snapshot";
import type { Module } from "../rbac";
import { canRead } from "../rbac";
import type { SessionUser } from "../types";
import {
  CONTRACT_STATUS_LABEL,
  DEBT_TYPE_LABEL,
  EXPENSE_CATEGORY_LABEL,
  FACILITY_LABEL,
  ISSUE_STAGE_LABEL,
  LEAD_STAGE_LABEL,
  LEASE_STATUS_LABEL,
  PRIORITY_LABEL,
  RECIPIENT_LABEL,
  RISK_STATUS_LABEL,
} from "../types";
import { LEASE_STATE_LABEL, PAY_STATE_LABEL, SALE_STATE_LABEL, crmStats, kpiStatus, monthlySales } from "../calc/analytics";
import { agingBucket, AGING_ORDER } from "../calc/contracts";
import { IN_LABEL, IN_LINES, OUT_LABEL, OUT_LINES } from "../calc/cashflow";
import { SIM_DEFAULT, SIM_PRESETS, simulate } from "../calc/simulator";
import { addDays, fmtNum, monthOf, ratio, sum } from "../format";

export type CellKind = "text" | "money" | "pct" | "num" | "date";
export interface ReportTable {
  columns: { label: string; kind?: CellKind }[];
  rows: (string | number | null)[][];
  total?: (string | number | null)[];
}
export interface ReportSection {
  title: string;
  text?: string[];
  kpis?: { label: string; value: number | string; kind?: CellKind; sub?: string }[];
  table?: ReportTable;
  pageBreak?: boolean;
}
export interface ReportDoc {
  type: string;
  title: string;
  sections: ReportSection[];
}

export const REPORTS: { type: string; title: string; module: Module; desc: string }[] = [
  { type: "plan", title: "준공 후 사업 정상화 종합 사업계획서", module: "dashboard", desc: "자산가치 회복 및 사업 정상화를 위한 통합 운영계획 (요약판)" },
  { type: "weekly", title: "주간 사업운영 현황보고서", module: "dashboard", desc: "최근 7일 계약·수납·상담·하자·리스크 조치" },
  { type: "monthly_exec", title: "월간 임원보고서", module: "dashboard", desc: "핵심 KPI 목표 대비·전월 대비, 분양·현금·리스크" },
  { type: "officetel", title: "오피스텔 분양 및 잔금현황표", module: "assets", desc: "호실별 분양·수납 상태와 잔금·유예 현황" },
  { type: "retail", title: "근린생활시설 분양·임대현황표", module: "assets", desc: "호실별 분양·임대·업종 현황" },
  { type: "receivables", title: "미수금 및 채권회수 보고서", module: "receivables", desc: "연체기간별 채권, 대위변제 위험, 회수예정" },
  { type: "sales_terms", title: "판매조건별 수익성 비교보고서", module: "feasibility", desc: "A~E안 할인·잔금유예 조건 비교" },
  { type: "cashflow", title: "36개월 현금흐름 및 채무상환계획서", module: "cashflow", desc: "기준 시나리오 월별 현금흐름, 시나리오 비교, 채무 상환" },
  { type: "feasibility", title: "사업수지 분석보고서", module: "feasibility", desc: "수입·지출(기집행·미지급·예정), 손익과 현금 차이" },
  { type: "risk", title: "법률·소송·하자 리스크 보고서", module: "risks", desc: "리스크 대응현황, 하자·민원 처리현황" },
];

export function reportMeta(type: string) {
  return REPORTS.find((r) => r.type === type);
}

const SC = { CONS: "보수적", BASE: "기준", OPT: "낙관적" } as const;

export function buildReport(type: string, snap: Snapshot, user: SessionUser): ReportDoc | null {
  const meta = reportMeta(type);
  if (!meta || !canRead(user.role, meta.module)) return null;
  const { data, values, kpis, cf, feas } = snap;
  const asOf = data.settings.base_date;
  const s = values.s;
  const c = values.c;
  const l = values.l;
  const d = values.d;
  const sections: ReportSection[] = [];
  const kpiTable = (): ReportSection => ({
    title: "핵심 KPI (목표 대비 · 전월 대비)",
    table: {
      columns: [{ label: "지표" }, { label: "현재값" }, { label: "목표" }, { label: "전월" }, { label: "상태" }],
      rows: kpis.map((k) => {
        const f = (v: number | null) => (v === null ? "-" : k.unit === "%" ? `${fmtNum(v, 1)}%` : `${fmtNum(v / 1e8, 1)}억원`);
        const st = kpiStatus(k);
        return [k.label, f(k.value), f(k.target), f(k.prev), st === "good" ? "● 양호" : st === "warn" ? "▲ 주의" : st === "bad" ? "■ 위험" : "-"];
      }),
    },
  });
  const salesSummary = (): ReportSection => ({
    title: "분양 현황",
    kpis: [
      { label: "전체 분양률", value: s.saleRate, kind: "pct", sub: `${s.sold}/${s.total}호` },
      { label: "금액기준 분양률", value: s.amountRate, kind: "pct" },
      { label: "오피스텔", value: s.officetel.rate, kind: "pct", sub: `${s.officetel.sold}/${s.officetel.total}호` },
      { label: "근린생활시설", value: s.retail.rate, kind: "pct", sub: `${s.retail.sold}/${s.retail.total}호` },
      { label: "미분양 재고가치(현재가)", value: s.unsoldValue, kind: "money" },
    ],
  });
  const collectionSummary = (): ReportSection => ({
    title: "잔금 수납 및 미수 현황",
    kpis: [
      { label: "잔금 청구확정액", value: c.billed, kind: "money" },
      { label: "잔금 수납액", value: c.collected, kind: "money" },
      { label: "잔금 회수율", value: c.collectionRate, kind: "pct" },
      { label: "잔금 미수금", value: c.unpaid, kind: "money", sub: `연체 ${fmtNum(c.overdue / 1e8, 1)}억 · 유예 ${fmtNum(c.deferred / 1e8, 1)}억` },
      { label: "연체료 발생액(누계)", value: c.lateFee, kind: "money", sub: `미수 ${fmtNum(c.lateFeeUnpaid / 1e8, 1)}억` },
    ],
  });
  const cfScenarioTable = (): ReportSection => ({
    title: "시나리오별 비교",
    table: {
      columns: [{ label: "항목" }, { label: "보수적" }, { label: "기준" }, { label: "낙관적" }],
      rows: [
        ["누적 분양매출(신규판매)", ...(["CONS", "BASE", "OPT"] as const).map((k) => cf[k].summary.newSalesRevenue)],
        ["총 할인손실", ...(["CONS", "BASE", "OPT"] as const).map((k) => feas[k].discountLoss)],
        ["누적 현금회수(분양)", ...(["CONS", "BASE", "OPT"] as const).map((k) => cf[k].summary.salesCollections)],
        ["기간 말 미수금", ...(["CONS", "BASE", "OPT"] as const).map((k) => cf[k].summary.receivableEnd)],
        ["기간 말 채무잔액", ...(["CONS", "BASE", "OPT"] as const).map((k) => cf[k].summary.debtBalanceEnd)],
        ["최저 기말현금", ...(["CONS", "BASE", "OPT"] as const).map((k) => cf[k].summary.minEnding)],
        ["자금부족 최소 필요액", ...(["CONS", "BASE", "OPT"] as const).map((k) => cf[k].summary.requiredFunding)],
        ["예상 사업손익", ...(["CONS", "BASE", "OPT"] as const).map((k) => feas[k].profit)],
        ["채무 상환완료 예상", ...(["CONS", "BASE", "OPT"] as const).map((k) => cf[k].summary.debtPayoffMonth ?? "기간 내 미완료")],
      ].map((r) => r.map((v, i) => (i > 0 && typeof v === "number" ? v : v))) as (string | number)[][],
    },
  });
  // 위 표의 숫자 열은 금액
  const fixMoneyCols = (sec: ReportSection) => {
    if (sec.table) sec.table.columns = sec.table.columns.map((col, i) => (i === 0 ? col : { ...col, kind: "money" }));
    return sec;
  };
  const debtTable = (): ReportSection => ({
    title: "채무 현황 및 상환계획",
    table: {
      columns: [{ label: "순위", kind: "num" }, { label: "유형" }, { label: "채권자" }, { label: "발생원금", kind: "money" }, { label: "이자·가산금", kind: "money" }, { label: "기상환", kind: "money" }, { label: "잔액", kind: "money" }, { label: "상환계획", kind: "money" }, { label: "납부기한", kind: "date" }],
      rows: d.rows.map((r) => [r.debt.priority, DEBT_TYPE_LABEL[r.debt.debt_type], r.debt.creditor, r.debt.principal, r.debt.interest_penalty, r.repaid, r.remaining, r.plannedFuture, r.debt.due_date]),
      total: ["합계", "", "", d.principal, sum(d.rows, (r) => r.debt.interest_penalty), sum(d.rows, (r) => r.repaid), d.balance, sum(d.rows, (r) => r.plannedFuture), ""],
    },
  });
  const cashTable = (months = 36): ReportSection => {
    const ms = cf.BASE.months.slice(0, months);
    return {
      title: "월별 현금흐름 (기준 시나리오)",
      table: {
        columns: [{ label: "월" }, { label: "기초현금", kind: "money" }, ...IN_LINES.map((k) => ({ label: IN_LABEL[k], kind: "money" as const })), { label: "유입 계", kind: "money" }, ...OUT_LINES.map((k) => ({ label: OUT_LABEL[k], kind: "money" as const })), { label: "유출 계", kind: "money" }, { label: "기말현금", kind: "money" }],
        rows: ms.map((m) => [m.month, m.opening, ...IN_LINES.map((k) => m.in[k]), m.inTotal, ...OUT_LINES.map((k) => m.out[k]), m.outTotal, m.ending]),
      },
    };
  };
  const feasTables = (): ReportSection[] => {
    const f = feas.BASE;
    return [
      {
        title: "수입 (기준 시나리오)",
        table: { columns: [{ label: "항목" }, { label: "금액", kind: "money" }, { label: "비고" }], rows: f.revenue.map((r) => [r.label, r.amount, r.note]), total: ["예상 총수익", f.revenueTotal, ""] },
      },
      {
        title: "지출 (기집행 · 미지급 · 향후 예정)",
        table: {
          columns: [{ label: "계정" }, { label: "계획", kind: "money" }, { label: "기집행", kind: "money" }, { label: "미지급", kind: "money" }, { label: "향후 예정", kind: "money" }, { label: "예상 합계", kind: "money" }, { label: "계획 대비", kind: "money" }],
          rows: f.costs.map((r) => [r.label, r.budget, r.executed, r.unpaid, r.future, r.total, r.variance]),
          total: ["합계", f.budgetTotal, sum(f.costs, (r) => r.executed), sum(f.costs, (r) => r.unpaid), sum(f.costs, (r) => r.future), f.costTotal, f.costTotal - f.budgetTotal],
        },
      },
      {
        title: "손익 요약",
        kpis: (["CONS", "BASE", "OPT"] as const).map((k) => ({ label: `${SC[k]} 시나리오 예상손익`, value: feas[k].profit, kind: "money" as const, sub: `수익률 ${fmtNum(feas[k].profitRate, 1)}%` })),
      },
    ];
  };

  switch (type) {
    case "plan": {
      sections.push({
        title: "1. 사업 정상화 목표",
        text: [
          `본 계획은 준공 및 사용승인(${data.settings.completion_date}) 이후 ${data.settings.project_name}의 미분양 해소, 분양대금 회수, 근린생활시설 임대 활성화, 채무 상환을 통해 자산가치를 회복하고 사업을 정상화하기 위한 통합 운영계획입니다.`,
          `기준일 ${asOf} 현재 분양률 ${fmtNum(s.saleRate, 1)}%, 잔금 회수율 ${fmtNum(c.collectionRate, 1)}%, 근생 임대율 ${fmtNum(l.rate, 1)}%, 총 채무잔액 ${fmtNum(d.balance / 1e8, 1)}억원입니다.`,
          `기준 시나리오 기준 36개월 내 채무 상환완료 예상시점은 ${cf.BASE.summary.debtPayoffMonth ?? "기간 내 미완료"}, 예상 사업손익은 ${fmtNum(feas.BASE.profit / 1e8, 1)}억원입니다.${cf.BASE.summary.shortageMonths.length ? ` 단, ${cf.BASE.summary.shortageMonths.length}개월간 일시적 자금부족(최대 ${fmtNum(cf.BASE.summary.requiredFunding / 1e8, 1)}억원)이 예상되어 채무 분납·만기 조정 또는 브릿지 자금 확보가 필요합니다.` : ""}`,
        ],
      });
      sections.push(kpiTable(), salesSummary(), collectionSummary());
      sections.push({
        title: "근린생활시설 임대 현황",
        kpis: [
          { label: "임대율(면적)", value: l.rate, kind: "pct" },
          { label: "임대 가능면적", value: `${fmtNum(l.leasable, 1)}㎡` },
          { label: "예상 연간 임대수익(전체)", value: l.annualRent, kind: "money" },
          { label: "사업시행법인 귀속분", value: l.devAnnualRent, kind: "money" },
          { label: "앵커테넌트", value: `${l.anchors}개` },
        ],
      });
      sections.push(fixMoneyCols(cfScenarioTable()), debtTable(), ...feasTables());
      sections.push({
        title: "핵심 실행과제",
        text: [
          "① 미분양 판매: 승인 판매조건(할인·잔금유예) 범위 내 집중판매, 해지세대 재판매 우선 추진",
          "② 미수금 회수: 연체기간별 단계적 최고장 → 납부약정 → 법적조치, 중도금대출 만기 도래 세대 대위변제 위험 사전 차단",
          "③ 임대·MD: 층별 MD 가설(1층 생활밀착, 2층 카페·외식, 3층 의료·교육) 검증 후 앵커 유치, 렌트프리는 장기계약과 연계",
          "④ 채무 상환: 법정·약정 우선순위에 따른 수입 연동 상환, 국세·지방세 분납 이행 관리",
          "⑤ 리스크: 소송·해지 분쟁·하자 책임범위를 주간 점검하고 비용을 사업수지에 즉시 반영",
        ],
      });
      break;
    }
    case "weekly": {
      const from = addDays(asOf, -6);
      const inWeek = (dt: string | null) => !!dt && dt >= from && dt <= asOf;
      const newC = data.contracts.filter((x) => inWeek(x.contract_date));
      const pays = data.payments.filter((p) => inWeek(p.paid_date));
      const leads = data.leads.filter((x) => inWeek(x.consult_date));
      const issues = data.issues.filter((x) => inWeek(x.received_date));
      const next = data.risks.filter((r) => r.status !== "CLOSED" && r.next_action_date && r.next_action_date <= addDays(asOf, 7) && (!r.confidential || canRead(user.role, "risks_confidential")));
      sections.push({
        title: `주간 실적 (${from} ~ ${asOf})`,
        kpis: [
          { label: "신규 계약", value: `${newC.length}건`, sub: `재판매 ${newC.filter((x) => x.is_resale).length}건` },
          { label: "계약금액", value: sum(newC, (x) => x.supply_price), kind: "money" },
          { label: "수납액(순)", value: sum(pays, (p) => p.amount), kind: "money", sub: `${pays.length}건` },
          { label: "신규 상담", value: `${leads.length}건`, sub: `방문 ${leads.filter((x) => x.visited).length}건` },
          { label: "하자·민원 접수", value: `${issues.length}건` },
        ],
      });
      sections.push(salesSummary(), collectionSummary());
      sections.push({
        title: "금주 계약 내역",
        table: { columns: [{ label: "계약일", kind: "date" }, { label: "자산 ID" }, { label: "공급금액", kind: "money" }, { label: "할인금액", kind: "money" }, { label: "재판매" }, { label: "담당" }], rows: newC.map((x) => [x.contract_date, x.asset_id, x.supply_price, x.discount_amount, x.is_resale ? "예" : "-", x.sales_manager]) },
      });
      sections.push({
        title: "향후 7일 리스크 조치 예정",
        table: { columns: [{ label: "ID" }, { label: "제목" }, { label: "우선순위" }, { label: "다음 조치일", kind: "date" }, { label: "담당" }], rows: next.map((r) => [r.id, r.title, PRIORITY_LABEL[r.priority], r.next_action_date, r.owner]) },
      });
      break;
    }
    case "monthly_exec": {
      const ms = monthlySales(data.contracts, "2026-04", monthOf(asOf));
      sections.push({
        title: "요약",
        text: [
          `분양률 ${fmtNum(s.saleRate, 1)}% (목표 ${data.settings.targets.sale_rate ?? "-"}%), 잔금 회수율 ${fmtNum(c.collectionRate, 1)}%, 근생 임대율 ${fmtNum(l.rate, 1)}%.`,
          `잔금 미수금 ${fmtNum(c.unpaid / 1e8, 1)}억원 중 연체원금 ${fmtNum(c.overdue / 1e8, 1)}억원(${c.overdueCount}세대), 유예 ${fmtNum(c.deferred / 1e8, 1)}억원(${c.deferredCount}세대).`,
          `기준 시나리오 최저 기말현금 ${fmtNum(cf.BASE.summary.minEnding / 1e8, 1)}억원(${cf.BASE.summary.minEndingMonth}), 채무 상환완료 예상 ${cf.BASE.summary.debtPayoffMonth ?? "기간 내 미완료"}.`,
        ],
      });
      sections.push(kpiTable());
      sections.push({ title: "월별 분양·재판매 실적 (준공 후)", table: { columns: [{ label: "월" }, { label: "신규분양", kind: "num" }, { label: "재판매", kind: "num" }, { label: "해지", kind: "num" }, { label: "계약금액", kind: "money" }], rows: ms.map((m) => [m.period, m.newSale, m.resale, m.terminated, m.amount]) } });
      sections.push(fixMoneyCols(cfScenarioTable()));
      break;
    }
    case "officetel":
    case "retail": {
      const ft = type === "officetel" ? "OFFICETEL" : "RETAIL";
      const vs = values.views.filter((v) => v.facility_type === ft);
      sections.push({
        title: `${FACILITY_LABEL[ft]} 요약`,
        kpis: [
          { label: "분양률", value: ratio(vs.filter((v) => v.sale_state !== "UNSOLD").length, vs.length), kind: "pct", sub: `${vs.filter((v) => v.sale_state !== "UNSOLD").length}/${vs.length}호` },
          { label: "계약 공급금액", value: sum(vs, (v) => v.supply_price ?? 0), kind: "money" },
          { label: "잔금 미납", value: sum(vs, (v) => v.balance_unpaid), kind: "money" },
          { label: "유예 잔액", value: sum(vs, (v) => v.deferral_outstanding), kind: "money" },
          type === "retail" ? { label: "임대율(면적)", value: l.rate, kind: "pct" } : { label: "연체 세대", value: `${vs.filter((v) => v.pay_state === "OVERDUE").length}세대` },
        ],
      });
      sections.push({
        title: `${FACILITY_LABEL[ft]} 호실별 현황`,
        table:
          type === "officetel"
            ? {
                columns: [{ label: "자산 ID" }, { label: "층", kind: "num" }, { label: "전용㎡", kind: "num" }, { label: "분양상태" }, { label: "수납상태" }, { label: "공급금액", kind: "money" }, { label: "할인", kind: "money" }, { label: "납부완료", kind: "money" }, { label: "잔금미납", kind: "money" }, { label: "유예잔액", kind: "money" }, { label: "유예만기", kind: "date" }, { label: "연체일", kind: "num" }, { label: "중도금대출만기", kind: "date" }],
                rows: vs.map((v) => [v.id, v.floor, v.exclusive_area, SALE_STATE_LABEL[v.sale_state], PAY_STATE_LABEL[v.pay_state], v.supply_price, v.discount_amount, v.paid_total, v.balance_unpaid, v.deferral_outstanding, v.deferral_maturity, v.overdue_days, v.middle_loan_maturity]),
              }
            : {
                columns: [{ label: "자산 ID" }, { label: "층", kind: "num" }, { label: "전용㎡", kind: "num" }, { label: "분양상태" }, { label: "수납상태" }, { label: "임대상태" }, { label: "업종" }, { label: "추천 MD" }, { label: "공급금액", kind: "money" }, { label: "현재 분양가", kind: "money" }, { label: "잔금미납", kind: "money" }],
                rows: vs.map((v) => [v.id, v.floor, v.exclusive_area, SALE_STATE_LABEL[v.sale_state], PAY_STATE_LABEL[v.pay_state], LEASE_STATE_LABEL[v.lease_state], v.tenant_industry, v.recommended_industry, v.supply_price, v.current_price, v.balance_unpaid]),
              },
      });
      if (type === "retail") {
        sections.push({
          title: "임대차 계약 현황",
          table: {
            columns: [{ label: "자산 ID" }, { label: "업종" }, { label: "상태" }, { label: "보증금", kind: "money" }, { label: "월임대료", kind: "money" }, { label: "렌트프리", kind: "num" }, { label: "시작", kind: "date" }, { label: "종료", kind: "date" }, { label: "수익귀속" }],
            rows: data.leases.map((x) => [x.asset_id, x.actual_industry ?? x.desired_industry, LEASE_STATUS_LABEL[x.negotiation_status], x.deposit, x.monthly_rent, x.rent_free_months, x.start_date, x.end_date, RECIPIENT_LABEL[x.income_recipient]]),
          },
        });
      }
      break;
    }
    case "receivables": {
      const act = values.calcs.filter((x) => x.activeAsOf && (x.balanceUnpaid > 0 || x.deferralOutstanding > 0));
      const buckets = AGING_ORDER.map((b) => {
        const xs = act.filter((x) => agingBucket(x.overdueDays) === b && (b !== "정상" || x.overduePrincipal === 0));
        return [b, xs.length, sum(xs, (x) => x.overduePrincipal), sum(xs, (x) => x.deferralNotMatured), sum(xs, (x) => x.lateFee.fee)];
      });
      sections.push(collectionSummary());
      sections.push({ title: "연체기간별 채권 분류", table: { columns: [{ label: "구간" }, { label: "세대", kind: "num" }, { label: "연체원금", kind: "money" }, { label: "유예잔액", kind: "money" }, { label: "연체료", kind: "money" }], rows: buckets as (string | number)[][] } });
      const subro = act.filter((x) => x.contract.middle_loan_maturity && x.contract.middle_loan_maturity <= addDays(asOf, 60));
      sections.push({
        title: "대위변제 위험 (중도금대출 만기 60일 이내 · 잔금 미납)",
        table: { columns: [{ label: "자산 ID" }, { label: "계약 ID" }, { label: "대출만기", kind: "date" }, { label: "연체원금", kind: "money" }, { label: "유예잔액", kind: "money" }], rows: subro.map((x) => [x.contract.asset_id, x.contract.id, x.contract.middle_loan_maturity, x.overduePrincipal, x.deferralOutstanding]) },
      });
      const recBy = new Map(data.receivables.map((r) => [r.contract_id, r]));
      sections.push({
        title: "채권별 상세",
        table: {
          columns: [{ label: "자산 ID" }, { label: "계약 ID" }, { label: "잔금", kind: "money" }, { label: "연체원금", kind: "money" }, { label: "유예잔액", kind: "money" }, { label: "연체일", kind: "num" }, { label: "연체료", kind: "money" }, { label: "최고장", kind: "num" }, { label: "협의상태" }, { label: "회수예정일", kind: "date" }, { label: "회수예정액", kind: "money" }],
          rows: act
            .sort((a, b) => b.overdueDays - a.overdueDays)
            .map((x) => {
              const r = recBy.get(x.contract.id);
              return [x.contract.asset_id, x.contract.id, x.contract.balance_amount, x.overduePrincipal, x.deferralOutstanding, x.overdueDays, x.lateFee.fee, r?.notice_count ?? 0, r?.negotiation_status ?? "-", r?.expected_date ?? null, r?.expected_amount ?? 0];
            }),
        },
      });
      break;
    }
    case "sales_terms": {
      const unsold = values.views.filter((v) => v.sale_state === "UNSOLD" && v.facility_type === "OFFICETEL");
      const avg = unsold.length ? sum(unsold, (v) => v.list_price) / unsold.length : SIM_DEFAULT.listPrice;
      const base = { ...SIM_DEFAULT, units: Math.max(1, unsold.length), listPrice: Math.round(avg), fundingRate: data.settings.project_funding_rate, discountRateNpv: data.settings.project_funding_rate };
      const res = SIM_PRESETS.map((p) => simulate(p.name, { ...base, ...p.patch }));
      sections.push({ title: "분석 전제", text: [`대상: 오피스텔 미분양 ${unsold.length}호, 호실당 평균 최초 분양가 ${fmtNum(avg / 1e8, 2)}억원`, `계약금 10% · 잔금 90%, 분양대행수수료 3%, 배분 원가율 85%, 조달금리 ${data.settings.project_funding_rate}% (B06 시뮬레이터 기본값)`] });
      sections.push({
        title: "시나리오별 비교",
        table: {
          columns: [{ label: "항목" }, ...res.map((r) => ({ label: r.name.split(":")[0], kind: "money" as const }))],
          rows: [
            ["예상 매출액", ...res.map((r) => r.revenue)],
            ["총 할인손실", ...res.map((r) => r.discountLoss)],
            ["초기 현금회수액", ...res.map((r) => r.initialCash)],
            ["향후 유예금 회수액", ...res.map((r) => r.deferredCash)],
            ["영업·판촉 비용", ...res.map((r) => r.salesCost)],
            ["금융비용 영향", ...res.map((r) => r.financeImpact)],
            ["예상 사업손익", ...res.map((r) => r.profit)],
            ["순현금흐름", ...res.map((r) => r.netCash)],
            ["NPV", ...res.map((r) => r.npv)],
          ],
        },
      });
      sections.push({ title: "회수기간", table: { columns: [{ label: "안" }, { label: "최종 회수 시점(개월)", kind: "num" }], rows: res.map((r) => [r.name, r.paybackMonth]) } });
      break;
    }
    case "cashflow": {
      const b = cf.BASE.summary;
      sections.push({
        title: "요약 (기준 시나리오)",
        kpis: [
          { label: "기초현금", value: cf.BASE.startOpening, kind: "money", sub: cf.BASE.months[0]?.month },
          { label: "기간 말 기말현금", value: b.endingCash, kind: "money" },
          { label: "최저 기말현금", value: b.minEnding, kind: "money", sub: b.minEndingMonth ?? "" },
          { label: "자금부족 최소 필요액", value: b.requiredFunding, kind: "money", sub: `부족 ${b.shortageMonths.length}개월` },
          { label: "채무 상환완료 예상", value: b.debtPayoffMonth ?? "기간 내 미완료" },
        ],
      });
      sections.push(fixMoneyCols(cfScenarioTable()), debtTable());
      sections.push({ ...cashTable(), pageBreak: true });
      break;
    }
    case "feasibility":
      sections.push(...feasTables());
      sections.push({
        title: "손익과 현금흐름의 차이 (기준 시나리오)",
        table: { columns: [{ label: "항목" }, { label: "금액", kind: "money" }], rows: [["예상 사업손익", feas.BASE.profit], ...feas.BASE.cashVsProfit.map((x) => [x.label, x.amount]), ["기간 말 기말현금", cf.BASE.summary.endingCash]] },
      });
      sections.push({ title: "사업비 계정 정의", text: Object.values(EXPENSE_CATEGORY_LABEL).map((x) => `· ${x}`) });
      break;
    case "risk": {
      const risks = data.risks.filter((r) => !r.confidential || canRead(user.role, "risks_confidential"));
      sections.push({
        title: "리스크 요약",
        kpis: [
          { label: "관리 중 리스크", value: `${risks.filter((r) => r.status !== "CLOSED").length}건` },
          { label: "우선순위 상", value: `${risks.filter((r) => r.status !== "CLOSED" && r.priority === "HIGH").length}건` },
          { label: "예상 비용 합계", value: sum(risks.filter((r) => r.status !== "CLOSED"), (r) => r.expected_cost), kind: "money" },
          { label: "하자·민원 미완료", value: `${data.issues.filter((i) => i.stage !== "DONE").length}건` },
          { label: "기밀 건(권한자 한정)", value: canRead(user.role, "risks_confidential") ? `${risks.filter((r) => r.confidential).length}건` : "열람 제한" },
        ],
      });
      sections.push({
        title: "법률·금융 리스크 대응현황",
        table: { columns: [{ label: "ID" }, { label: "유형" }, { label: "제목" }, { label: "상태" }, { label: "우선순위" }, { label: "예상비용", kind: "money" }, { label: "다음 조치일", kind: "date" }, { label: "담당" }], rows: risks.map((r) => [r.id, r.risk_type, r.title, RISK_STATUS_LABEL[r.status], PRIORITY_LABEL[r.priority], r.expected_cost, r.next_action_date, r.owner]) },
      });
      sections.push({
        title: "하자·민원 처리현황",
        table: { columns: [{ label: "ID" }, { label: "자산" }, { label: "구분" }, { label: "접수일", kind: "date" }, { label: "단계" }, { label: "책임주체" }, { label: "보수예정", kind: "date" }, { label: "비용", kind: "money" }], rows: data.issues.map((i) => [i.id, i.asset_id ?? "공용부", i.issue_kind === "DEFECT" ? "하자" : "민원", i.received_date, ISSUE_STAGE_LABEL[i.stage], i.responsible, i.planned_date, i.cost]) },
      });
      break;
    }
  }
  // CRM 요약은 임원보고에 추가
  if (type === "monthly_exec" && canRead(user.role, "crm")) {
    const cs = crmStats(data, "2026-04-01", asOf);
    sections.push({ title: "영업(CRM) 성과", table: { columns: [{ label: "담당자" }, { label: "상담", kind: "num" }, { label: "방문", kind: "num" }, { label: "계약", kind: "num" }, { label: "전환율", kind: "pct" }, { label: "계약금액", kind: "money" }], rows: cs.byManager.map((m) => [m.name, m.leads, m.visits, m.contracts, m.conversion, m.amount]) } });
    void LEAD_STAGE_LABEL;
    void CONTRACT_STATUS_LABEL;
  }
  return { type, title: meta.title, sections };
}
