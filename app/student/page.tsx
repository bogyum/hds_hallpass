"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getSchoolByCode,
  getSchoolsByName,
  getTeachersBySchool,
  createCall,
  subscribeToSchoolCalls,
  subscribeToLatestConfirmedCall,
  autoConfirmExpiredCalls,
} from "@/lib/firestore";
import { verifyPassword } from "@/lib/hash";
import { playSound, resumeAudioContext } from "@/lib/audio";
import { OFFICE_GROUPS, OFFICE_LABELS } from "@/types";
import type { School, Teacher, SoundType, OfficeGroupItem, Call } from "@/types";

type Phase = "login" | "calling";

export default function StudentPage() {
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
  const [waitListCalls, setWaitListCalls] = useState<Call[]>([]);
  const [isWaitListOpen, setIsWaitListOpen] = useState(false);
  const [confirmedTeacherName, setConfirmedTeacherName] = useState<string | null>(null);
  const [selectedOfficeCode, setSelectedOfficeCode] = useState<string | null>(null);

  // 호출 팝업
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [studentName, setStudentName] = useState("");
  const [callLoading, setCallLoading] = useState(false);
  const [callError, setCallError] = useState("");

  // LED + 토스트
  const [showLed, setShowLed] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const soundType = useRef<SoundType>("ding");
  const soundVolume = useRef(0.7);

  // 학생 로그인
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

      const ok = await verifyPassword(password, sc.studentPW);
      if (!ok) { setLoginError("비밀번호가 올바르지 않습니다."); return; }

      // AudioContext 초기화 (자동재생 정책 대응)
      await resumeAudioContext();

      soundType.current = sc.soundType ?? "ding";
      soundVolume.current = (sc.soundVolume ?? 70) / 100;

      const teacherList = await getTeachersBySchool(sc.schoolCode);
      setSchool(sc);
      setTeachers(teacherList);
      setPhase("calling");
    } catch {
      setLoginError("로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 실시간 구독 + 10분 경과 호출 자동 확인
  useEffect(() => {
    if (!school) return;
    const unsub1 = subscribeToSchoolCalls(school.schoolCode, setWaitListCalls);
    const unsub2 = subscribeToLatestConfirmedCall(school.schoolCode, async (tid) => {
      if (!tid) return;
      // teacherId → 이름 조회
      const t = teachers.find((t) => t.id === tid);
      if (t) {
        setConfirmedTeacherName(t.name);
        setTimeout(() => setConfirmedTeacherName(null), 3000);
      }
    });

    // 키오스크는 항상 켜져 있으므로, 교사 미로그인 상태에서도 자동 확인
    autoConfirmExpiredCalls(school.schoolCode).catch(() => {});
    const autoConfirmInterval = setInterval(() => {
      autoConfirmExpiredCalls(school.schoolCode).catch(() => {});
    }, 60 * 1000);

    return () => { unsub1(); unsub2(); clearInterval(autoConfirmInterval); };
  }, [school, teachers]);

  const uniqueWaitList = waitListCalls.reduce<Call[]>((acc, call) => {
    if (!acc.some(c => c.teacherId === call.teacherId)) {
      acc.push(call);
    }
    return acc;
  }, []);

  const unconfirmedCount = waitListCalls.length;

  // 호출 처리
  const handleCall = async () => {
    if (!selectedTeacher || !school || !studentName.trim()) {
      setCallError("이름을 입력해주세요.");
      return;
    }
    setCallLoading(true);
    setCallError("");
    try {
      await createCall({
        schoolCode: school.schoolCode,
        teacherId: selectedTeacher.id,
        teacherName: selectedTeacher.name,
        studentName: studentName.trim(),
      });
      setSelectedTeacher(null);
      setStudentName("");

      // LED 피드백
      setShowLed(true);
      playSound(soundType.current, soundVolume.current);
      setTimeout(() => setShowLed(false), 800);

      // 토스트
      setTimeout(() => setShowToast(true), 800);
      setTimeout(() => setShowToast(false), 1600);
    } catch {
      setCallError("호출 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setCallLoading(false);
    }
  };

  // 교무실별 교사 그룹화
  const officeList = school?.officeGroups?.length 
    ? school.officeGroups 
    : OFFICE_GROUPS.map(g => ({ code: g, label: OFFICE_LABELS[g] || g }));

  const grouped = officeList.map((g) => ({
    group: g.code,
    label: g.label,
    teachers: teachers.filter((t) => t.officeGroup === g.code),
  })).filter((g) => g.teachers.length > 0);

  if (phase === "login") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* 뒤로 */}
          <button onClick={() => router.push("/")} className="mb-6 flex items-center gap-2 text-slate-500 hover:text-slate-700 transition text-sm font-medium">
            ← 처음으로
          </button>
          <div className="card p-8 shadow-xl">
            <div className="text-center mb-8">
              <span className="text-5xl">🎒</span>
              <h2 className="text-2xl font-bold text-slate-800 mt-3">학생용 로그인</h2>
              <p className="text-slate-500 mt-1 text-sm">학교이름과 비밀번호를 입력하세요</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="form-label">학교이름</label>
                <input id="schoolName" type="text" value={schoolName} 
                  onChange={(e) => { setSchoolName(e.target.value); setDuplicateSchools([]); setDisambiguationCode(""); }}
                  className="input-field" placeholder="예: 흥덕고등학교" required />
              </div>
              {duplicateSchools.length > 0 && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="form-label text-blue-600 font-bold">학교코드 입력</label>
                  <input id="studentDisambiguationCode" type="text" value={disambiguationCode}
                    onChange={(e) => setDisambiguationCode(e.target.value)}
                    className="input-field border-blue-300 bg-blue-50" placeholder="식별용 학교코드 (예: HDHS2024)" required />
                </div>
              )}
              <div>
                <label className="form-label">비밀번호</label>
                <input id="studentPassword" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="input-field" placeholder="공용 비밀번호" required />
              </div>
              {loginError && (
                <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{loginError}</p>
              )}
              <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
                {loading ? "확인 중..." : "입장하기"}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* LED 오버레이 */}
      {showLed && <div className="led-overlay" />}

      {/* 상단 헤더 */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-800">선생님~ 질문있어요!</h1>
            <p className="text-xs text-slate-500">{school?.name}</p>
          </div>
          <div className="flex items-center gap-3">
            {unconfirmedCount > 0 && (
              <button 
                onClick={() => setIsWaitListOpen(true)}
                className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-bold px-3 py-1.5 rounded-full shadow-md hover:bg-blue-700 transition active:scale-95">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse inline-block" />
                대기 {unconfirmedCount}건
              </button>
            )}
            <button onClick={() => { setSchool(null); setPhase("login"); setSelectedOfficeCode(null); setIsWaitListOpen(false); }}
              className="text-sm text-slate-400 hover:text-slate-600 transition">
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* 교사 목록 */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 space-y-6">
        {grouped.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <p className="text-lg">등록된 교사가 없습니다.</p>
          </div>
        ) : !selectedOfficeCode ? (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1 h-5 bg-blue-600 rounded-full inline-block" />
              <h2 className="text-base font-bold text-slate-700 tracking-wide">어느 교무실에 계신가요?</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {grouped.map(({ group, label, teachers: groupTeachers }) => (
                <button
                  key={group}
                  onClick={() => setSelectedOfficeCode(group)}
                  className="
                    card p-6 text-center 
                    hover:bg-blue-50 hover:border-blue-200 hover:shadow-md
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
                <span className="text-blue-600 mr-2">{grouped.find(g => g.group === selectedOfficeCode)?.label}</span>
                선생님 선택
              </h2>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {grouped.find(g => g.group === selectedOfficeCode)?.teachers.map((teacher) => (
                <button
                  key={teacher.id}
                  onClick={() => { setSelectedTeacher(teacher); setStudentName(""); setCallError(""); }}
                  className="
                    card p-4 text-center font-semibold text-slate-700
                    hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700
                    active:scale-95 transition-all duration-150
                    cursor-pointer text-sm
                  "
                >
                  {teacher.profileImageUrl ? (
                    <div className="w-8 h-8 rounded-full overflow-hidden mx-auto mb-1">
                      <img src={teacher.profileImageUrl} alt={teacher.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <span className="block text-2xl mb-1">👨‍🏫</span>
                  )}
                  <span className="block text-xl">{teacher.name}</span>
                  {teacher.subject && <span className="block text-sm text-slate-400 font-normal mt-0.5">{teacher.subject}</span>}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* 교사 확인 하단 알림 */}
      {confirmedTeacherName && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-full shadow-xl font-semibold text-sm toast-enter z-50">
          ✅ {confirmedTeacherName} 선생님이 확인하셨습니다
        </div>
      )}

      {/* 호출 팝업 */}
      {selectedTeacher && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedTeacher(null); }}>
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-[fadeInUp_0.25s_ease-out]">
            <div className="text-center mb-6">
              <span className="text-5xl">📣</span>
              <h3 className="text-xl font-bold text-slate-800 mt-3">
                {selectedTeacher.name} 선생님 호출
                {selectedTeacher.subject && <span className="text-sm font-normal text-slate-500 ml-2">({selectedTeacher.subject})</span>}
              </h3>
              <p className="text-slate-400 text-sm mt-1">
                {school?.officeGroups?.find(g => g.code === selectedTeacher.officeGroup)?.label || OFFICE_LABELS[selectedTeacher.officeGroup] || selectedTeacher.officeGroup}
              </p>
            </div>
            <div className="mb-5">
              <label className="form-label">학생 이름</label>
              <input
                id="studentNameInput"
                type="text"
                autoFocus
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCall(); }}
                className="input-field text-lg text-center font-semibold"
                placeholder="이름을 입력하세요"
                maxLength={10}
              />
            </div>
            {callError && (
              <p className="text-red-500 text-sm text-center mb-3 bg-red-50 px-3 py-2 rounded-lg">{callError}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setSelectedTeacher(null)} className="btn-secondary flex-1">
                취소
              </button>
              <button
                onClick={handleCall}
                disabled={callLoading || !studentName.trim()}
                id="callButton"
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {callLoading ? "호출 중..." : "호출하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 성공 토스트 */}
      {showToast && (
        <div className="fixed inset-0 flex items-center justify-center z-[9998] pointer-events-none">
          <div className="bg-emerald-600 text-white px-8 py-4 rounded-2xl shadow-2xl text-lg font-bold toast-enter">
            ✅ 호출이 접수되었습니다
          </div>
        </div>
      )}

      {/* 대기 목록 팝업 */}
      {isWaitListOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setIsWaitListOpen(false); }}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-[fadeInUp_0.25s_ease-out]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">📌 대기 중인 호출 목록</h3>
              <button onClick={() => setIsWaitListOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">✕</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {uniqueWaitList.length === 0 ? (
                <p className="text-center py-8 text-slate-400 text-sm">대기 중인 호출이 없습니다</p>
              ) : (
                uniqueWaitList.map((c) => {
                  const t = teachers.find(teach => teach.id === c.teacherId);
                  return (
                    <div key={c.id} className="bg-slate-50 border border-slate-100 p-3 rounded-2xl flex items-center justify-between">
                      <div>
                        <span className="block font-bold text-slate-700 text-sm">{c.teacherName || t?.name || "선생님"}</span>
                        {t?.subject && <span className="block text-xs text-slate-400">{t.subject}</span>}
                      </div>
                      <span className="text-[10px] text-slate-400 bg-white px-2 py-1 rounded-full border border-slate-100 shadow-sm">
                        {c.calledAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <p className="text-[10px] text-slate-400 text-center mt-4">목록은 최신 호출 순으로 표시됩니다</p>
            <button onClick={() => setIsWaitListOpen(false)} className="btn-primary w-full mt-4 text-sm py-2.5">
              닫기
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
