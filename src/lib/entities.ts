// 엔티티 레지스트리 — 한 곳에서 정의한 필드 메타데이터로
// 서버 검증·권한, 화면 표/입력폼, Excel 템플릿·업로드 검증을 모두 구동합니다.
import type { Module } from "./rbac";
import {
  CASH_ACCOUNT_LABEL,
  CONTRACT_STATUS_LABEL,
  DEBT_TYPE_LABEL,
  EXPENSE_CATEGORY_LABEL,
  FACILITY_LABEL,
  ISSUE_STAGE_LABEL,
  LEAD_STAGE_LABEL,
  LEASE_STATUS_LABEL,
  PAYMENT_TYPE_LABEL,
  PRIORITY_LABEL,
  RECIPIENT_LABEL,
  RISK_STATUS_LABEL,
} from "./types";

export type FieldType =
  | "text"
  | "textarea"
  | "int"
  | "number"
  | "money"
  | "rate"
  | "area"
  | "date"
  | "month"
  | "select"
  | "bool";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: Record<string, string>;
  required?: boolean;
  pii?: boolean; // 개인정보 — 권한 없으면 서버에서 마스킹
  protected?: boolean; // 변경 시 승인 필요
  readonly?: boolean; // 화면 입력 불가(시스템 산출)
  list?: boolean; // 목록 표에 표시
  min?: number;
  max?: number;
  ref?: EntityName;
  help?: string;
}

export type EntityName =
  | "assets"
  | "sale_contracts"
  | "contract_parties"
  | "payments"
  | "deferrals"
  | "receivables"
  | "collection_actions"
  | "leases"
  | "crm_leads"
  | "sales_policies"
  | "expenses"
  | "debts"
  | "debt_repayments"
  | "cashflow_actuals"
  | "cashflow_forecasts"
  | "issues"
  | "legal_cases";

export interface EntityDef {
  name: EntityName;
  label: string;
  module: Module;
  idPrefix: string | null; // null 이면 ID 직접 입력(자산 ID)
  idPad: number;
  fields: FieldDef[];
  defaultSort: string;
  /** SALES 역할 등 '본인 배정 건'만 수정 가능한 경우 담당자 필드 */
  ownerField?: string;
  ownerRoles?: string[];
  /** 기밀 여부 필드(1이면 risks_confidential 권한 필요) */
  confidentialField?: string;
  /** 삭제 시 승인 필요 */
  approvalOnDelete?: boolean;
  /** 레코드 단위 교차 검증 */
  validate?: (row: Record<string, unknown>) => string[];
}

const YN = { "1": "예", "0": "아니오" };

const base = (fields: FieldDef[]): FieldDef[] => fields;

