// 서버·클라이언트 공용 UI 기본 요소 (상태 없음)
import Link from "next/link";
import { clsx } from "clsx";

export function PageHeader({
  code,
  title,
  desc,
  actions,
  sample = true,
}: {
  code?: string;
  title: string;
  desc?: string;
  actions?: React.ReactNode;
  sample?: boolean;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          {code && <span className="rounded bg-navy px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-white">{code}</span>}
          <h1 className="text-xl font-bold text-ink">{title}</h1>
          {sample && <SampleTag />}
        </div>
        {desc && <p className="mt-1 max-w-3xl text-sm text-ink2">{desc}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SampleTag({ className }: { className?: string }) {
  return (
    <span
      title="실제 현장 정보가 제공되지 않아 가상의 예시 데이터로 표시합니다."
      className={clsx("rounded border border-warn/40 bg-warn-bg px-1.5 py-0.5 text-[11px] font-semibold text-warn", className)}
    >
      예시 데이터
    </span>
  );
}

export function Card({
  title,
  sub,
  actions,
  children,
  className,
  pad = true,
}: {
  title?: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={clsx("avoid-break rounded-lg border border-line bg-white shadow-[0_1px_2px_rgba(18,38,63,0.04)]", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
            {sub && <p className="text-xs text-ink3">{sub}</p>}
          </div>
          {actions && <div className="no-print flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

const TONE: Record<string, string> = {
  good: "bg-good-bg text-good",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  info: "bg-teal-soft text-teal",
  neutral: "bg-bg2 text-ink2",
  navy: "bg-navy text-white",
};

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof TONE | string; children: React.ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap", TONE[tone] ?? TONE.neutral, className)}>{children}</span>;
}

/** 상태: 색 + 아이콘 + 라벨 (색만으로 구분하지 않음) */
export function StatusBadge({ status }: { status: "good" | "warn" | "bad" | "none" }) {
  if (status === "none") return <Badge>목표 미설정</Badge>;
  const m = { good: ["●", "양호"], warn: ["▲", "주의"], bad: ["■", "위험"] }[status];
  return (
    <Badge tone={status}>
      <span aria-hidden>{m[0]}</span>
      {m[1]}
    </Badge>
  );
}

export function ButtonLink({ href, children, variant = "secondary", className }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary"; className?: string }) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium",
        variant === "primary" ? "bg-navy text-white hover:bg-navy-2" : "border border-line bg-white text-ink hover:bg-bg2",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Grid({ cols = 4, children, className }: { cols?: 2 | 3 | 4 | 6; children: React.ReactNode; className?: string }) {
  const c = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-2 xl:grid-cols-4", 6: "md:grid-cols-3 xl:grid-cols-6" }[cols];
  return <div className={clsx("grid grid-cols-1 gap-4", c, className)}>{children}</div>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-lg border border-line bg-white px-4 py-3">
      <div className="text-xs text-ink3">{label}</div>
      <div className={clsx("num mt-1 text-lg font-bold", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "good" ? "text-good" : "text-ink")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink3">{sub}</div>}
    </div>
  );
}

export function Note({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  return (
    <div className={clsx("rounded-md border px-3 py-2 text-xs leading-relaxed", tone === "warn" ? "border-warn/30 bg-warn-bg text-[#7a5212]" : "border-teal/20 bg-teal-soft text-[#1b5f6c]")}>
      {children}
    </div>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2 text-[13.5px] leading-relaxed text-ink2 [&_b]:text-ink [&_li]:ml-4 [&_li]:list-disc">{children}</div>;
}
