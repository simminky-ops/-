"use client";
import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import { Download, RotateCcw, Save, UserPlus } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { Badge, Card, Note } from "./ui";
import { DataTable } from "./data-table";

type User = { id: number; username: string; name: string; role_code: string; pii_access: number; active: number; last_login_at: string | null; locked_until: string | null; created_at: string };
type Backup = { name: string; size: number; created: string };

const MODULE_LABEL: Record<string, string> = {
  report: "A 사업계획서",
  dashboard: "B01 대시보드",
  assets: "B02 호실·계약",
  crm: "B03 영업 CRM",
  leasing: "B04 임대·MD",
  receivables: "B05 미수·채권",
  feasibility: "B06 사업수지",
  cashflow: "B07 현금흐름·채무",
  operations: "B08 건물운영·하자",
  risks: "B09 리스크",
  risks_confidential: "B09 법률 기밀",
  reports: "B10 보고서",
  admin: "B11 시스템관리",
  data: "C01·C02 데이터·문서",
  approvals: "C03 승인관리",
};

export function AdminTabs({
  currentUserId,
  logs,
  settings,
  matrix,
  roles,
}: {
  currentUserId: number;
  logs: Record<string, unknown>[];
  settings: [string, string][];
  matrix: { module: string; read: string[]; write: string[] }[];
  roles: { code: string; label: string; desc: string }[];
}) {
  const [tab, setTab] = useState("users");
  const tabs = [
    ["users", "사용자 계정"],
    ["matrix", "권한 매트릭스"],
    ["audit", "감사로그"],
    ["backup", "백업·복구"],
    ["settings", "시스템 설정"],
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-line">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={clsx("-mb-px border-b-2 px-4 py-2 text-sm", tab === k ? "border-teal font-semibold text-ink" : "border-transparent text-ink3 hover:text-ink")}>
            {l}
          </button>
        ))}
      </div>
      {tab === "users" && <UsersTab currentUserId={currentUserId} roles={roles} />}
      {tab === "matrix" && <MatrixTab matrix={matrix} roles={roles} />}
      {tab === "audit" && <AuditTab logs={logs} />}
      {tab === "backup" && <BackupTab />}
      {tab === "settings" && (
        <Card title="시스템 설정 (조회)" sub="기준일·현금흐름 설정은 PM/재무, 목표값은 PM/경영진, 외부보고 금액공개는 경영진만 변경 가능">
          <table className="tbl max-w-2xl">
            <tbody>
              {settings.map(([k, v]) => (
                <tr key={k}>
                  <td className="w-56 font-medium text-ink2">{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3">
            <Note>외부 보고자 화면은 서버에서 비율·지수로 변환된 값만 전달합니다. ‘외부보고 실금액 공개’는 경영진 계정에서 PUT /api/settings(external_show_amounts)로만 변경되며 감사로그에 기록됩니다.</Note>
          </div>
        </Card>
      )}
    </div>
  );
}

function UsersTab({ currentUserId, roles }: { currentUserId: number; roles: { code: string; label: string }[] }) {
  const [users, setUsers] = useState<User[]>([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ username: "", name: "", role: "SALES", password: "", pii: false });
  const roleLabel = Object.fromEntries(roles.map((r) => [r.code, r.label]));

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/users");
    const j = await r.json();
    if (r.ok) setUsers(j.users);
    else setMsg(j.error);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const errText = (j: { error: string; details?: string[] }) => [j.error, ...(j.details ?? [])].join(" · ");

  async function patch(body: Record<string, unknown>) {
    const r = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    setMsg(r.ok ? "변경 완료 (감사로그 기록)" : errText(j));
    load();
  }

  async function create() {
    const r = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const j = await r.json();
    setMsg(r.ok ? `계정 ${form.username} 생성 완료` : errText(j));
    if (r.ok) setForm({ username: "", name: "", role: "SALES", password: "", pii: false });
    load();
  }

  return (
    <div className="space-y-4">
      {msg && <div className="rounded-md bg-teal-soft px-3 py-2 text-xs text-[#1b5f6c]">{msg}</div>}
      <Card title="사용자 목록" sub="역할 변경·비활성화 시 해당 사용자의 기존 세션이 즉시 만료됩니다(비활성/비밀번호 재설정)." pad={false}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>아이디</th>
                <th>이름</th>
                <th>역할</th>
                <th>개인정보 접근</th>
                <th>상태</th>
                <th>최근 로그인</th>
                <th>비밀번호 재설정</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="font-mono">{u.username}</td>
                  <td>{u.name}</td>
                  <td>
                    <select className="input !w-36 !py-0.5" value={u.role_code} disabled={u.id === currentUserId} onChange={(e) => patch({ id: u.id, role: e.target.value })}>
                      {roles.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className="inline-flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={!!u.pii_access} onChange={(e) => patch({ id: u.id, pii: e.target.checked })} /> 허용
                    </label>
                  </td>
                  <td>
                    <button
                      disabled={u.id === currentUserId}
                      onClick={() => patch({ id: u.id, active: !u.active })}
                      className="disabled:opacity-50"
                      title={u.active ? "클릭하여 비활성화" : "클릭하여 활성화"}
                    >
                      <Badge tone={u.active ? "good" : "neutral"}>{u.active ? "● 활성" : "○ 비활성"}</Badge>
                    </button>
                    {u.locked_until && new Date(u.locked_until) > new Date() && <Badge tone="bad">잠김</Badge>}
                  </td>
                  <td className="num text-xs">{fmtDateTime(u.last_login_at)}</td>
                  <td>
                    <button
                      onClick={() => {
                        const pw = prompt(`${u.username} 의 새 비밀번호 (10자 이상, 영문+숫자)`);
                        if (pw) patch({ id: u.id, password: pw });
                      }}
                      className="inline-flex items-center gap-1 rounded border border-line px-2 py-0.5 text-xs hover:bg-bg2"
                    >
                      <RotateCcw className="h-3 w-3" /> 재설정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="신규 계정 생성" sub="비밀번호 정책: 10자 이상, 영문과 숫자 포함 · 5회 실패 시 15분 잠금 · 세션 12시간">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <input className="input" placeholder="아이디(영문 소문자·숫자)" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="input" placeholder="이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {roles.map((r) => (
              <option key={r.code} value={r.code}>
                {roleLabel[r.code]}
              </option>
            ))}
          </select>
          <input className="input" type="password" placeholder="초기 비밀번호" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.pii} onChange={(e) => setForm({ ...form, pii: e.target.checked })} /> 개인정보 접근 허용
          </label>
        </div>
        <button onClick={create} className="mt-3 inline-flex items-center gap-1 rounded-md bg-navy px-4 py-1.5 text-sm font-medium text-white hover:bg-navy-2">
          <UserPlus className="h-4 w-4" /> 계정 생성
        </button>
      </Card>
    </div>
  );
}

