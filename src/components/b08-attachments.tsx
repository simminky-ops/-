"use client";
import { useCallback, useEffect, useState } from "react";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { fmtDateTime } from "@/lib/format";

type Doc = { id: string; filename: string; category: string; size: number; uploaded_by: string; created_at: string };

/** 엔티티 단위 첨부파일(사진·문서) 업로드/목록 — /api/documents 사용 (서버 저장) */
export function AttachmentPanel({
  entityType,
  ids,
  canWrite,
  categories = ["현장사진", "보수전", "보수후", "견적서", "협의문서", "기타"],
}: {
  entityType: string;
  ids: string[];
  canWrite: boolean;
  categories?: string[];
}) {
  const [entityId, setEntityId] = useState(ids[0] ?? "");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState(categories[0]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) return setDocs([]);
    const r = await fetch(`/api/documents?entity_type=${entityType}&entity_id=${encodeURIComponent(entityId)}`);
    const j = await r.json();
    setDocs(r.ok ? j.rows : []);
  }, [entityType, entityId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function upload() {
    if (!file || !entityId) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("entity_type", entityType);
    fd.append("entity_id", entityId);
    fd.append("category", category);
    const r = await fetch("/api/documents", { method: "POST", body: fd });
    const j = await r.json();
    setBusy(false);
    setMsg(r.ok ? `업로드 완료 (${j.id})` : `업로드 실패: ${j.error}`);
    if (r.ok) setFile(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm("첨부파일을 삭제합니다. 계속하시겠습니까?")) return;
    const r = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    setMsg(r.ok ? "삭제 완료" : `삭제 실패: ${(await r.json()).error}`);
    load();
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-ink2">대상 ID</span>
          <select className="input !w-40" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            {ids.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        {canWrite && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs text-ink2">분류</span>
              <select className="input !w-32" value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-ink2">파일 (사진·PDF 등, 20MB 이하)</span>
              <input type="file" className="input !w-64" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <button disabled={!file || busy} onClick={upload} className="inline-flex items-center gap-1 rounded-md bg-navy px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              <Upload className="h-3.5 w-3.5" /> {busy ? "업로드 중…" : "업로드"}
            </button>
          </>
        )}
      </div>
      {msg && <p className="text-xs text-teal">{msg}</p>}
      <ul className="divide-y divide-line rounded-md border border-line">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
            <Paperclip className="h-3.5 w-3.5 text-ink3" />
            <a href={`/api/documents/${d.id}`} className="flex-1 truncate font-medium text-teal hover:underline">
              {d.filename}
            </a>
            <span className="text-ink3">{d.category}</span>
            <span className="num text-ink3">{(d.size / 1024).toFixed(0)}KB</span>
            <span className="text-ink3">{d.uploaded_by}</span>
            <span className="num text-ink3">{fmtDateTime(d.created_at)}</span>
            {canWrite && (
              <button onClick={() => remove(d.id)} aria-label="삭제" className="text-bad">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
        {!docs.length && <li className="px-3 py-3 text-center text-xs text-ink3">첨부파일이 없습니다.</li>}
      </ul>
    </div>
  );
}
