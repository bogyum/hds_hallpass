"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getSchoolByCode,
  getSchoolsByName,
  getTeachersBySchool,
  subscribeToAllTeacherCallCounts,
  subscribeToTeacherStatuses,
} from "@/lib/firestore";
import { verifyPassword } from "@/lib/hash";
import { playAlert, resumeAudioContext } from "@/lib/audio";
import { OFFICE_GROUPS, OFFICE_LABELS } from "@/types";
import type { School, Teacher, OfficeGroupItem, TeacherStatus } from "@/types";

type Phase = "login" | "dashboard";

export default function OfficePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("login");
  const [schoolName, setSchoolName] = useState("");
  const [password, setPassword] = useState("");
  const [disambiguationCode, setDisambiguationCode] = useState("");
  const [duplicateSchools, setDuplicateSchools] = useState<School[]>([]);
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);

  const [school, setSchool] = useState<School | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [callCounts, setCallCounts] = useState<Record<string, number>>({});
  const [teacherStatuses, setTeacherStatuses] = useState<Record<string, TeacherStatus>>({});
  const [selectedOfficeCode, setSelectedOfficeCode] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoading(true);
    try {
      let sc: School | null = null;

      if (duplicateSchools.length > 0) {
        if (!disambiguationCode.trim()) {
          setLoginError("학교코드를 입력해 주세요.");
          setLoading(false);
          return;
        }
        sc = await getSchoolByCode(disambiguationCode.trim());
        if (!sc || sc.name !== schoolName.trim()) {
          setLoginError("학교코드가 일치하지 않습니다.");
          setLoading(false);
          return;
        }
      } else {
        const matches = await getSchoolsByName(schoolName.trim());
        if (matches.length === 0) {
          setLoginError("등록되지 않은 학교이름입니다.");
          setLoading(false);
          return;
        }
        if (matches.length > 1) {
          setDuplicateSchools(matches);
          setLoginError("동일한 이름의 학교가 여러 개 있습니다. 학교코드를 입력해 주세요.");
          setLoading(false);
          return;
        }
        sc = matches[0];
      }

      const ok = await verifyPassword(password, sc.officePW);
      if (!ok) { setLoginError("비밀번호가 올바르지 않습니다."); return; }
      const teacherList = await getTeachersBySchool(sc.schoolCode);
      setSchool(sc);
      setTeachers(teacherList);
      setPhase("dashboard");
    } catch {
      setLoginError("로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!school) return;
    const unsub1 = subscribeToAllTeacherCallCounts(school.schoolCode, setCallCounts);
    const unsub2 = subscribeToTeacherStatuses(school.schoolCode, setTeacherStatuses);
    return () => { unsub1(); unsub2(); };
  }, [school]);

  const officeList = school?.officeGroups?.length 
    ? school.officeGroups 
    : OFFICE_GROUPS.map(g => ({ code: g, label: OFFICE_LABELS[g] || g }));

  const grouped = officeList.map((g) => ({
    group: g.code,
    label: g.label,
    teachers: teachers.filter((t) => t.officeGroup === g.code),
  })).filter((g) => g.teachers.length > 0);

  const totalCalls = Object.values(callCounts).reduce((a, b) => a + b, 0);
  const prevTotalCalls = useRef(0);

  useEffect(() => {
    if (totalCalls > prevTotalCalls.current) {
      resumeAudioContext().catch(() => {});
      playAlert(1.0);
    }
    prevTotalCalls.current = totalCalls;
  }, [totalCalls]);

  if (phase === "login") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <button onClick={() => router.push("/")} className="mb-6 flex items-center gap-2 text-slate-500 hover:text-slate-700 transition text-sm font-medium">
            ← 처음으로
          </button>
          <div className="card p-8 shadow-xl">
            <div className="text-center mb-8">
              <span className="text-5xl">🏫</span>
              <h2 className="text-2xl font-bold text-slate-800 mt-3">교무실용 로그인</h2>
              <p className="text-slate-500 mt-1 text-sm">전체 호출 현황을 확인하는 화면입니다</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="form-label">학교이름</label>
                <input id="officeSchoolName" type="text" value={schoolName}
                  onChange={(e) => { setSchoolName(e.target.value); setDuplicateSchools([]); setDisambiguationCode(""); }}
                  className="input-field" placeholder="예: 흥덕고등학교" required />
              </div>
              {duplicateSchools.length > 0 && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="form-label text-blue-600 font-bold">학교코드 입력</label>
                  <input id="officeDisambiguationCode" type="text" value={disambiguationCode}
                    onChange={(e) => setDisambiguationCode(e.target.value)}
                    className="input-field border-blue-300 bg-blue-50" placeholder="식별용 학교코드 (예: HDHS2024)" required />
                </div>
              )}
              <div>
                <label className="form-label">교무실 비밀번호</label>
                <input id="officePassword" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field" placeholder="교무실 공용 비밀번호" required />
              </div>
              {loginError && (
                <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{loginError}</p>
              )}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "확인 중..." : "입장하기"}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b shadow-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-800">
              {school?.name} — {selectedOfficeCode === "ALL" ? "전체 현황" : selectedOfficeCode ? grouped.find(g => g.group === selectedOfficeCode)?.label : "교무실 선택"}
            </h1>
            <p className="text-xs text-slate-500">실시간 교사 호출 현황</p>
          </div>
          <div className="flex items-center gap-3">
            {totalCalls > 0 ? (
              <div className="flex items-center gap-1.5 bg-emerald-500 text-white text-sm font-bold px-3 py-1.5 rounded-full shadow-md animate-pulse">
                <span className="w-2 h-2 rounded-full bg-white inline-block" />
                총 {totalCalls}건 대기
              </div>
            ) : (
              <div className="bg-slate-100 text-slate-500 text-sm font-medium px-3 py-1.5 rounded-full">
                대기 없음
              </div>
            )}
            <button onClick={() => { setSchool(null); setPhase("login"); setSelectedOfficeCode(null); }}
              className="text-sm text-slate-400 hover:text-slate-600 transition">
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 space-y-6">
        {!selectedOfficeCode ? (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1 h-5 bg-violet-600 rounded-full inline-block" />
              <h2 className="text-base font-bold text-slate-700 tracking-wide">조회할 교무실을 선택하세요</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-4">
              <button
                onClick={() => setSelectedOfficeCode("ALL")}
                className="
                  card p-6 text-center bg-violet-50 border-violet-200
                  hover:bg-violet-100 hover:border-violet-300 hover:shadow-md
                  active:scale-95 transition-all duration-150
                  cursor-pointer
                "
              >
                <span className="block text-3xl mb-3">🌐</span>
                <span className="block text-violet-800 font-bold">전체 현황 보기</span>
                <span className="block text-xs text-violet-600/70 mt-1">모든 교사 표시</span>
              </button>
              {grouped.map(({ group, label, teachers: groupTeachers }) => (
                <button
                  key={group}
                  onClick={() => setSelectedOfficeCode(group)}
                  className="
                    card p-6 text-center 
                    hover:bg-slate-50 hover:border-slate-300 hover:shadow-md
                    active:scale-95 transition-all duration-150
                    cursor-pointer
                  "
                >
                  <span className="block text-3xl mb-3">🚪</span>
                  <span className="block text-slate-800 font-bold">{label}</span>
                  <span className="block text-xs text-slate-400 mt-1">{groupTeachers.length}분의 선생님</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <button 
                onClick={() => setSelectedOfficeCode(null)}
                className="text-slate-500 hover:text-slate-800 transition w-8 h-8 flex items-center justify-center rounded-full border border-slate-200 hover:bg-slate-100"
              >
                ←
              </button>
              <h2 className="text-base font-bold text-slate-700 tracking-wide">
                <span className="text-violet-600 mr-2">{selectedOfficeCode === "ALL" ? "전체 현황" : grouped.find(g => g.group === selectedOfficeCode)?.label}</span>
                실시간 호출
              </h2>
            </div>
            {(selectedOfficeCode === "ALL" ? grouped : grouped.filter(g => g.group === selectedOfficeCode)).map(({ group, label, teachers: groupTeachers }) => (
              <div key={group} className="mb-8 last:mb-0">
                {selectedOfficeCode === "ALL" && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-1 h-5 bg-violet-600 rounded-full inline-block" />
                    <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wide">{label}</h3>
                  </div>
                )}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {groupTeachers.map((teacher) => {
                    const count = callCounts[teacher.id] ?? 0;
                    const hasCall = count > 0;
                    const status = teacherStatuses[teacher.id] ?? "offline";
                    return (
                      <div key={teacher.id}
                        className={`
                          card p-4 text-center transition-all duration-300 relative
                          ${hasCall
                            ? "bg-emerald-50 border-emerald-400 text-emerald-900 shadow-emerald-200 shadow-md transform scale-[1.02] ring-4 ring-emerald-400 animate-pulse"
                            : "bg-white border-gray-200 text-gray-400 font-semibold"
                          }
                        `}
                      >
                        {/* LED 상태 점 */}
                        <span className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ${
                          status === "online" ? "bg-green-500" :
                          status === "away" ? "bg-orange-400" :
                          "bg-gray-400"
                        }`} />
                        <span className={`block mb-1 ${hasCall ? "text-3xl" : "text-2xl opacity-40"}`}>
                          {hasCall ? "🔔" : "⬜"}
                        </span>
                        <span className={`block text-sm ${hasCall ? "font-extrabold" : "font-semibold"}`}>{teacher.name}</span>
                        {teacher.subject && <span className={`block text-xs mt-0.5 ${hasCall ? "text-emerald-700 font-bold" : "text-gray-400 opacity-80"}`}>{teacher.subject}</span>}
                        {hasCall && (
                          <div className="mt-2">
                            <span className="text-xs font-bold text-white bg-emerald-500 px-2 py-1 rounded-full shadow-sm inline-block">
                              {count}건 호출
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
