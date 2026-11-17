import { requirePage } from "@/lib/server/auth";
import { getSnapshot } from "@/lib/server/snapshot";
import { canWrite } from "@/lib/rbac";
import { ENTITIES } from "@/lib/entities";
import { ISSUE_STAGE_LABEL } from "@/lib/types";
import { addDays, daysBetween, sum } from "@/lib/format";
import { Badge, Card, Note, PageHeader, Stat } from "@/components/ui";
import { BarsChart, DonutChart } from "@/components/charts";
import { DataTable } from "@/components/data-table";
import { EntityManager } from "@/components/entity-manager";
import { AttachmentPanel } from "@/components/b08-attachments";
import { Money } from "@/components/money";

const BEARER: Record<string, string> = { CONTRACTOR: "시공사", DEVELOPER: "사업시행법인", OWNER: "소유자", UNDECIDED: "미정" };

export default async function OperationsPage() {
  const user = await requirePage("operations");
  const snap = getSnapshot();
  const asOf = snap.data.settings.base_date;
  const issues = snap.data.issues;
  const typeLabel = ENTITIES.issues.fields.find((f) => f.key === "defect_type")!.options!;
  const open = issues.filter((i) => i.stage !== "DONE");
  const stages = Object.entries(ISSUE_STAGE_LABEL).map(([k, label]) => ({ k, label, n: issues.filter((i) => i.stage === k).length }));

  const byType = Object.entries(typeLabel)
    .map(([k, name]) => ({
      name,
      open: issues.filter((i) => i.defect_type === k && i.stage !== "DONE").length,
      done: issues.filter((i) => i.defect_type === k && i.stage === "DONE").length,
    }))
    .filter((r) => r.open + r.done > 0);

  const bearerCost = Object.entries(BEARER)
    .map(([k, name]) => ({ name, value: sum(issues.filter((i) => i.cost_bearer === k), (i) => i.cost) }))
    .filter((d) => d.value > 0);
  const devOpenCost = sum(open.filter((i) => i.cost_bearer === "DEVELOPER"), (i) => i.cost);

  const overdue = open.filter((i) => i.planned_date && i.planned_date < asOf);
  const warranty = issues.filter((i) => i.warranty_due && i.warranty_due >= asOf && i.warranty_due <= addDays(asOf, 365) && i.stage !== "DONE");
  const recurrence = issues.filter((i) => i.recurrence);
  const complaints = issues.filter((i) => i.issue_kind === "COMPLAINT");
  const complaintStatus = [...new Set(complaints.map((c) => c.complaint_status ?? "미분류"))].map((s) => ({ s, n: complaints.filter((c) => (c.complaint_status ?? "미분류") === s).length }));

  const watch = [...overdue, ...warranty.filter((w) => !overdue.includes(w))].map((i) => ({
    id: i.id,
    asset_id: i.asset_id ?? "공용부",
    type: typeLabel[i.defect_type] ?? i.defect_type,
    stage: i.stage,
    responsible: i.responsible,
    planned_date: i.planned_date,
    warranty_due: i.warranty_due,
    flag: i.planned_date && i.planned_date < asOf ? `보수예정 경과 D+${daysBetween(i.planned_date, asOf)}` : `담보만료 D-${daysBetween(asOf, i.warranty_due!)}`,
  }));

  return (
    <div className="space-y-5">
      <PageHeader code="B08" title="건물 운영 및 하자관리" desc="하자·민원 접수부터 재발점검까지 처리 단계, 책임주체·비용부담, 하자담보 기한을 관리합니다." />

      <Card title="하자관리 프로세스" sub="접수 → 현장확인 → 원인분석 → 보수협의 → 보수진행 → 완료확인 → 재발점검">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {stages.map((s, i) => (
            <div key={s.k} className="relative rounded-md border border-line bg-bg2 px-3 py-2.5">
              <div className="text-[11px] text-ink3">STEP {i + 1}</div>
              <div className="text-sm font-semibold text-ink">{s.label}</div>
              <div className="num mt-1 text-xl font-bold text-navy">{s.n}건</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Stat label="미완료 하자·민원" value={`${open.length}건`} sub={`전체 ${issues.length}건`} />
        <Stat label="보수예정일 경과" value={`${overdue.length}건`} tone={overdue.length ? "bad" : undefined} />
        <Stat label="하자담보 만료 도래(1년 내)" value={`${warranty.length}건`} tone={warranty.length ? "warn" : undefined} />
        <Stat label="재발 건" value={`${recurrence.length}건`} tone={recurrence.length ? "warn" : undefined} />
        <Stat label="사업주체 부담 미완료 비용" value={<Money v={devOpenCost} />} sub="현금흐름·사업수지 자동 반영" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="하자 유형별 현황" sub="미완료 / 완료 건수" className="xl:col-span-2">
          <BarsChart
            data={byType}
            x="name"
            series={[
              { key: "open", label: "미완료", stack: "a" },
              { key: "done", label: "완료", stack: "a" },
            ]}
            height={240}
          />
        </Card>
        <Card title="비용부담 주체별 보수비용" sub="전체 접수건 기준">
          <DonutChart data={bearerCost} />
          <div className="mt-3">
            <Note>
              비용부담이 <b>사업시행법인</b>이고 완료되지 않은 건의 보수비용은 보수예정월 기준으로 <b>B07 36개월 현금흐름(법률·하자 비용)</b>과 <b>B06 사업수지(향후 예정 비용)</b>에 자동 반영됩니다. 시공사 부담 건은 반영되지 않습니다.
            </Note>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="기한 관리 대상" sub="보수예정일 경과 · 하자담보 만료 1년 내 도래" className="xl:col-span-2">
          <DataTable
            rows={watch}
            dense
            maxHeight={300}
            cols={[
              { key: "id", label: "ID" },
              { key: "asset_id", label: "자산 ID" },
              { key: "type", label: "유형" },
              { key: "stage", label: "단계", map: ISSUE_STAGE_LABEL },
              { key: "responsible", label: "책임주체" },
              { key: "planned_date", label: "보수예정일", kind: "date" },
              { key: "warranty_due", label: "담보만료", kind: "date" },
              { key: "flag", label: "기한" },
            ]}
          />
        </Card>
        <Card title="민원 처리상태" sub={`민원 ${complaints.length}건`}>
          <ul className="space-y-2 text-sm">
            {complaintStatus.map((c) => (
              <li key={c.s} className="flex items-center justify-between">
                <Badge tone={c.s === "처리완료" ? "good" : c.s === "처리중" ? "info" : "warn"}>{c.s}</Badge>
                <span className="num font-semibold">{c.n}건</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-line pt-3 text-xs text-ink2">
            <div className="mb-1 font-semibold text-ink">재발 건</div>
            {recurrence.map((r) => (
              <div key={r.id}>
                {r.id} · {r.asset_id ?? "공용부"} · {typeLabel[r.defect_type]}
              </div>
            ))}
            {!recurrence.length && <div className="text-ink3">없음</div>}
          </div>
        </Card>
      </div>

      <Card title="하자·민원 대장" sub="행을 클릭하면 상세 조회·수정 · 등록/수정/삭제는 감사로그에 기록">
        <EntityManager entity="issues" canWrite={canWrite(user.role, "operations")} filters={["issue_kind", "stage", "cost_bearer"]} />
      </Card>

      <Card title="사진 및 첨부파일" sub="하자 건별 현장사진·견적서·협의문서 (서버 저장)">
        <AttachmentPanel entityType="issues" ids={issues.map((i) => i.id)} canWrite={canWrite(user.role, "operations")} />
      </Card>
    </div>
  );
}
