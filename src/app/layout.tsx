import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A-D PROJECT · 준공 후 복합개발사업 통합 운영관리",
  description: "Post-Completion Real Estate Asset Management Platform",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