export const ENTITIES: Record<EntityName, EntityDef> = {
  assets: {
    name: "assets",
    label: "호실(자산)",
    module: "assets",
    idPrefix: null,
    idPad: 3,
    defaultSort: "id",
    fields: base([
      { key: "id", label: "자산 ID", type: "text", required: true, list: true, help: "예: A-001(오피스텔), B-001(근생)" },
      { key: "facility_type", label: "시설유형", type: "select", options: { OFFICETEL: "오피스텔", RETAIL: "근린생활시설" }, required: true, list: true },
      { key: "building", label: "동 구분", type: "text", list: false },
      { key: "floor", label: "층", type: "int", required: true, list: true, min: -5, max: 80 },
      { key: "exclusive_area", label: "전용면적(㎡)", type: "area", required: true, list: true, min: 0 },
      { key: "contract_area", label: "계약면적(㎡)", type: "area", required: true, list: false, min: 0 },
      { key: "usage", label: "용도", type: "text", list: false },
      { key: "list_price", label: "최초 분양가격", type: "money", required: true, list: true, protected: true, min: 0 },
      { key: "current_price", label: "현재 분양가격", type: "money", required: true, list: true, protected: true, min: 0 },
      { key: "is_sale_target", label: "분양대상", type: "bool", options: YN },
      { key: "leasable", label: "임대대상", type: "bool", options: YN },
      { key: "recommended_industry", label: "추천업종(MD)", type: "text" },
      { key: "manager", label: "담당자", type: "text", list: true },
      { key: "note", label: "비고", type: "textarea" },
    ]),
    validate: (r) => {
      const e: string[] = [];
      if (r.id && !/^[A-Z]-\d{3,4}$/.test(String(r.id))) e.push("자산 ID 형식은 'A-001'과 같아야 합니다.");
      if (Number(r.contract_area) < Number(r.exclusive_area)) e.push("계약면적은 전용면적 이상이어야 합니다.");
      return e;
    },
  },
  sale_contracts: {
    name: "sale_contracts",
    label: "분양계약",
    module: "assets",
    idPrefix: "C-",
    idPad: 4,
    defaultSort: "contract_date desc",
    ownerField: "sales_manager",
    ownerRoles: ["SALES"],
    approvalOnDelete: true,
    fields: base([
      { key: "id", label: "계약 ID", type: "text", readonly: true, list: true },
      { key: "asset_id", label: "자산 ID", type: "text", required: true, list: true, ref: "assets" },
      { key: "contract_date", label: "계약일", type: "date", required: true, list: true },
      { key: "list_price_at_contract", label: "계약시 분양가", type: "money", required: true, protected: true, min: 0 },
      { key: "discount_amount", label: "할인금액", type: "money", protected: true, list: true, min: 0 },
      { key: "supply_price", label: "공급금액(할인후)", type: "money", required: true, protected: true, list: true, min: 0 },
      { key: "deposit_amount", label: "계약금", type: "money", required: true, protected: true, min: 0 },
      { key: "middle_amount", label: "중도금", type: "money", protected: true, min: 0 },
      { key: "balance_amount", label: "잔금", type: "money", required: true, protected: true, min: 0 },
      { key: "balance_due_date", label: "잔금 납부기한", type: "date" },
      { key: "late_fee_rate", label: "연체이율(연%)", type: "rate", protected: true, min: 0, max: 30 },
      { key: "middle_loan_maturity", label: "중도금대출 만기일", type: "date" },
      { key: "middle_loan_interest", label: "중도금 대납이자", type: "money", min: 0 },
      { key: "status", label: "계약상태", type: "select", options: CONTRACT_STATUS_LABEL, required: true, protected: true, list: true },
      { key: "is_resale", label: "재판매", type: "bool", options: YN, list: true },
      { key: "prev_contract_id", label: "직전(해지)계약 ID", type: "text" },
      { key: "terminated_at", label: "해지일", type: "date" },
      { key: "termination_reason", label: "해지사유", type: "text" },
      { key: "sales_manager", label: "영업담당", type: "text", list: true },
      { key: "party_id", label: "계약자 관리ID", type: "text", ref: "contract_parties" },
      { key: "note", label: "비고", type: "textarea" },
    ]),
    validate: (r) => {
      const e: string[] = [];
      const lp = Number(r.list_price_at_contract) || 0;
      const disc = Number(r.discount_amount) || 0;
      const sp = Number(r.supply_price) || 0;
      const parts = (Number(r.deposit_amount) || 0) + (Number(r.middle_amount) || 0) + (Number(r.balance_amount) || 0);
      if (Math.abs(lp - disc - sp) > 1) e.push(`공급금액(${sp.toLocaleString()})이 분양가-할인금액(${(lp - disc).toLocaleString()})과 다릅니다.`);
      if (Math.abs(parts - sp) > 1) e.push(`계약금+중도금+잔금(${parts.toLocaleString()})이 공급금액(${sp.toLocaleString()})과 일치하지 않습니다.`);
      if (r.status === "TERMINATED" && !r.terminated_at) e.push("해지 상태는 해지일이 필요합니다.");
      return e;
    },
  },
  contract_parties: {
    name: "contract_parties",
    label: "계약자(개인정보)",
    module: "assets",
    idPrefix: "P-",
    idPad: 4,
    defaultSort: "id",
    fields: base([
      { key: "id", label: "계약자 관리ID", type: "text", readonly: true, list: true },
      { key: "party_type", label: "구분", type: "select", options: { INDIVIDUAL: "개인", CORPORATE: "법인" }, list: true },
      { key: "name", label: "성명/법인명", type: "text", required: true, pii: true, list: true },
      { key: "phone", label: "연락처", type: "text", pii: true, list: true },
      { key: "email", label: "이메일", type: "text", pii: true },
      { key: "address", label: "주소", type: "text", pii: true },
      { key: "note", label: "비고", type: "textarea" },
    ]),
  },
  payments: {
    name: "payments",
    label: "수납내역",
    module: "receivables",
    idPrefix: "PM-",
    idPad: 5,
    defaultSort: "paid_date desc",
    approvalOnDelete: true,
    fields: base([
      { key: "id", label: "수납 ID", type: "text", readonly: true, list: true },
      { key: "contract_id", label: "계약 ID", type: "text", required: true, list: true, ref: "sale_contracts" },
      { key: "asset_id", label: "자산 ID", type: "text", readonly: true, list: true, help: "계약 ID에서 자동 연결" },
      { key: "pay_type", label: "수납구분", type: "select", options: PAYMENT_TYPE_LABEL, required: true, list: true },
      { key: "amount", label: "금액", type: "money", required: true, protected: true, list: true, help: "해지 환급은 음수로 입력" },
      { key: "paid_date", label: "수납일", type: "date", required: true, list: true },
      { key: "deferral_id", label: "유예 ID", type: "text", ref: "deferrals" },
      { key: "method", label: "수납방법", type: "text" },
      { key: "note", label: "비고", type: "textarea" },
    ]),
    validate: (r) => {
      const e: string[] = [];
      const a = Number(r.amount);
      if (r.pay_type === "REFUND" && a >= 0) e.push("해지 환급은 음수 금액으로 입력합니다.");
      if (r.pay_type !== "REFUND" && a <= 0) e.push("수납 금액은 0보다 커야 합니다.");
      if (r.pay_type === "DEFERRAL" && !r.deferral_id) e.push("유예금 회수는 유예 ID가 필요합니다.");
      return e;
    },
  },
  deferrals: {
    name: "deferrals",
    label: "잔금유예",
    module: "receivables",
    idPrefix: "DF-",
    idPad: 4,
    defaultSort: "maturity_date",
    fields: base([
      { key: "id", label: "유예 ID", type: "text", readonly: true, list: true },
      { key: "contract_id", label: "계약 ID", type: "text", required: true, list: true, ref: "sale_contracts" },
      { key: "asset_id", label: "자산 ID", type: "text", readonly: true, list: true },
      { key: "basis", label: "유예율 산정기준", type: "select", options: { SUPPLY: "공급금액 대비", BALANCE: "잔금 대비" }, required: true },
      { key: "deferral_rate", label: "유예율(%)", type: "rate", min: 0, max: 100, list: true },
      { key: "deferred_amount", label: "유예금액", type: "money", required: true, protected: true, list: true, min: 0 },
      { key: "interest_rate", label: "유예이자율(연%)", type: "rate", min: 0, max: 30 },
      { key: "start_date", label: "유예 시작일", type: "date", required: true },
      { key: "maturity_date", label: "유예 만기일", type: "date", required: true, list: true },
      { key: "status", label: "상태", type: "select", options: { ACTIVE: "유예중", REPAID: "상환완료", DEFAULT: "만기미납", CANCELLED: "취소" }, required: true, list: true },
      { key: "note", label: "비고", type: "textarea" },
    ]),
  },
  receivables: {
    name: "receivables",
    label: "채권(미수금)",
    module: "receivables",
    idPrefix: "R-",
    idPad: 4,
    defaultSort: "due_date",
    fields: base([
      { key: "id", label: "채권관리 ID", type: "text", readonly: true, list: true },
      { key: "contract_id", label: "계약 ID", type: "text", required: true, list: true, ref: "sale_contracts" },
      { key: "asset_id", label: "자산 ID", type: "text", readonly: true, list: true },
      { key: "rec_type", label: "채권유형", type: "select", options: { BALANCE: "잔금", MIDDLE: "중도금", DEPOSIT: "계약금" }, required: true, list: true },
      { key: "billed_amount", label: "청구 확정액", type: "money", required: true, protected: true, list: true, min: 0 },
      { key: "due_date", label: "납부기한", type: "date", required: true, list: true, help: "연체 기산일 = 납부기한 다음날" },
      { key: "notice_count", label: "최고장 발송차수", type: "int", min: 0, list: true },
      { key: "last_notice_date", label: "최근 최고장 발송일", type: "date" },
      { key: "negotiation_status", label: "회수협의 상태", type: "select", options: { NONE: "미협의", CONTACTING: "연락중", NEGOTIATING: "협의중", PROMISED: "납부약정", LEGAL: "법적조치", TERMINATING: "해지검토", CLOSED: "종결" }, list: true },
      { key: "promise_date", label: "납부약정일", type: "date" },
      { key: "expected_amount", label: "회수예정액", type: "money", min: 0 },
      { key: "expected_date", label: "회수예정일", type: "date" },
      { key: "legal_action", label: "법률조치", type: "bool", options: YN },
      { key: "status", label: "상태", type: "select", options: { OPEN: "관리중", CLOSED: "종결" }, required: true, list: true },
      { key: "manager", label: "담당자", type: "text" },
      { key: "note", label: "비고", type: "textarea" },
    ]),
  },
  collection_actions: {
    name: "collection_actions",
    label: "회수조치 이력",
    module: "receivables",
    idPrefix: "CA-",
    idPad: 5,
    defaultSort: "action_date desc",
    fields: base([
      { key: "id", label: "ID", type: "text", readonly: true, list: true },
      { key: "receivable_id", label: "채권관리 ID", type: "text", required: true, list: true, ref: "receivables" },
      { key: "action_date", label: "조치일", type: "date", required: true, list: true },
      { key: "action_type", label: "조치유형", type: "select", options: { NOTICE: "최고장 발송", CALL: "유선독촉", VISIT: "방문면담", PROMISE: "납부약정", LEGAL: "법률조치", OTHER: "기타" }, required: true, list: true },
      { key: "round", label: "차수", type: "int", min: 0, list: true },
      { key: "note", label: "내용", type: "textarea", list: true },
    ]),
  },
  leases: {
    name: "leases",
    label: "임대차/MD",
    module: "leasing",
    idPrefix: "L-",
    idPad: 4,
    defaultSort: "asset_id",
    fields: base([
      { key: "id", label: "임대 ID", type: "text", readonly: true, list: true },
      { key: "asset_id", label: "자산 ID", type: "text", required: true, list: true, ref: "assets" },
      { key: "tenant_name", label: "임차인(상호)", type: "text", list: true },
      { key: "desired_industry", label: "희망 업종", type: "text" },
      { key: "actual_industry", label: "실제 업종", type: "text", list: true },
      { key: "deposit", label: "보증금", type: "money", min: 0, list: true },
      { key: "monthly_rent", label: "월임대료", type: "money", min: 0, list: true },
      { key: "mgmt_fee", label: "관리비(월)", type: "money", min: 0 },
      { key: "rent_free_months", label: "렌트프리(개월)", type: "int", min: 0, max: 36 },
      { key: "start_date", label: "계약 시작일", type: "date", list: true },
      { key: "end_date", label: "계약 종료일", type: "date", list: true },
      { key: "move_in_date", label: "입점예정일", type: "date" },
      { key: "open_date", label: "영업개시일", type: "date" },
      { key: "leasing_fee", label: "임대유치수수료", type: "money", min: 0 },
      { key: "tenant_support", label: "임차인 지원금", type: "money", min: 0 },
      { key: "negotiation_status", label: "협상상태", type: "select", options: LEASE_STATUS_LABEL, required: true, list: true },
      { key: "income_recipient", label: "임대수익 귀속", type: "select", options: RECIPIENT_LABEL, required: true, list: true },
      { key: "is_anchor", label: "앵커테넌트", type: "bool", options: YN },
      { key: "manager", label: "담당자", type: "text" },
      { key: "note", label: "비고", type: "textarea" },
    ]),
    validate: (r) => {
      const e: string[] = [];
      if (r.start_date && r.end_date && String(r.end_date) <= String(r.start_date)) e.push("계약 종료일은 시작일 이후여야 합니다.");
      if (["CONTRACTED", "OPEN"].includes(String(r.negotiation_status)) && (!r.start_date || !r.end_date)) e.push("계약완료/영업중 상태는 계약기간이 필요합니다.");
      return e;
    },
  },
  crm_leads: {
    name: "crm_leads",
    label: "영업 상담",
    module: "crm",
    idPrefix: "CL-",
    idPad: 4,
    defaultSort: "consult_date desc",
    ownerField: "manager",
    ownerRoles: ["SALES"],
    fields: base([
      { key: "id", label: "고객관리 ID", type: "text", readonly: true, list: true },
      { key: "consult_date", label: "상담일", type: "date", required: true, list: true },
      { key: "channel", label: "상담경로", type: "select", options: { WALKIN: "현장방문", PHONE: "전화문의", ONLINE: "온라인광고", AGENCY: "중개법인", REFERRAL: "지인소개", EVENT: "설명회" }, required: true, list: true },
      { key: "manager", label: "담당자", type: "text", list: true },
      { key: "interest_type", label: "관심 시설유형", type: "select", options: FACILITY_LABEL, list: true },
      { key: "interest_asset_id", label: "관심 자산 ID", type: "text", ref: "assets", list: true },
      { key: "initial_price", label: "최초 제시가격", type: "money", min: 0 },
      { key: "discount_offer_rate", label: "할인 제안(%)", type: "rate", min: 0, max: 60 },
      { key: "deferral_terms", label: "잔금유예 조건", type: "text" },
      { key: "customer_wish", label: "고객 희망조건", type: "text" },
      { key: "expected_contract_date", label: "예상 계약일", type: "date" },
      { key: "stage", label: "진행상태", type: "select", options: LEAD_STAGE_LABEL, required: true, list: true },
      { key: "visited", label: "현장방문 여부", type: "bool", options: YN },
      { key: "valid", label: "유효상담", type: "bool", options: YN },
      { key: "next_date", label: "다음 상담예정일", type: "date", list: true },
      { key: "contracted", label: "계약완료", type: "bool", options: YN },
      { key: "contract_amount", label: "계약금액", type: "money", min: 0 },
      { key: "contract_id", label: "연결 계약 ID", type: "text", ref: "sale_contracts" },
      { key: "is_resale", label: "재판매 건", type: "bool", options: YN },
      { key: "customer_name", label: "고객명", type: "text", pii: true, list: true },
      { key: "customer_phone", label: "연락처", type: "text", pii: true },
      { key: "note", label: "비고", type: "textarea" },
    ]),
  },
  sales_policies: {
    name: "sales_policies",
    label: "판매조건(정책)",
    module: "feasibility",
    idPrefix: "SP-",
    idPad: 3,
    defaultSort: "id",
    fields: base([
      { key: "id", label: "정책 ID", type: "text", readonly: true, list: true },
      { key: "name", label: "정책명", type: "text", required: true, list: true },
      { key: "discount_rate", label: "할인율(%)", type: "rate", min: 0, max: 60, list: true },
      { key: "deposit_rate", label: "계약금(%)", type: "rate", min: 0, max: 100, list: true },
      { key: "middle_rate", label: "중도금(%)", type: "rate", min: 0, max: 100 },
      { key: "balance_rate", label: "잔금(%)", type: "rate", min: 0, max: 100, list: true },
      { key: "deferral_rate", label: "잔금유예(%)", type: "rate", min: 0, max: 100, list: true },
      { key: "deferral_basis", label: "유예율 기준", type: "select", options: { SUPPLY: "공급금액 대비", BALANCE: "잔금 대비" } },
      { key: "deferral_months", label: "유예기간(개월)", type: "int", min: 0, max: 60 },
      { key: "deferral_interest_rate", label: "유예이자율(%)", type: "rate", min: 0, max: 30 },
      { key: "agency_fee_rate", label: "분양대행수수료(%)", type: "rate", min: 0, max: 20 },
      { key: "ad_cost", label: "광고비(호실당)", type: "money", min: 0 },
      { key: "other_support", label: "기타 지원비(호실당)", type: "money", min: 0 },
      { key: "status", label: "상태", type: "select", options: { DRAFT: "검토", APPROVED: "승인", RETIRED: "폐지" }, list: true },
      { key: "effective_from", label: "적용개시일", type: "date" },
      { key: "note", label: "비고", type: "textarea" },
    ]),
    validate: (r) => {
      const s = (Number(r.deposit_rate) || 0) + (Number(r.middle_rate) || 0) + (Number(r.balance_rate) || 0);
      return Math.abs(s - 100) > 0.01 ? [`계약금+중도금+잔금 비율의 합(${s}%)이 100%가 아닙니다.`] : [];
    },
  },
  expenses: {
    name: "expenses",
    label: "사업비",
    module: "feasibility",
    idPrefix: "EX-",
    idPad: 3,
    defaultSort: "id",
    fields: base([
      { key: "id", label: "ID", type: "text", readonly: true, list: true },
      { key: "category", label: "계정", type: "select", options: EXPENSE_CATEGORY_LABEL, required: true, list: true },
      { key: "item", label: "세부항목", type: "text", required: true, list: true },
      { key: "budget_amount", label: "총 사업비 계획", type: "money", min: 0, list: true, protected: true },
      { key: "executed_amount", label: "기집행(채무모듈 외)", type: "money", min: 0, list: true, help: "채무관리 모듈로 상환한 금액은 제외하고 입력(자동 합산)" },
      { key: "planned_amount", label: "향후 예정액", type: "money", min: 0, list: true, help: "채무로 등록되지 않은 미래 지출만 입력" },
      { key: "planned_month", label: "지출 예정월", type: "month", list: true },
      { key: "note", label: "비고", type: "textarea" },
    ]),
  },
  debts: {
    name: "debts",
    label: "채무",
    module: "cashflow",
    idPrefix: "D-",
    idPad: 3,
    defaultSort: "priority",
    fields: base([
      { key: "id", label: "채무 ID", type: "text", readonly: true, list: true },
      { key: "debt_type", label: "채무유형", type: "select", options: DEBT_TYPE_LABEL, required: true, list: true },
      { key: "creditor", label: "채권자 구분", type: "text", required: true, list: true },
      { key: "description", label: "내용", type: "text" },
      { key: "principal", label: "발생원금", type: "money", required: true, protected: true, list: true, min: 0 },
      { key: "interest_penalty", label: "이자 및 가산금", type: "money", protected: true, min: 0 },
      { key: "interest_rate", label: "적용이율(연%)", type: "rate", min: 0, max: 30, help: "잔여원금 기준 월 이자를 현금흐름에 반영" },
      { key: "due_date", label: "납부기한", type: "date", list: true },
      { key: "installment_status", label: "분납 협의상태", type: "select", options: { NONE: "해당없음", NEGOTIATING: "협의중", AGREED: "분납합의" }, list: true },
      { key: "priority", label: "우선순위", type: "int", min: 1, max: 99, required: true, list: true, protected: true, help: "작을수록 우선 상환(승인 필요)" },
      { key: "negotiator", label: "협의 담당자", type: "text" },
      { key: "note", label: "비고", type: "textarea" },
    ]),
  },
  debt_repayments: {
    name: "debt_repayments",
    label: "채무 상환(계획/실적)",
    module: "cashflow",
    idPrefix: "DR-",
    idPad: 5,
    defaultSort: "month",
    approvalOnDelete: true,
    fields: base([
      { key: "id", label: "ID", type: "text", readonly: true, list: true },
      { key: "debt_id", label: "채무 ID", type: "text", required: true, list: true, ref: "debts" },
      { key: "kind", label: "구분", type: "select", options: { PLAN: "상환계획", ACTUAL: "상환실적" }, required: true, list: true },
      { key: "month", label: "상환월", type: "month", required: true, list: true },
      { key: "pay_date", label: "실제 상환일", type: "date" },
      { key: "amount", label: "금액", type: "money", required: true, list: true, protected: true, min: 0 },
      { key: "note", label: "비고", type: "textarea" },
    ]),
  },
  cashflow_actuals: {
    name: "cashflow_actuals",
    label: "현금흐름 실적(수기)",
    module: "cashflow",
    idPrefix: "CFA-",
    idPad: 5,
    defaultSort: "month",
    fields: base([
      { key: "id", label: "ID", type: "text", readonly: true, list: true },
      { key: "month", label: "월", type: "month", required: true, list: true },
      { key: "account", label: "계정", type: "select", options: CASH_ACCOUNT_LABEL, required: true, list: true },
      { key: "amount", label: "금액", type: "money", required: true, min: 0, list: true },
      { key: "note", label: "비고", type: "textarea", list: true },
    ]),
  },
  cashflow_forecasts: {
    name: "cashflow_forecasts",
    label: "현금흐름 예상(수기)",
    module: "cashflow",
    idPrefix: "CFF-",
    idPad: 5,
    defaultSort: "month",
    fields: base([
      { key: "id", label: "ID", type: "text", readonly: true, list: true },
      { key: "scenario", label: "적용 시나리오", type: "select", options: { ALL: "전체", CONS: "보수", BASE: "기준", OPT: "낙관" }, required: true, list: true },
      { key: "month", label: "월", type: "month", required: true, list: true },
      { key: "account", label: "계정", type: "select", options: CASH_ACCOUNT_LABEL, required: true, list: true },
      { key: "amount", label: "금액", type: "money", required: true, min: 0, list: true },
      { key: "note", label: "비고", type: "textarea", list: true },
    ]),
  },
  issues: {
    name: "issues",
    label: "하자·민원",
    module: "operations",
    idPrefix: "I-",
    idPad: 4,
    defaultSort: "received_date desc",
    fields: base([
      { key: "id", label: "ID", type: "text", readonly: true, list: true },
      { key: "asset_id", label: "자산 ID", type: "text", ref: "assets", list: true },
      { key: "issue_kind", label: "구분", type: "select", options: { DEFECT: "하자", COMPLAINT: "민원" }, required: true, list: true },
      { key: "defect_type", label: "하자/민원 유형", type: "select", options: { WATER: "누수·결로", ELEC: "전기·통신", MECH: "기계·설비", FINISH: "마감·도장", WINDOW: "창호", FIRE: "소방", NOISE: "소음", PARKING: "주차·공용", ETC: "기타" }, list: true },
      { key: "received_date", label: "접수일", type: "date", required: true, list: true },
      { key: "reporter", label: "접수자", type: "text" },
      { key: "description", label: "피해내용", type: "textarea", required: true },
      { key: "stage", label: "진행단계", type: "select", options: ISSUE_STAGE_LABEL, required: true, list: true },
      { key: "contractor_status", label: "시공사 협의상태", type: "text" },
      { key: "responsible", label: "책임주체", type: "text", list: true },
      { key: "warranty_due", label: "하자담보 만료일", type: "date" },
      { key: "planned_date", label: "보수예정일", type: "date", list: true },
      { key: "completed_date", label: "보수완료일", type: "date" },
      { key: "cost", label: "보수비용", type: "money", min: 0, list: true },
      { key: "cost_bearer", label: "비용부담", type: "select", options: { CONTRACTOR: "시공사", DEVELOPER: "사업시행법인", OWNER: "소유자", UNDECIDED: "미정" }, list: true },
      { key: "recurrence", label: "재발", type: "bool", options: YN },
      { key: "complaint_status", label: "민원 처리상태", type: "text" },
      { key: "note", label: "비고", type: "textarea" },
    ]),
  },
  legal_cases: {
    name: "legal_cases",
    label: "법률·리스크",
    module: "risks",
    idPrefix: "RK-",
    idPad: 3,
    defaultSort: "next_action_date",
    confidentialField: "confidential",
    fields: base([
      { key: "id", label: "리스크 ID", type: "text", readonly: true, list: true },
      { key: "risk_type", label: "유형", type: "select", options: { TERMINATION: "분양계약 해지", REFUND_DISPUTE: "분양대금 반환분쟁", MIDDLE_LOAN: "중도금대출 위험", SUBROGATION: "대위변제 위험", LAWSUIT: "소송", COLLECTION_LEGAL: "채권회수 법률조치", TRUST_FINANCE: "신탁·금융기관 협의", CONTRACT_CHANGE: "계약조건 변경", FUND_APPROVAL: "자금집행 승인", OTHER: "기타" }, required: true, list: true },
      { key: "title", label: "제목", type: "text", required: true, list: true },
      { key: "occurred_date", label: "발생일", type: "date", required: true, list: true },
      { key: "related_id", label: "관련 계약/자산 ID", type: "text", list: true },
      { key: "status", label: "진행상태", type: "select", options: RISK_STATUS_LABEL, required: true, list: true },
      { key: "priority", label: "우선순위", type: "select", options: PRIORITY_LABEL, required: true, list: true },
      { key: "owner", label: "담당자", type: "text", list: true },
      { key: "expected_cost", label: "예상 비용", type: "money", min: 0, list: true },
      { key: "cost_month", label: "비용 발생 예상월", type: "month" },
      { key: "plan", label: "대응계획", type: "textarea" },
      { key: "next_action_date", label: "다음 조치일", type: "date", list: true },
      { key: "completed_date", label: "완료일", type: "date" },
      { key: "confidential", label: "법률 기밀문서", type: "bool", options: YN },
      { key: "note", label: "비고", type: "textarea" },
    ]),
  },
};

