"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Badge, Card } from "./ui";

export interface ApprovalView {
  id: number;
  entityLabel: string;
  entity_type: string;
  entity_id: string;
  action: string;
  reason: string | null;
  requested_by: string;
  requested_at: string;
  status: string;
  decided_by: string | null;
  decided_at: string | null;
  comment: string | null;
  diff: { label: string; before: string; after: string }[];
}

const STATUS: Record<string, [string, string]> = {
  PENDING: ["warn", "▲ 승인대기"],
  APPROVED: ["good", "● 승인"],
  REJECTED: ["bad", "■ 반려"],
  FAILED: ["bad", "■ 실패"],
};

export function ApprovalList({ items, canApprove, me }: { items: ApprovalView[]; canApprove: boolean; me: string }) {
  const router = useRouter();
  const [comment, setComment] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const shown = items.filter((i) => showDone || i.status === "PENDING");

  async function decide(id: number, approve: boolean) {
    setBusy(true);
    const r = await fetch(`/api/approvals/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approve, comment: comment[id] ?? "" }) });
    const j = await r.json();
    setBusy(false);
    setMsg(r.ok ? `#${id} ${approve ? "승인" : "반려"} 처리 완료` : [j.error, ...(j.details ?? [])].join(" · "));
    router.refresh();
  }

  return (
    <Card
      title="변경 승인 요청"
      sub="중요 금액·계약정보 변경 및 계약·수납 삭제 요청 — 승인 시 현재 데이터 기준으로 재검증 후 반영"
      actions={
        <label className="inline-flex items-center gap-1 text-xs">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> 처리 완료 건 포함
        </label>
      }
    >
      {msg && <div className="mb-3 rounded-md bg-teal-soft px-3 py-2 text-xs text-[#1b5f6c]">{msg}</div>}
      <div className="space-y-3">
        {shown.map((a) => {
          const [tone, lab] = STATUS[a.status] ?? ["neutral", a.status];
          const own = a.requested_by === me;
          return (
            <div key={a.id} className="rounded-md border border-line">
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-[#f7f9fb] px-3 py-2 text-sm">
                <span className="num font-semibold">#{a.id}</span>
                <Badge tone={tone}>{lab}</Badge>
                <Badge tone={a.action === "DELETE" ? "bad" : "info"}>{a.action === "DELETE" ? "삭제" : "수정"}</Badge>
                <span className="font-medium">
                  {a.entityLabel} {a.entity_id}
                </span>
                <span className="ml-auto text-xs text-ink3">
                  요청 {a.requested_by} · {a.requested_at}
                </span>
              </div>
              <div className="px-3 py-2">
                {a.reason && <p className="mb-2 text-xs text-ink2">사유: {a.reason}</p>}
                {a.diff.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>항목</th>
                          <th className="r">변경 전</th>
                          <th className="r">{a.action === "DELETE" ? "" : "변경 요청"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.diff.map((d) => (
                          <tr key={d.label}>
                            <td>{d.label}</td>
                            <td className="r num text-ink3">{d.before}</td>
                            <td className="r num font-semibold">{d.after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {a.status !== "PENDING" ? (
                  <p className="mt-2 text-xs text-ink3">
                    처리: {a.decided_by} · {a.decided_at} {a.comment ? `· ${a.comment}` : ""}
                  </p>
                ) : canApprove ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input className="input !w-72 flex-1" placeholder="검토 의견" value={comment[a.id] ?? ""} onChange={(e) => setComment({ ...comment, [a.id]: e.target.value })} />
                    {own ? (
                      <span className="text-xs text-ink3">본인 요청은 승인할 수 없습니다.</span>
                    ) : (
                      <>
                        <button disabled={busy} onClick={() => decide(a.id, false)} className="inline-flex items-center gap-1 rounded-md border border-bad/40 px-3 py-1.5 text-xs text-bad hover:bg-bad-bg">
                          <X className="h-3.5 w-3.5" /> 반려
                        </button>
                        <button disabled={busy} onClick={() => decide(a.id, true)} className="inline-flex items-center gap-1 rounded-md bg-navy px-3 py-1.5 text-xs font-medium text-white">
                          <Check className="h-3.5 w-3.5" /> 승인
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-ink3">승인권자(경영진)의 처리를 기다리는 중입니다.</p>
                )}
              </div>
            </div>
          );
        })}
        {!shown.length && <p className="py-6 text-center text-sm text-ink3">승인 대기 중인 요청이 없습니다.</p>}
      </div>
    </Card>
  );
}
