import { requirePage } from "@/lib/server/auth";
import { all } from "@/lib/server/db";
import { ENTITIES, isEntityName } from "@/lib/entities";
import { APPROVER_ROLES, canRead } from "@/lib/rbac";
import { Note, PageHeader, Card } from "@/components/ui";
import { ApprovalList, type ApprovalView } from "@/components/c-approvals";
import { DataTable } from "@/components/data-table";

type ApprovalRow = {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  before_json: string | null;
  payload_json: string | null;
  reason: string | null;
  requested_by: string;
  requested_at: string;
  status: string;
  decided_by: string | null;
  decided_at: string | null;
  comment: string | null;
};

function show(v: unknown, type?: string, options?: Record<string, string>): string {
  if (v === null || v === undefined || v === "") return "-";
  if (options) return options[String(v)] ?? String(v);
  if (type === "money" || type === "int") return Number(v).toLocaleString("ko-KR");
  if (type === "bool") return Number(v) ? "예" : "아니오";
  return String(v);
}

export default async function ApprovalsPage() {
  const user = await requirePage("approvals");
  const rows = all<ApprovalRow>("SELECT * FROM approvals ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END, id DESC LIMIT 300");
  const items: ApprovalView[] = rows
    .filter((r) => isEntityName(r.entity_type) && canRead(user.role, ENTITIES[r.entity_type].module))
    .map((r) => {
      const def = ENTITIES[r.entity_type as keyof typeof ENTITIES];
      const before = JSON.parse(r.before_json ?? "{}") as Record<string, unknown>;
      const after = JSON.parse(r.payload_json ?? "{}") as Record<string, unknown>;
      const keys = r.action === "DELETE" ? def.fields.filter((f) => !f.pii && f.list).map((f) => f.key) : Object.keys(after);
      return {
        id: r.id,
        entityLabel: def.label,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        action: r.action,
        reason: r.reason,
        requested_by: r.requested_by,
        requested_at: r.requested_at,
        status: r.status,
        decided_by: r.decided_by,
        decided_at: r.decided_at,
        comment: r.comment,
        diff: keys.map((k) => {
          const f = def.fields.find((x) => x.key === k);
          return { label: f?.label ?? k, before: show(before[k], f?.type, f?.options), after: r.action === "DELETE" ? "" : show(after[k], f?.type, f?.options) };
        }),
      };
    });

  const history = all<Record<string, unknown>>(
    "SELECT id, at, username, role, action, entity_type, entity_id, detail FROM audit_logs WHERE action IN ('CREATE','UPDATE','DELETE','APPROVAL_REQUEST','APPROVAL_REJECT','IMPORT') ORDER BY id DESC LIMIT 300",
  )
    .filter((h) => !h.entity_type || !isEntityName(String(h.entity_type)) || canRead(user.role, ENTITIES[String(h.entity_type) as keyof typeof ENTITIES].module))
    .map((h) => ({ ...h, entity_label: isEntityName(String(h.entity_type)) ? ENTITIES[String(h.entity_type) as keyof typeof ENTITIES].label : h.entity_type }));

  const ACTION: Record<string, string> = { CREATE: "등록", UPDATE: "수정", DELETE: "삭제", APPROVAL_REQUEST: "승인요청", APPROVAL_REJECT: "반려", IMPORT: "Excel 반영" };
  const pending = items.filter((i) => i.status === "PENDING").length;

  return (
    <div className="space-y-5">
      <PageHeader code="C03" title="변경이력 및 승인관리" desc={`승인 대기 ${pending}건 · 중요 금액·계약정보 변경과 삭제는 경영진 승인 후 반영되며, 모든 변경은 변경 전/후 값과 함께 기록됩니다.`} />
      <Note>
        승인 대상(★ 보호필드): 호실 분양가격, 계약 공급금액·할인·계약금/중도금/잔금·상태·연체이율, 수납 금액, 유예금액, 채권 청구액, 채무 원금·가산금·우선순위, 상환 금액, 사업비 계획 등 · 삭제 승인: 분양계약·수납내역·채무상환 · 승인권자: 경영진(본인 요청 승인 불가)
      </Note>
      <ApprovalList items={items} canApprove={APPROVER_ROLES.includes(user.role)} me={user.name} />
      <Card title="최근 데이터 변경이력" sub="등록·수정·삭제·승인요청 (최근 300건) · 상세 변경 전/후 값은 B11 감사로그에서 조회">
        <DataTable
          rows={history}
          dense
          filters={[{ key: "action", label: "구분", options: ACTION }]}
          cols={[
            { key: "id", label: "#", kind: "num" },
            { key: "at", label: "일시(UTC)" },
            { key: "username", label: "사용자" },
            { key: "action", label: "구분", map: ACTION },
            { key: "entity_label", label: "데이터" },
            { key: "entity_id", label: "ID" },
            { key: "detail", label: "비고" },
          ]}
        />
      </Card>
    </div>
  );
}
