import type {
  Asset,
  CashflowEntry,
  CollectionAction,
  CrmLead,
  Debt,
  DebtRepayment,
  Deferral,
  Expense,
  Issue,
  LegalCase,
  Lease,
  Payment,
  Receivable,
  SaleContract,
  SalesPolicy,
  Settings,
} from "../types";

/** 계산엔진 입력 — 서버에서 DB 전체를 읽어 구성 */
export interface ProjectData {
  settings: Settings;
  assets: Asset[];
  contracts: SaleContract[];
  payments: Payment[];
  deferrals: Deferral[];
  receivables: Receivable[];
  actions: CollectionAction[];
  leases: Lease[];
  leads: CrmLead[];
  policies: SalesPolicy[];
  expenses: Expense[];
  debts: Debt[];
  repayments: DebtRepayment[];
  cfActuals: CashflowEntry[];
  cfForecasts: CashflowEntry[];
  issues: Issue[];
  risks: LegalCase[];
}
