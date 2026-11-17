import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { LoginForm } from "./login-form";
import { DEMO_USERS } from "@/lib/server/seed";
import { ROLE_LABEL } from "@/lib/types";

export default async function LoginPage() {
  getDb(); // 최초 실행 시 DB·예시데이터 준비
  if (await getSessionUser()) redirect("/");
  const demo = process.env.AD_SHOW_DEMO_ACCOUNTS !== "0";
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy px-4 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl md:grid-cols-2">
        <div className="hidden flex-col justify-between bg-[linear-gradient(160deg,#12263f,#1c3656_55%,#247f91)] p-8 text-white md:flex">
          <div>
            <div className="text-2xl font-bold tracking-wide">A-D PROJECT</div>
            <div className="mt-1 text-sm text-white/70">Post-Completion Real Estate Asset Management Platform</div>
          </div>
          <div className="space-y-2 text-sm text-white/85">
            <p className="text-lg font-semibold text-white">준공 후 복합개발사업의 자산가치 회복 및 사업 정상화를 위한 통합 운영계획</p>
            <p>미분양·분양계약·임대·채권회수·사업수지·채무상환·현금흐름·리스크를 하나의 시스템에서 관리합니다.</p>
          </div>
          <div className="text-[11px] text-white/50">내부 관리 시스템 · 권한 있는 사용자만 접근할 수 있습니다.</div>
        </div>
        <div className="p-8">
          <h1 className="text-xl font-bold text-ink">로그인</h1>
          <p className="mt-1 text-sm text-ink3">수도권 A복합개발사업 · 통합 운영관리 시스템</p>
          <LoginForm />
          {demo && (
            <div className="mt-6 rounded-md border border-line bg-bg2 p-3 text-xs text-ink2">
              <div className="mb-1 font-semibold text-ink">데모 계정 (예시 데이터 환경)</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {DEMO_USERS.map((u) => (
                  <div key={u.username}>
                    <span className="font-mono text-ink">{u.username}</span> · {ROLE_LABEL[u.role]}
                  </div>
                ))}
              </div>
              <div className="mt-1.5 text-ink3">초기 비밀번호는 README의 ‘데모 계정’ 항목을 참고하세요. 운영 전환 시 반드시 변경·비활성화하십시오.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
