"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Badge, Card } from "./ui";

type Ent = { name: string; label: string; canWrite: boolean; fields: number };
type Report = {
  entity: string;
  total: number;
  inserts: number;
  updates: number;
  errorRows: { row: number; id?: string; messages: string[] }[];
  committed: boolean;
  pendingApprovals: number;
};

export function DataCenter({ entities }: { entities: Ent[] }) {
  const router = useRouter();
  const [entity, setEntity] = useState(entities[0]?.name ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const cur = entities.find((e) => e.name === entity);
  const blocking = report ? report.errorRows.filter((e) => !(e.row === 1 && e.messages[0]?.startsWith("인식하지 못한"))) : [];

  async function send(commit: boolean) {
    if (!file) return;
    setBusy(true);
    setErr("");
    const fd = new FormData();
    fd.append("entity", entity);
    fd.append("file", file);
    fd.append("commit", commit ? "1" : "0");
    const r = await fetch("/api/excel/import", { method: "POST", body: fd });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) {
      setErr([j.error, ...(j.details ?? [])].join(" · "));
      return;
    }
    setReport(j);
    if (j.committed) router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card title="데이터 선택 및 다운로드" sub="Excel 다운로드는 권한에 따라 개인정보가 마스킹되며 출력 이력이 감사로그에 기록됩니다.">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-ink2">데이터 유형</span>
          <select
            className="input"
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setReport(null);
              setFile(null);
            }}
          >
            {entities.map((e) => (
              <option key={e.name} value={e.name}>
                {e.label} ({e.name})
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`/api/excel/export?entity=${entity}`} className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-3 py-1.5 text-sm hover:bg-bg2">
            <Download className="h-4 w-4" /> 데이터 다운로드
          </a>
          <a href={`/api/excel/template?entity=${entity}`} className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-3 py-1.5 text-sm hover:bg-bg2">
            <FileSpreadsheet className="h-4 w-4" /> 업로드 양식
          </a>
        </div>
        <div className="mt-3 text-xs text-ink3">{cur?.canWrite ? <Badge tone="good">업로드 가능</Badge> : <Badge>조회 전용 (업로드 권한 없음)</Badge>}</div>
      </Card>

      <Card title="Excel 업로드 (2단계: 검증 → 반영)" sub="1단계 검증 결과에 오류가 없을 때만 2단계 서버 반영이 가능합니다." className="xl:col-span-2">
        {cur?.canWrite ? (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <input
                type="file"
                accept=".xlsx"
                className="input !w-80"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setReport(null);
                }}
              />
              <button disabled={!file || busy} onClick={() => send(false)} className="inline-flex items-center gap-1 rounded-md border border-navy px-3 py-1.5 text-sm text-navy disabled:opacity-40">
                <CheckCircle2 className="h-4 w-4" /> 1단계 검증
              </button>
              <button
                disabled={!file || busy || !report || report.committed || blocking.length > 0 || report.inserts + report.updates === 0}
                onClick={() => send(true)}
                className="inline-flex items-center gap-1 rounded-md bg-navy px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                <Upload className="h-4 w-4" /> 2단계 서버 반영
              </button>
            </div>
            {err && <p className="mt-2 rounded bg-bad-bg px-3 py-2 text-xs text-bad">{err}</p>}
            {report && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                  <Box label="데이터 행" v={report.total} />
                  <Box label="신규 등록" v={report.inserts} />
                  <Box label="수정" v={report.updates} />
                  <Box label="오류 행" v={blocking.length} bad={blocking.length > 0} />
                  <Box label="승인 대기" v={report.pendingApprovals} />
                </div>
                {report.committed ? (
                  <p className="rounded bg-good-bg px-3 py-2 text-xs text-good">
                    ● 서버(DB)에 반영되었습니다. 신규 {report.inserts}건 · 수정 {report.updates}건{report.pendingApprovals ? ` (중요항목 변경 ${report.pendingApprovals}건은 승인 대기)` : ""} · 감사로그 기록 완료
                  </p>
                ) : blocking.length ? (
                  <p className="rounded bg-bad-bg px-3 py-2 text-xs text-bad">■ 오류가 있어 반영할 수 없습니다. 파일을 수정한 뒤 다시 검증하세요. (전체 반영 또는 전체 미반영 — 부분 반영 없음)</p>
                ) : (
                  <p className="rounded bg-teal-soft px-3 py-2 text-xs text-[#1b5f6c]">검증 통과. ‘2단계 서버 반영’을 누르면 하나의 트랜잭션으로 저장됩니다.</p>
                )}
                {report.errorRows.length > 0 && (
                  <div className="max-h-72 overflow-auto rounded-md border border-line">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>행</th>
                          <th>ID</th>
                          <th>오류 내용</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.errorRows.map((e, i) => (
                          <tr key={i}>
                            <td className="num">{e.row}</td>
                            <td>{e.id ?? "-"}</td>
                            <td className="!whitespace-normal text-bad">{e.messages.join(" / ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-ink3">선택한 데이터 유형에 대한 업로드(쓰기) 권한이 없습니다.</p>
        )}
      </Card>
    </div>
  );
}

function Box({ label, v, bad }: { label: string; v: number; bad?: boolean }) {
  return (
    <div className="rounded-md border border-line px-3 py-2">
      <div className="text-xs text-ink3">{label}</div>
      <div className={`num text-lg font-bold ${bad ? "text-bad" : "text-ink"}`}>{v.toLocaleString()}</div>
    </div>
  );
}
