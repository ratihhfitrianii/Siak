/** Tipe data API T1.11b — shape mengikuti respons backend (krs & grades). */

export interface UserMe {
  id: number;
  email: string;
  fullName: string;
  role: string;
  roleName: string;
  isWali: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  /** null untuk non-mahasiswa; dipakai transkrip mandiri (T1.11b). */
  studentId: number | null;
  createdAt: string;
  menu: string[];
}

export interface KrsPeriod {
  id: number;
  semesterId: number;
  semesterCode: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  isRevision: boolean;
  status: 'open' | 'closed';
}

export interface AvailableClass {
  id: number;
  classCode: string;
  capacity: number;
  currentEnrolled: number;
  quotaLeft: number;
  room: string | null;
  /** 1=Senin .. 7=Minggu (SMALLINT dari backend). */
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  course: { code: string; name: string; credits: number };
  isMandatory: boolean;
  semesterNumber: number;
}

export type KrsStatus =
  'no_period' | 'not_filled' | 'draft' | 'submitted' | 'approved' | 'rejected';

export interface MyKrsItem {
  id: number;
  classCode: string;
  course: { code: string; name: string; credits: number };
  /** 1=Senin .. 7=Minggu (SMALLINT dari backend). */
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
}

export interface MyKrs {
  submissionId: number | null;
  status: KrsStatus;
  isLocked: boolean;
  submittedAt: string | null;
  rejectionReason: string | null;
  totalCredits: number;
  items: MyKrsItem[];
}

export interface GradeItem {
  id: number;
  krsItemId: number;
  classId: number;
  classCode: string;
  course: { code: string; name: string; credits: number };
  period: string;
  semester: string;
  tugasScore: number | null;
  utsScore: number | null;
  uasScore: number | null;
  finalScore: number | null;
  gradeLetter: string | null;
  gradePoint: number | null;
  isRemedial: boolean;
  remedialScore: number | null;
  inputBy: number;
  inputAt: string;
  updatedBy: number | null;
  updatedAt: string | null;
}

/* ==== T1.11c — Admin Dashboard ==== */

export interface AdminKrsItem {
  id: number;
  nim: string;
  studentName: string;
  prodiCode: string;
  submittedAt: string;
  itemCount: number;
  totalCredits: number;
}

export interface AdminKrsPending {
  items: AdminKrsItem[];
}

export interface UserListItem {
  id: number;
  email: string;
  fullName: string;
  isWali: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roleCode: string;
  roleName: string;
}

export interface UserListResponse {
  items: UserListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  roleCode: 'mahasiswa' | 'dosen' | 'admin_akademik' | 'admin_keuangan' | 'admin_sistem';
  isWali: boolean;
}

export interface UpdateRoleInput {
  roleCode: 'mahasiswa' | 'dosen' | 'admin_akademik' | 'admin_keuangan' | 'admin_sistem';
  isWali: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  role?: string;
  search?: string;
}

/* ==== T1.13 — Waiting Room ==== */

export type WaitingRoomStatus =
  { status: 'enter' } | { status: 'waiting'; position: number } | { status: 'unknown' };
