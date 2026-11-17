import Link from "next/link";

export default function Forbidden() {
  return (
    <div className="mx-auto mt-20 max-w-md rounded-lg border border-line bg-white p-8 text-center">
      <div className="text-3xl">🔒</div>
      <h1 className="mt-2 text-lg font-bold">접근 권한이 없습니다</h1>
      <p className="mt-2 text-sm text-ink2">현재 역할로는 이 화면을 조회할 수 없습니다. 권한이 필요하면 시스템 관리자에게 요청하세요.</p>
      <Link href="/" className="mt-4 inline-block rounded-md bg-navy px-4 py-2 text-sm text-white">
        첫 화면으로
      </Link>
    </div>
  );
}
