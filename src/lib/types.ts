// 공통 도메인 타입 및 코드값 라벨 (클라이언트·서버 공용)

export type RoleCode = "EXTERNAL" | "EXECUTIVE" | "PM" | "SALES" | "LEASING" | "FINANCE" | "ADMIN";

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  role: RoleCode;
  piiAccess: boolean;
}

export type FacilityType = "OFFICETEL" | "RETAIL";

export interface Asset {
  id: string;
  facility_type: FacilityType;
  building: string;
  floor: number;
  exclusive_area: number;
  contract_area: number;
  usage: string;
  list_price: number; // 최초 분양가격(공급예정금액)
  current_price: number; // 현재 분양가격(판매 기준가)
  is_sale_target: number; // 분양대상 여부
  leasable: number; // 임대 대상(근생) 여부
  recommended_industry: string | null;
  manager: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type ContractStatus = "ACTIVE" | "COMPLETED" | "TERMINATED";

export interface SaleContract {
  id: string;
  asset_id: string;
  contract_date: string;
  list_price_at_contract: number;
  discount_amount: number;
  supply_price: number; // 할인 후 공급금액
  deposit_amount: number;
  middle_amount: number;
  balance_amount: number;
  balance_due_date: string | null;
  late_fee_rate: number; // 연 연체이율(%)
  middle_loan_maturity: string | null;
  middle_loan_interest: number; // 중도금 대납이자(사업주체 부담분)
  status: ContractStatus;
  is_resale: number;
  prev_contract_id: string | null;
  terminated_at: string | null;
  termination_reason: string | null;
  sales_manager: string | null;
  party_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractParty {
  id: string;
  party_type: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentType = "DEPOSIT" | "MIDDLE" | "BALANCE" | "DEFERRAL" | "LATE_FEE" | "REFUND";

export interface Payment {
  id: string;
  contract_id: string;
  asset_id: string;
  pay_type: PaymentType;
  amount: number;
  paid_date: string;
  deferral_id: string | null;
  method: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Deferral {
  id: string;
  contract_id: string;
  asset_id: string;
  basis: "SUPPLY" | "BALANCE";
  deferral_rate: number;
  deferred_amount: number;
  interest_rate: number;
  start_date: string;
  maturity_date: string;
  status: "ACTIVE" | "REPAID" | "DEFAULT" | "CANCELLED";
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Receivable {
  id: string;
  contract_id: string;
  asset_id: string;
  rec_type: "BALANCE" | "MIDDLE" | "DEPOSIT";
  billed_amount: number;
  due_date: string;
  notice_count: number;
  last_notice_date: string | null;
  negotiation_status: string;
  promise_date: string | null;
  expected_amount: number;
  expected_date: string | null;
  legal_action: number;
  status: "OPEN" | "CLOSED";
  manager: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CollectionAction {
  id: string;
  receivable_id: string;
  action_date: string;
  action_type: "NOTICE" | "CALL" | "VISIT" | "PROMISE" | "LEGAL" | "OTHER";
  round: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lease {
  id: string;
  asset_id: string;
  tenant_name: string | null;
  desired_industry: string | null;
  actual_industry: string | null;
  deposit: number;
  monthly_rent: number;
  mgmt_fee: number;
  rent_free_months: number;
  start_date: string | null;
  end_date: string | null;
  move_in_date: string | null;
  open_date: string | null;
  leasing_fee: number;
  tenant_support: number;
  negotiation_status: "LEAD" | "NEGOTIATING" | "LOI" | "CONTRACTED" | "OPEN" | "TERMINATED" | "DROPPED";
  income_recipient: "OWNER" | "DEVELOPER" | "OPERATOR";
  is_anchor: number;
  manager: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type LeadStage =
  | "INFLOW"
  | "CONSULT"
  | "VISIT"
  | "OFFER"
  | "NEGOTIATE"
  | "CONTRACTED"
  | "BALANCE_PAID"
  | "AFTERCARE"
  | "DROPPED";

export interface CrmLead {
  id: string;
  consult_date: string;
  channel: string;
  manager: string | null;
  interest_type: FacilityType | "ANY";
  interest_asset_id: string | null;
  initial_price: number;
  discount_offer_rate: number;
  deferral_terms: string | null;
  customer_wish: string | null;
  expected_contract_date: string | null;
  stage: LeadStage;
  visited: number;
  valid: number;
  next_date: string | null;
  contracted: number;
  contract_amount: number;
  contract_id: string | null;
  is_resale: number;
  customer_name: string | null;
  customer_phone: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesPolicy {
  id: string;
  name: string;
  discount_rate: number;
  deposit_rate: number;
  middle_rate: number;
  balance_rate: number;
  deferral_rate: number;
  deferral_basis: "SUPPLY" | "BALANCE";
  deferral_months: number;
  deferral_interest_rate: number;
  agency_fee_rate: number;
  ad_cost: number;
  other_support: number;
  status: "DRAFT" | "APPROVED" | "RETIRED";
  effective_from: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type ExpenseCategory =
  | "LAND"
  | "CONSTRUCTION"
  | "DESIGN"
  | "AGENCY_FEE"
  | "AD"
  | "FINANCE"
  | "TAX"
  | "OPERATION"
  | "BUILDING_MGMT"
  | "DEFECT"
  | "LEGAL"
  | "OTHER";

export interface Expense {
  id: string;
  category: ExpenseCategory;
  item: string;
  budget_amount: number;
  executed_amount: number;
  planned_amount: number;
  planned_month: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type DebtType = "NATIONAL_TAX" | "LOCAL_TAX" | "CONSTRUCTION" | "FINANCE" | "OPEX" | "OTHER";

export interface Debt {
  id: string;
  debt_type: DebtType;
  creditor: string;
  description: string | null;
  principal: number;
  interest_penalty: number;
  interest_rate: number; // 연 이자율(%) — 금융원리금 등 잔액 기준 월 이자 산정
  due_date: string | null;
  installment_status: "NONE" | "NEGOTIATING" | "AGREED";
  priority: number;
  negotiator: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface DebtRepayment {
  id: string;
  debt_id: string;
  kind: "PLAN" | "ACTUAL";
  month: string; // YYYY-MM
  pay_date: string | null;
  amount: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type CashAccount =
  | "RENT"
  | "OTHER_IN"
  | "TAX"
  | "CONSTRUCTION"
  | "FINANCE"
  | "SALES_COST"
  | "OPEX"
  | "LEGAL_DEFECT"
  | "OTHER_OUT";

export interface CashflowEntry {
  id: string;
  month: string;
  account: CashAccount;
  amount: number;
  scenario?: "ALL" | "CONS" | "BASE" | "OPT";
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Issue {
  id: string;
  asset_id: string | null;
  issue_kind: "DEFECT" | "COMPLAINT";
  defect_type: string;
  received_date: string;
  reporter: string | null;
  description: string;
  stage: "RECEIVED" | "INSPECTED" | "ANALYZED" | "NEGOTIATING" | "REPAIRING" | "DONE" | "RECHECK";
  contractor_status: string | null;
  responsible: string | null;
  warranty_due: string | null;
  planned_date: string | null;
  completed_date: string | null;
  cost: number;
  cost_bearer: "CONTRACTOR" | "DEVELOPER" | "OWNER" | "UNDECIDED";
  recurrence: number;
  complaint_status: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface LegalCase {
  id: string;
  risk_type: string;
  title: string;
  occurred_date: string;
  related_id: string | null;
  status: "OPEN" | "IN_PROGRESS" | "MONITORING" | "CLOSED";
  priority: "HIGH" | "MEDIUM" | "LOW";
  owner: string | null;
  expected_cost: number;
  cost_month: string | null;
  plan: string | null;
  next_action_date: string | null;
  completed_date: string | null;
  confidential: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  project_name: string;
  base_date: string;
  completion_date: string;
  opening_cash: number;
  opening_cash_month: string;
  cashflow_start: string;
  cashflow_months: number;
  min_cash: number;
  project_funding_rate: number;
  external_show_amounts: boolean;
  targets: Record<string, number>;
  scenarios: Record<ScenarioKey, ScenarioAssumptions>;
}

export type ScenarioKey = "CONS" | "BASE" | "OPT";

export interface ScenarioAssumptions {
  label: string;
  officetelUnitsPerMonth: number;
  retailUnitsPerMonth: number;
  salesStartDelay: number; // 판매 개시 지연(개월)
  discountRate: number; // 신규판매 할인율(%)
  depositRate: number; // 계약금 비율(%)
  balanceLagMonths: number; // 계약 후 잔금까지(개월)
  deferralRate: number; // 잔금유예 비율(공급가 대비 %)
  deferralMonths: number;
  agencyFeeRate: number; // 분양대행수수료율(%)
  monthlyAdCost: number;
  collectionRate: number; // 기존 미수금 회수율(%)
  collectionDelay: number; // 회수예정일 지연(개월)
  unplannedCollectionMonths: number; // 회수일정 미정 미수금 분산 회수기간
  leaseUpSqmPerMonth: number; // 사업주체 보유 공실 신규임대 면적(㎡/월)
  rentPerSqm: number; // ㎡당 월임대료
  rentFreeMonths: number;
  monthlyOpex: number; // 인건비·운영비(월)
  autoRepay: boolean; // 잉여현금 우선순위 자동상환
}

// ---------- 라벨 ----------
export const ROLE_LABEL: Record<RoleCode, string> = {
  EXTERNAL: "외부 보고자",
  EXECUTIVE: "경영진",
  PM: "사업관리 PM",
  SALES: "분양 담당자",
  LEASING: "임대 담당자",
  FINANCE: "재무 담당자",
  ADMIN: "시스템 관리자",
};

export const FACILITY_LABEL: Record<string, string> = {
  OFFICETEL: "오피스텔",
  RETAIL: "근린생활시설",
  ANY: "무관",
};

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  ACTIVE: "계약유효",
  COMPLETED: "완납",
  TERMINATED: "해지",
};

export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  DEPOSIT: "계약금",
  MIDDLE: "중도금",
  BALANCE: "잔금",
  DEFERRAL: "유예금 회수",
  LATE_FEE: "연체료",
  REFUND: "해지 환급(-)",
};

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  INFLOW: "고객유입",
  CONSULT: "상담등록",
  VISIT: "현장방문",
  OFFER: "조건제시",
  NEGOTIATE: "계약협의",
  CONTRACTED: "계약체결",
  BALANCE_PAID: "잔금납부",
  AFTERCARE: "사후관리",
  DROPPED: "이탈",
};

export const LEASE_STATUS_LABEL: Record<Lease["negotiation_status"], string> = {
  LEAD: "문의",
  NEGOTIATING: "협상중",
  LOI: "LOI",
  CONTRACTED: "계약완료",
  OPEN: "영업중",
  TERMINATED: "종료",
  DROPPED: "무산",
};

export const RECIPIENT_LABEL: Record<Lease["income_recipient"], string> = {
  OWNER: "개별 소유자",
  DEVELOPER: "사업시행법인",
  OPERATOR: "운영법인",
};

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  LAND: "토지비",
  CONSTRUCTION: "공사비",
  DESIGN: "설계·감리·인허가",
  AGENCY_FEE: "분양대행수수료",
  AD: "광고홍보비",
  FINANCE: "금융비용",
  TAX: "국세 및 지방세",
  OPERATION: "운영비",
  BUILDING_MGMT: "건물관리비",
  DEFECT: "하자 관련 비용",
  LEGAL: "소송·법률비용",
  OTHER: "기타 사업비",
};

export const DEBT_TYPE_LABEL: Record<DebtType, string> = {
  NATIONAL_TAX: "국세",
  LOCAL_TAX: "지방세",
  CONSTRUCTION: "미지급 공사비",
  FINANCE: "금융원리금",
  OPEX: "운영비 미지급금",
  OTHER: "기타 미지급 비용",
};

// 채무 유형 → 사업비 계정 매핑(사업수지 중복집계 방지)
export const DEBT_TO_EXPENSE: Record<DebtType, ExpenseCategory> = {
  NATIONAL_TAX: "TAX",
  LOCAL_TAX: "TAX",
  CONSTRUCTION: "CONSTRUCTION",
  FINANCE: "FINANCE",
  OPEX: "OPERATION",
  OTHER: "OTHER",
};

export const CASH_ACCOUNT_LABEL: Record<CashAccount, string> = {
  RENT: "임대수입(사업주체)",
  OTHER_IN: "기타 자금유입",
  TAX: "세금 납부",
  CONSTRUCTION: "공사비 지급",
  FINANCE: "금융원리금 상환",
  SALES_COST: "판매·광고비",
  OPEX: "인건비 및 운영비",
  LEGAL_DEFECT: "법률·하자 비용",
  OTHER_OUT: "기타 지출",
};

export const ISSUE_STAGE_LABEL: Record<Issue["stage"], string> = {
  RECEIVED: "접수",
  INSPECTED: "현장확인",
  ANALYZED: "원인분석",
  NEGOTIATING: "보수협의",
  REPAIRING: "보수진행",
  DONE: "완료확인",
  RECHECK: "재발점검",
};

export const RISK_STATUS_LABEL: Record<LegalCase["status"], string> = {
  OPEN: "발생",
  IN_PROGRESS: "대응중",
  MONITORING: "모니터링",
  CLOSED: "종결",
};

export const PRIORITY_LABEL: Record<LegalCase["priority"], string> = {
  HIGH: "상",
  MEDIUM: "중",
  LOW: "하",
};
