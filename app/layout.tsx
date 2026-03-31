import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "선생님~ 질문있어요! | 흥덕고등학교 교사 호출 시스템",
  description: "교무실 입구 태블릿 기반 교사 호출 시스템",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
        {children}
      </body>
    </html>
  );
}
