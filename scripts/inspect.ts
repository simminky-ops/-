// 개발용: 메모리 DB에 예시 데이터를 적재하고 주요 계산 결과를 출력
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL } from "../src/lib/server/schema";
import { seedAll } from "../src/lib/server/seed";
import { loadProjectData } from "../src/lib/server/load";
import { computeKpiValues } from "../src/lib/calc/analytics";
import { runAllScenarios } from "../src/lib/calc/cashflow";
import { runFeasibility } from "../src/lib/calc/feasibility";

const db = new DatabaseSync(":memory:");
db.exec(SCHEMA_SQL);
seedAll(db);
const data = loadProjectData(db);
const eok = (v: number) => (v / 1e8).toFixed(1) + "억";
const k = computeKpiValues(data, data.settings.base_date);
console.log("counts", { assets: data.assets.length, contracts: data.contracts.length, payments: data.payments.length, leases: data.leases.length, leads: data.leads.length });
console.log("sale", { rate: k.s.saleRate.toFixed(1), amount: k.s.amountRate.toFixed(1), ot: k.s.officetel, rt: k.s.retail });
console.log("collect", { billed: eok(k.c.billed), collected: eok(k.c.collected), rate: k.c.collectionRate.toFixed(1), unpaid: eok(k.c.unpaid), overdue: eok(k.c.overdue), deferred: eok(k.c.deferred), lateFee: eok(k.c.lateFee), overdueCount: k.c.overdueCount });
console.log("lease", { rate: k.l.rate.toFixed(1), byFloor: k.l.byFloor.map((f) => `${f.floor}:${f.rate.toFixed(0)}%`) });
console.log("debt", { balance: eok(k.d.balance), repay: k.d.repayRate.toFixed(1) });
console.log("collectedTotal", eok(k.collectedTotal));
for (const r of runAllScenarios(data)) {
  const s = r.summary;
  console.log(r.scenario, {
    end: eok(s.endingCash),
    min: eok(s.minEnding),
    minM: s.minEndingMonth,
    shortage: s.shortageMonths.length,
    newUnits: s.newSalesUnits,
    newRev: eok(s.newSalesRevenue),
    debtEnd: eok(s.debtBalanceEnd),
    payoff: s.debtPayoffMonth,
    recvEnd: eok(s.receivableEnd),
  });
  const f = runFeasibility(data, r);
  console.log("  feas", { rev: eok(f.revenueTotal), cost: eok(f.costTotal), profit: eok(f.profit), rate: f.profitRate.toFixed(1) });
  if (r.scenario === "BASE") {
    console.log(r.months.slice(0, 6).map((m) => `${m.month} ${m.kind[0]} open ${eok(m.opening)} in ${eok(m.inTotal)} out ${eok(m.outTotal)} end ${eok(m.ending)}`).join("\n"));
    console.log(f.revenue.map((x) => `${x.label}: ${eok(x.amount)}`).join(" | "));
    console.log(f.costs.map((x) => `${x.label}: ex ${eok(x.executed)} un ${eok(x.unpaid)} fu ${eok(x.future)} / bud ${eok(x.budget)}`).join("\n"));
    console.log(r.warnings);
  }
}
