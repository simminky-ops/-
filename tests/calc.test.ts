// 계산엔진·검증 단위 테스트 — 실행: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { calcLateFee } from "../src/lib/calc/contracts";
import { ENTITIES, normalizeRow } from "../src/lib/entities";
import { simulate, SIM_DEFAULT, validateSim } from "../src/lib/calc/simulator";
import { SCHEMA_SQL } from "../src/lib/server/schema";
import { seedAll } from "../src/lib/server/seed";
import { loadProjectData } from "../src/lib/server/load";
import { runCashflow, IN_LINES, OUT_LINES } from "../src/lib/calc/cashflow";
import { runFeasibility } from "../src/lib/calc/feasibility";
import { computeKpiValues } from "../src/lib/calc/analytics";
import { addMonths, monthDiff } from "../src/lib/format";

test("연체료: 1억 × 12% × 30일 / 365", () => {
  const r = calcLateFee({ dueDate: "2026-05-31", rate: 12, balance: 100_000_000, balancePayments: [], deferrals: [], asOf: "2026-06-30" });
  assert.equal(r.fee, Math.round((100_000_000 * 0.12 * 30) / 365));
  assert.equal(r.overduePrincipal, 100_000_000);
  assert.equal(r.overdueDays, 30);
});

test("연체료: 부분납부는 납부일부터 원금에서 제외", () => {
  const r = calcLateFee({ dueDate: "2026-05-31", rate: 12, balance: 100_000_000, balancePayments: [{ date: "2026-06-10", amount: 60_000_000 }], deferrals: [], asOf: "2026-06-30" });
  const expected = (100_000_000 * 0.12 * 10) / 365 + (40_000_000 * 0.12 * 20) / 365;
  assert.equal(r.fee, Math.round(expected));
  assert.equal(r.overduePrincipal, 40_000_000);
});

test("연체료: 유예금은 만기 전 연체 아님, 만기 경과 시 연체원금 가산", () => {
  const inp = { dueDate: "2026-05-31", rate: 12, balance: 100_000_000, balancePayments: [{ date: "2026-05-20", amount: 50_000_000 }], deferrals: [{ amount: 50_000_000, maturity: "2026-11-30", payments: [] }] };
  assert.equal(calcLateFee({ ...inp, asOf: "2026-11-17" }).fee, 0);
  const after = calcLateFee({ ...inp, asOf: "2026-12-10" });
  assert.equal(after.overduePrincipal, 50_000_000);
  assert.equal(after.overdueDays, 10);
  assert.equal(after.fee, Math.round((50_000_000 * 0.12 * 10) / 365));
});

test("입력 검증: 형식 오류·라벨→코드 변환·금액 불일치", () => {
  const def = ENTITIES.sale_contracts;
  const [row, errs] = normalizeRow(def, { asset_id: "A-001", contract_date: "2026/11/01", list_price_at_contract: "300,000,000", supply_price: 270_000_000, discount_amount: 30_000_000, deposit_amount: 27_000_000, balance_amount: 240_000_000, status: "계약유효" });
  assert.deepEqual(errs, []);
  assert.equal(row.contract_date, "2026-11-01");
  assert.equal(row.list_price_at_contract, 300_000_000);
  assert.equal(row.status, "ACTIVE");
  const v = def.validate!(row);
  assert.ok(v.some((e) => e.includes("일치하지")), "계약금+잔금 ≠ 공급금액 오류 검출");
  const [, e2] = normalizeRow(def, { asset_id: "A-001", contract_date: "20261340", list_price_at_contract: "abc", supply_price: 1, deposit_amount: 1, balance_amount: 0, status: "XX" });
  assert.ok(e2.length >= 3);
});

test("시뮬레이터: 매출·할인손실·유예 분리", () => {
  const i = { ...SIM_DEFAULT, units: 10, listPrice: 300_000_000, discountRate: 20, deferralRate: 30, deferralBasis: "SUPPLY" as const };
  assert.deepEqual(validateSim(i), []);
  const r = simulate("D", i);
  assert.equal(r.revenue, 2_400_000_000);
  assert.equal(r.discountLoss, 600_000_000);
  assert.equal(Math.round(r.deferredCash), 720_000_000);
  assert.equal(Math.round(r.initialCash + r.deferredCash), 2_400_000_000);
  assert.ok(Math.abs(r.profit - (r.revenue - r.salesCost - r.tax - r.cost - r.financeImpact)) < 1);
});

function seeded() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  seedAll(db);
  return loadProjectData(db);
}

test("현금흐름: 기말현금 = 기초 + 유입 − 유출, 다음 달 기초로 연결", () => {
  const data = seeded();
  for (const sc of ["CONS", "BASE", "OPT"] as const) {
    const cf = runCashflow(data, { scenario: sc });
    assert.equal(cf.months.length, 36);
    cf.months.forEach((m, i) => {
      const inSum = IN_LINES.reduce((s, k) => s + m.in[k], 0);
      const outSum = OUT_LINES.reduce((s, k) => s + m.out[k], 0);
      assert.equal(m.inTotal, inSum);
      assert.equal(m.outTotal, outSum);
      assert.equal(m.ending, m.opening + inSum - outSum);
      if (i > 0) assert.equal(m.opening, cf.months[i - 1].ending);
    });
  }
});

test("현금흐름: 시작월·기간 변경 시에도 동일 월 값 일치", () => {
  const data = seeded();
  const a = runCashflow(data, { scenario: "BASE" });
  const b = runCashflow(data, { scenario: "BASE", startMonth: addMonths(data.settings.cashflow_start, 6), months: 12 });
  const ma = a.months.find((m) => m.month === b.months[0].month)!;
  assert.equal(b.months[0].opening, ma.opening);
  assert.equal(b.months[0].ending, ma.ending);
  assert.equal(monthDiff(b.months[0].month, b.months[11].month), 11);
});

test("채무: 상환액 합계가 잔액을 초과하지 않음", () => {
  const data = seeded();
  const cf = runCashflow(data, { scenario: "OPT" });
  for (const d of cf.debtEnd) {
    assert.ok(d.end >= 0);
    assert.ok(d.paid <= d.start + 1);
  }
});

test("사업수지: 수입·비용 합계 일관성 및 손익 = 수익 − 비용", () => {
  const data = seeded();
  const cf = runCashflow(data, { scenario: "BASE" });
  const f = runFeasibility(data, cf);
  assert.equal(f.revenueTotal, f.revenue.reduce((s, r) => s + r.amount, 0));
  assert.equal(f.costTotal, f.costs.reduce((s, r) => s + r.total, 0));
  for (const r of f.costs) assert.equal(r.total, r.executed + r.unpaid + r.future);
  assert.equal(f.profit, f.revenueTotal - f.costTotal);
  // 금융 차입원금은 비용에서 제외
  const fin = f.costs.find((r) => r.category === "FINANCE")!;
  assert.equal(fin.unpaid, 0);
});

test("KPI: 분양률·회수율 산식", () => {
  const data = seeded();
  const k = computeKpiValues(data, data.settings.base_date);
  const target = data.assets.filter((a) => a.is_sale_target).length;
  assert.equal(k.s.total, target);
  assert.ok(Math.abs(k.s.saleRate - (k.s.sold / target) * 100) < 1e-9);
  assert.ok(Math.abs(k.c.collectionRate - (k.c.collected / k.c.billed) * 100) < 1e-9);
  assert.equal(k.c.unpaid, k.c.billed - k.c.collected);
  assert.ok(k.l.rate >= 0 && k.l.rate <= 100);
});
