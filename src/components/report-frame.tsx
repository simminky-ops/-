// PART A 공통 프레임(서버 컴포넌트): 계획서 표지 정보, 섹션 이동, 외부 열람 안내
import Link from "next/link";
import { clsx } from "clsx";
import { Note, PageHeader } from "./ui";
import { PrintButton } from "./report-ui";

export const PLAN_TITLE = "준공 후 복합개발사업의 자산가치 회복 및 사업 정상화를 위한 통합 운영계획";

const SECTIONS = [
  { code: "A01", href: "/report", label: "Executive Summary" },
  { code: "A02", href: "/report/overview", label: "사업개요" },
  { code: "A03", href: "/report/location", label: "입지·상권" },
  { code: "A04", href: "/report/status", label: "사업현황" },
  { code: "A05", href: "/report/strategy", label: "활성화 전략" },
  { code: "A06", href: "/report/financial", label: "사업수지·채무" },
  { code: "A07", href: "/report/roadmap", label: "정상화 로드맵" },
];

export function ReportFrame({
  code,
  title,
  desc,
  meta,
  mode,
  children,
}: {
  code: string;
  title: string;
  desc: string;
  meta: { projectName: string; baseDate: string; dataVersion: number };
  mode: "amount" | "index";
  children: React.ReactNode;
}) {
  const idx = SECTIONS.findIndex((s) => s.code === code);
  const prev = SECTIONS[idx - 1];
  const next = SECTIONS[idx + 1];
  return (
    <div className="print-page mx-auto max-w-[1200px] space-y-5">
      <div className="rounded-lg border border-line bg-[linear-gradient(120deg,#12263f,#1c3656_60%,#247f91)] px-5 py-4 text-white">
        <div className="text-[11px] tracking-wider text-white/60">A-D PROJECT · 사업계획서</div>
        <div className="mt-0.5 text-[15px] font-semibold">{PLAN_TITLE}</div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] text-white/75">
          <span>{meta.projectName}</span>
          <span>기준일 {meta.baseDate}</span>
          <span>데이터 버전 v{meta.dataVersion}</span>
          <span>{mode === "index" ? "금액 표시: 지수(총 공급예정금액=100)" : "금액 표시: 원 단위(상단 단위 전환)"}</span>
        </div>
      </div>

      <nav className="no-print flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <Link
            key={s.code}
            href={s.href}
            className={clsx(
              "rounded-md border px-2.5 py-1 text-xs",
              s.code === code ? "border-navy bg-navy font-semibold text-white" : "border-line bg-white text-ink2 hover:bg-bg2",
            )}
          >
            <span className="mr-1 font-semibold">{s.code}</span>
            {s.label}
          </Link>
        ))}
      </nav>

      <PageHeader code={code} title={title} desc={desc} actions={<PrintButton />} />

      {mode === "index" && (
        <Note tone="warn">
          <b>외부 보고용 비식별 화면</b> — 사업장·당사자 식별정보와 개별 호실·계약 단위 정보는 제공되지 않으며, 모든 금액은 실금액 대신
          <b> 지수(총 공급예정금액 = 100)</b>로 변환되어 표시됩니다. 비율(%)·호실 수·면적은 집계값입니다. 본 수치는 예시 데이터입니다.
        </Note>
      )}

      {children}

      <div className="no-print flex justify-between border-t border-line pt-3 text-sm">
        {prev ? (
          <Link href={prev.href} className="text-teal hover:underline">
            ← {prev.code} {prev.label}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={next.href} className="text-teal hover:underline">
            {next.code} {next.label} →
          </Link>
        )}
      </div>
    </div>
  );
}

/** 섹션 소제목 */
export function H({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-[15px] font-bold text-ink">
      <span className="rounded bg-teal-soft px-1.5 py-0.5 text-[11px] font-semibold text-teal">{n}</span>
      {children}
    </h3>
  );
}
