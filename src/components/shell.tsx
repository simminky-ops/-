"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import { Bell, Building2, LogOut, Menu, Search, X } from "lucide-react";
import { NAV } from "@/lib/nav";
import { canRead } from "@/lib/rbac";
import { ROLE_LABEL, type SessionUser } from "@/lib/types";
import { PrefsProvider, usePrefs, type PeriodMode } from "./providers";
import type { MoneyUnit } from "@/lib/format";

export interface ShellAlert {
  level: string;
  category: string;
  title: string;
  link: string;
  dday: number | null;
}

export function Shell(props: {
  user: SessionUser;
  projectName: string;
  baseDate: string;
  dataVersion: number;
  alerts: ShellAlert[];
  canEditBaseDate: boolean;
  children: React.ReactNode;
}) {
  return (
    <PrefsProvider>
      <ShellInner {...props} />
    </PrefsProvider>
  );
}

function ShellInner({ user, projectName, baseDate, dataVersion, alerts, canEditBaseDate, children }: Parameters<typeof Shell>[0]) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const [q, setQ] = useState("");
  const { unit, setUnit, period, setPeriod } = usePrefs();

  const isActive = (href: string) => (href === "/report" ? path === "/report" : path === href || path.startsWith(href + "/"));
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => canRead(user.role, i.module)) })).filter((g) => g.items.length);

  async function changeBaseDate(v: string) {
    if (!v) return;
    const r = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base_date: v }) });
    if (r.ok) router.refresh();
    else alert((await r.json()).error);
  }

  return (
    <div className="flex min-h-screen">
      {/* 사이드바 */}
      <aside
        className={clsx(
          "no-print fixed inset-y-0 left-0 z-40 w-64 shrink-0 overflow-y-auto bg-navy text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <Link href={user.role === "EXTERNAL" ? "/report" : "/dashboard"} className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-[#7fd0de]" />
            <div>
              <div className="text-[15px] font-bold tracking-wide">A-D PROJECT</div>
              <div className="text-[10.5px] text-white/60">Post-Completion Asset Management</div>
            </div>
          </Link>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="메뉴 닫기">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="space-y-4 px-3 pb-8">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="px-2 pb-1 text-[10.5px] font-semibold tracking-wider text-white/45">{g.title}</div>
              {g.items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={() => setOpen(false)}
                  className={clsx(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]",
                    isActive(i.href) ? "bg-white/12 font-semibold text-white" : "text-white/75 hover:bg-white/6 hover:text-white",
                  )}
                >
                  <span className={clsx("w-8 text-[10.5px] font-semibold", isActive(i.href) ? "text-[#7fd0de]" : "text-white/40")}>{i.code}</span>
                  {i.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {open && <div className="no-print fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 상단바 */}
        <header className="no-print sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 lg:px-6">
            <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="메뉴 열기">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-ink">{projectName}</div>
              <div className="text-[11px] text-ink3">준공 후 복합개발사업 통합 운영관리 · 데이터 v{dataVersion}</div>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-ink2">
                기준일
                {canEditBaseDate ? (
                  <input type="date" defaultValue={baseDate} onBlur={(e) => e.target.value !== baseDate && changeBaseDate(e.target.value)} className="input !w-[140px] !py-1" />
                ) : (
                  <span className="num font-semibold text-ink">{baseDate}</span>
                )}
              </label>
              <select aria-label="조회기간" value={period} onChange={(e) => setPeriod(e.target.value as PeriodMode)} className="input !w-auto !py-1">
                <option value="month">월간</option>
                <option value="quarter">분기</option>
                <option value="cumulative">누적</option>
              </select>
              <select aria-label="금액단위" value={unit} onChange={(e) => setUnit(e.target.value as MoneyUnit)} className="input !w-auto !py-1">
                <option value="EOK">억원</option>
                <option value="MAN">만원</option>
                <option value="WON">원</option>
              </select>
              {user.role !== "EXTERNAL" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (q.trim()) router.push(`/assets?q=${encodeURIComponent(q.trim())}`);
                  }}
                  className="relative hidden md:block"
                >
                  <Search className="pointer-events-none absolute top-1.5 left-2 h-4 w-4 text-ink3" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="자산 ID·계약 ID 검색" className="input !w-48 !py-1 !pl-8" />
                </form>
              )}
              {user.role !== "EXTERNAL" && (
                <div className="relative">
                  <button onClick={() => setBell(!bell)} className="relative rounded-md p-1.5 hover:bg-bg2" aria-label="알림">
                    <Bell className="h-5 w-5 text-ink2" />
                    {alerts.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 rounded-full bg-bad px-1 text-[10px] font-bold text-white">{alerts.length > 99 ? "99+" : alerts.length}</span>
                    )}
                  </button>
                  {bell && (
                    <div className="absolute right-0 mt-2 w-[340px] max-w-[90vw] rounded-lg border border-line bg-white shadow-xl">
                      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-sm font-semibold">
                        업무기한·리스크 알림
                        <Link href="/alerts" onClick={() => setBell(false)} className="text-xs font-normal text-teal">
                          전체보기
                        </Link>
                      </div>
                      <ul className="max-h-[360px] overflow-y-auto">
                        {alerts.slice(0, 12).map((a, i) => (
                          <li key={i}>
                            <Link href={a.link} onClick={() => setBell(false)} className="flex gap-2 border-b border-line/60 px-3 py-2 text-xs hover:bg-bg2">
                              <span className={clsx("mt-0.5 font-bold", a.level === "critical" ? "text-bad" : a.level === "serious" ? "text-[#c05621]" : "text-warn")}>
                                {a.level === "critical" ? "■" : a.level === "serious" ? "◆" : "▲"}
                              </span>
                              <span className="flex-1">
                                <span className="font-semibold text-ink">[{a.category}]</span> {a.title}
                              </span>
                              {a.dday !== null && <span className="num text-ink3">{a.dday >= 0 ? `D-${a.dday}` : `D+${-a.dday}`}</span>}
                            </Link>
                          </li>
                        ))}
                        {!alerts.length && <li className="px-3 py-4 text-center text-xs text-ink3">알림이 없습니다.</li>}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 border-l border-line pl-3">
                <div className="text-right leading-tight">
                  <div className="text-[13px] font-semibold">{user.name}</div>
                  <div className="text-[11px] text-ink3">{ROLE_LABEL[user.role]}</div>
                </div>
                <button
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    router.push("/login");
                    router.refresh();
                  }}
                  className="rounded-md p-1.5 hover:bg-bg2"
                  aria-label="로그아웃"
                  title="로그아웃"
                >
                  <LogOut className="h-4 w-4 text-ink2" />
                </button>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-5 lg:px-6">{children}</main>
        <footer className="no-print border-t border-line px-6 py-3 text-[11px] text-ink3">
          A-D PROJECT · 본 화면의 수치는 가상의 <b>예시 데이터</b>이며 실제 현장 실적이 아닙니다. 사업장 식별정보는 비공개 처리되어 있습니다.
        </footer>
      </div>
    </div>
  );
}
