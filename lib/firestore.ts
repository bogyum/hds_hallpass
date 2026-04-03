import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db, storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import type { School, Teacher, Call, Admin, SoundType, OfficeGroup, OfficeGroupItem, TeacherRequest, TeacherStatus } from "@/types";
import { hashPassword } from "./hash";

// =====================
// Schools
// =====================

export async function getSchoolByCode(schoolCode: string): Promise<School | null> {
  const q = query(collection(db, "schools"), where("schoolCode", "==", schoolCode));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as School;
}

export async function getSchoolsByName(name: string): Promise<School[]> {
  const q = query(collection(db, "schools"), where("name", "==", name));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as School));
}

export async function getAllSchools(): Promise<School[]> {
  const snap = await getDocs(collection(db, "schools"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as School));
}

export async function createSchool(data: {
  schoolCode: string;
  name: string;
  studentPW: string;
  officePW: string;
  soundVolume?: number;
  soundType?: SoundType;
  officeGroups?: OfficeGroupItem[];
}): Promise<string> {
  const studentPW = await hashPassword(data.studentPW);
  const officePW = await hashPassword(data.officePW);
  const ref = await addDoc(collection(db, "schools"), {
    ...data,
    studentPW,
    officePW,
    soundVolume: data.soundVolume ?? 70,
    soundType: data.soundType ?? "chime",
    officeGroups: data.officeGroups ?? [],
  });
  return ref.id;
}

export async function updateSchool(
  id: string,
  data: Partial<{
    name: string;
    studentPW: string;
    officePW: string;
    soundVolume: number;
    soundType: SoundType;
    officeGroups: OfficeGroupItem[];
  }>
): Promise<void> {
  const update: Record<string, unknown> = { ...data };
  if (data.studentPW) update.studentPW = await hashPassword(data.studentPW);
  if (data.officePW) update.officePW = await hashPassword(data.officePW);
  await updateDoc(doc(db, "schools", id), update);
}

export async function deleteSchool(id: string): Promise<void> {
  await deleteDoc(doc(db, "schools", id));
}

// =====================
// Teachers
// =====================

export async function getTeachersBySchool(schoolCode: string): Promise<Teacher[]> {
  const q = query(
    collection(db, "teachers"),
    where("schoolCode", "==", schoolCode),
    where("isActive", "==", true)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Teacher));
}

