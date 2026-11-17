// SQLite DDL (PostgreSQL 이식용 DDL은 docs/schema.postgres.sql 참고)
// 모든 업무 테이블: 고유 ID, created_at, updated_at, 관련 자산 ID(해당 시), 변경이력(audit_logs) 연결

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS roles (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role_code TEXT NOT NULL REFERENCES roles(code),
  password_hash TEXT NOT NULL,
  pii_access INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  facility_type TEXT NOT NULL CHECK (facility_type IN ('OFFICETEL','RETAIL')),
  building TEXT,
  floor INTEGER NOT NULL,
  exclusive_area REAL NOT NULL,
  contract_area REAL NOT NULL,
  usage TEXT,
  list_price INTEGER NOT NULL,
  current_price INTEGER NOT NULL,
  is_sale_target INTEGER NOT NULL DEFAULT 1,
  leasable INTEGER NOT NULL DEFAULT 0,
  recommended_industry TEXT,
  manager TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contract_parties (
  id TEXT PRIMARY KEY,
  party_type TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sale_contracts (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  contract_date TEXT NOT NULL,
  list_price_at_contract INTEGER NOT NULL,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  supply_price INTEGER NOT NULL,
  deposit_amount INTEGER NOT NULL DEFAULT 0,
  middle_amount INTEGER NOT NULL DEFAULT 0,
  balance_amount INTEGER NOT NULL DEFAULT 0,
  balance_due_date TEXT,
  late_fee_rate REAL NOT NULL DEFAULT 12,
  middle_loan_maturity TEXT,
  middle_loan_interest INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','COMPLETED','TERMINATED')),
  is_resale INTEGER NOT NULL DEFAULT 0,
  prev_contract_id TEXT REFERENCES sale_contracts(id),
  terminated_at TEXT,
  termination_reason TEXT,
  sales_manager TEXT,
  party_id TEXT REFERENCES contract_parties(id),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_contracts_asset ON sale_contracts(asset_id);

CREATE TABLE IF NOT EXISTS deferrals (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES sale_contracts(id),
  asset_id TEXT NOT NULL REFERENCES assets(id),
  basis TEXT NOT NULL DEFAULT 'SUPPLY',
  deferral_rate REAL NOT NULL DEFAULT 0,
  deferred_amount INTEGER NOT NULL,
  interest_rate REAL NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL,
  maturity_date TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_deferrals_contract ON deferrals(contract_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES sale_contracts(id),
  asset_id TEXT NOT NULL REFERENCES assets(id),
  pay_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  paid_date TEXT NOT NULL,
  deferral_id TEXT REFERENCES deferrals(id),
  method TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_payments_contract ON payments(contract_id);

CREATE TABLE IF NOT EXISTS receivables (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES sale_contracts(id),
  asset_id TEXT NOT NULL REFERENCES assets(id),
  rec_type TEXT NOT NULL,
  billed_amount INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  notice_count INTEGER NOT NULL DEFAULT 0,
  last_notice_date TEXT,
  negotiation_status TEXT NOT NULL DEFAULT 'NONE',
  promise_date TEXT,
  expected_amount INTEGER NOT NULL DEFAULT 0,
  expected_date TEXT,
  legal_action INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN',
  manager TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_receivables_contract ON receivables(contract_id);

CREATE TABLE IF NOT EXISTS collection_actions (
  id TEXT PRIMARY KEY,
  receivable_id TEXT NOT NULL REFERENCES receivables(id),
  action_date TEXT NOT NULL,
  action_type TEXT NOT NULL,
  round INTEGER,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leases (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  tenant_name TEXT,
  desired_industry TEXT,
  actual_industry TEXT,
  deposit INTEGER NOT NULL DEFAULT 0,
  monthly_rent INTEGER NOT NULL DEFAULT 0,
  mgmt_fee INTEGER NOT NULL DEFAULT 0,
  rent_free_months INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  move_in_date TEXT,
  open_date TEXT,
  leasing_fee INTEGER NOT NULL DEFAULT 0,
  tenant_support INTEGER NOT NULL DEFAULT 0,
  negotiation_status TEXT NOT NULL,
  income_recipient TEXT NOT NULL,
  is_anchor INTEGER NOT NULL DEFAULT 0,
  manager TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_leases_asset ON leases(asset_id);

CREATE TABLE IF NOT EXISTS crm_leads (
  id TEXT PRIMARY KEY,
  consult_date TEXT NOT NULL,
  channel TEXT NOT NULL,
  manager TEXT,
  interest_type TEXT,
  interest_asset_id TEXT,
  initial_price INTEGER NOT NULL DEFAULT 0,
  discount_offer_rate REAL NOT NULL DEFAULT 0,
  deferral_terms TEXT,
  customer_wish TEXT,
  expected_contract_date TEXT,
  stage TEXT NOT NULL,
  visited INTEGER NOT NULL DEFAULT 0,
  valid INTEGER NOT NULL DEFAULT 1,
  next_date TEXT,
  contracted INTEGER NOT NULL DEFAULT 0,
  contract_amount INTEGER NOT NULL DEFAULT 0,
  contract_id TEXT,
  is_resale INTEGER NOT NULL DEFAULT 0,
  customer_name TEXT,
  customer_phone TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales_policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  discount_rate REAL NOT NULL DEFAULT 0,
  deposit_rate REAL NOT NULL DEFAULT 10,
  middle_rate REAL NOT NULL DEFAULT 0,
  balance_rate REAL NOT NULL DEFAULT 90,
  deferral_rate REAL NOT NULL DEFAULT 0,
  deferral_basis TEXT NOT NULL DEFAULT 'SUPPLY',
  deferral_months INTEGER NOT NULL DEFAULT 0,
  deferral_interest_rate REAL NOT NULL DEFAULT 0,
  agency_fee_rate REAL NOT NULL DEFAULT 0,
  ad_cost INTEGER NOT NULL DEFAULT 0,
  other_support INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  effective_from TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  item TEXT NOT NULL,
  budget_amount INTEGER NOT NULL DEFAULT 0,
  executed_amount INTEGER NOT NULL DEFAULT 0,
  planned_amount INTEGER NOT NULL DEFAULT 0,
  planned_month TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY,
  debt_type TEXT NOT NULL,
  creditor TEXT NOT NULL,
  description TEXT,
  principal INTEGER NOT NULL,
  interest_penalty INTEGER NOT NULL DEFAULT 0,
  interest_rate REAL NOT NULL DEFAULT 0,
  due_date TEXT,
  installment_status TEXT NOT NULL DEFAULT 'NONE',
  priority INTEGER NOT NULL DEFAULT 50,
  negotiator TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS debt_repayments (
  id TEXT PRIMARY KEY,
  debt_id TEXT NOT NULL REFERENCES debts(id),
  kind TEXT NOT NULL CHECK (kind IN ('PLAN','ACTUAL')),
  month TEXT NOT NULL,
  pay_date TEXT,
  amount INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_repay_debt ON debt_repayments(debt_id);

CREATE TABLE IF NOT EXISTS cashflow_actuals (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  account TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cashflow_forecasts (
  id TEXT PRIMARY KEY,
  scenario TEXT NOT NULL DEFAULT 'ALL',
  month TEXT NOT NULL,
  account TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  asset_id TEXT REFERENCES assets(id),
  issue_kind TEXT NOT NULL,
  defect_type TEXT,
  received_date TEXT NOT NULL,
  reporter TEXT,
  description TEXT NOT NULL,
  stage TEXT NOT NULL,
  contractor_status TEXT,
  responsible TEXT,
  warranty_due TEXT,
  planned_date TEXT,
  completed_date TEXT,
  cost INTEGER NOT NULL DEFAULT 0,
  cost_bearer TEXT NOT NULL DEFAULT 'UNDECIDED',
  recurrence INTEGER NOT NULL DEFAULT 0,
  complaint_status TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS legal_cases (
  id TEXT PRIMARY KEY,
  risk_type TEXT NOT NULL,
  title TEXT NOT NULL,
  occurred_date TEXT NOT NULL,
  related_id TEXT,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  owner TEXT,
  expected_cost INTEGER NOT NULL DEFAULT 0,
  cost_month TEXT,
  plan TEXT,
  next_action_date TEXT,
  completed_date TEXT,
  confidential INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  entity_type TEXT,
  entity_id TEXT,
  asset_id TEXT,
  category TEXT,
  filename TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  confidential INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('UPDATE','DELETE')),
  before_json TEXT,
  payload_json TEXT,
  reason TEXT,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','FAILED')),
  decided_by TEXT,
  decided_at TEXT,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  username TEXT,
  role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS report_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  base_date TEXT NOT NULL,
  data_version INTEGER NOT NULL,
  author TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
  approved_by TEXT,
  approved_at TEXT,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
