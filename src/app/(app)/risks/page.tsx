import { requirePage } from "@/lib/server/auth";
import { getSnapshot } from "@/lib/server/snapshot";
import { canRead, canWrite } from "@/lib/rbac";
import { ENTITIES } from "@/lib/entities";
import { PRIORITY_LABEL, RISK_STATUS_LABEL } from "@/lib/types";
import { addDays, daysBetween, sum } from "@/lib/format";
import { Badge, Card, Note, PageHeader, Stat } from "@/components/ui";
import { DataTable } from "@/components/data-table";
import { EntityManager } from "@/components/entity-manager";
import { Money } from "@/components/money";

export default async function RisksPage() {
  const user = await requirePage("risks");
  const snap = getSnapshot();
  const asOf = snap.data.settings.base_date;
  const seeConf = canRead(user.role, "risks_confidential");
  const risks = snap.data.risks.filter((r) => !r.confidential || seeConf);
  const typeLabel = ENTITIES.legal_cases.fields.find((f) => f.key === "risk_type")!.options!;
  const active = risks.filter((r) => r.status !== "CLOSED");

  const prios = ["HIGH", "MEDIUM", "LOW"] as const;
  const types = Object.keys(typeLabel).filter((t) => risks.some((r) => r.risk_type === t));
  const matrix = types.map((t) => ({
    type: t,
    label: typeLabel[t],
    cells: prios.map((p) => active.filter((r) => r.risk_type === t && r.priority === p).length),
    cost: sum(active.filter((r) => r.risk_type === t), (r) => r.expected_cost),
  }));

  const deadline = active
    .filter((r) => r.next_action_date)
    .sort((a, b) => String(a.next_action_date).localeCompare(String(b.next_action_date)))
    .map((r) => {
      const d = daysBetween(asOf, r.next_action_date!);
      return {
        id: r.id,
        type: typeLabel[r.risk_type] ?? r.risk_type,
        title: r.title,
        priority: r.priority,
        status: r.status,
        owner: r.owner,
        next: r.next_action_date,
        dday: d >= 0 ? `D-${d}` : `D+${-d} 경과`,
        cost: r.expected_cost,
      };
    });

  // 대위변제·중도금대출 위험: 중도금대출 만기 60일 이내 & 잔금 미납(연체+유예)
  const subrogation = snap.values.calcs
    .filter((c) => c.activeAsOf && c.contract.middle_loan_maturity && c.contract.middle_loan_maturity <= addDays(asOf, 60) && c.overduePrincipal + c.deferralOutstanding > 0)
    .map((c) => ({
      contract_id: c.contract.id,
      asset_id: c.contract.asset_id,
      maturity: c.contract.middle_loan_maturity,
      dday: daysBetween(asOf, c.contract.middle_loan_maturity!),
      middle: c.contract.middle_amount,
      overdue: c.overduePrincipal,
      deferred: c.deferralOutstanding,
      overdue_days: c.overdueDays,
    }))
    .sort((a, b) => a.dday - b.dday);

  const terminated = snap.data.contracts.filter((c) => c.status === "TERMINATED");
  const resold = new Set(snap.data.contracts.filter((c) => c.is_resale && c.prev_contract_id).map((c) => c.prev_contract_id));
  const termRows = terminated.map((c) => ({
    id: c.id,
    asset_id: c.asset_id,
    terminated_at: c.terminated_at,
    reason: c.termination_reason,
    supply: c.supply_price,
    resold: resold.has(c.id) ? "재판매 완료" : "재판매 대기",
  }));

  const statusCounts = (Object.keys(RISK_STATUS_LABEL) as (keyof typeof RISK_STATUS_LABEL)[]).map((s) => ({ s, n: risks.filter((r) => r.status === s).length }));
  const totalCost = sum(active, (r) => r.expected_cost);
  const overdueActions = deadline.filter((d) => d.dday.includes("경과")).length;

  return (
    <div className="space-y-5">
      <PageHeader code="B09" title="법률·금융·리스크관리" desc="분양계약 해지, 반환분쟁, 중도금대출·대위변제, 소송, 신탁·금융기관 협의 등 사업 정상화 리스크를 유형별 우선순위와 대응기한으로 관리합니다." />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        {statusCounts.map((s) => (
          <Stat key={s.s} label={`상태: ${RISK_STATUS_LABEL[s.s]}`} value={`${s.n}건`} />
        ))}
        <Stat label="조치기한 경과" value={`${overdueActions}건`} tone={overdueActions ? "bad" : undefined} />
        <Stat label="진행중 예상비용 합계" value={<Money v={totalCost} />} sub="B07 현금흐름 반영" />
      </div>

      {!seeConf && <Note tone="warn">법률 기밀 문서로 지정된 리스크 건은 현재 역할에서 조회할 수 없어 목록·집계에서 제외되었습니다.</Note>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card title="리스크 매트릭스" sub="유형 × 우선순위 (진행중 건수)" className="xl:col-span-2">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>유형</th>
                  {prios.map((p) => (
                    <th key={p} className="r">
                      {PRIORITY_LABEL[p]}
                    </th>
                  ))}
                  <th className="r">예상비용</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((m) => (
                  <tr key={m.type}>
                    <td>{m.label}</td>
                    {m.cells.map((n, i) => (
                      <td key={i} className="r">
                        {n > 0 ? <Badge tone={i === 0 ? "bad" : i === 1 ? "warn" : "neutral"}>{i === 0 ? "■" : i === 1 ? "▲" : "●"} {n}</Badge> : <span className="text-ink3">-</span>}
                      </td>
                    ))}
                    <td className="r">
                      <Money v={m.cost} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="대응기한 현황" sub="다음 조치일 순 · 진행중 리스크" className="xl:col-span-3">
          <DataTable
            rows={deadline}
            dense
            maxHeight={320}
            cols={[
              { key: "id", label: "ID" },
              { key: "type", label: "유형" },
              { key: "title", label: "제목" },
              { key: "priority", label: "우선순위", map: PRIORITY_LABEL, tone: { HIGH: "bad", MEDIUM: "warn", LOW: "neutral" } },
              { key: "status", label: "상태", map: RISK_STATUS_LABEL },
              { key: "next", label: "다음 조치일", kind: "date" },
              { key: "dday", label: "D-day" },
              { key: "owner", label: "담당" },
            ]}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="대위변제·중도금대출 위험 세대" sub="중도금대출 만기 60일 이내 & 잔금(연체·유예) 미납 — 계약·수납 데이터에서 자동 산출">
          <DataTable
            rows={subrogation}
            rowKey="contract_id"
            dense
            maxHeight={320}
            cols={[
              { key: "asset_id", label: "자산 ID", link: "/assets/{asset_id}" },
              { key: "contract_id", label: "계약 ID" },
              { key: "maturity", label: "대출만기", kind: "date" },
              { key: "dday", label: "잔여일", kind: "num" },
              { key: "middle", label: "중도금", kind: "money", sum: true },
              { key: "overdue", label: "연체원금", kind: "money", sum: true },
              { key: "deferred", label: "유예잔액", kind: "money", sum: true },
              { key: "overdue_days", label: "연체일수", kind: "num" },
            ]}
            emptyText="해당 위험 세대가 없습니다."
          />
        </Card>
        <Card title="계약해지 및 재판매 현황" sub={`해지 ${termRows.length}건 · 재판매 완료 ${termRows.filter((t) => t.resold === "재판매 완료").length}건`}>
          <DataTable
            rows={termRows}
            dense
            maxHeight={320}
            cols={[
              { key: "id", label: "계약 ID" },
              { key: "asset_id", label: "자산 ID", link: "/assets/{asset_id}" },
              { key: "terminated_at", label: "해지일", kind: "date" },
              { key: "reason", label: "사유" },
              { key: "supply", label: "공급금액", kind: "money", sum: true },
              { key: "resold", label: "재판매", tone: { "재판매 완료": "good", "재판매 대기": "warn" } },
            ]}
          />
        </Card>
      </div>

      <Card title="리스크 대장" sub="예상비용·비용발생 예상월은 B07 현금흐름(법률·하자 비용)에 자동 반영 · 기밀 건은 권한자만 조회·수정">
        <EntityManager entity="legal_cases" canWrite={canWrite(user.role, "risks")} filters={["risk_type", "status", "priority"]} />
      </Card>
    </div>
  );
}