export async function getTeacherByNameAndSchool(name: string, schoolCode: string): Promise<Teacher | null> {
  const q = query(
    collection(db, "teachers"),
    where("name", "==", name),
    where("schoolCode", "==", schoolCode),
    where("isActive", "==", true)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as Teacher;
}

export async function getTeacherById(id: string): Promise<Teacher | null> {
  const snap = await getDoc(doc(db, "teachers", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Teacher;
}

export async function createTeacher(data: {
  schoolCode: string;
  name: string;
  subject?: string;
  officeGroup: OfficeGroup;
  password: string;
}): Promise<string> {
  const passwordHash = await hashPassword(data.password);
  const ref = await addDoc(collection(db, "teachers"), {
    schoolCode: data.schoolCode,
    name: data.name,
    subject: data.subject || "",
    officeGroup: data.officeGroup,
    passwordHash,
    isActive: true,
  });
  return ref.id;
}

export async function updateTeacher(
  id: string,
  data: Partial<{
    name: string;
    subject: string;
    officeGroup: OfficeGroup;
    password: string;
    isActive: boolean;
    profileImageUrl: string | null;
  }>
): Promise<void> {
  const update: Record<string, unknown> = { ...data };
  if (data.password) {
    update.passwordHash = await hashPassword(data.password);
    delete update.password;
  }
  await updateDoc(doc(db, "teachers", id), update);
}

export async function deleteTeacher(id: string): Promise<void> {
  await updateDoc(doc(db, "teachers", id), { isActive: false });
}

export async function uploadTeacherProfileImage(teacherId: string, file: File): Promise<string> {
  const storageRef = ref(storage, `teachers/${teacherId}/profile`);
  const snapshot = await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(snapshot.ref);
}

export async function deleteTeacherProfileImage(teacherId: string): Promise<void> {
  const storageRef = ref(storage, `teachers/${teacherId}/profile`);
  await deleteObject(storageRef);
}

export async function setTeacherStatus(teacherId: string, status: TeacherStatus): Promise<void> {
  await updateDoc(doc(db, "teachers", teacherId), { status });
}

export function subscribeToTeacherStatuses(
  schoolCode: string,
  callback: (statuses: Record<string, TeacherStatus>) => void
): () => void {
  const q = query(
    collection(db, "teachers"),
    where("schoolCode", "==", schoolCode),
    where("isActive", "==", true)
  );
  return onSnapshot(q, (snap) => {
    const statuses: Record<string, TeacherStatus> = {};
    snap.docs.forEach((d) => {
      statuses[d.id] = (d.data().status as TeacherStatus) ?? "offline";
    });
    callback(statuses);
  });
}

// =====================
// Calls
// =====================

export async function createCall(data: {
  schoolCode: string;
  teacherId: string;
  teacherName?: string;
  studentName: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, "calls"), {
    ...data,
    calledAt: serverTimestamp(),
    confirmedAt: null,
    confirmedBy: null,
  });
  return ref.id;
}

export async function confirmCall(callId: string, teacherId: string): Promise<void> {
  await updateDoc(doc(db, "calls", callId), {
    confirmedAt: serverTimestamp(),
    confirmedBy: teacherId,
  });
}

/**
 * 학교 전체에서 10분 이상 경과한 미확인 호출을 자동 확인 처리
 */
export async function autoConfirmExpiredCalls(schoolCode: string): Promise<void> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const q = query(
    collection(db, "calls"),
    where("schoolCode", "==", schoolCode),
    where("confirmedAt", "==", null)
  );
  const snap = await getDocs(q);
  const expired = snap.docs.filter((d) => {
    const calledAt = (d.data().calledAt as Timestamp)?.toDate();
    return calledAt && calledAt < tenMinutesAgo;
  });
  if (expired.length === 0) return;
  await Promise.all(
    expired.map((d) =>
      updateDoc(d.ref, {
        confirmedAt: serverTimestamp(),
        confirmedBy: "AUTO",
      })
    )
  );
}

export async function confirmAllCallsByTeacherAndStudent(
  teacherId: string,
  studentName: string,
  schoolCode: string
): Promise<void> {
  const q = query(
    collection(db, "calls"),
    where("teacherId", "==", teacherId),
    where("studentName", "==", studentName),
    where("schoolCode", "==", schoolCode),
    where("confirmedAt", "==", null)
  );
  const snap = await getDocs(q);
  const updates = snap.docs.map((d) =>
    updateDoc(d.ref, {
      confirmedAt: serverTimestamp(),
      confirmedBy: teacherId,
    })
  );
  await Promise.all(updates);
}

/**
 * 특정 교사의 미확인 호출 실시간 구독
 */
export function subscribeToTeacherCalls(
  teacherId: string,
  schoolCode: string,
  callback: (calls: Call[]) => void
): () => void {
  const q = query(
    collection(db, "calls"),
    where("teacherId", "==", teacherId),
    where("schoolCode", "==", schoolCode),
    where("confirmedAt", "==", null)
  );
  return onSnapshot(q, (snap) => {
    const calls = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        calledAt: (data.calledAt as Timestamp)?.toDate() ?? new Date(),
        confirmedAt: data.confirmedAt ? (data.confirmedAt as Timestamp).toDate() : null,
      } as Call;
    });
    // orderBy("calledAt", "desc") 대신 클라이언트에서 정렬하여 복합 인덱스 에러 회피
    calls.sort((a, b) => b.calledAt.getTime() - a.calledAt.getTime());
    callback(calls);
  }, (err) => console.error("subscribeToTeacherCalls Error:", err));
}

/**
 * 학교 전체 미확인 호출 수 실시간 구독 (학생 화면 카운터용)
 */
export function subscribeToSchoolCallCount(
  schoolCode: string,
  callback: (count: number) => void
): () => void {
  const q = query(
    collection(db, "calls"),
    where("schoolCode", "==", schoolCode),
    where("confirmedAt", "==", null)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.size);
  });
}

/**
 * 학교 전체 미확인 호출 실시간 구독 (학생 화면 대기 목록용)
 */
