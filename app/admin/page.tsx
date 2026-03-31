"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getAdminByAdminId,
  getAllSchools,
  createSchool,
  updateSchool,
  deleteSchool,
  getTeachersBySchool,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  getCallLogs,
  getTeacherRequestsBySchools,
  approveTeacherRequest,
  rejectTeacherRequest,
} from "@/lib/firestore";
import { verifyPassword } from "@/lib/hash";
import { OFFICE_GROUPS, OFFICE_LABELS } from "@/types";
import type { School, Teacher, Call, Admin, SoundType, OfficeGroup, TeacherRequest, OfficeGroupItem } from "@/types";

type Phase = "login" | "dashboard";
type Tab = "requests" | "schools" | "teachers" | "sound" | "logs";

export default function AdminPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("login");
  const [adminId, setAdminId] = useState("");
  const [adminPw, setAdminPw] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [tab, setTab] = useState<Tab>("requests");

  // 학교 관리
  const [schools, setSchools] = useState<School[]>([]);
  const [newSchool, setNewSchool] = useState<{
    schoolCode: string; name: string; studentPW: string; officePW: string; officeGroups: OfficeGroupItem[];
  }>({ schoolCode: "", name: "", studentPW: "", officePW: "", officeGroups: [{ code: "office_1", label: "교무실1" }] });
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [schoolMsg, setSchoolMsg] = useState("");

  // 교사 관리
  const [selectedSchoolCode, setSelectedSchoolCode] = useState("");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [newTeacher, setNewTeacher] = useState({ name: "", subject: "", officeGroup: "", password: "" });
  const [teacherMsg, setTeacherMsg] = useState("");
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [editingTeacherPassword, setEditingTeacherPassword] = useState("");

  // 알림 설정
  const [soundSchool, setSoundSchool] = useState<School | null>(null);
  const [soundVolume, setSoundVolume] = useState(70);
  const [soundType, setSoundType] = useState<SoundType>("chime");
  const [soundMsg, setSoundMsg] = useState("");

  // 로그
  const [logSchoolCode, setLogSchoolCode] = useState("");
  const [logs, setLogs] = useState<Call[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({});

  // 헬퍼 함수
  const getOfficeLabel = useCallback((schoolCode: string, officeGroupCode: string) => {
    const school = schools.find((s) => s.schoolCode === schoolCode);
    if (!school) return OFFICE_LABELS[officeGroupCode] || officeGroupCode;
    const og = school.officeGroups?.find((g) => g.code === officeGroupCode);
    return og ? og.label : (OFFICE_LABELS[officeGroupCode] || officeGroupCode);
  }, [schools]);

  // 가입 요청
  const [requests, setRequests] = useState<TeacherRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [requestMsg, setRequestMsg] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const a = await getAdminByAdminId(adminId.trim());
      if (!a) { setLoginError("관리자 ID가 없습니다."); return; }
      const ok = await verifyPassword(adminPw, a.passwordHash);
      if (!ok) { setLoginError("비밀번호가 틀렸습니다."); return; }
      setAdmin(a);
      setPhase("dashboard");
    } catch { setLoginError("로그인 오류가 발생했습니다."); }
    finally { setLoginLoading(false); }
  };

  const loadSchools = useCallback(async () => {
    const list = await getAllSchools();
    setSchools(admin?.schoolCodes?.length
      ? list.filter((s) => admin.schoolCodes.includes(s.schoolCode))
      : list);
  }, [admin]);

  useEffect(() => { if (phase === "dashboard") loadSchools(); }, [phase, loadSchools]);

  // 가입 요청 로드
  const loadRequests = useCallback(async () => {
    if (!admin) return;
    setRequestsLoading(true);
    try {
      const reqs = await getTeacherRequestsBySchools(admin.schoolCodes ?? []);
      setRequests(reqs);
    } catch { /* ignore */ }
    setRequestsLoading(false);
  }, [admin]);

  useEffect(() => {
    if (phase === "dashboard" && tab === "requests") loadRequests();
  }, [phase, tab, loadRequests]);

  // 가입 승인
  const handleApprove = async (req: TeacherRequest) => {
    try {
      await approveTeacherRequest(req.id);
      setRequestMsg(`✅ ${req.name} 선생님 가입을 승인했습니다.`);
      loadRequests();
    } catch { setRequestMsg("승인 처리 중 오류가 발생했습니다."); }
    setTimeout(() => setRequestMsg(""), 4000);
  };

  // 가입 거부 모달 열기
  const openRejectModal = (id: string) => {
    setRejectModalId(id);
    setRejectReason("");
  };

  // 가입 거부 확정
  const handleReject = async () => {
    if (!rejectModalId) return;
    try {
      await rejectTeacherRequest(rejectModalId, rejectReason.trim() || undefined);
      const req = requests.find((r) => r.id === rejectModalId);
      setRequestMsg(`❌ ${req?.name ?? ""} 선생님 가입을 거부했습니다.`);
      setRejectModalId(null);
      setRejectReason("");
      loadRequests();
    } catch { setRequestMsg("거부 처리 중 오류가 발생했습니다."); }
    setTimeout(() => setRequestMsg(""), 4000);
  };

  // 학교 생성
  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSchool(newSchool);
      setNewSchool({ schoolCode: "", name: "", studentPW: "", officePW: "", officeGroups: [{ code: "office_1", label: "교무실1" }] });
      setSchoolMsg("학교가 등록되었습니다.");
      loadSchools();
    } catch { setSchoolMsg("등록 실패"); }
    setTimeout(() => setSchoolMsg(""), 3000);
  };

  const handleUpdateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchool) return;
    try {
      await updateSchool(editingSchool.id, { name: editingSchool.name, officeGroups: editingSchool.officeGroups });
      setEditingSchool(null);
      setSchoolMsg("수정되었습니다.");
      loadSchools();
    } catch { setSchoolMsg("수정 실패"); }
    setTimeout(() => setSchoolMsg(""), 3000);
  };

  const handleDeleteSchool = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    await deleteSchool(id);
    loadSchools();
  };

  const loadTeachers = async (code: string) => {
    const list = await getTeachersBySchool(code);
    setTeachers(list);
    const m: Record<string, string> = {};
    list.forEach((t) => (m[t.id] = t.name));
    setTeacherMap(m);
  };

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchoolCode) return;
    try {
      await createTeacher({ schoolCode: selectedSchoolCode, ...newTeacher });
      setNewTeacher({ name: "", subject: "", officeGroup: "", password: "" });
      setTeacherMsg("교사가 등록되었습니다.");
      loadTeachers(selectedSchoolCode);
    } catch { setTeacherMsg("등록 실패"); }
    setTimeout(() => setTeacherMsg(""), 3000);
  };

  const handleUpdateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher) return;
    try {
      await updateTeacher(editingTeacher.id, {
        name: editingTeacher.name,
        subject: editingTeacher.subject || "",
        officeGroup: editingTeacher.officeGroup,
        ...(editingTeacherPassword ? { password: editingTeacherPassword } : {})
      });
      setEditingTeacher(null);
      setEditingTeacherPassword("");
      loadTeachers(selectedSchoolCode);
      setTeacherMsg("교사 정보가 수정되었습니다.");
    } catch { setTeacherMsg("수정 실패"); }
    setTimeout(() => setTeacherMsg(""), 3000);
  };

  const handleDeleteTeacher = async (id: string) => {
    if (!confirm("비활성화하시겠습니까?")) return;
    await deleteTeacher(id);
    loadTeachers(selectedSchoolCode);
  };

  const handleSoundSave = async () => {
    if (!soundSchool) return;
    try {
      await updateSchool(soundSchool.id, { soundVolume, soundType });
      setSoundMsg("저장되었습니다.");
    } catch { setSoundMsg("저장 실패"); }
    setTimeout(() => setSoundMsg(""), 3000);
  };

  const loadLogs = async () => {
    if (!logSchoolCode) return;
    setLogLoading(true);
    try {
      const logTeachers = await getTeachersBySchool(logSchoolCode);
      const m: Record<string, string> = {};
      logTeachers.forEach((t) => (m[t.id] = t.name));
      setTeacherMap(m);
      const data = await getCallLogs(logSchoolCode);
      setLogs(data);
    } catch { /* ignore */ }
    setLogLoading(false);
  };

  const exportCSV = () => {
    const header = "호출ID,학교코드,교사이름,학생이름,호출시각,확인시각\n";
    const rows = logs.map((c) =>
      [
        c.id, c.schoolCode,
        teacherMap[c.teacherId] ?? c.teacherId,
        c.studentName,
        c.calledAt.toLocaleString("ko-KR"),
        c.confirmedAt ? c.confirmedAt.toLocaleString("ko-KR") : "미확인",
      ].join(",")
    ).join("\n");
    const blob = new Blob(["\ufeff" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `hallpass_log_${logSchoolCode}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const TABS: { id: Tab; label: string; icon: string; badge?: number }[] = [
    { id: "requests", label: "가입 요청", icon: "🔔", badge: pendingCount },
    { id: "schools", label: "학교코드 관리", icon: "🏫" },
    { id: "teachers", label: "교사 관리", icon: "👩‍🏫" },
    { id: "sound", label: "알림 설정", icon: "🎵" },
    { id: "logs", label: "호출 로그", icon: "📋" },
  ];

  const statusBadge = (status: TeacherRequest["status"]) => {
    if (status === "pending") return <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2.5 py-1 rounded-full">대기중</span>;
    if (status === "approved") return <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2.5 py-1 rounded-full">승인됨</span>;
    return <span className="text-xs bg-red-100 text-red-600 font-semibold px-2.5 py-1 rounded-full">거부됨</span>;
  };

  // ──────── 로그인 화면 ────────
  if (phase === "login") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="w-full max-w-md">
          <button onClick={() => router.push("/")} className="mb-6 flex items-center gap-2 text-slate-500 hover:text-slate-700 transition text-sm font-medium">
            ← 처음으로
          </button>
          <div className="card p-8 shadow-xl">
            <div className="text-center mb-8">
              <span className="text-5xl">⚙️</span>
              <h2 className="text-2xl font-bold text-slate-800 mt-3">관리자 로그인</h2>
              <p className="text-slate-400 text-sm mt-1">학교 관리자 전용 페이지입니다</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="form-label">관리자 ID</label>
                <input id="adminId" type="text" value={adminId} onChange={(e) => setAdminId(e.target.value)}
                  className="input-field" required />
              </div>
              <div>
                <label className="form-label">비밀번호</label>
                <input id="adminPassword" type="password" value={adminPw} onChange={(e) => setAdminPw(e.target.value)}
                  className="input-field" required />
              </div>
              {loginError && <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{loginError}</p>}
              <button type="submit" disabled={loginLoading} className="btn-primary w-full">
                {loginLoading ? "로그인 중..." : "로그인"}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  // ──────── 대시보드 ────────
  return (
    <main className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b shadow-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-800">⚙️ 관리자 대시보드</h1>
          <button onClick={() => { setAdmin(null); setPhase("login"); }}
            className="text-sm text-slate-400 hover:text-slate-600 transition">로그아웃</button>
        </div>
      </header>

      {/* 탭 네비게이션 */}
      <div className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto py-2">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition relative
                ${tab === t.id ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {t.icon} {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className={`ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center
                  ${tab === t.id ? "bg-white text-blue-600" : "bg-red-500 text-white"}`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">

        {/* ======================== 가입 요청 ======================== */}
        {tab === "requests" && (
          <div className="space-y-5">
            {/* 상태 메시지 */}
            {requestMsg && (
              <div className={`px-4 py-3 rounded-xl text-sm font-semibold
                ${requestMsg.startsWith("✅") ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                  requestMsg.startsWith("❌") ? "bg-red-50 text-red-700 border border-red-200" :
                  "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                {requestMsg}
              </div>
            )}

            {/* 새 요청 목록 */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800">🔔 대기 중인 가입 요청</h3>
                  {pendingCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {pendingCount}
                    </span>
                  )}
                </div>
                <button onClick={loadRequests} disabled={requestsLoading}
                  className="text-xs text-blue-600 hover:underline disabled:opacity-50">
                  {requestsLoading ? "로딩 중..." : "새로고침"}
                </button>
              </div>

              {requestsLoading ? (
                <div className="py-12 text-center text-slate-400 text-sm">로딩 중...</div>
              ) : (
                <>
                  {requests.filter((r) => r.status === "pending").length === 0 ? (
                    <div className="py-12 text-center">
                      <span className="text-4xl block mb-3">📭</span>
                      <p className="text-slate-400 text-sm">대기 중인 가입 요청이 없습니다</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {requests.filter((r) => r.status === "pending").map((req) => (
                        <div key={req.id} className="px-5 py-4 flex items-center gap-4 hover:bg-slate-50 transition">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-lg">👤</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-bold text-slate-800">{req.name}</span>
                              <span className="text-xs text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded">{req.schoolCode}</span>
                              {statusBadge(req.status)}
                            </div>
                            <p className="text-xs text-slate-500">
                              {getOfficeLabel(req.schoolCode, req.officeGroup)}
                              {req.subject ? ` (${req.subject})` : ""} · {req.requestedAt.toLocaleString("ko-KR")}
                            </p>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => handleApprove(req)}
                              id={`approve-${req.id}`}
                              className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition">
                              승인
                            </button>
                            <button
                              onClick={() => openRejectModal(req.id)}
                              id={`reject-${req.id}`}
                              className="px-4 py-1.5 bg-white hover:bg-red-50 text-red-500 border border-red-200 text-xs font-bold rounded-lg transition">
                              거부
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 처리 히스토리 */}
            <div className="card overflow-hidden">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="w-full px-5 py-4 border-b bg-slate-50 flex items-center justify-between hover:bg-slate-100 transition"
              >
                <h3 className="font-bold text-slate-700 text-sm">📋 처리 완료 내역</h3>
                <span className="text-slate-400 text-xs">{showHistory ? "▲ 닫기" : `▼ ${requests.filter((r) => r.status !== "pending").length}건`}</span>
              </button>
              {showHistory && (
                <div className="divide-y">
                  {requests.filter((r) => r.status !== "pending").length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-sm">처리된 내역이 없습니다</div>
                  ) : (
                    requests.filter((r) => r.status !== "pending").map((req) => (
                      <div key={req.id} className="px-5 py-3 flex items-center gap-4 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-semibold text-slate-700">{req.name}</span>
                            <span className="text-xs text-slate-400 font-mono">{req.schoolCode}</span>
                            {statusBadge(req.status)}
                          </div>
                          <p className="text-xs text-slate-400">
                            {getOfficeLabel(req.schoolCode, req.officeGroup)}
                            {req.subject ? ` (${req.subject})` : ""}
                            {req.reviewedAt && ` · 처리: ${req.reviewedAt.toLocaleString("ko-KR")}`}
                            {req.rejectionReason && ` · 사유: ${req.rejectionReason}`}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================== 학교코드 관리 ======================== */}
        {tab === "schools" && (
          <div className="space-y-6">
            <div className="card p-6">
              <h3 className="font-bold text-slate-800 mb-4">➕ 새 학교 등록</h3>
              <form onSubmit={handleCreateSchool} className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">학교코드</label>
                  <input type="text" value={newSchool.schoolCode} onChange={(e) => setNewSchool({ ...newSchool, schoolCode: e.target.value })} className="input-field" placeholder="HDHS2024" required />
                </div>
                <div>
                  <label className="form-label">학교명</label>
                  <input type="text" value={newSchool.name} onChange={(e) => setNewSchool({ ...newSchool, name: e.target.value })} className="input-field" placeholder="흥덕고등학교" required />
                </div>
                <div>
                  <label className="form-label">학생 비밀번호</label>
                  <input type="text" value={newSchool.studentPW} onChange={(e) => setNewSchool({ ...newSchool, studentPW: e.target.value })} className="input-field" required />
                </div>
                <div>
                  <label className="form-label">교무실 비밀번호</label>
                  <input type="text" value={newSchool.officePW} onChange={(e) => setNewSchool({ ...newSchool, officePW: e.target.value })} className="input-field" required />
                </div>
                <div className="col-span-2">
                  <label className="form-label mb-2 flex items-center justify-between">
                    <span>교무실 목록 설정</span>
                    <button type="button" onClick={() => setNewSchool({ ...newSchool, officeGroups: [...newSchool.officeGroups, { code: `office_${Date.now()}`, label: "" }] })} className="text-blue-600 text-xs font-bold px-2 py-1 bg-blue-50 hover:bg-blue-100 rounded">+ 추가</button>
                  </label>
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center text-xs font-semibold text-slate-500 mb-1 px-1">
                      <div className="flex-1">ID (영문/숫자)</div>
                      <div className="flex-1">교실이름</div>
                      {newSchool.officeGroups.length > 1 && <div className="w-8"></div>}
                    </div>
                    {newSchool.officeGroups.map((og, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input type="text" value={og.code} onChange={(e) => {
                          const arr = [...newSchool.officeGroups];
                          arr[idx].code = e.target.value;
                          setNewSchool({ ...newSchool, officeGroups: arr });
                        }} className="input-field flex-1" placeholder="예: office_1" required />
                        <input type="text" value={og.label} onChange={(e) => {
                          const arr = [...newSchool.officeGroups];
                          arr[idx].label = e.target.value;
                          setNewSchool({ ...newSchool, officeGroups: arr });
                        }} className="input-field flex-1" placeholder="예: 1학년 교무실" required />
                        {newSchool.officeGroups.length > 1 && (
                          <button type="button" onClick={() => {
                            const arr = newSchool.officeGroups.filter((_, i) => i !== idx);
                            setNewSchool({ ...newSchool, officeGroups: arr });
                          }} className="text-red-500 px-2 py-2 hover:bg-red-50 rounded">✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-span-2 flex items-center gap-3 mt-2">
                  <button type="submit" className="btn-primary text-sm px-5 py-2.5">등록</button>
                  {schoolMsg && <span className="text-sm text-emerald-600 font-medium">{schoolMsg}</span>}
                </div>
              </form>
            </div>

            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    {["학교코드", "학교명", ""].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-slate-600 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schools.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-blue-600">{s.schoolCode}</td>
                      <td className="px-4 py-3 text-slate-700">{s.name}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingSchool(s)} className="text-xs text-blue-600 hover:underline">수정</button>
                          <button onClick={() => handleDeleteSchool(s.id)} className="text-xs text-red-500 hover:underline">삭제</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {schools.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">등록된 학교가 없습니다</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {editingSchool && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                  <h3 className="font-bold text-slate-800 mb-4">학교 정보 수정</h3>
                  <form onSubmit={handleUpdateSchool} className="space-y-3">
                    <div>
                      <label className="form-label">학교명</label>
                      <input type="text" value={editingSchool.name}
                        onChange={(e) => setEditingSchool({ ...editingSchool, name: e.target.value })}
                        className="input-field" required />
                    </div>
                    <div>
                      <label className="form-label mb-2 flex items-center justify-between mt-3">
                        <span>교무실 목록</span>
                        <button type="button" onClick={() => setEditingSchool({ ...editingSchool, officeGroups: [...(editingSchool.officeGroups || []), { code: `office_${Date.now()}`, label: "" }] })} className="text-blue-600 text-xs font-bold px-2 py-1 bg-blue-50 hover:bg-blue-100 rounded">+ 추가</button>
                      </label>
                      <div className="max-h-48 overflow-y-auto space-y-2 p-1">
                        <div className="flex gap-2 items-center text-xs font-semibold text-slate-500 mb-1 px-1">
                          <div className="flex-1">ID (영문/숫자)</div>
                          <div className="flex-1">교실이름</div>
                          <div className="w-6"></div>
                        </div>
                        {(editingSchool.officeGroups || []).map((og, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <input type="text" value={og.code} onChange={(e) => {
                              const arr = [...(editingSchool.officeGroups || [])];
                              arr[idx].code = e.target.value;
                              setEditingSchool({ ...editingSchool, officeGroups: arr });
                            }} className="input-field flex-1 text-xs" placeholder="코드" required />
                            <input type="text" value={og.label} onChange={(e) => {
                              const arr = [...(editingSchool.officeGroups || [])];
                              arr[idx].label = e.target.value;
                              setEditingSchool({ ...editingSchool, officeGroups: arr });
                            }} className="input-field flex-1 text-xs" placeholder="이름" required />
                            <button type="button" onClick={() => {
                              const arr = (editingSchool.officeGroups || []).filter((_, i) => i !== idx);
                              setEditingSchool({ ...editingSchool, officeGroups: arr });
                            }} className="text-red-500 px-2 py-1 hover:bg-red-50 rounded text-xs">✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button type="button" onClick={() => setEditingSchool(null)} className="btn-secondary flex-1 text-sm py-2.5">취소</button>
                      <button type="submit" className="btn-primary flex-1 text-sm py-2.5">저장</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================== 교사 관리 ======================== */}
        {tab === "teachers" && (
          <div className="space-y-6">
            <div className="card p-5">
              <div className="flex gap-2 mb-5">
                <select value={selectedSchoolCode} onChange={(e) => { setSelectedSchoolCode(e.target.value); loadTeachers(e.target.value); }}
                  className="input-field">
                  <option value="">-- 학교를 선택하세요 --</option>
                  {schools.map((s) => <option key={s.id} value={s.schoolCode}>{s.name} ({s.schoolCode})</option>)}
                </select>
              </div>

              {selectedSchoolCode && (
                <>
                  <h3 className="font-bold text-slate-800 mb-3">➕ 교사 등록</h3>
                  <form onSubmit={handleCreateTeacher} className="grid grid-cols-4 gap-3 mb-2">
                    <div>
                      <label className="form-label">이름</label>
                      <input type="text" value={newTeacher.name}
                        onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })}
                        className="input-field" placeholder="박지수" required />
                    </div>
                    <div>
                      <label className="form-label">과목 (선택)</label>
                      <input type="text" value={newTeacher.subject}
                        onChange={(e) => setNewTeacher({ ...newTeacher, subject: e.target.value })}
                        className="input-field" placeholder="수학" />
                    </div>
                    <div>
                      <label className="form-label">소속 교무실</label>
                      <select value={newTeacher.officeGroup}
                        onChange={(e) => setNewTeacher({ ...newTeacher, officeGroup: e.target.value as OfficeGroup })}
                        className="input-field" required>
                        <option value="">-- 선택 --</option>
                        {(schools.find((s) => s.schoolCode === selectedSchoolCode)?.officeGroups || []).map((g) => (
                          <option key={g.code} value={g.code}>{g.label}</option>
                        ))}
                        {/* 하위 호환 및 fallback용 */}
                        {schools.find((s) => s.schoolCode === selectedSchoolCode)?.officeGroups?.length ? null : OFFICE_GROUPS.map((g) => <option key={g} value={g}>{OFFICE_LABELS[g]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">개인 비밀번호</label>
                      <input type="text" value={newTeacher.password}
                        onChange={(e) => setNewTeacher({ ...newTeacher, password: e.target.value })}
                        className="input-field" required />
                    </div>
                    <div className="col-span-4 flex items-center gap-3 mt-1">
                      <button type="submit" className="btn-primary text-sm px-5 py-2.5">등록</button>
                      {teacherMsg && <span className="text-sm text-emerald-600">{teacherMsg}</span>}
                    </div>
                  </form>
                </>
              )}
            </div>

            {selectedSchoolCode && (
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      {["이름", "소속", "과목", "상태", ""].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-slate-600 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {teachers.map((t) => (
                      <tr key={t.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{t.name}</td>
                        <td className="px-4 py-3 text-slate-500">{getOfficeLabel(t.schoolCode, t.officeGroup)}</td>
                        <td className="px-4 py-3 text-slate-500">{t.subject || "-"}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">활성</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => { setEditingTeacher({...t}); setEditingTeacherPassword(""); }} className="text-xs text-blue-600 font-bold hover:underline mr-3">수정</button>
                          <button onClick={() => handleDeleteTeacher(t.id)} className="text-xs text-red-500 hover:underline">비활성화</button>
                        </td>
                      </tr>
                    ))}
                    {teachers.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">등록된 교사가 없습니다</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* 교사 수정 모달 */}
            {editingTeacher && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                  <h3 className="font-bold text-slate-800 mb-4">교사 정보 수정</h3>
                  <form onSubmit={handleUpdateTeacher} className="space-y-3">
                    <div>
                      <label className="form-label">이름</label>
                      <input type="text" value={editingTeacher.name}
                        onChange={(e) => setEditingTeacher({ ...editingTeacher, name: e.target.value })}
                        className="input-field" required />
                    </div>
                    <div>
                      <label className="form-label">과목 (선택)</label>
                      <input type="text" value={editingTeacher.subject || ""}
                        onChange={(e) => setEditingTeacher({ ...editingTeacher, subject: e.target.value })}
                        className="input-field" />
                    </div>
                    <div>
                      <label className="form-label">소속 교무실</label>
                      <select value={editingTeacher.officeGroup}
                        onChange={(e) => setEditingTeacher({ ...editingTeacher, officeGroup: e.target.value as OfficeGroup })}
                        className="input-field" required>
                        <option value="">-- 선택 --</option>
                        {(schools.find((s) => s.schoolCode === editingTeacher.schoolCode)?.officeGroups || []).map((g) => (
                          <option key={g.code} value={g.code}>{g.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">새 비밀번호 (변경시에만 입력)</label>
                      <input type="text" value={editingTeacherPassword}
                        onChange={(e) => setEditingTeacherPassword(e.target.value)}
                        className="input-field" placeholder="유지하려면 비워두세요" />
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button type="button" onClick={() => setEditingTeacher(null)} className="btn-secondary flex-1 text-sm py-2.5">취소</button>
                      <button type="submit" className="btn-primary flex-1 text-sm py-2.5">저장</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================== 알림 설정 ======================== */}
        {tab === "sound" && (
          <div className="card p-6 max-w-lg">
            <h3 className="font-bold text-slate-800 mb-5">🎵 알림 설정</h3>
            <div className="mb-4">
              <label className="form-label">학교 선택</label>
              <select value={soundSchool?.id ?? ""} onChange={(e) => {
                const s = schools.find((sc) => sc.id === e.target.value) ?? null;
                setSoundSchool(s);
                if (s) { setSoundVolume(s.soundVolume ?? 70); setSoundType(s.soundType ?? "chime"); }
              }} className="input-field">
                <option value="">-- 학교를 선택하세요 --</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {soundSchool && (
              <>
                <div className="mb-5">
                  <label className="form-label">볼륨: {soundVolume}%</label>
                  <input type="range" min={0} max={100} step={5} value={soundVolume}
                    onChange={(e) => setSoundVolume(Number(e.target.value))}
                    className="w-full accent-blue-600" />
                </div>
                <div className="mb-5">
                  <label className="form-label">알림음 종류</label>
                  <div className="flex gap-3 mt-1">
                    {(["ding", "chime", "beep"] as SoundType[]).map((s) => (
                      <button key={s} onClick={() => setSoundType(s)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold border transition
                          ${soundType === s ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-gray-300 hover:bg-slate-50"}`}>
                        {s === "ding" ? "🎵 띵" : s === "chime" ? "🔔 차임벨" : "📢 비프"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={handleSoundSave} className="btn-primary text-sm px-5 py-2.5">저장</button>
                  {soundMsg && <span className="text-sm text-emerald-600">{soundMsg}</span>}
                </div>
              </>
            )}
          </div>
        )}

        {/* ======================== 로그 조회 ======================== */}
        {tab === "logs" && (
          <div className="space-y-4">
            <div className="card p-5 flex items-end gap-3">
              <div className="flex-1">
                <label className="form-label">학교 선택</label>
                <select value={logSchoolCode} onChange={(e) => setLogSchoolCode(e.target.value)} className="input-field">
                  <option value="">-- 학교를 선택하세요 --</option>
                  {schools.map((s) => <option key={s.id} value={s.schoolCode}>{s.name}</option>)}
                </select>
              </div>
              <button onClick={loadLogs} disabled={!logSchoolCode || logLoading}
                className="btn-primary text-sm px-5 py-3 disabled:opacity-50">
                {logLoading ? "로딩 중..." : "조회"}
              </button>
              {logs.length > 0 && (
                <button onClick={exportCSV} className="btn-secondary text-sm px-5 py-3">
                  📥 CSV 내보내기
                </button>
              )}
            </div>

            {logs.length > 0 && (
              <div className="card overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      {["교사", "학생", "호출 시각", "상태"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-slate-600 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((c) => (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-700">{teacherMap[c.teacherId] ?? c.teacherId}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{c.studentName}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{c.calledAt.toLocaleString("ko-KR")}</td>
                        <td className="px-4 py-3">
                          {c.confirmedAt ? (
                            <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full">확인됨</span>
                          ) : (
                            <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full">미확인</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-slate-400 px-4 py-2">총 {logs.length}건</p>
              </div>
            )}

            {logs.length === 0 && logSchoolCode && !logLoading && (
              <div className="text-center py-12 text-slate-400">로그가 없습니다</div>
            )}
          </div>
        )}
      </div>

      {/* ── 거부 사유 입력 모달 ── */}
      {rejectModalId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-slate-800 mb-1">가입 거부</h3>
            <p className="text-slate-500 text-sm mb-4">거부 사유를 입력하면 교사에게 표시됩니다 (선택사항)</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="input-field resize-none h-24 text-sm"
              placeholder="예: 교사 명부에 없는 이름입니다. 관리자에게 문의하세요."
            />
            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setRejectModalId(null)}
                className="btn-secondary flex-1 text-sm py-2.5">취소</button>
              <button type="button" onClick={handleReject}
                className="flex-1 text-sm py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold transition">
                거부 확정
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
