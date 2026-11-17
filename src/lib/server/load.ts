// DB → 계산엔진 입력(ProjectData) 변환 (CLI 테스트에서도 사용하므로 server-only 미적용)
import type { DatabaseSync } from "node:sqlite";
import type { ProjectData } from "../calc/data";
import type { Settings } from "../types";
import { DEFAULT_SCENARIOS } from "../calc/scenarioDefaults";

export function readSettings(db: DatabaseSync): Settings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const m: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      m[r.key] = JSON.parse(r.value);
    } catch {
      m[r.key] = r.value;
    }
  }
  const scen = (m.scenarios as Settings["scenarios"]) ?? DEFAULT_SCENARIOS;
  return {
    project_name: String(m.project_name ?? "수도권 A복합개발사업"),
    base_date: String(m.base_date ?? new Date().toISOString().slice(0, 10)),
    completion_date: String(m.completion_date ?? "2026-03-20"),
    opening_cash: Number(m.opening_cash ?? 0),
    opening_cash_month: String(m.opening_cash_month ?? "2026-04"),
    cashflow_start: String(m.cashflow_start ?? "2026-11"),
    cashflow_months: Number(m.cashflow_months ?? 36),
    min_cash: Number(m.min_cash ?? 0),
    project_funding_rate: Number(m.project_funding_rate ?? 7.5),
    external_show_amounts: Boolean(m.external_show_amounts),
    targets: (m.targets as Record<string, number>) ?? {},
    scenarios: {
      CONS: { ...DEFAULT_SCENARIOS.CONS, ...scen.CONS },
      BASE: { ...DEFAULT_SCENARIOS.BASE, ...scen.BASE },
      OPT: { ...DEFAULT_SCENARIOS.OPT, ...scen.OPT },
    },
  };
}

export function loadProjectData(db: DatabaseSync): ProjectData {
  // node:sqlite 행은 null-prototype 객체 → 일반 객체로 변환(클라이언트 컴포넌트 전달 가능)
  const all = <T,>(sql: string) => db.prepare(sql).all().map((r) => ({ ...r })) as unknown as T[];
  return {
    settings: readSettings(db),
    assets: all("SELECT * FROM assets ORDER BY id"),
    contracts: all("SELECT * FROM sale_contracts ORDER BY id"),
    payments: all("SELECT * FROM payments ORDER BY paid_date, id"),
    deferrals: all("SELECT * FROM deferrals ORDER BY id"),
    receivables: all("SELECT * FROM receivables ORDER BY id"),
    actions: all("SELECT * FROM collection_actions ORDER BY action_date"),
    leases: all("SELECT * FROM leases ORDER BY asset_id"),
    leads: all("SELECT * FROM crm_leads ORDER BY consult_date"),
    policies: all("SELECT * FROM sales_policies ORDER BY id"),
    expenses: all("SELECT * FROM expenses ORDER BY id"),
    debts: all("SELECT * FROM debts ORDER BY priority, id"),
    repayments: all("SELECT * FROM debt_repayments ORDER BY month, id"),
    cfActuals: all("SELECT * FROM cashflow_actuals ORDER BY month, id"),
    cfForecasts: all("SELECT * FROM cashflow_forecasts ORDER BY month, id"),
    issues: all("SELECT * FROM issues ORDER BY received_date DESC"),
    risks: all("SELECT * FROM legal_cases ORDER BY next_action_date"),
  };
}
