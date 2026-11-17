import { requirePage } from "@/lib/server/auth";
import { all } from "@/lib/server/db";
import { getSnapshot } from "@/lib/server/snapshot";
import { MATRIX, ROLE_DESCRIPTION } from "@/lib/rbac";
import { ROLE_LABEL } from "@/lib/types";
import { PageHeader } from "@/components/ui";
import { AdminTabs } from "@/components/b11-admin";

export default async function AdminPage() {
  const user = await requirePage("admin");
  const snap = getSnapshot();
  const logs = all<Record<string, unknown>>("SELECT id, at, username, role, action, entity_type, entity_id, before_json, after_json, detail FROM audit_logs ORDER BY id DESC LIMIT 300");
  const st = snap.data.settings;
  const settings: [string, string][] = [
    ["사업장명(비식별)", st.project_name],
    ["기준일", st.base_date],
    ["사용승인일", st.completion_date],
    ["기초현금 / 기준월", `${(st.opening_cash / 1e8).toFixed(1)}억원 / ${st.opening_cash_month}`],
    ["현금흐름 시작월 · 기간", `${st.cashflow_start} · ${st.cashflow_months}개월`],
    ["최소 보유현금", `${(st.min_cash / 1e8).toFixed(1)}억원`],
    ["사업 조달금리", `${st.project_funding_rate}%`],
    ["외부보고 실금액 공개", st.external_show_amounts ? "공개(경영진 승인)" : "비공개 — 비율·지수로 변환"],
    ["데이터 버전", `v${snap.version}`],
  ];
  return (
    <div className="space-y-5">
      <PageHeader code="B11" title="사용자·보안·권한관리" desc="계정·역할·개인정보 접근권한, 역할별 화면/API 권한 매트릭스, 감사로그, 백업·복구, 시스템 설정을 관리합니다. (시스템 관리자는 사업 데이터를 수정할 수 없습니다)" />
      <AdminTabs
        currentUserId={user.id}
        logs={logs}
        settings={settings}
        matrix={Object.entries(MATRIX).map(([m, v]) => ({ module: m, read: v.read, write: v.write }))}
        roles={Object.entries(ROLE_LABEL).map(([code, label]) => ({ code, label, desc: ROLE_DESCRIPTION[code as keyof typeof ROLE_DESCRIPTION] }))}
      />
    </div>
  );
}
