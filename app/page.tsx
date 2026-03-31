"use client";

import Link from "next/link";

const modes = [
  {
    href: "/student",
    icon: "🎒",
    label: "학생용",
    desc: "교사 호출하기",
    color: "from-blue-500 to-blue-600",
    shadow: "shadow-blue-200",
    ring: "focus:ring-blue-400",
  },
  {
    href: "/teacher",
    icon: "👩‍🏫",
    label: "교사용",
    desc: "호출 확인하기",
    color: "from-emerald-500 to-emerald-600",
    shadow: "shadow-emerald-200",
    ring: "focus:ring-emerald-400",
  },
  {
    href: "/office",
    icon: "🏫",
    label: "교무실용",
    desc: "전체 현황 보기",
    color: "from-violet-500 to-violet-600",
    shadow: "shadow-violet-200",
    ring: "focus:ring-violet-400",
  },
  {
    href: "/admin",
    icon: "⚙️",
    label: "관리자용",
    desc: "시스템 관리",
    color: "from-slate-600 to-slate-700",
    shadow: "shadow-slate-200",
    ring: "focus:ring-slate-400",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      {/* 헤더 */}
      <div className="text-center mb-12 animate-[fadeInUp_0.6s_ease-out]">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-white shadow-xl mb-6 text-4xl">
          📣
        </div>
        <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight mb-2">
          선생님~ 질문있어요!
        </h1>
        <p className="text-lg text-slate-500 font-medium">
          흥덕고등학교 교사 호출 시스템
        </p>
        <div className="mt-4 inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-sm font-medium px-4 py-1.5 rounded-full border border-blue-100">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse inline-block"></span>
          실시간 연결 중
        </div>
      </div>

      {/* 모드 선택 카드들 */}
      <div className="grid grid-cols-2 gap-5 w-full max-w-xl">
        {modes.map((mode, i) => (
          <Link
            key={mode.href}
            href={mode.href}
            className={`
              group relative flex flex-col items-center justify-center
              bg-gradient-to-br ${mode.color}
              rounded-3xl p-8 text-white
              shadow-lg ${mode.shadow}
              hover:scale-105 hover:shadow-xl
              active:scale-95
              transition-all duration-200 ease-out
              focus:outline-none focus:ring-4 ${mode.ring} focus:ring-offset-2
            `}
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <span className="text-5xl mb-3 group-hover:scale-110 transition-transform duration-200">
              {mode.icon}
            </span>
            <span className="text-xl font-bold tracking-tight">{mode.label}</span>
            <span className="text-sm opacity-80 mt-1 font-medium">{mode.desc}</span>
            <div className="absolute inset-0 rounded-3xl bg-white opacity-0 group-hover:opacity-5 transition-opacity duration-200" />
          </Link>
        ))}
      </div>

      {/* 푸터 */}
      <p className="mt-12 text-sm text-slate-400">
        흥덕고등학교 창의융합부 · v1.1
      </p>
    </main>
  );
}
