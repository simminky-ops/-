-- A-D PROJECT · PostgreSQL 이식용 DDL (운영 DB 전환 시 사용)
-- ※ 현재 애플리케이션은 SQLite(node:sqlite)로 구현·검증되어 있습니다.
--   PostgreSQL 전환 시 src/lib/server/db.ts 의 all/get/run/tx 를 pg 드라이버로 교체해야 하며,
--   이 DDL과 어댑터는 아직 실행 검증되지 않았습니다.

CREATE TABLE roles (code TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role_code TEXT NOT NULL REFERENCES roles(code),
  password_hash TEXT NOT NULL, pii_access BOOLEAN NOT NULL DEFAULT false, active BOOLEAN NOT NULL DEFAULT true,
  failed_count INT NOT NULL DEFAULT 0, locked_until TIMESTAMPTZ, last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE settings (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE assets (
  id TEXT PRIMARY KEY, facility_type TEXT NOT NULL CHECK (facility_type IN ('OFFICETEL','RETAIL')), building TEXT, floor INT NOT NULL,
  exclusive_area NUMERIC(10,2) NOT NULL, contract_area NUMERIC(10,2) NOT NULL, usage TEXT,
  list_price BIGINT NOT NULL, current_price BIGINT NOT NULL, is_sale_target BOOLEAN NOT NULL DEFAULT true, leasable BOOLEAN NOT NULL DEFAULT false,
  recommended_industry TEXT, manager TEXT, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE contract_parties (id TEXT PRIMARY KEY, party_type TEXT, name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE sale_contracts (
  id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), contract_date DATE NOT NULL,
  list_price_at_contract BIGINT NOT NULL, discount_amount BIGINT NOT NULL DEFAULT 0, supply_price BIGINT NOT NULL,
  deposit_amount BIGINT NOT NULL DEFAULT 0, middle_amount BIGINT NOT NULL DEFAULT 0, balance_amount BIGINT NOT NULL DEFAULT 0,
  balance_due_date DATE, late_fee_rate NUMERIC(6,3) NOT NULL DEFAULT 12, middle_loan_maturity DATE, middle_loan_interest BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','COMPLETED','TERMINATED')), is_resale BOOLEAN NOT NULL DEFAULT false,
  prev_contract_id TEXT REFERENCES sale_contracts(id), terminated_at DATE, termination_reason TEXT, sales_manager TEXT,
  party_id TEXT REFERENCES contract_parties(id), note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (deposit_amount + middle_amount + balance_amount = supply_price));
-- 자산당 유효계약 1건 (해지 이력은 무제한 보존)
CREATE UNIQUE INDEX ux_contract_active_asset ON sale_contracts(asset_id) WHERE status <> 'TERMINATED';
CREATE TABLE deferrals (
  id TEXT PRIMARY KEY, contract_id TEXT NOT NULL REFERENCES sale_contracts(id), asset_id TEXT NOT NULL REFERENCES assets(id),
  basis TEXT NOT NULL DEFAULT 'SUPPLY', deferral_rate NUMERIC(6,3) NOT NULL DEFAULT 0, deferred_amount BIGINT NOT NULL,
  interest_rate NUMERIC(6,3) NOT NULL DEFAULT 0, start_date DATE NOT NULL, maturity_date DATE NOT NULL, status TEXT NOT NULL, note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE payments (
  id TEXT PRIMARY KEY, contract_id TEXT NOT NULL REFERENCES sale_contracts(id), asset_id TEXT NOT NULL REFERENCES assets(id),
  pay_type TEXT NOT NULL, amount BIGINT NOT NULL, paid_date DATE NOT NULL, deferral_id TEXT REFERENCES deferrals(id), method TEXT, note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, pay_type, amount, paid_date));
CREATE TABLE receivables (
  id TEXT PRIMARY KEY, contract_id TEXT NOT NULL REFERENCES sale_contracts(id), asset_id TEXT NOT NULL REFERENCES assets(id),
  rec_type TEXT NOT NULL, billed_amount BIGINT NOT NULL, due_date DATE NOT NULL, notice_count INT NOT NULL DEFAULT 0, last_notice_date DATE,
  negotiation_status TEXT NOT NULL DEFAULT 'NONE', promise_date DATE, expected_amount BIGINT NOT NULL DEFAULT 0, expected_date DATE,
  legal_action BOOLEAN NOT NULL DEFAULT false, status TEXT NOT NULL DEFAULT 'OPEN', manager TEXT, note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE collection_actions (id TEXT PRIMARY KEY, receivable_id TEXT NOT NULL REFERENCES receivables(id), action_date DATE NOT NULL, action_type TEXT NOT NULL, round INT, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE leases (
  id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), tenant_name TEXT, desired_industry TEXT, actual_industry TEXT,
  deposit BIGINT NOT NULL DEFAULT 0, monthly_rent BIGINT NOT NULL DEFAULT 0, mgmt_fee BIGINT NOT NULL DEFAULT 0, rent_free_months INT NOT NULL DEFAULT 0,
  start_date DATE, end_date DATE, move_in_date DATE, open_date DATE, leasing_fee BIGINT NOT NULL DEFAULT 0, tenant_support BIGINT NOT NULL DEFAULT 0,
  negotiation_status TEXT NOT NULL, income_recipient TEXT NOT NULL CHECK (income_recipient IN ('OWNER','DEVELOPER','OPERATOR')),
  is_anchor BOOLEAN NOT NULL DEFAULT false, manager TEXT, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE crm_leads (
  id TEXT PRIMARY KEY, consult_date DATE NOT NULL, channel TEXT NOT NULL, manager TEXT, interest_type TEXT, interest_asset_id TEXT REFERENCES assets(id),
  initial_price BIGINT NOT NULL DEFAULT 0, discount_offer_rate NUMERIC(6,3) NOT NULL DEFAULT 0, deferral_terms TEXT, customer_wish TEXT,
  expected_contract_date DATE, stage TEXT NOT NULL, visited BOOLEAN NOT NULL DEFAULT false, valid BOOLEAN NOT NULL DEFAULT true, next_date DATE,
  contracted BOOLEAN NOT NULL DEFAULT false, contract_amount BIGINT NOT NULL DEFAULT 0, contract_id TEXT REFERENCES sale_contracts(id), is_resale BOOLEAN NOT NULL DEFAULT false,
  customer_name TEXT, customer_phone TEXT, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE sales_policies (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, discount_rate NUMERIC(6,3) NOT NULL DEFAULT 0, deposit_rate NUMERIC(6,3) NOT NULL DEFAULT 10,
  middle_rate NUMERIC(6,3) NOT NULL DEFAULT 0, balance_rate NUMERIC(6,3) NOT NULL DEFAULT 90, deferral_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  deferral_basis TEXT NOT NULL DEFAULT 'SUPPLY', deferral_months INT NOT NULL DEFAULT 0, deferral_interest_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  agency_fee_rate NUMERIC(6,3) NOT NULL DEFAULT 0, ad_cost BIGINT NOT NULL DEFAULT 0, other_support BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT', effective_from DATE, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE expenses (id TEXT PRIMARY KEY, category TEXT NOT NULL, item TEXT NOT NULL, budget_amount BIGINT NOT NULL DEFAULT 0, executed_amount BIGINT NOT NULL DEFAULT 0, planned_amount BIGINT NOT NULL DEFAULT 0, planned_month CHAR(7), note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE debts (
  id TEXT PRIMARY KEY, debt_type TEXT NOT NULL, creditor TEXT NOT NULL, description TEXT, principal BIGINT NOT NULL, interest_penalty BIGINT NOT NULL DEFAULT 0,
  interest_rate NUMERIC(6,3) NOT NULL DEFAULT 0, due_date DATE, installment_status TEXT NOT NULL DEFAULT 'NONE', priority INT NOT NULL DEFAULT 50,
  negotiator TEXT, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE debt_repayments (id TEXT PRIMARY KEY, debt_id TEXT NOT NULL REFERENCES debts(id), kind TEXT NOT NULL CHECK (kind IN ('PLAN','ACTUAL')), month CHAR(7) NOT NULL, pay_date DATE, amount BIGINT NOT NULL, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE cashflow_actuals (id TEXT PRIMARY KEY, month CHAR(7) NOT NULL, account TEXT NOT NULL, amount BIGINT NOT NULL, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE cashflow_forecasts (id TEXT PRIMARY KEY, scenario TEXT NOT NULL DEFAULT 'ALL', month CHAR(7) NOT NULL, account TEXT NOT NULL, amount BIGINT NOT NULL, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE issues (
  id TEXT PRIMARY KEY, asset_id TEXT REFERENCES assets(id), issue_kind TEXT NOT NULL, defect_type TEXT, received_date DATE NOT NULL, reporter TEXT,
  description TEXT NOT NULL, stage TEXT NOT NULL, contractor_status TEXT, responsible TEXT, warranty_due DATE, planned_date DATE, completed_date DATE,
  cost BIGINT NOT NULL DEFAULT 0, cost_bearer TEXT NOT NULL DEFAULT 'UNDECIDED', recurrence BOOLEAN NOT NULL DEFAULT false, complaint_status TEXT, note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE legal_cases (
  id TEXT PRIMARY KEY, risk_type TEXT NOT NULL, title TEXT NOT NULL, occurred_date DATE NOT NULL, related_id TEXT, status TEXT NOT NULL, priority TEXT NOT NULL,
  owner TEXT, expected_cost BIGINT NOT NULL DEFAULT 0, cost_month CHAR(7), plan TEXT, next_action_date DATE, completed_date DATE,
  confidential BOOLEAN NOT NULL DEFAULT false, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE documents (id TEXT PRIMARY KEY, entity_type TEXT, entity_id TEXT, asset_id TEXT, category TEXT, filename TEXT NOT NULL, stored_name TEXT NOT NULL, mime TEXT, size BIGINT NOT NULL DEFAULT 0, confidential BOOLEAN NOT NULL DEFAULT false, uploaded_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE approvals (
  id BIGSERIAL PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL CHECK (action IN ('UPDATE','DELETE')),
  before_json JSONB, payload_json JSONB, reason TEXT, requested_by TEXT NOT NULL, requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','FAILED')), decided_by TEXT, decided_at TIMESTAMPTZ, comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE audit_logs (id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), username TEXT, role TEXT, action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, before_json JSONB, after_json JSONB, detail TEXT);
CREATE INDEX ix_audit_entity ON audit_logs(entity_type, entity_id);
CREATE TABLE report_snapshots (
  id BIGSERIAL PRIMARY KEY, report_type TEXT NOT NULL, title TEXT NOT NULL, base_date DATE NOT NULL, data_version INT NOT NULL, author TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')), approved_by TEXT, approved_at TIMESTAMPTZ, comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
-- 감사로그 변경 금지(append-only) 권장
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
