import "server-only";
// 전체 데이터 + 계산 결과 스냅샷 (데이터 버전 단위 캐시)
import { getDb, getSetting } from "./db";
import { loadProjectData } from "./load";
import type { ProjectData } from "../calc/data";
import { buildKpis, computeKpiValues, type Kpi } from "../calc/analytics";
import { runCashflow, type CashflowResult } from "../calc/cashflow";
import { runFeasibility, type FeasibilityResult } from "../calc/feasibility";
import type { ScenarioKey } from "../types";
import { addMonths, monthOf } from "../format";

export interface Snapshot {
  version: number;
  data: ProjectData;
  values: ReturnType<typeof computeKpiValues>;
  kpis: Kpi[];
  cf: Record<ScenarioKey, CashflowResult>;
  feas: Record<ScenarioKey, FeasibilityResult>;
}

type G = typeof globalThis & { __adSnap?: { key: string; snap: Snapshot } };
const g = globalThis as G;

export function getSnapshot(): Snapshot {
  const db = getDb();
  const version = getSetting<number>("data_version", 0);
  const settingsStamp = (db.prepare("SELECT MAX(updated_at) AS t FROM settings").get() as { t: string }).t;
  const key = `${version}|${settingsStamp}`;
  if (g.__adSnap?.key === key) return g.__adSnap.snap;

  const data = loadProjectData(db);
  const asOf = data.settings.base_date;
  const cf = {
    CONS: runCashflow(data, { scenario: "CONS" }),
    BASE: runCashflow(data, { scenario: "BASE" }),
    OPT: runCashflow(data, { scenario: "OPT" }),
  };
  const feas = { CONS: runFeasibility(data, cf.CONS), BASE: runFeasibility(data, cf.BASE), OPT: runFeasibility(data, cf.OPT) };
  // 당월 예상 기말현금: 기준 시나리오 기준월 / 전월: 전월 실적 기말
  const baseMonth = monthOf(asOf);
  const full = runCashflow(data, { scenario: "BASE", startMonth: data.settings.opening_cash_month, months: Math.max(1, (Number(baseMonth.slice(0, 4)) - Number(data.settings.opening_cash_month.slice(0, 4))) * 12 + Number(baseMonth.slice(5)) - Number(data.settings.opening_cash_month.slice(5)) + 1) });
  const cur = full.months.find((m) => m.month === baseMonth);
  const prev = full.months.find((m) => m.month === addMonths(baseMonth, -1));
  const kpis = buildKpis(data, asOf, cur?.ending ?? 0, prev?.ending ?? null);
  const values = computeKpiValues(data, asOf);
  const snap: Snapshot = { version, data, values, kpis, cf, feas };
  g.__adSnap = { key, snap };
  return snap;
}

export function invalidateSnapshot() {
  g.__adSnap = undefined;
}
