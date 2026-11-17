"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-6 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
        setBusy(false);
        if (!r.ok) {
          setErr((await r.json()).error ?? "로그인 실패");
          return;
        }
        router.replace("/");
        router.refresh();
      }}
    >
      <label className="block text-sm">
        <span className="mb-1 block text-ink2">아이디</span>
        <input className="input !py-2" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-ink2">비밀번호</span>
        <input className="input !py-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </label>
      {err && <p className="rounded bg-bad-bg px-3 py-2 text-xs text-bad">{err}</p>}
      <button disabled={busy} className="w-full rounded-md bg-navy py-2.5 text-sm font-semibold text-white hover:bg-navy-2 disabled:opacity-60">
        {busy ? "확인 중…" : "로그인"}
      </button>
      <p className="text-[11px] text-ink3">5회 연속 실패 시 15분간 계정이 잠깁니다. 세션은 12시간 후 만료됩니다.</p>
    </form>
  );
}