function MatrixTab({ matrix, roles }: { matrix: { module: string; read: string[]; write: string[] }[]; roles: { code: string; label: string; desc: string }[] }) {
  return (
    <div className="space-y-4">
      <Card title="역할별 화면·API 권한 매트릭스" sub="W = 조회·등록·수정, R = 조회만, - = 접근 불가 · 서버 API에서 동일 매트릭스로 최종 검사" pad={false}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>모듈</th>
                {roles.map((r) => (
                  <th key={r.code} className="text-center">
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((m) => (
                <tr key={m.module}>
                  <td className="font-medium">{MODULE_LABEL[m.module] ?? m.module}</td>
                  {roles.map((r) => {
                    const w = m.write.includes(r.code);
                    const rd = m.read.includes(r.code);
                    return (
                      <td key={r.code} className="text-center">
                        {w ? <Badge tone="good">W</Badge> : rd ? <Badge tone="info">R</Badge> : <span className="text-ink3">-</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="역할 설명">
        <ul className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
          {roles.map((r) => (
            <li key={r.code} className="rounded-md border border-line px-3 py-2">
              <div className="font-semibold">{r.label}</div>
              <div className="text-xs text-ink2">{r.desc}</div>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-2">
          <Note>
            추가 통제: ① 개인정보(계약자·고객 성명/연락처)는 개인정보 접근 허용 계정만 원문 조회, 그 외 서버에서 마스킹 ② 분양 담당자는 본인 배정 계약·상담만 수정 ③ 법률 기밀 건은 경영진·PM만 조회 ④ 중요 금액·계약정보 변경과 수납·계약 삭제는 경영진 승인 후 반영(본인 요청은 본인 승인 불가) ⑤ 쓰기 요청은 동일 출처만 허용(CSRF 완화).
          </Note>
        </div>
      </Card>
    </div>
  );
}

function AuditTab({ logs }: { logs: Record<string, unknown>[] }) {
  const [sel, setSel] = useState<Record<string, unknown> | null>(null);
  const actions = Object.fromEntries([...new Set(logs.map((l) => String(l.action)))].map((a) => [a, a]));
  const pretty = (s: unknown) => {
    if (!s) return "-";
    try {
      return JSON.stringify(JSON.parse(String(s)), null, 2);
    } catch {
      return String(s);
    }
  };
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card title="감사로그 (최근 300건)" sub="로그인·데이터 변경·승인·Excel·백업 등 모든 주요 작업 · 행 클릭 시 변경 전/후 조회" className="xl:col-span-2">
        <DataTable
          rows={logs}
          dense
          filters={[{ key: "action", label: "작업", options: actions }]}
          onRowClick={setSel}
          cols={[
            { key: "id", label: "#", kind: "num" },
            { key: "at", label: "일시(UTC)" },
            { key: "username", label: "사용자" },
            { key: "role", label: "역할" },
            { key: "action", label: "작업" },
            { key: "entity_type", label: "대상" },
            { key: "entity_id", label: "대상 ID" },
            { key: "detail", label: "비고" },
          ]}
        />
      </Card>
      <Card title="변경 상세" sub={sel ? `#${String(sel.id)} ${String(sel.action)} · ${String(sel.entity_type ?? "")} ${String(sel.entity_id ?? "")}` : "로그를 선택하세요"}>
        {sel ? (
          <div className="space-y-3 text-xs">
            <div>
              <div className="mb-1 font-semibold text-ink2">변경 전</div>
              <pre className="max-h-64 overflow-auto rounded bg-bg2 p-2 whitespace-pre-wrap">{pretty(sel.before_json)}</pre>
            </div>
            <div>
              <div className="mb-1 font-semibold text-ink2">변경 후</div>
              <pre className="max-h-64 overflow-auto rounded bg-bg2 p-2 whitespace-pre-wrap">{pretty(sel.after_json)}</pre>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink3">감사로그는 수정·삭제할 수 없는 추가 전용 기록입니다.</p>
        )}
      </Card>
    </div>
  );
}

function BackupTab() {
  const [list, setList] = useState<Backup[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/backup");
    const j = await r.json();
    if (r.ok) setList(j.backups);
    else setMsg(j.error);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function backup() {
    setBusy(true);
    const r = await fetch("/api/admin/backup", { method: "POST" });
    const j = await r.json();
    setBusy(false);
    setMsg(r.ok ? `백업 생성: ${j.name}` : j.error);
    load();
  }
  async function restore(name: string) {
    const c = prompt(`⚠ ${name} 으로 전체 데이터를 복구합니다.\n현재 데이터는 자동 안전백업 후 교체되며, 모든 사용자 세션이 만료될 수 있습니다.\n계속하려면 RESTORE 를 입력하세요.`);
    if (c !== "RESTORE") return;
    setBusy(true);
    const r = await fetch("/api/admin/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, confirm: c }) });
    const j = await r.json();
    setBusy(false);
    setMsg(r.ok ? `복구 완료 · 복구 전 안전백업: ${j.safety}. 다시 로그인이 필요할 수 있습니다.` : j.error);
    load();
  }

  return (
    <div className="space-y-4">
      <Note tone="warn">
        <b>복구 정책</b> · 수동 백업과 복구 전 자동 안전백업(prerestore)을 포함해 최근 <b>30개</b>를 보관합니다 · 백업은 SQLite <code>VACUUM INTO</code>로 운영 중 일관된 스냅샷을 생성합니다 · 복구 시 무결성 검사(integrity_check)와 필수 테이블 확인을 통과해야 하며, 현재 DB를 먼저 자동 백업한 뒤 교체합니다 · 운영 환경에서는 data/backups 폴더를 별도 저장소(NAS·클라우드)로 정기 복제하십시오.
      </Note>
      {msg && <div className="rounded-md bg-teal-soft px-3 py-2 text-xs text-[#1b5f6c]">{msg}</div>}
      <Card
        title="백업 목록"
        actions={
          <button disabled={busy} onClick={backup} className="inline-flex items-center gap-1 rounded-md bg-navy px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
            <Save className="h-3.5 w-3.5" /> 지금 백업
          </button>
        }
        pad={false}
      >
        <table className="tbl">
          <thead>
            <tr>
              <th>파일명</th>
              <th className="r">크기</th>
              <th>생성일시</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.name}>
                <td className="font-mono text-xs">{b.name}</td>
                <td className="r num">{(b.size / 1024).toFixed(0)}KB</td>
                <td className="num">{fmtDateTime(b.created)}</td>
                <td className="space-x-2">
                  <a href={`/api/admin/backup?download=${encodeURIComponent(b.name)}`} className="inline-flex items-center gap-1 text-xs text-teal hover:underline">
                    <Download className="h-3 w-3" /> 다운로드
                  </a>
                  <button disabled={busy} onClick={() => restore(b.name)} className="inline-flex items-center gap-1 text-xs text-bad hover:underline">
                    <RotateCcw className="h-3 w-3" /> 복구
                  </button>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-ink3">
                  백업이 없습니다. ‘지금 백업’으로 생성하세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
