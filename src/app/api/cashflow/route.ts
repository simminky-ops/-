import { apiError, HttpError, requireApi } from "@/lib/server/auth";
import { getSnapshot } from "@/lib/server/snapshot";
import { runCashflow } from "@/lib/calc/cashflow";
import { runFeasibility } from "@/lib/calc/feasibility";
import type { ScenarioAssumptions, ScenarioKey } from "@/lib/types";

// 가정 변경 시 즉시 재계산 (저장하지 않음 — 저장은 /api/settings)
export async function POST(req: Request) {
  try {
    await requireApi("cashflow");
    const b = (await req.json()) as { scenario?: ScenarioKey; startMonth?: string; months?: number; assumptions?: Partial<ScenarioAssumptions> };
    const scenario = b.scenario ?? "BASE";
    if (!["CONS", "BASE", "OPT"].includes(scenario)) throw new HttpError(422, "시나리오 오류");
    if (b.startMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(b.startMonth)) throw new HttpError(422, "시작월 형식 오류");
    const { data } = getSnapshot();
    const cf = runCashflow(data, { scenario, startMonth: b.startMonth, months: b.months, assumptions: b.assumptions });
    const feas = runFeasibility(data, cf);
    return Response.json({ cf, feas });
  } catch (e) {
    return apiError(e);
  }
}
