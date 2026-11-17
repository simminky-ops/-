"use client";
import { useCallback, useEffect, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { Badge, Card } from "./ui";
import { DataTable } from "./data-table";

type Doc = Record<string, unknown> & { id: string; filename: string; entity_type: string | null };

export function DocumentCenter({
  entityOptions,
  canConfidential,
  canUploadGeneral,
}: {
  entityOptions: { name: string; label: string }[];
  canConfidential: boolean;
  canUploadGeneral: boolean;
}) {
  const [rows, setRows] = useState<Doc[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ entity_type: "", entity_id: "", category: "일반", confidential: false });
  const [file, setFile] = useState<File | null>(null);
  const [sel, setSel] = useState<Doc | null>(null);
  const label = Object.fromEntries(entityOptions.map((e) => [e.name, e.label]));

  const load = useCallback(async () => {
    const r = await fetch("/api/documents");
    const j = await r.json();
    if (r.ok) setRows(j.rows.map((d: Doc) => ({ ...d, kb: Math.round(Number(d.size) / 1024), created: fmtDateTime(String(d.created_at)) })));
    else setMsg(j.error);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    if (form.entity_type) fd.append("entity_type", form.entity_type);
    if (form.entity_id) fd.append("entity_id", form.entity_id);
    fd.append("category", form.category);
    fd.append("confidential", form.confidential ? "1" : "0");
    const r = await fetch("/api/documents", { method: "POST", body: fd });
    const j = await r.json();
    setBusy(false);
    setMsg(r.ok ? `업로드 완료 (${j.id})` : `업로드 실패: ${j.error}`);
    if (r.ok) setFile(null);
    load();
  }

  async function remove(d: Doc) {
    if (!confirm(`${d.filename} 을(를) 삭제합니다. 계속하시겠습니까?`)) return;
    const r = await fetch(`/api/documents/${d.id}`, { method: "DELETE" });
    setMsg(r.ok ? "삭제 완료" : `삭제 실패: ${(await r.json()).error}`);
    setSel(null);
    load();
  }

  return (
    <div className="space-y-4">
      {msg && <div className="rounded-md bg-teal-soft px-3 py-2 text-xs text-[#1b5f6c]">{msg}</div>}
      <Card title="문서 업로드" sub="허용 형식: PDF·이미지·Office·HWP·TXT·ZIP / 20MB 이하 · 서버 저장(data/uploads) · 연결 데이터의 권한을 따름">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <select className="input" value={form.entity_type} onChange={(e) => setForm({ ...form, entity_type: e.target.value })}>
            <option value="">{canUploadGeneral ? "연결 없음(일반 문서)" : "연결 데이터 선택"}</option>
            {entityOptions.map((e) => (
              <option key={e.name} value={e.name}>
                {e.label}
              </option>
            ))}
          </select>
          <input className="input" placeholder="연결 ID (예: A-001, C-0012)" value={form.entity_id} onChange={(e) => setForm({ ...form, entity_id: e.target.value })} />
          <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {["일반", "계약서", "납부약정서", "최고장", "임대차계약서", "현장사진", "견적서", "법률문서", "금융약정", "보고서"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input type="file" className="input xl:col-span-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <div className="flex items-center gap-3">
            {canConfidential && (
              <label className="inline-flex items-center gap-1 text-xs">
                <input type="checkbox" checked={form.confidential} onChange={(e) => setForm({ ...form, confidential: e.target.checked })} /> 법률 기밀
              </label>
            )}
            <button disabled={!file || busy} onClick={upload} className="inline-flex items-center gap-1 rounded-md bg-navy px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              <Upload className="h-3.5 w-3.5" /> 업로드
            </button>
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="문서 목록" sub="현재 역할로 조회 가능한 문서만 표시 · 다운로드 이력은 감사로그에 기록" className="xl:col-span-2">
          <DataTable
            rows={rows}
            onRowClick={(r) => setSel(r as Doc)}
            filters={[{ key: "entity_type", label: "연결 데이터", options: label }]}
            cols={[
              { key: "id", label: "문서 ID" },
              { key: "filename", label: "파일명", link: "/api/documents/{id}" },
              { key: "category", label: "분류" },
              { key: "entity_type", label: "연결", map: label },
              { key: "entity_id", label: "연결 ID" },
              { key: "kb", label: "KB", kind: "num" },
              { key: "uploaded_by", label: "등록자" },
              { key: "created", label: "등록일시" },
            ]}
            emptyText="등록된 문서가 없습니다."
          />
        </Card>
        <Card title="문서 상세">
          {sel ? (
            <div className="space-y-2 text-sm">
              <div className="font-semibold break-all">{sel.filename}</div>
              <div className="text-xs text-ink2">
                {String(sel.category)} · {label[String(sel.entity_type)] ?? "일반"} {String(sel.entity_id ?? "")}
              </div>
              {Number(sel.confidential) === 1 && <Badge tone="bad">■ 법률 기밀</Badge>}
              <div className="flex gap-2 pt-2">
                <a href={`/api/documents/${sel.id}`} className="rounded-md border border-line px-3 py-1.5 text-xs hover:bg-bg2">
                  다운로드
                </a>
                <button onClick={() => remove(sel)} className="inline-flex items-center gap-1 rounded-md border border-bad/40 px-3 py-1.5 text-xs text-bad hover:bg-bad-bg">
                  <Trash2 className="h-3.5 w-3.5" /> 삭제
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink3">목록에서 문서를 선택하세요.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
