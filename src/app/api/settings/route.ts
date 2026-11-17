import { apiError, HttpError, requireApi } from "@/lib/server/auth";
import { bumpDataVersion, getSetting, setSetting, tx } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { invalidateSnapshot } from "@/lib/server/snapshot";
import { SCENARIO_FIELDS } from "@/lib/calc/scenarioDefaults";
import type { RoleCode, ScenarioAssumptions } from "@/lib/types";

// 설정 키별 수정 가능 역할
const KEY_ROLES: Record<string, RoleCode[]> = {
  base_date: ["PM", "FINANCE"],
  cashflow_start: ["PM", "FINANCE"],
  cashflow_months: ["PM", "FINANCE"],
  opening_cash: ["FINANCE"],
  opening_cash_month: ["FINANCE"],
  min_cash: ["FINANCE", "PM"],
  project_funding_rate: ["FINANCE"],
  targets: ["PM", "EXECUTIVE"],
  scenarios: ["PM", "FINANCE"],
  external_show_amounts: ["EXECUTIVE"],
  project_name: ["ADMIN"],
};

function validate(key: string, v: unknown): string | null {
  switch (key) {
    case "base_date":
      return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : "기준일 형식 오류(YYYY-MM-DD)";
    case "cashflow_start":
    case "opening_cash_month":
      return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? null : "월 형식 오류(YYYY-MM)";
    case "cashflow_months":
      return Number.isInteger(v) && (v as number) >= 6 && (v as number) <= 120 ? null : "기간은 6~120개월";
    case "opening_cash":
    case "min_cash":
    case "project_funding_rate":
      return typeof v === "number" && Number.isFinite(v) ? null : "숫자 형식 오류";
    case "external_show_amounts":
      return typeof v === "boolean" ? null : "true/false";
    case "targets":
      return v && typeof v === "object" && Object.values(v).every((x) => typeof x === "number") ? null : "목표값은 숫자";
    case "scenarios": {
      if (!v || typeof v !== "object") return "시나리오 형식 오류";
      for (const k of ["CONS", "BASE", "OPT"]) {
        const s = (v as Record<string, ScenarioAssumptions>)[k];
        if (!s) return `${k} 시나리오 누락`;
        for (const f of SCENARIO_FIELDS) if (typeof s[f.key] !== "number" || (s[f.key] as number) < 0) return `${k}.${f.label} 값 오류`;
        if (s.depositRate + s.deferralRate > 100) return `${k}: 계약금+유예 비율이 100% 초과`;
      }
      return null;
    }
    case "project_name":
      return typeof v === "string" && v.length > 0 ? null : "이름 필요";
  }
  return "알 수 없는 설정";
}

export async function PUT(req: Request) {
  try {
    const user = await requireApi();
    const body = (await req.json()) as Record<string, unknown>;
    const errors: string[] = [];
    for (const [k, v] of Object.entries(body)) {
      if (!KEY_ROLES[k]) errors.push(`${k}: 수정할 수 없는 설정`);
      else if (!KEY_ROLES[k].includes(user.role)) throw new HttpError(403, `${k} 설정 변경 권한이 없습니다.`);
      else {
        const err = validate(k, v);
        if (err) errors.push(`${k}: ${err}`);
      }
    }
    if (errors.length) throw new HttpError(422, "설정 검증 오류", errors);
    tx(() => {
      for (const [k, v] of Object.entries(body)) {
        const before = getSetting(k, null);
        setSetting(k, v);
        audit(user, "SETTING", "settings", k, before, v, null);
      }
      bumpDataVersion();
    });
    invalidateSnapshot();
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
