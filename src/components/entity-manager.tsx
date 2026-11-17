"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Pencil, Plus, Trash2, X } from "lucide-react";
import { ENTITIES, type EntityName, type FieldDef } from "@/lib/entities";
import { DataTable, type Col, type FilterDef } from "./data-table";

type Row = Record<string, unknown>;

export function fieldToCol(f: FieldDef, link?: string): Col {
  const kind: Col["kind"] =
    f.type === "money" ? "money" : f.type === "rate" ? "pct" : f.type === "area" ? "area" : f.type === "int" || f.type === "number" ? "num" : f.type === "date" ? "date" : f.type === "bool" ? "bool" : "text";
  return { key: f.key, label: f.label, kind, map: f.type === "select" ? f.options : undefined, link };
}

export function EntityManager({
  entity,
  canWrite,
  filterBy,
  defaults,
  columns,
  filters,
  links,
  title,
  compact,
  initialQuery,
  extraCols,
}: {
  entity: EntityName;
  canWrite: boolean;
  filterBy?: { key: string; value: string };
  defaults?: Row;
  columns?: string[];
  filters?: string[];
  links?: Record<string, string>;
  title?: string;
  compact?: boolean;
  initialQuery?: string;
  extraCols?: Col[];
}) {
  const def = ENTITIES[entity];
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [msg, setMsg] = useState<string>("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const qs = filterBy ? `?by=${filterBy.key}&value=${encodeURIComponent(filterBy.value)}` : "";
    const r = await fetch(`/api/entities/${entity}${qs}`);
    const j = await r.json();
    setRows(r.ok ? j.rows : []);
    if (!r.ok) setMsg(j.error);
  }, [entity, filterBy]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const listFields = columns ? columns.map((k) => def.fields.find((f) => f.key === k)!).filter(Boolean) : def.fields.filter((f) => f.list);
  const cols: Col[] = [...listFields.map((f) => fieldToCol(f, links?.[f.key] ?? (f.key === "asset_id" ? "/assets/{asset_id}" : undefined))), ...(extraCols ?? [])];
  const filterDefs: FilterDef[] = (filters ?? def.fields.filter((f) => f.list && f.type === "select").slice(0, 3).map((f) => f.key))
    .map((k) => def.fields.find((f) => f.key === k)!)
    .filter((f) => f?.options)
    .map((f) => ({ key: f.key, label: f.label, options: f.options! }));

  async function save() {
    if (!editing) return;
    setBusy(true);
    setErrors([]);
    const url = isNew ? `/api/entities/${entity}` : `/api/entities/${entity}/${encodeURIComponent(String(editing.id))}`;
    const r = await fetch(url, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isNew ? editing : { data: editing, reason }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) {
      setErrors(j.details ?? [j.error]);
      return;
    }
    if (j.status === "PENDING") setMsg(`중요 항목(${(j.protectedFields as string[]).map((k) => def.fields.find((f) => f.key === k)?.label).join(", ")}) 변경은 승인 요청(#${j.approvalId})으로 등록되었습니다. 경영진 승인 후 반영됩니다.`);
    else setMsg(isNew ? `${def.label} ${j.row.id} 등록 완료` : `${def.label} ${editing.id} 수정 완료`);
    setEditing(null);
    setReason("");
    await load();
    router.refresh();
  }

  async function remove(row: Row) {
    const rs = prompt(`${def.label} ${row.id} 을(를) 삭제합니다. 사유를 입력하세요.${def.approvalOnDelete ? "\n(삭제는 승인 후 반영됩니다)" : ""}`);
    if (rs === null) return;
    const r = await fetch(`/api/entities/${entity}/${encodeURIComponent(String(row.id))}?reason=${encodeURIComponent(rs)}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok) setMsg(`삭제 실패: ${j.error}`);
    else setMsg(j.status === "PENDING" ? `삭제 승인 요청(#${j.approvalId})이 등록되었습니다.` : `${row.id} 삭제 완료`);
    setEditing(null);
    await load();
    router.refresh();
  }

  return (
    <div>
      {msg && (
        <div className="mb-2 flex items-start justify-between rounded-md border border-teal/30 bg-teal-soft px-3 py-2 text-xs text-[#1b5f6c]">
          <span>{msg}</span>
          <button onClick={() => setMsg("")} aria-label="닫기">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {rows === null ? (
        <div className="py-10 text-center text-sm text-ink3">불러오는 중…</div>
      ) : (
        <DataTable
          rows={rows}
          cols={cols}
          filters={filterDefs}
          maxHeight={compact ? 320 : 560}
          pageSize={compact ? 20 : 50}
          initialQuery={initialQuery}
          onRowClick={(row) => {
            setIsNew(false);
            setErrors([]);
            setEditing({ ...row });
          }}
          toolbar={
            <>
              {title && <span className="text-xs font-semibold text-ink2">{title}</span>}
              <a href={`/api/excel/export?entity=${entity}`} className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-xs hover:bg-bg2">
                <Download className="h-3.5 w-3.5" /> Excel
              </a>
              {canWrite && (
                <a href={`/api/excel/template?entity=${entity}`} className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-xs hover:bg-bg2">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> 양식
                </a>
              )}
              {canWrite && (
                <button
                  onClick={() => {
                    setIsNew(true);
                    setErrors([]);
                    setEditing({ ...(defaults ?? {}), ...(filterBy ? { [filterBy.key]: filterBy.value } : {}) });
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-navy px-2.5 py-1 text-xs font-medium text-white hover:bg-navy-2"
                >
                  <Plus className="h-3.5 w-3.5" /> 신규 등록
                </button>
              )}
            </>
          }
        />
      )}

      {editing && (
        <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-4" onClick={() => setEditing(null)}>
          <div className="my-6 w-full max-w-3xl rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h3 className="font-semibold">
                {def.label} {isNew ? "신규 등록" : `${String(editing.id)} ${canWrite ? "수정" : "상세"}`}
              </h3>
              <button onClick={() => setEditing(null)} aria-label="닫기">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid max-h-[65vh] grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2">
              {def.fields
                .filter((f) => !(isNew && f.key === "id" && def.idPrefix))
                .map((f) => (
                  <FieldInput key={f.key} f={f} value={editing[f.key]} disabled={!canWrite || !!f.readonly || (!isNew && f.key === "id")} onChange={(v) => setEditing({ ...editing, [f.key]: v })} />
                ))}
            </div>
            {errors.length > 0 && (
              <ul className="mx-5 mb-3 rounded-md bg-bad-bg px-4 py-2 text-xs text-bad">
                {errors.map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            )}
            {canWrite && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
                {!isNew && <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="변경 사유 (변경이력·승인요청에 기록)" className="input !w-72 flex-1" />}
                <div className="ml-auto flex gap-2">
                  {!isNew && (
                    <button onClick={() => remove(editing)} className="inline-flex items-center gap-1 rounded-md border border-bad/40 px-3 py-1.5 text-sm text-bad hover:bg-bad-bg">
                      <Trash2 className="h-4 w-4" /> 삭제
                    </button>
                  )}
                  <button disabled={busy} onClick={save} className="inline-flex items-center gap-1 rounded-md bg-navy px-4 py-1.5 text-sm font-medium text-white hover:bg-navy-2 disabled:opacity-60">
                    <Pencil className="h-4 w-4" /> {busy ? "저장 중…" : "저장"}
                  </button>
                </div>
                <p className="w-full text-[11px] text-ink3">★ 표시 항목은 중요 금액·계약정보로, 변경 시 경영진 승인 후 반영됩니다. 모든 변경은 감사로그에 기록됩니다.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FieldInput({ f, value, onChange, disabled }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void; disabled: boolean }) {
  const label = (
    <span className="mb-1 block text-xs text-ink2">
      {f.label}
      {f.required && <span className="text-bad"> *</span>}
      {f.protected && <span className="text-warn" title="변경 시 승인 필요"> ★</span>}
      {f.pii && <span className="ml-1 rounded bg-bad-bg px-1 text-[10px] text-bad">개인정보</span>}
    </span>
  );
  const v = value === null || value === undefined ? "" : String(value);
  let input: React.ReactNode;
  if (f.type === "select" || f.type === "bool") {
    const opts = f.type === "bool" ? { "1": "예", "0": "아니오" } : f.options!;
    input = (
      <select className="input" value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">선택</option>
        {Object.entries(opts).map(([k, lab]) => (
          <option key={k} value={k}>
            {lab}
          </option>
        ))}
      </select>
    );
  } else if (f.type === "textarea") {
    input = <textarea className="input min-h-[64px]" value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  } else if (["money", "int", "number", "rate", "area"].includes(f.type)) {
    input = (
      <div>
        <input className="input num text-right" inputMode="decimal" value={v} disabled={disabled} onChange={(e) => onChange(e.target.value.replace(/,/g, ""))} />
        {f.type === "money" && v && !Number.isNaN(Number(v)) && <div className="num mt-0.5 text-right text-[11px] text-ink3">{Number(v).toLocaleString("ko-KR")}원 ≈ {(Number(v) / 1e8).toFixed(2)}억원</div>}
      </div>
    );
  } else {
    input = <input className="input" type={f.type === "date" ? "date" : f.type === "month" ? "month" : "text"} value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <label className={f.type === "textarea" ? "block sm:col-span-2" : "block"}>
      {label}
      {input}
      {f.help && <span className="mt-0.5 block text-[11px] text-ink3">{f.help}</span>}
    </label>
  );
}