export function subscribeToSchoolCalls(
  schoolCode: string,
  callback: (calls: Call[]) => void
): () => void {
  const q = query(
    collection(db, "calls"),
    where("schoolCode", "==", schoolCode),
    where("confirmedAt", "==", null)
  );
  return onSnapshot(q, (snap) => {
    const calls = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        calledAt: (data.calledAt as Timestamp)?.toDate() ?? new Date(),
        confirmedAt: data.confirmedAt ? (data.confirmedAt as Timestamp).toDate() : null,
      } as Call;
    });
    // 최신순 정렬
    calls.sort((a, b) => b.calledAt.getTime() - a.calledAt.getTime());
    callback(calls);
  }, (err) => console.error("subscribeToSchoolCalls Error:", err));
}

/**
 * 교무실용: 교사별 미확인 호출 수 실시간 구독
 */
export function subscribeToAllTeacherCallCounts(
  schoolCode: string,
  callback: (counts: Record<string, number>) => void
): () => void {
  const q = query(
    collection(db, "calls"),
    where("schoolCode", "==", schoolCode),
    where("confirmedAt", "==", null)
  );
  return onSnapshot(q, (snap) => {
    const counts: Record<string, number> = {};
    snap.docs.forEach((d) => {
      const tid = d.data().teacherId as string;
      counts[tid] = (counts[tid] ?? 0) + 1;
    });
    callback(counts);
  });
}

/**
 * 특정 교사를 확인한 최신 호출 이력 구독 (학생 화면 "OOO 선생님 확인하셨습니다" 알림용)
 */
export function subscribeToLatestConfirmedCall(
  schoolCode: string,
  callback: (teacherName: string | null) => void
): () => void {
  const q = query(
    collection(db, "calls"),
    where("schoolCode", "==", schoolCode),
    where("confirmedAt", "!=", null)
  );
  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      callback(null);
      return;
    }
    const docs = snap.docs.map(d => d.data());
    docs.sort((a, b) => ((b.confirmedAt as Timestamp)?.toMillis() || 0) - ((a.confirmedAt as Timestamp)?.toMillis() || 0));
    
    // 가장 최근에 확인된 건 (5초 이내만 유효)
    const latest = docs[0];
    const confirmedAt = (latest.confirmedAt as Timestamp)?.toDate();
    const now = new Date();
    if (confirmedAt && now.getTime() - confirmedAt.getTime() < 5000) {
      callback(latest.confirmedBy ?? null);
    } else {
      callback(null);
    }
  });
}

// =====================
// Call Logs
// =====================
export async function getCallLogs(
  schoolCode: string,
  filters?: {
    teacherId?: string;
    studentName?: string;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<Call[]> {
  let q = query(
    collection(db, "calls"),
    where("schoolCode", "==", schoolCode)
  );

  const snap = await getDocs(q);
  let calls = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      calledAt: (data.calledAt as Timestamp)?.toDate() ?? new Date(),
      confirmedAt: data.confirmedAt ? (data.confirmedAt as Timestamp).toDate() : null,
    } as Call;
  });

  if (filters?.teacherId) {
    calls = calls.filter((c) => c.teacherId === filters.teacherId);
  }
  if (filters?.studentName) {
    calls = calls.filter((c) =>
      c.studentName.includes(filters.studentName!)
    );
  }
  if (filters?.startDate) {
    calls = calls.filter((c) => c.calledAt >= filters.startDate!);
  }
  if (filters?.endDate) {
    calls = calls.filter((c) => c.calledAt <= filters.endDate!);
  }
  calls.sort((a, b) => b.calledAt.getTime() - a.calledAt.getTime());
  return calls;
}

