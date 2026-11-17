import Link from "next/link";
import { requirePage } from "@/lib/server/auth";
import { getSnapshot } from "@/lib/server/snapshot";
import { buildAlerts, type Alert } from "@/lib/server/alerts";
import { Badge, Card, Note, PageHeader, Stat } from "@/components/ui";

const LEVEL: Record<Alert["level"], [string, string]> = {
  critical: ["bad", "■ 긴급"],
  serious: ["warn", "◆ 중요"],
  warning: ["neutral", "▲ 주의"],
};

export default async function AlertsPage() {
  const user = await requirePage("dashboard");
  const snap = getSnapshot();
  const alerts = buildAlerts(snap, user);
  const groups = new Map<string, Alert[]>();
  for (const a of alerts) groups.set(a.category, [...(groups.get(a.category) ?? []), a]);
  const count = (l: Alert["level"]) => alerts.filter((a) => a.level === l).length;

  return (
    <div className="space-y-5">
      <PageHeader code="C04" title="알림 및 업무기한 관리" desc={`기준일 ${snap.data.settings.base_date} 기준으로 계약·수납·유예·채무·리스크·임대·하자·현금흐름 데이터에서 실시간 산출한 기한 알림입니다.`} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="전체 알림" value={`${alerts.length}건`} />
        <Stat label="■ 긴급" value={`${count("critical")}건`} tone={count("critical") ? "bad" : undefined} />
        <Stat label="◆ 중요" value={`${count("serious")}건`} tone={count("serious") ? "warn" : undefined} />
        <Stat label="▲ 주의" value={`${count("warning")}건`} />
      </div>
      <Note>
        알림 기준: 중도금대출 만기 60일 이내 미납(대위변제 위험) · 잔금 90일 초과 연체 · 유예 만기 45일 이내 · 채무 납부기한 45일 이내 · 리스크 조치일 14일 이내 · 임대차 만기 180일 이내·입점 지연 · 하자 보수예정일 경과 · 기준 시나리오 현금부족 월 · 승인 대기. 현재 역할이 조회할 수 없는 업무의 알림은 표시되지 않습니다.
      </Note>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {[...groups.entries()].map(([cat, list]) => (
          <Card key={cat} title={`${cat} (${list.length})`} pad={false}>
            <ul className="max-h-[360px] divide-y divide-line overflow-y-auto text-[13px]">
              {list.map((a, i) => (
                <li key={i} className="flex items-center gap-2 px-4 py-2">
                  <Badge tone={LEVEL[a.level][0]}>{LEVEL[a.level][1]}</Badge>
                  <Link href={a.link} className="flex-1 truncate hover:text-teal">
                    {a.title}
                  </Link>
                  {a.due && <span className="num text-xs text-ink3">{a.due}</span>}
                  {a.dday !== null && (
                    <span className={`num w-16 text-right text-xs font-semibold ${a.dday < 0 ? "text-bad" : "text-ink2"}`}>{a.dday >= 0 ? `D-${a.dday}` : `D+${-a.dday}`}</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
        {!alerts.length && (
          <Card title="알림 없음">
            <p className="text-sm text-ink3">기한이 도래한 업무가 없습니다.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
