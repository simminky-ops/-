// 비밀번호 해시 (scrypt + 솔트, 타이밍 안전 비교) — node:crypto 표준 라이브러리 사용
import crypto from "node:crypto";

const N = 16384;
const KEYLEN = 64;

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, KEYLEN, { N }).toString("hex");
  return `scrypt$${N}$${salt}$${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, n, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const calc = crypto.scryptSync(pw, salt, KEYLEN, { N: Number(n) });
  const expected = Buffer.from(hash, "hex");
  return expected.length === calc.length && crypto.timingSafeEqual(expected, calc);
}

export function passwordPolicyErrors(pw: string): string[] {
  const e: string[] = [];
  if (pw.length < 10) e.push("비밀번호는 10자 이상이어야 합니다.");
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) e.push("영문과 숫자를 모두 포함해야 합니다.");
  return e;
}
