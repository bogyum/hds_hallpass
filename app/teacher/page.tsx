"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getSchoolByCode,
  getTeachersBySchool,
  subscribeToTeacherCalls,
  confirmAllCallsByTeacherAndStudent,
  autoConfirmExpiredCalls,
  createTeacherRequest,
  getLatestRequestByNameAndSchool,
  updateTeacher,
  uploadTeacherProfileImage,
  deleteTeacherProfileImage,
  getSchoolsByName,
  getTeacherByNameAndSchool,
  setTeacherStatus as updateTeacherStatusInDB,
} from "@/lib/firestore";
import { verifyPassword } from "@/lib/hash";
import { playChime, playDing, playBeep, resumeAudioContext } from "@/lib/audio";
import { OFFICE_GROUPS, OFFICE_LABELS } from "@/types";
import type { Teacher, Call, SoundType, OfficeGroup, School, TeacherStatus } from "@/types";

interface BannerItem {
  id: string;
  message: string;
  leaving: boolean;
}

type Phase = "login" | "signup" | "signup_pending" | "rejected" | "school_not_setup" | "dashboard";

export default function TeacherPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("login");

  // ── 로그인 ──
  const [loginSchoolName, setLoginSchoolName] = useState("");
  const [loginSchoolLoaded, setLoginSchoolLoaded] = useState(false);
  const [loginSchool, setLoginSchool] = useState<School | null>(null);
  const [disambiguationCode, setDisambiguationCode] = useState("");
  const [duplicateSchools, setDuplicateSchools] = useState<School[]>([]);
  const [loginTeacherName, setLoginTeacherName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // ── 가입 ──
  const [signupName, setSignupName] = useState("");
  const [signupSchoolCode, setSignupSchoolCode] = useState("");
  const [signupSchoolPW, setSignupSchoolPW] = useState("");
  const [signupSchoolVerified, setSignupSchoolVerified] = useState(false);
  const [signupSchoolName, setSignupSchoolName] = useState("");
  const [signupSchoolId, setSignupSchoolId] = useState("");
  const [signupSchool, setSignupSchool] = useState<School | null>(null);
  const [signupOffice, setSignupOffice] = useState("");
  const [signupSubject, setSignupSubject] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupVerifyLoading, setSignupVerifyLoading] = useState(false);

  // ── 거부 정보 ──
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  // ── 대시보드 ──
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [teacherSchool, setTeacherSchool] = useState<School | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [teacherStatus, setTeacherStatus] = useState<TeacherStatus>("offline");

  // ── 정보 수정 ──
  const [editingInfo, setEditingInfo] = useState<{
    name: string;
    subject: string;
    officeGroup: string;
    password: string;
    profileImageFile: File | null;
    profileImagePreview: string | null;
    removeProfileImage: boolean;
  } | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState(false);

  // ── 알림 ──
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  const lastCallCount = useRef(0);
  const soundDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const sessionStart = useRef(new Date());
  const soundType = useRef<SoundType>("chime");

  // localStorage에서 알림음 설정 로드
  useEffect(() => {
    const saved = localStorage.getItem("teacherSoundOn");
    const on = saved === null ? true : saved === "true";
    setSoundOn(on);
    soundOnRef.current = on;
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    soundOnRef.current = next;
    localStorage.setItem("teacherSoundOn", String(next));
  };

  // ── 로그인: 학교이름으로 학교 정보 로드 ──
  const loadSchoolForLogin = async () => {
    if (!loginSchoolName.trim()) return;
    setLoginSchoolLoaded(false);
    setLoginError("");
    try {
      if (duplicateSchools.length > 0) {
        if (!disambiguationCode.trim()) {
          setLoginError("학교코드를 입력해 주세요.");
          return;
        }
        const sc = await getSchoolByCode(disambiguationCode.trim());
        if (!sc || sc.name !== loginSchoolName.trim()) {
          setLoginError("학교코드가 일치하지 않습니다.");
          return;
        }
        soundType.current = sc.soundType ?? "chime";
        setLoginSchool(sc);
        setLoginSchoolLoaded(true);
      } else {
        const matches = await getSchoolsByName(loginSchoolName.trim());
        if (matches.length === 0) {
          setLoginError("등록되지 않은 학교이름입니다.");
          return;
        }
        if (matches.length > 1) {
          setDuplicateSchools(matches);
          setLoginError("동일한 이름의 학교가 여러 개 있습니다. 학교코드를 입력해 주세요.");
          return;
        }
        const sc = matches[0];
        soundType.current = sc.soundType ?? "chime";
        setLoginSchool(sc);
        setLoginSchoolLoaded(true);
      }
    } catch {
      setLoginError("학교 조회 중 오류가 발생했습니다.");
    }
  };

  // ── 교사 로그인 ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      if (!loginSchool) return;
      const t = await getTeacherByNameAndSchool(loginTeacherName.trim(), loginSchool.schoolCode);
      if (!t) { setLoginError("교사 정보를 찾을 수 없습니다. 성함을 확인해 주세요."); return; }
      
      const ok = await verifyPassword(loginPassword, t.passwordHash);
      if (!ok) { setLoginError("비밀번호가 올바르지 않습니다."); return; }

      await resumeAudioContext();
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
      soundType.current = loginSchool.soundType ?? "chime";
      setTeacher(t);
      setTeacherSchool(loginSchool);
      sessionStart.current = new Date();
      setTeacherStatus("online");
      await updateTeacherStatusInDB(t.id, "online").catch(() => {});
      setPhase("dashboard");
    } catch {
      setLoginError("로그인 중 오류가 발생했습니다.");
    } finally {
      setLoginLoading(false);
    }
  };

  // ── 가입: 학교코드 검증 ──
  const handleVerifySchool = async () => {
    if (!signupSchoolCode.trim() || !signupSchoolPW.trim()) {
      setSignupError("학교코드와 학교 비밀번호를 모두 입력해주세요.");
      return;
    }
    setSignupVerifyLoading(true);
    setSignupError("");
    setSignupSchoolVerified(false);
    try {
      const school = await getSchoolByCode(signupSchoolCode.trim());
      if (!school) {
        setSignupError("등록되지 않은 학교코드입니다.");
        return;
      }
      // 학생용 비밀번호로 학교 소속 검증
      const ok = await verifyPassword(signupSchoolPW, school.studentPW);
      if (!ok) {
        setSignupError("학교 비밀번호가 올바르지 않습니다. 담당 선생님께 문의하세요.");
        return;
      }
      setSignupSchoolVerified(true);
      setSignupSchoolName(school.name);
      setSignupSchoolId(school.id);
      setSignupSchool(school);
    } catch {
      setSignupError("학교 조회 중 오류가 발생했습니다.");
    } finally {
      setSignupVerifyLoading(false);
    }
  };

  // ── 가입 신청 제출 ──
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError("");

    if (!signupName.trim()) { setSignupError("이름을 입력해주세요."); return; }
    if (!signupSchoolVerified) { setSignupError("먼저 학교코드를 인증해주세요."); return; }
    if (!signupOffice) { setSignupError("소속 교무실을 선택해주세요."); return; }
    if (signupPassword.length < 4) { setSignupError("비밀번호는 4자 이상이어야 합니다."); return; }
    if (signupPassword !== signupPasswordConfirm) { setSignupError("비밀번호가 일치하지 않습니다."); return; }

    setSignupLoading(true);
    try {
      // 이미 pending 신청이 있는지 확인
      const existing = await getLatestRequestByNameAndSchool(signupName.trim(), signupSchoolCode.trim());
      if (existing && existing.status === "pending") {
        setSignupError("이미 가입 신청이 접수되어 있습니다. 관리자 승인을 기다려주세요.");
        return;
      }

      await createTeacherRequest({
        name: signupName.trim(),
        subject: signupSubject.trim(),
        schoolCode: signupSchoolCode.trim(),
        officeGroup: signupOffice,
        password: signupPassword,
      });
      setPhase("signup_pending");
    } catch {
      setSignupError("가입 신청 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setSignupLoading(false);
    }
  };

  // ── 배너 추가 ──
  const addBanner = useCallback((msg: string) => {
    const id = Math.random().toString(36).slice(2);
    setBanners((prev) => {
      const next = [...prev.slice(-2), { id, message: msg, leaving: false }];
      return next;
    });
    setTimeout(() => {
      setBanners((prev) =>
        prev.map((b) => (b.id === id ? { ...b, leaving: true } : b))
      );
    }, 3000);
    setTimeout(() => {
      setBanners((prev) => prev.filter((b) => b.id !== id));
    }, 3300);
  }, []);

  // ── 실시간 구독 ──
  useEffect(() => {
    if (!teacher || phase !== "dashboard") return;
    const unsub = subscribeToTeacherCalls(teacher.id, teacher.schoolCode, (newCalls) => {
      const freshCalls = newCalls.filter((c) => c.calledAt > sessionStart.current);
      if (freshCalls.length > lastCallCount.current) {
        const diff = freshCalls.length - lastCallCount.current;
        const newCallsList = freshCalls.slice(0, diff);

        for (let i = 0; i < Math.min(diff, 3); i++) {
          const c = freshCalls[i];
          addBanner(`📣 ${c.studentName} 학생이 호출했습니다`);
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("학생 호출", {
              body: `${c.studentName} 학생이 호출했습니다`,
            });
          }
        }
        if (diff > 3) {
          addBanner(`📣 외 ${diff - 3}건 더 있습니다`);
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("학생 호출", {
              body: `외 ${diff - 3}건의 호출이 더 있습니다`,
            });
          }
        }

        if (diff > 0) {
          try {
            const popup = window.open("", `CallPopup_${Date.now()}`, "width=400,height=450,left=200,top=200");
            if (popup) {
              const itemsHtml = newCallsList.map(c => {
                const t = c.calledAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                return `<div style="background:white; padding:15px; border-radius:12px; margin-bottom:10px; box-shadow:0 2px 4px rgb(0 0 0 / 0.05); text-align:left; border-left: 4px solid #3b82f6;">
                  <div style="font-size:20px; font-weight:bold; color:#1e293b;">${c.studentName} 학생</div>
                  <div style="font-size:14px; color:#64748b; margin-top:5px;">호출 시간: ${t}</div>
                </div>`;
              }).join('');

              popup.document.write(`
                <html>
                  <head>
                    <title>학생 호출 알림</title>
                    <meta charset="utf-8" />
                  </head>
                  <body style="margin:0; padding:20px; font-family:'Pretendard', sans-serif; background:#f1f5f9; display:flex; flex-direction:column; height:100vh; box-sizing:border-box;">
                    <audio id="popupAudio" src="/sounds/call_chime.mp3" style="display:none;" autoplay></audio>
                    <div style="text-align:center; margin-bottom:15px;">
                      <div style="font-size:40px; margin-bottom:5px;">🚨</div>
                      <h1 style="color:#0f172a; margin:0; font-size:20px;">선생님~ 질문있어요!</h1>
                    </div>
                    <div style="flex:1; overflow-y:auto; padding:5px;">
                      ${itemsHtml}
                    </div>
                    <button onclick="window.close()" style="margin-top:15px; width:100%; padding:15px; background:#3b82f6; color:white; border:none; border-radius:12px; font-size:16px; font-weight:bold; cursor:pointer; box-shadow:0 4px 6px -1px rgb(59 130 246 / 0.5);">확인 (창 닫기)</button>
                  </body>
                </html>
              `);
              popup.document.close();
              popup.focus();
            }
          } catch(e) {
            console.error("Popup blocked or failed", e);
          }
        }

        if (soundOnRef.current) {
          if (soundDebounceRef.current) clearTimeout(soundDebounceRef.current);
          soundDebounceRef.current = setTimeout(() => {
            if (soundType.current === "chime") playChime(0.7);
            else if (soundType.current === "ding") playDing(0.7);
            else playBeep(0.7);
          }, 100);
        }
      }
      lastCallCount.current = freshCalls.length;
      setCalls(newCalls);
    });
    return () => { unsub(); };
  }, [teacher, phase, addBanner]);

  // ── 10분 경과 자동 확인 (1분마다 학교 전체 검사) ──
  useEffect(() => {
    if (!teacher || phase !== "dashboard") return;
    autoConfirmExpiredCalls(teacher.schoolCode).catch(() => {});
    const interval = setInterval(() => {
      autoConfirmExpiredCalls(teacher.schoolCode).catch(() => {});
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [teacher, phase]);

  // ── 확인 처리 ──
  const handleConfirm = async (call: Call) => {
    if (!teacher) return;
    try {
      await confirmAllCallsByTeacherAndStudent(teacher.id, call.studentName, teacher.schoolCode);
      setExpandedStudent(null);
    } catch { /* ignore */ }
  };

  // ── 정보 수정 ──
  const handleUpdateInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacher || !editingInfo) return;
    setEditLoading(true);
    setEditError("");
    try {
      let profileImageUrl: string | null = teacher.profileImageUrl ?? null;

      if (editingInfo.removeProfileImage) {
        try { await deleteTeacherProfileImage(teacher.id); } catch {}
        profileImageUrl = null;
      } else if (editingInfo.profileImageFile) {
        profileImageUrl = await uploadTeacherProfileImage(teacher.id, editingInfo.profileImageFile);
      }

      await updateTeacher(teacher.id, {
        name: editingInfo.name.trim(),
        subject: editingInfo.subject.trim(),
        officeGroup: editingInfo.officeGroup as OfficeGroup,
        ...(editingInfo.password ? { password: editingInfo.password } : {}),
        profileImageUrl,
      });
      setTeacher({
        ...teacher,
        name: editingInfo.name.trim(),
        subject: editingInfo.subject.trim(),
        officeGroup: editingInfo.officeGroup as OfficeGroup,
        profileImageUrl,
      });
      setEditSuccess(true);
      setTimeout(() => {
        setEditSuccess(false);
        setEditingInfo(null);
      }, 1500);
    } catch {
      setEditError("정보 수정에 실패했습니다.");
    } finally {
      setEditLoading(false);
    }
  };

  const studentGroups = calls.reduce<Record<string, Call[]>>((acc, call) => {
    if (!acc[call.studentName]) acc[call.studentName] = [];
    acc[call.studentName].push(call);
    return acc;
  }, {});

  const resetToLogin = () => {
    if (teacher) {
      updateTeacherStatusInDB(teacher.id, "offline").catch(() => {});
    }
    setPhase("login");
    setTeacher(null);
    setCalls([]);
    setTeacherStatus("offline");
    setLoginSchoolName("");
    setLoginSchoolLoaded(false);
    setLoginSchool(null);
    setLoginPassword("");
    setLoginError("");
    setLoginTeacherName("");
    setSignupSubject("");
  };

  // ══════════════════════════════════════════
  // 로그인 화면
  // ══════════════════════════════════════════
  if (phase === "login") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="w-full max-w-md">
          <button onClick={() => router.push("/")} className="mb-6 flex items-center gap-2 text-slate-500 hover:text-slate-700 transition text-sm font-medium">
            ← 처음으로
          </button>
          <div className="card p-8 shadow-xl">
            <div className="text-center mb-8">
              <span className="text-5xl">👩‍🏫</span>
              <h2 className="text-2xl font-bold text-slate-800 mt-3">교사용 로그인</h2>
              <p className="text-slate-500 mt-1 text-sm">학교이름을 먼저 입력한 뒤 로그인하세요</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="form-label">학교이름</label>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input id="teacherSchoolName" type="text" value={loginSchoolName}
                      onChange={(e) => { setLoginSchoolName(e.target.value); setLoginSchoolLoaded(false); setDuplicateSchools([]); setDisambiguationCode(""); }}
                      disabled={loginSchoolLoaded}
                      className="input-field" placeholder="예: 흥덕고등학교" />
                    {!loginSchoolLoaded && (
                      <button type="button" onClick={loadSchoolForLogin}
                        className="btn-secondary whitespace-nowrap text-sm px-4 py-3">
                        조회
                      </button>
                    )}
                    {loginSchoolLoaded && (
                      <button type="button" onClick={() => { setLoginSchoolLoaded(false); setLoginSchool(null); setDuplicateSchools([]); setDisambiguationCode(""); }} className="text-blue-600 text-xs font-bold px-2 hover:bg-blue-50 rounded">변경</button>
                    )}
                  </div>
                  {duplicateSchools.length > 0 && !loginSchoolLoaded && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                      <label className="form-label text-blue-600 font-bold">학교코드 입력</label>
                      <input id="teacherDisambiguationCode" type="text" value={disambiguationCode}
                        onChange={(e) => setDisambiguationCode(e.target.value)}
                        className="input-field border-blue-300 bg-blue-50" placeholder="식별용 학교코드 (예: HDHS2024)" required />
                    </div>
                  )}
                </div>
              </div>
              {loginSchoolLoaded && (
                <>
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="form-label">선생님 성함</label>
                    <input id="teacherName" type="text" value={loginTeacherName}
                      onChange={(e) => setLoginTeacherName(e.target.value)}
                      className="input-field" placeholder="이름을 입력하세요" required />
                  </div>
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="form-label">비밀번호</label>
                    <input id="teacherPassword" type="password" value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="input-field" placeholder="개인 비밀번호" required />
                  </div>
                </>
              )}
              {loginError && (
                <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{loginError}</p>
              )}
              <button type="submit" disabled={loginLoading || !loginSchoolLoaded}
                className="btn-primary w-full disabled:opacity-50">
                {loginLoading ? "로그인 중..." : "로그인"}
              </button>
            </form>

            {/* 구분선 */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">또는</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <button
              onClick={() => {
                setSignupError("");
                setSignupSchoolVerified(false);
                setSignupSchool(null);
                setSignupSchoolCode("");
                setSignupSchoolPW("");
                setSignupName("");
                setSignupSubject("");
                setSignupOffice("");
                setSignupPassword("");
                setSignupPasswordConfirm("");
                setPhase("signup");
              }}
              className="w-full py-3 rounded-xl border-2 border-blue-200 text-blue-600 font-semibold text-sm
                hover:bg-blue-50 hover:border-blue-400 transition"
            >
              ✏️ 교사 가입 신청하기
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ══════════════════════════════════════════
  // 가입 신청 화면
  // ══════════════════════════════════════════
  if (phase === "signup") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="w-full max-w-md">
          <button onClick={() => setPhase("login")} className="mb-6 flex items-center gap-2 text-slate-500 hover:text-slate-700 transition text-sm font-medium">
            ← 로그인으로 돌아가기
          </button>
          <div className="card p-8 shadow-xl">
            <div className="text-center mb-7">
              <span className="text-5xl">✏️</span>
              <h2 className="text-2xl font-bold text-slate-800 mt-3">교사 가입 신청</h2>
              <p className="text-slate-500 mt-1 text-sm">가입 후 관리자 승인이 완료되면 로그인할 수 있습니다</p>
            </div>

            <form onSubmit={handleSignup} className="space-y-5">

              {/* STEP 1: 학교코드 인증 */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Step 1. 학교 인증</p>
                <div>
                  <label className="form-label">학교코드</label>
                  <input type="text" value={signupSchoolCode}
                    onChange={(e) => { setSignupSchoolCode(e.target.value); setSignupSchoolVerified(false); }}
                    className="input-field" placeholder="예: HDHS2024" />
                </div>
                <div>
                  <label className="form-label">학교 비밀번호 <span className="text-slate-400 text-xs font-normal">(학교 공용 비밀번호)</span></label>
                  <div className="flex gap-2">
                    <input type="password" value={signupSchoolPW}
                      onChange={(e) => { setSignupSchoolPW(e.target.value); setSignupSchoolVerified(false); }}
                      className="input-field" placeholder="담당자에게 문의" />
                    <button type="button" onClick={handleVerifySchool}
                      disabled={signupVerifyLoading}
                      className="btn-secondary whitespace-nowrap text-sm px-4 py-3 disabled:opacity-50">
                      {signupVerifyLoading ? "확인 중..." : "인증"}
                    </button>
                  </div>
                </div>
                {signupSchoolVerified && (
                  <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 text-sm font-semibold">
                    <span>✅</span>
                    <span>{signupSchoolName} 인증 완료</span>
                  </div>
                )}
              </div>

              {/* STEP 2: 교사 정보 */}
              <div className={`space-y-3 transition-opacity ${signupSchoolVerified ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide bg-slate-50 rounded-xl px-4 py-2 border border-slate-200">Step 2. 교사 정보 입력</p>
                <div>
                  <label className="form-label">이름 <span className="text-slate-400 text-xs font-normal">(로그인 아이디로 사용됩니다)</span></label>
                  <input type="text" value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    className="input-field" placeholder="홍길동" />
                </div>
                <div>
                  <label className="form-label">담당 과목 (선택)</label>
                  <input type="text" value={signupSubject}
                    onChange={(e) => setSignupSubject(e.target.value)}
                    className="input-field" placeholder="수학" />
                </div>
                <div>
                  <label className="form-label">소속 교무실</label>
                  <select value={signupOffice}
                    onChange={(e) => setSignupOffice(e.target.value)}
                    className="input-field" required>
                    <option value="">-- 선택 --</option>
                    {(signupSchool?.officeGroups || []).map((g) => (
                      <option key={g.code} value={g.code}>{g.label}</option>
                    ))}
                    {signupSchool?.officeGroups?.length ? null : OFFICE_GROUPS.map((g) => (
                      <option key={g} value={g}>{OFFICE_LABELS[g]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">비밀번호 설정</label>
                  <input type="password" value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    className="input-field" placeholder="4자 이상" />
                </div>
                <div>
                  <label className="form-label">비밀번호 확인</label>
                  <input type="password" value={signupPasswordConfirm}
                    onChange={(e) => setSignupPasswordConfirm(e.target.value)}
                    className="input-field" placeholder="비밀번호 재입력" />
                </div>
              </div>

              {signupError && (
                <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{signupError}</p>
              )}

              <button type="submit"
                disabled={signupLoading || !signupSchoolVerified}
                className="btn-primary w-full disabled:opacity-50">
                {signupLoading ? "신청 중..." : "가입 신청하기"}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  // ══════════════════════════════════════════
  // 가입 신청 완료 (대기) 화면
  // ══════════════════════════════════════════
  if (phase === "signup_pending") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-emerald-50">
        <div className="w-full max-w-md">
          <div className="card p-10 shadow-xl text-center">
            <div className="w-20 h-20 mx-auto bg-emerald-100 rounded-full flex items-center justify-center mb-5">
              <span className="text-4xl">📬</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-3">가입 신청 완료!</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">
              가입 신청이 정상적으로 접수되었습니다.<br />
              관리자가 승인하면 로그인할 수 있습니다.<br />
              <span className="text-slate-400">승인 여부는 담당자에게 문의해주세요.</span>
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700 text-sm font-medium mb-6">
              ⏳ 관리자 승인 대기 중
            </div>
            <button onClick={() => setPhase("login")}
              className="btn-primary w-full">
              로그인 화면으로 돌아가기
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ══════════════════════════════════════════
  // 가입 거부 화면
  // ══════════════════════════════════════════
  if (phase === "rejected") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-red-50">
        <div className="w-full max-w-md">
          <div className="card p-10 shadow-xl text-center">
            <div className="w-20 h-20 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-5">
              <span className="text-4xl">❌</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-3">가입 신청 거부됨</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-4">
              관리자가 가입 신청을 거부하였습니다.
            </p>
            {rejectionReason && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm mb-6">
                <p className="font-semibold mb-1">거부 사유</p>
                <p>{rejectionReason}</p>
              </div>
            )}
            <p className="text-slate-400 text-xs mb-6">
              문의사항은 학교 관리자에게 연락해주세요.<br />
              재신청을 원하시면 아래 버튼을 눌러주세요.
            </p>
            <div className="space-y-2">
              <button onClick={() => {
                setSignupError("");
                setSignupSchoolVerified(false);
                setSignupSchoolCode("");
                setSignupSchoolPW("");
                setSignupName("");
                setSignupPassword("");
                setSignupPasswordConfirm("");
                setPhase("signup");
              }} className="btn-primary w-full">
                재신청하기
              </button>
              <button onClick={resetToLogin} className="btn-secondary w-full">
                로그인으로 돌아가기
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ══════════════════════════════════════════
  // 학교 미설정 화면
  // ══════════════════════════════════════════
  if (phase === "school_not_setup") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-amber-50">
        <div className="w-full max-w-md">
          <div className="card p-10 shadow-xl text-center">
            <div className="w-20 h-20 mx-auto bg-amber-100 rounded-full flex items-center justify-center mb-5">
              <span className="text-4xl">🏫</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-3">아직 학교 설정 전입니다</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">
              학교 관리자가 학교 정보를 아직 설정하지 않았습니다.<br />
              관리자가 설정을 완료한 후 이용해주세요.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
              <p className="text-amber-700 text-sm font-semibold">⚙️ 관리자에게 학교 설정을 요청하세요</p>
              <p className="text-amber-600 text-xs mt-1">학교코드, 이름, 비밀번호 등록이 필요합니다</p>
            </div>
            <button onClick={resetToLogin} className="btn-secondary w-full">
              로그인으로 돌아가기
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ══════════════════════════════════════════
  // 대시보드
  // ══════════════════════════════════════════
  return (
    <main className="min-h-screen flex flex-col bg-slate-50">
      {/* 배너 알림 */}
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        {banners.map((b) => (
          <div key={b.id}
            className={`bg-emerald-500 text-white px-6 py-3 text-sm font-semibold shadow-lg text-center
              ${b.leaving ? "banner-out" : "banner-in"}`}>
            {b.message}
          </div>
        ))}
      </div>

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-800">{teacher?.name} 선생님</h1>
            <p className="text-xs text-slate-500">
              {teacher?.subject && <span className="mr-1">{teacher.subject} ·</span>}
              {teacher && teacherSchool ? (teacherSchool.officeGroups?.find(g => g.code === teacher.officeGroup)?.label || OFFICE_LABELS[teacher.officeGroup] || teacher.officeGroup) : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 상태 토글 */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
              <button
                onClick={async () => {
                  setTeacherStatus("online");
                  if (teacher) await updateTeacherStatusInDB(teacher.id, "online").catch(() => {});
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition ${
                  teacherStatus === "online" ? "bg-green-500 text-white shadow-sm" : "text-slate-500 hover:bg-white"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${teacherStatus === "online" ? "bg-white" : "bg-green-400"}`} />
                온라인
              </button>
              <button
                onClick={async () => {
                  setTeacherStatus("away");
                  if (teacher) await updateTeacherStatusInDB(teacher.id, "away").catch(() => {});
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition ${
                  teacherStatus === "away" ? "bg-orange-400 text-white shadow-sm" : "text-slate-500 hover:bg-white"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${teacherStatus === "away" ? "bg-white" : "bg-orange-400"}`} />
                자리비움
              </button>
            </div>
            <button onClick={() => setEditingInfo({
              name: teacher!.name,
              subject: teacher!.subject || "",
              officeGroup: teacher!.officeGroup,
              password: "",
              profileImageFile: null,
              profileImagePreview: teacher!.profileImageUrl || null,
              removeProfileImage: false,
            })}
              className="text-xl w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition"
              title="프로필 수정">
              ⚙️
            </button>
            <button onClick={toggleSound}
              className="text-xl w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition"
              title={soundOn ? "알림음 끄기" : "알림음 켜기"}>
              {soundOn ? "🔔" : "🔕"}
            </button>
            <button onClick={resetToLogin}
              className="text-sm text-slate-400 hover:text-slate-600 transition">
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* 호출 목록 */}
      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">
        {calls.length === 0 ? (
          <div className="text-center py-24">
            <span className="text-6xl block mb-4">😊</span>
            <p className="text-slate-400 text-lg font-medium">대기 중인 학생이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500 font-medium">
              미확인 호출 <span className="text-blue-600 font-bold">{Object.keys(studentGroups).length}</span>건
            </p>
            {Object.entries(studentGroups).map(([studentName, callList]) => (
              <div key={studentName} className="card overflow-visible">
                <button
                  onClick={() => setExpandedStudent(
                    expandedStudent === studentName ? null : studentName
                  )}
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 transition"
                >
                  <span className="w-3 h-3 rounded-full bg-emerald-500 green-dot-pulse flex-shrink-0" />
                  <div className="flex-1">
                    <span className="font-bold text-slate-800 text-base">{studentName}</span>
                    <span className="ml-2 text-xs text-slate-400">
                      {callList.length > 1 ? `${callList.length}회 호출` : ""}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {callList[0].calledAt.toLocaleTimeString("ko-KR", {
                      hour: "2-digit", minute: "2-digit", second: "2-digit"
                    })}
                  </span>
                  <span className="text-slate-300 text-sm">{expandedStudent === studentName ? "▲" : "▼"}</span>
                </button>

                {expandedStudent === studentName && (
                  <div className="border-t border-gray-100 p-4 bg-slate-50 rounded-b-2xl">
                    <p className="text-xs text-slate-500 font-semibold mb-2">호출 시각 기록</p>
                    <ul className="space-y-1 mb-4">
                      {callList.map((c) => (
                        <li key={c.id} className="text-sm text-slate-600">
                          • {c.calledAt.toLocaleTimeString("ko-KR")}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => handleConfirm(callList[0])}
                      id={`confirmBtn-${studentName}`}
                      className="btn-primary text-sm px-5 py-2.5"
                    >
                      ✅ 확인 완료
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 정보 수정 모달 */}
      {editingInfo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-slate-800 mb-4">내 정보 수정</h3>
            <form onSubmit={handleUpdateInfo} className="space-y-3">
              {/* 프로필 이미지 */}
              <div>
                <label className="form-label">프로필 이미지</label>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center flex-shrink-0 border-2 border-slate-200">
                    {editingInfo.profileImagePreview && !editingInfo.removeProfileImage ? (
                      <img src={editingInfo.profileImagePreview} alt="프로필" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">👨‍🏫</span>
                    )}
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <label className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-600 text-xs font-medium cursor-pointer hover:bg-slate-100 transition">
                      📷 이미지 선택
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const preview = URL.createObjectURL(file);
                          setEditingInfo({ ...editingInfo, profileImageFile: file, profileImagePreview: preview, removeProfileImage: false });
                        }}
                      />
                    </label>
                    {(editingInfo.profileImagePreview || teacher?.profileImageUrl) && !editingInfo.removeProfileImage && (
                      <button
                        type="button"
                        onClick={() => setEditingInfo({ ...editingInfo, profileImageFile: null, profileImagePreview: null, removeProfileImage: true })}
                        className="w-full text-xs text-red-500 hover:text-red-700 py-1 transition"
                      >
                        이미지 삭제
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="form-label">이름</label>
                <input type="text" value={editingInfo.name}
                  onChange={(e) => setEditingInfo({ ...editingInfo, name: e.target.value })}
                  className="input-field" required />
              </div>
              <div>
                <label className="form-label">담당 과목 (선택)</label>
                <input type="text" value={editingInfo.subject}
                  onChange={(e) => setEditingInfo({ ...editingInfo, subject: e.target.value })}
                  className="input-field" placeholder="수학" />
              </div>
              <div>
                <label className="form-label">소속 교무실</label>
                <select value={editingInfo.officeGroup}
                  onChange={(e) => setEditingInfo({ ...editingInfo, officeGroup: e.target.value })}
                  className="input-field" required>
                  <option value="">-- 선택 --</option>
                  {(teacherSchool?.officeGroups || []).map((g) => (
                    <option key={g.code} value={g.code}>{g.label}</option>
                  ))}
                  {teacherSchool?.officeGroups?.length ? null : OFFICE_GROUPS.map((g) => (
                    <option key={g} value={g}>{OFFICE_LABELS[g]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">새 비밀번호 (변경시에만 입력)</label>
                <input type="text" value={editingInfo.password}
                  onChange={(e) => setEditingInfo({ ...editingInfo, password: e.target.value })}
                  className="input-field" placeholder="유지하려면 비워두세요" />
              </div>
              {editError && <div className="text-red-500 text-sm mt-2">{editError}</div>}
              {editSuccess && <div className="text-emerald-600 font-bold text-sm mt-2">✅ 수정되었습니다!</div>}
              <div className="flex gap-3 mt-4">
                <button type="button" onClick={() => setEditingInfo(null)} className="btn-secondary flex-1 text-sm py-2.5">닫기</button>
                {!editSuccess && (
                  <button type="submit" disabled={editLoading} className="btn-primary flex-1 text-sm py-2.5 disabled:opacity-50">
                    {editLoading ? "저장 중..." : "저장"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
