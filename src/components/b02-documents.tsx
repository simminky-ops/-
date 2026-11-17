"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Paperclip, Trash2 } from "lucide-react";
import { fmtDateTime, fmtNum } from "@/lib/format";

interface Doc {
  id: string;
  category: string;
  filename: string;
  size: number;
  confidential: number;
  uploaded_by: string;
  created_at: string;
}

export function AssetDocuments({ entityType, entityId, canWrite }: { entityType: string; entityId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<Doc[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("계약서");

  const load = useCallback(async () => {
    const r = await fetch(`/api/documents?entity_type=${entityType}&entity_id=${encodeURIComponent(entityId)}`);
    const j = await r.json();
    setRows(r.ok ? j.rows : []);
    if (!r.ok) setMsg(j.error);
  }, [entityType, entityId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const f = fileRef.current?.files?.[0];
    if (!f) return setMsg("파일을 선택하세요.");
    const fd = new FormData();
    fd.append("file", f);
    fd.append("entity_type", entityType);
    fd.append("entity_id", entityId);
    fd.append("category", category);
    setBusy(true);
    const r = await fetch("/api/documents", { method: "POST", body: fd });
    setBusy(false);
    const j = await r.json();
    setMsg(r.ok ? `업로드 완료 (${j.id})` : `업로드 실패: ${j.error}`);
    if (fileRef.current) fileRef.current.value = "";
    load();
  }

  async function remove(id: string) {
    if (!confirm("첨부파일을 삭제합니다. 계속할까요?")) return;
    const r = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    const j = await r.json();
    setMsg(r.ok ? "삭제 완료" : `삭제 실패: ${j.error}`);
    load();
  }

  return (
    <div className="space-y-3">
      {canWrite && (
        <form onSubmit={upload} className="no-print flex flex-wrap items-center gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input !w-auto">
            {["계약서", "수납증빙", "유예약정", "최고장", "하자사진", "임대차계약", "기타"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input ref={fileRef} type="file" className="text-xs" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.xls,.docx,.doc,.hwp,.hwpx,.txt,.zip" />
          <button disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-navy px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
            <Paperclip className="h-3.5 w-3.5" /> {busy ? "업로드 중…" : "첨부"}
          </button>
          <span className="text-[11px] text-ink3">최대 20MB · PDF/이미지/오피스/한글 문서</span>
        </form>
      )}
      {msg && <div className="rounded bg-teal-soft px-3 py-1.5 text-xs text-[#1b5f6c]">{msg}</div>}
      {rows === null ? (
        <div className="text-xs text-ink3">불러오는 중…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-ink3">첨부된 문서가 없습니다.</div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>구분</th>
              <th>파일명</th>
              <th className="r">크기</th>
              <th>등록자</th>
              <th>등록일시</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>{d.category}</td>
                <td>
                  <a href={`/api/documents/${d.id}`} className="inline-flex items-center gap-1 text-teal hover:underline">
                    <Download className="h-3.5 w-3.5" /> {d.filename}
                  </a>
                </td>
                <td className="r num">{fmtNum(d.size / 1024, 0)}KB</td>
                <td>{d.uploaded_by}</td>
                <td className="num">{fmtDateTime(d.created_at)}</td>
                <td>
                  {canWrite && (
                    <button onClick={() => remove(d.id)} className="text-bad" aria-label="삭제">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
