import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { clsx } from "clsx";
import { requirePage } from "@/lib/server/auth";
import { getSnapshot } from "@/lib/server/snapshot";
import { buildReport, reportMeta, type CellKind } from "@/lib/server/reports";
import { get } from "@/lib/server/db";
import { canRead } from "@/lib/rbac";
import { fmtDate, fmtNum } from "@/lib/format";
import { PrintButton } from "@/components/b10-actions";
import { SampleTag } from "@/components/ui";

const STATUS: Record<string, string> = { DRAFT: "초안", SUBMITTED: "승인요청", APPROVED: "승인완료", REJECTED: "반려" };

function cell(v: string | number | null, kind?: CellKind) {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "number") {
    if (kind === "money") return fmtNum(v / 1e8, 2);
    if (kind === "pct") return `${fmtNum(v, 1)}%`;
    return fmtNum(v, Number.isInteger(v) ? 0 : 2);
  }
  if (kind === "date") return fmtDate(v);
  return v;
}

export default async function ReportView({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const meta = reportMeta(type);
  if (!meta) notFound();
  const user = await requirePage("reports");
  if (!canRead(user.role, meta.module)) redirect(`/forbidden?m=${meta.module}`);
  const snap = getSnapshot();
  const doc = buildReport(type, snap, user);
  if (!doc) redirect("/forbidden");
  const approval = get<{ id: number; status: string; approved_by: string | null; approved_at: string | null; author: string; data_version: number }>(
    "SELECT * FROM report_snapshots WHERE report_type = ? ORDER BY id DESC LIMIT 1",
    type,
  );
  const today = new Date().toISOString().slice(0, 10);
  const stale = approval && approval.data_version !== snap.version;

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Link href="/reports" className="text-sm text-teal hover:underline">
          ← 보고서 목록
        </Link>
        <div className="ml-auto flex gap-2">
          <a href={`/api/reports/${type}`} className="rounded-md border border-line bg-white px-3 py-1.5 text-[13px] hover:bg-bg2">
            Excel 다운로드
          </a>
          <PrintButton />
        </div>
      </div>
      <article className="print-page mx-auto max-w-[210mm] rounded-lg border border-line bg-white px-[14mm] py-[12mm] shadow-sm">
        <header className="border-b-2 border-navy pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold tracking-wider text-teal">A-D PROJECT · {snap.data.settings.project_name}</div>
              <h1 className="mt-1 text-[22px] font-bold text-navy">{doc.title}</h1>
              <div className="mt-0.5 text-xs text-ink3">준공 후 복합개발사업의 자산가치 회복 및 사업 정상화를 위한 통합 운영계획</div>
            </div>
            <SampleTag />
          </div>
          <table className="mt-3 w-full text-[11.5px]">
            <tbody>
              <tr className="[&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1">
                <td className="w-[14%] bg-bg2 font-semibold">기준일</td>
                <td className="num">{snap.data.settings.base_date}</td>
                <td className="w-[14%] bg-bg2 font-semibold">작성일</td>
                <td className="num">{today}</td>
                <td className="w-[14%] bg-bg2 font-semibold">작성자</td>
                <td>{approval?.author ?? user.name}</td>
              </tr>
              <tr className="[&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1">
                <td className="bg-bg2 font-semibold">데이터 버전</td>
                <td className="num">v{snap.version}</td>
                <td className="bg-bg2 font-semibold">승인상태</td>
                <td colSpan={3}>
                  {approval ? `${STATUS[approval.status]}${approval.approved_by ? ` · ${approval.approved_by} (${approval.approved_at?.slice(0, 10)})` : ""}${stale ? ` — 승인본 데이터 v${approval.data_version}과 현재 데이터가 다름` : ""}` : "미제출(초안)"}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1.5 text-[10.5px] text-ink3">금액 단위: 억원(표) · 수치는 가상의 예시 데이터이며 실제 현장 실적이 아닙니다 · 내부 관리용</p>
        </header>
        {doc.sections.map((sec, i) => (
          <section key={i} className={clsx("mt-5", sec.pageBreak && "print-break")}>
            <h2 className="mb-2 border-l-4 border-teal pl-2 text-[15px] font-bold text-navy">{sec.title}</h2>
            {sec.text && (
              <div className="space-y-1 text-[12.5px] leading-relaxed text-ink2">
                {sec.text.map((t, j) => (
                  <p key={j}>{t}</p>
                ))}
              </div>
            )}
            {sec.kpis && (
              <div className="avoid-break grid grid-cols-2 gap-2 sm:grid-cols-5">
                {sec.kpis.map((k) => (
                  <div key={k.label} className="rounded border border-line px-2.5 py-2">
                    <div className="text-[10.5px] text-ink3">{k.label}</div>
                    <div className="num text-[15px] font-bold text-ink">
                      {typeof k.value === "number" ? (k.kind === "money" ? `${fmtNum(k.value / 1e8, 1)}억원` : k.kind === "pct" ? `${fmtNum(k.value, 1)}%` : fmtNum(k.value)) : k.value}
                    </div>
                    {k.sub && <div className="text-[10.5px] text-ink3">{k.sub}</div>}
                  </div>
                ))}
              </div>
            )}
            {sec.table && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[10.5px]">
                  <thead>
                    <tr>
                      {sec.table.columns.map((c, ci) => (
                        <th key={ci} className={clsx("border border-line bg-navy px-1.5 py-1 font-semibold whitespace-nowrap text-white", c.kind && c.kind !== "text" && c.kind !== "date" ? "text-right" : "text-left")}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sec.table.rows.map((r, ri) => (
                      <tr key={ri} className="avoid-break odd:bg-white even:bg-[#f8fafb]">
                        {r.map((v, ci) => {
                          const k = sec.table!.columns[ci]?.kind;
                          const neg = typeof v === "number" && v < 0 && k === "money";
                          return (
                            <td key={ci} className={clsx("num border border-line px-1.5 py-0.5 whitespace-nowrap", typeof v === "number" ? "text-right" : "", neg && "text-bad")}>
                              {cell(v, k)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {!sec.table.rows.length && (
                      <tr>
                        <td colSpan={sec.table.columns.length} className="border border-line py-3 text-center text-ink3">
                          해당 내역 없음
                        </td>
                      </tr>
                    )}
                    {sec.table.total && (
                      <tr className="bg-[#eef3f6] font-semibold">
                        {sec.table.total.map((v, ci) => (
                          <td key={ci} className={clsx("num border border-line px-1.5 py-1", typeof v === "number" && "text-right")}>
                            {cell(v, sec.table!.columns[ci]?.kind)}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
        <footer className="mt-8 border-t border-line pt-2 text-[10px] text-ink3">
          A-D PROJECT · 본 보고서는 시스템에서 자동 생성되었습니다. 사업장 식별정보·개인정보는 비공개 처리되었습니다. 출력: {user.name} / {today}
        </footer>
      </article>
    </div>
  );
}