// =====================
// Admin
// =====================
export async function getAdminByAdminId(adminId: string): Promise<Admin | null> {
  const q = query(collection(db, "admins"), where("adminId", "==", adminId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as Admin;
}

// =====================
// Teacher Requests (가입 신청)
// =====================

export async function createTeacherRequest(data: {
  name: string;
  subject?: string;
  schoolCode: string;
  officeGroup: OfficeGroup;
  password: string;
}): Promise<string> {
  const passwordHash = await hashPassword(data.password);
  const ref = await addDoc(collection(db, "teacherRequests"), {
    name: data.name,
    subject: data.subject || "",
    schoolCode: data.schoolCode,
    officeGroup: data.officeGroup,
    passwordHash,
    status: "pending",
    requestedAt: serverTimestamp(),
    reviewedAt: null,
    rejectionReason: null,
  });
  return ref.id;
}

export async function getTeacherRequestsBySchool(
  schoolCode: string
): Promise<TeacherRequest[]> {
  const q = query(
    collection(db, "teacherRequests"),
    where("schoolCode", "==", schoolCode)
  );
  const snap = await getDocs(q);
  const results = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      requestedAt: (data.requestedAt as Timestamp)?.toDate() ?? new Date(),
      reviewedAt: data.reviewedAt ? (data.reviewedAt as Timestamp).toDate() : null,
    } as TeacherRequest;
  });
  results.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
  return results;
}

export async function getTeacherRequestsBySchools(
  schoolCodes: string[]
): Promise<TeacherRequest[]> {
  if (schoolCodes.length === 0) {
    // 슈퍼관리자: 전체 조회
    const q = query(
      collection(db, "teacherRequests"),
      orderBy("requestedAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        requestedAt: (data.requestedAt as Timestamp)?.toDate() ?? new Date(),
        reviewedAt: data.reviewedAt ? (data.reviewedAt as Timestamp).toDate() : null,
      } as TeacherRequest;
    });
  }
  // 담당 학교 목록으로 필터
  const results: TeacherRequest[] = [];
  for (const code of schoolCodes) {
    const reqs = await getTeacherRequestsBySchool(code);
    results.push(...reqs);
  }
  results.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
  return results;
}

export async function approveTeacherRequest(requestId: string): Promise<string> {
  const reqDoc = await getDoc(doc(db, "teacherRequests", requestId));
  if (!reqDoc.exists()) throw new Error("신청을 찾을 수 없습니다.");
  const data = reqDoc.data();

  // teachers 컬렉션에 추가
  const teacherRef = await addDoc(collection(db, "teachers"), {
    schoolCode: data.schoolCode,
    name: data.name,
    subject: data.subject || "",
    officeGroup: data.officeGroup,
    passwordHash: data.passwordHash,
    isActive: true,
  });

  // 신청 상태 업데이트
  await updateDoc(doc(db, "teacherRequests", requestId), {
    status: "approved",
    reviewedAt: serverTimestamp(),
  });

  return teacherRef.id;
}

export async function rejectTeacherRequest(
  requestId: string,
  reason?: string
): Promise<void> {
  await updateDoc(doc(db, "teacherRequests", requestId), {
    status: "rejected",
    reviewedAt: serverTimestamp(),
    rejectionReason: reason ?? null,
  });
}

export async function getPendingRequestByNameAndSchool(
  name: string,
  schoolCode: string
): Promise<TeacherRequest | null> {
  const q = query(
    collection(db, "teacherRequests"),
    where("name", "==", name),
    where("schoolCode", "==", schoolCode),
    where("status", "==", "pending")
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data();
  return {
    id: d.id,
    ...data,
    requestedAt: (data.requestedAt as Timestamp)?.toDate() ?? new Date(),
    reviewedAt: data.reviewedAt ? (data.reviewedAt as Timestamp).toDate() : null,
  } as TeacherRequest;
}

export async function getLatestRequestByNameAndSchool(
  name: string,
  schoolCode: string
): Promise<TeacherRequest | null> {
  const q = query(
    collection(db, "teacherRequests"),
    where("name", "==", name),
    where("schoolCode", "==", schoolCode)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  
  const docs = snap.docs.map(d => ({id: d.id, ...(d.data() as any)}));
  docs.sort((a, b) => ((b.requestedAt as Timestamp)?.toMillis() || 0) - ((a.requestedAt as Timestamp)?.toMillis() || 0));
  
  const data = docs[0];
  return {
    ...data,
    requestedAt: (data.requestedAt as Timestamp)?.toDate() ?? new Date(),
    reviewedAt: data.reviewedAt ? (data.reviewedAt as Timestamp).toDate() : null,
  } as TeacherRequest;
}