export const ENTITY_NAMES = Object.keys(ENTITIES) as EntityName[];

export function isEntityName(s: string): s is EntityName {
  return s in ENTITIES;
}

/** 필드 단위 값 정규화 + 검증 (서버/Excel 공용). 반환: [정규화된 행, 오류목록] */
export function normalizeRow(
  def: EntityDef,
  input: Record<string, unknown>,
  opts: { partial?: boolean } = {},
): [Record<string, unknown>, string[]] {
  const out: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const f of def.fields) {
    if (!(f.key in input)) {
      if (!opts.partial && f.required && !(f.key === "id" && def.idPrefix)) errors.push(`${f.label}: 필수 입력값입니다.`);
      continue;
    }
    let v = input[f.key];
    if (typeof v === "string") v = v.trim();
    if (v === "" || v === undefined) v = null;
    if (v === null) {
      if (f.required && !(f.key === "id" && def.idPrefix)) errors.push(`${f.label}: 필수 입력값입니다.`);
      out[f.key] = ["money", "int", "number", "rate", "area"].includes(f.type) ? (f.required ? null : 0) : f.type === "bool" ? 0 : null;
      continue;
    }
    switch (f.type) {
      case "money":
      case "int":
      case "number":
      case "rate":
      case "area": {
        const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s원%]/g, ""));
        if (!Number.isFinite(n)) {
          errors.push(`${f.label}: 숫자 형식이 아닙니다 (${String(v)}).`);
          continue;
        }
        const val = f.type === "money" || f.type === "int" ? Math.round(n) : n;
        if (f.min !== undefined && val < f.min) errors.push(`${f.label}: ${f.min} 이상이어야 합니다.`);
        if (f.max !== undefined && val > f.max) errors.push(`${f.label}: ${f.max} 이하여야 합니다.`);
        out[f.key] = val;
        break;
      }
      case "bool": {
        const s = String(v).toLowerCase();
        out[f.key] = ["1", "true", "y", "yes", "예", "o"].includes(s) ? 1 : 0;
        break;
      }
      case "date": {
        let s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).replace(/[./]/g, "-");
        if (/^\d{8}$/.test(s)) s = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
          errors.push(`${f.label}: 날짜 형식(YYYY-MM-DD)이 아닙니다 (${String(v)}).`);
          continue;
        }
        out[f.key] = s;
        break;
      }
      case "month": {
        let s = v instanceof Date ? v.toISOString().slice(0, 7) : String(v).replace(/[./]/g, "-");
        if (/^\d{6}$/.test(s)) s = `${s.slice(0, 4)}-${s.slice(4, 6)}`;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = s.slice(0, 7);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) {
          errors.push(`${f.label}: 월 형식(YYYY-MM)이 아닙니다 (${String(v)}).`);
          continue;
        }
        out[f.key] = s;
        break;
      }
      case "select": {
        const s = String(v);
        if (f.options && !(s in f.options)) {
          // 라벨로 입력된 경우 코드로 변환 (Excel 업로드 편의)
          const hit = Object.entries(f.options).find(([, lab]) => lab === s);
          if (hit) out[f.key] = hit[0];
          else errors.push(`${f.label}: 허용되지 않는 값입니다 (${s}).`);
        } else out[f.key] = s;
        break;
      }
      default:
        out[f.key] = String(v).slice(0, 2000);
    }
  }
  return [out, errors];
}
