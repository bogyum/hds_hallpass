// =====================
// 공통 타입 정의
// =====================

// 학교별 커스텀 교무실 항목
export interface OfficeGroupItem {
  code: string;   // 식별 코드 (예: "office_1", "teachers_room" 등 자유롭게)
  label: string;  // 표시 이름 (예: "1학년 교무실")
}

// 하위 호환용 — 기존 코드에서 OfficeGroup 타입이 쓰이는 곳에서 string으로 허용
export type OfficeGroup = string;

// 기존 데이터 fallback용 (레거시 고정 코드 → 레이블 매핑)
export const OFFICE_LABELS: Record<string, string | undefined> = {
  office_1: "1학년 교무실",
  office_2: "2학년 교무실",
  office_3: "3학년 교무실",
  office_main: "본 교무실",
  office_special: "특별실",
};

export const OFFICE_GROUPS: string[] = [
  "office_1",
  "office_2",
  "office_3",
  "office_main",
  "office_special",
];

export type SoundType = "ding" | "chime" | "beep";
export type AuthMode = "student" | "teacher" | "office" | "admin";

export interface School {
  id: string;
  schoolCode: string;
  name: string;
  studentPW: string;     // SHA-256 해시
  officePW: string;      // SHA-256 해시
  soundVolume: number;   // 0~100
  soundType: SoundType;
  officeGroups: OfficeGroupItem[];  // 학교별 교무실 목록
}

export type TeacherStatus = "online" | "offline" | "away";

export interface Teacher {
  id: string;
  schoolCode: string;
  name: string;
  subject?: string;           // 과목 (예: "수학", "문학 2" 등)
  officeGroup: string;        // 학교별 커스텀 코드 (예: "office_1", "teachers_room" 등)
  passwordHash: string;       // SHA-256 해시
  isActive: boolean;
  profileImageUrl?: string | null;  // Firebase Storage 프로필 이미지 URL
  status?: TeacherStatus;     // 온라인 상태 (기본값: offline)
}

export interface Call {
  id: string;
  schoolCode: string;
  teacherId: string;
  teacherName?: string;
  studentName: string;
  calledAt: Date;
  confirmedAt: Date | null;
  confirmedBy: string | null;
}

export interface Admin {
  id: string;
  adminId: string;
  passwordHash: string;
  schoolCodes: string[];
}

// 교사 로그인 세션 (localStorage 기반 커스텀 인증)
export interface TeacherSession {
  teacherId: string;
  teacherName: string;
  schoolCode: string;
  officeGroup: OfficeGroup;
}

export type RequestStatus = "pending" | "approved" | "rejected";

export interface TeacherRequest {
  id: string;
  name: string;              // 한글 이름 (아이디로 사용)
  subject?: string;
  schoolCode: string;
  officeGroup: OfficeGroup;
  passwordHash: string;      // SHA-256 해시
  status: RequestStatus;
  requestedAt: Date;
  reviewedAt: Date | null;
  rejectionReason: string | null;
}
