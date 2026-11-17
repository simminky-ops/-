"use client";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";

export function PrintButton({ label = "인쇄 / PDF 저장" }: { label?: string }) {
  return (
    <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md bg-navy px-3 py-1.5 text-[13px] font-medium text-white hover:bg-navy-2">
      <Printer className="h-4 w-4" /> {label}
    </button>
  );
}

export function SnapshotAction({ action, type, id, label, tone = "secondary" }: { action: "create" | "submit" | "approve" | "reject"; type?: string; id?: number; label: string; tone?: "primary" | "secondary" | "danger" }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        const comment = action === "reject" || action === "approve" ? (prompt(`${label} 의견(선택)`) ?? undefined) : undefined;
        const r = await fetch("/api/report-snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, type, id, comment }) });
        if (!r.ok) alert((await r.json()).error);
        router.refresh();
      }}
      className={
        tone === "primary"
          ? "rounded-md bg-navy px-2.5 py-1 text-xs font-medium text-white hover:bg-navy-2"
          : tone === "danger"
            ? "rounded-md border border-bad/40 px-2.5 py-1 text-xs text-bad hover:bg-bad-bg"
            : "rounded-md border border-line bg-white px-2.5 py-1 text-xs hover:bg-bg2"
      }
    >
      {label}
    </button>
  );
}
