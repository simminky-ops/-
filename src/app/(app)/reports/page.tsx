import Link from "next/link";
import { requirePage } from "@/lib/server/auth";
import { getSnapshot } from "@/lib/server/snapshot";
import { REPORTS } from "@/lib/server/reports";
import { all } from "@/lib/server/db";
import { canRead, canWrite } from "@/lib/rbac";
import { crmStats, kpiStatus } from "@/lib/calc/analytics";
import { Badge, Card, PageHeader } from "@/components/ui";
import { BarsChart } from "@/components/charts";
import { SnapshotAction } from "@/components/b10-actions";
import { DataTable } from "@/components/data-table";
import { ratio } from "@/lib/format";

const STATUS: Record<string, [string, string]> = { DRAFT: ["초안", "neutral"], SUBMITTED: ["승인요청", "warn"], APPROVED: ["승인완료", "good"], REJECTED: ["반려", "bad"] };

export default async function ReportsPage() {
  const user = await requirePage("reports");
  const snap = getSnapshot();
  const { kpis, data } = snap;
  const versions = all<{ id: number; report_type: string; title: string; base_date: string; data_version: number; author: string; status: string; approved_by: string | null; approved_at: string | null; comment: string | null; created_at: string }>(
    "SELECT * FROM report_snapshots ORDER BY id DESC LIMIT 50",
  );
  const visible = REPORTS.filter((r) => canRead(user.role, r.module));
  const attain = kpis
    .filter((k) => k.target !== null && k.unit === "%")
    .map((k) => ({ name: k.label, rate: k.higherIsBetter ? ratio(k.value, k.target!) : ratio(k.target!, k.value) }));
  const crm = canRead(user.role, "crm") ? crmStats(data, "2026-04-01", data.settings.base_date) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        code="B10"
        title="성과분석 및 보고서관리"
        desc="10종 보고서를 화면에서 조회하고 A4 인쇄/PDF 및 Excel로 출력합니다. 보고서에는 기준일·작성일·작성자·데이터 버전·승인상태가 표시되며, 작성 → 제출 → 경영진 승인 절차로 버전을 관리합니다."
      />
      <Card title="보고서 목록" pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>No</th>
              <th>보고서</th>
              <th>내용</th>
              <th>최근 승인상태</th>
              <th className="r">출력</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const last = versions.find((v) => v.report_type === r.type);
              return (
                <tr key={r.type}>
                  <td className="num">{i + 1}</td>
                  <td>
                    <Link href={`/reports/${r.type}`} className="font-semibold text-teal hover:underline">
                      {r.title}
                    </Link>
                  </td>
                  <td className="text-ink2">{r.desc}</td>
                  <td>{last ? <Badge tone={STATUS[last.status][1]}>{STATUS[last.status][0]}</Badge> : <Badge>미작성</Badge>}</td>
                  <td className="r">
                    <div className="flex justify-end gap-1.5">
                      <Link href={`/reports/${r.type}`} className="rounded-md border border-line px-2 py-1 text-xs hover:bg-bg2">
                        조회·PDF
                      </Link>
                      <a href={`/api/reports/${r.type}`} className="rounded-md border border-line px-2 py-1 text-xs hover:bg-bg2">
                        Excel
                      </a>
                      {canWrite(user.role, "reports") && <SnapshotAction action="create" type={r.type} label="버전 작성" />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title="보고서 버전·승인 이력" sub="버전 작성 시점의 기준일·데이터 버전이 고정 기록됩니다.">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>보고서</th>
                <th>기준일</th>
                <th>데이터 버전</th>
                <th>작성자</th>
                <th>상태</th>
                <th>승인자/의견</th>
                <th className="r">처리</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td className="num">{v.id}</td>
                  <td>{v.title}</td>
                  <td className="num">{v.base_date}</td>
                  <td className="num">
                    v{v.data_version}
                    {v.data_version !== snap.version && <span className="ml-1 text-[11px] text-warn">(현재 v{snap.version})</span>}
                  </td>
                  <td>{v.author}</td>
                  <td>
                    <Badge tone={STATUS[v.status][1]}>{STATUS[v.status][0]}</Badge>
                  </td>
                  <td className="text-xs text-ink2">
                    {v.approved_by ? `${v.approved_by} ${v.approved_at?.slice(0, 10) ?? ""}` : "-"} {v.comment && `· ${v.comment}`}
                  </td>
                  <td className="r">
                    <div className="flex justify-end gap-1">
                      {(v.status === "DRAFT" || v.status === "REJECTED") && v.author === user.name && <SnapshotAction action="submit" id={v.id} label="승인요청" tone="primary" />}
                      {v.status === "SUBMITTED" && user.role === "EXECUTIVE" && (
                        <>
                          <SnapshotAction action="approve" id={v.id} label="승인" tone="primary" />
                          <SnapshotAction action="reject" id={v.id} label="반려" tone="danger" />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="KPI 목표 달성도" sub="달성률 = 현재값 ÷ 목표 (낮을수록 양호 지표는 목표 ÷ 현재값)">
          <BarsChart data={attain} x="name" kind="pct" horizontal series={[{ key: "rate", label: "달성률" }]} refLine={undefined} height={300} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {kpis.map((k) => {
              const st = kpiStatus(k);
              return (
                <Badge key={k.key} tone={st === "good" ? "good" : st === "warn" ? "warn" : st === "bad" ? "bad" : "neutral"}>
                  {st === "good" ? "●" : st === "warn" ? "▲" : "■"} {k.label}
                </Badge>
              );
            })}
          </div>
        </Card>
        {crm && (
          <Card title="담당자별 영업 성과 (준공 후)">
            <DataTable
              rows={crm.byManager.map((m) => ({ id: m.name, ...m }))}
              cols={[
                { key: "name", label: "담당자" },
                { key: "leads", label: "상담", kind: "num" },
                { key: "visits", label: "방문", kind: "num" },
                { key: "contracts", label: "계약", kind: "num" },
                { key: "conversion", label: "전환율", kind: "pct" },
                { key: "amount", label: "계약금액", kind: "money", sum: true },
              ]}
            />
          </Card>
        )}
      </div>
    </div>
  );
}
