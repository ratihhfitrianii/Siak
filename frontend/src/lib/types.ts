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

/** Mahasiswa Profile — detail mahasiswa untuk halaman Profile */
export interface StudentProfile {
  id: number;
  nim: string;
  fullName: string;
  email: string;
  phone: string | null;
  personalEmail: string | null;
  photoUrl: string | null;
  prodiCode: string;
  prodiName: string;
  facultyCode: string;
  facultyName: string;
  academicYearCode: string;
  entryType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** IP per semester untuk grafik */
export interface SemesterIps {
  semesterId: number;
  semesterCode: string;
  semesterName: string;
  ips: number;
  sksLulus: number;
  sksDiambil: number;
}

/** Dosen Profile — detail dosen untuk halaman Profile dosen */
export interface LecturerProfile {
  id: number;
  nik: string;
  nidn: string | null;
  photoUrl: string | null;
  phone: string | null;
  personalEmail: string | null;
  fullName: string;
  email: string;
  facultyName: string;
  facultyCode: string;
  prodiName: string;
  prodiCode: string;
}

/** Input update profil dosen (HANYA field yang bisa diedit mahasiswa/dosen sendiri) */
export interface UpdateLecturerProfileInput {
  phone?: string | null;
  personalEmail?: string | null;
  photoUrl?: string | null;
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
  /** Pesan saat status closed (backend: "Tidak ada periode KRS yang sedang buka"). */
  message?: string;
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
  /** Nama dosen pengampu (keluhan #29/#30 — grouping & kartu matkul). */
  lecturerName: string | null;
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
  /** Nama dosen pengampu (keluhan #29/#30); opsional utk kompatibilitas item lama. */
  lecturerName?: string | null;
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
  /** true jika matkul diulang dan BUKAN nilai terbaik (hanya di transkrip) */
  isRepeated?: boolean;
}

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

export interface CreateUserByNimNikInput {
  roleCode: 'mahasiswa' | 'dosen';
  /** mahasiswa → NIM; dosen → NIK. Lookup master data; password awal = NIM/NIK. */
  nim?: string;
  nik?: string;
  isWali?: boolean;
}

export interface CreateUserManualInput {
  roleCode: 'admin_akademik' | 'admin_keuangan' | 'admin_sistem';
  email: string;
  password: string;
  fullName: string;
  isWali?: boolean;
}

export type CreateUserInput = CreateUserByNimNikInput | CreateUserManualInput;

/** GET /users/lookup — preview auto-fill form Buat User (NIM/NIK → data master). */
export interface UserCreateLookup {
  found: boolean;
  userId?: number;
  nim?: string | null;
  nik?: string | null;
  fullName?: string;
  email?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
  prodiCode?: string;
  prodiName?: string;
}

export interface UpdateRoleInput {
  roleCode: 'mahasiswa' | 'dosen' | 'admin_akademik' | 'admin_keuangan' | 'admin_sistem';
  isWali: boolean;
}

// ==== #16 Master Data (admin_sistem) ====

export interface MasterStudent {
  id: number;
  nim: string;
  fullName: string;
  email: string;
  userActive: boolean;
  prodiCode: string;
  prodiName: string;
  angkatan: string;
  status: string;
}

export interface MasterLecturer {
  id: number;
  nidn: string;
  fullName: string;
  email: string;
  userActive: boolean;
  isWali: boolean;
  prodiCode: string;
  prodiName: string;
  employmentType: string;
}

export interface MasterListResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface CreateMasterStudentInput {
  nim: string;
  fullName: string;
  prodiCode: string;
  angkatan: string;
  email?: string;
}

export interface UpdateMasterStudentInput {
  fullName?: string;
  prodiCode?: string;
  angkatan?: string;
  email?: string;
  isActive?: boolean;
}

export interface CreateMasterLecturerInput {
  nidn: string;
  fullName: string;
  prodiCode: string;
  email?: string;
}

export interface UpdateMasterLecturerInput {
  fullName?: string;
  prodiCode?: string;
  email?: string;
  isActive?: boolean;
}

/* ==== #16 Master Data — Fakultas & Prodi (admin_sistem) ==== */

export interface Faculty {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Prodi {
  id: number;
  code: string;
  name: string;
  facultyId: number;
  facultyCode: string;
  facultyName: string;
  degree: string;
  accreditation: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFacultyInput {
  code: string;
  name: string;
  isActive?: boolean;
}

export interface UpdateFacultyInput {
  code?: string;
  name?: string;
  isActive?: boolean;
}

export interface CreateProdiInput {
  code: string;
  name: string;
  facultyCode: string;
  degree: 'S1' | 'S2' | 'S3' | 'D3' | 'D4';
  accreditation?: string;
  isActive?: boolean;
}

export interface UpdateProdiInput {
  code?: string;
  name?: string;
  facultyCode?: string;
  degree?: 'S1' | 'S2' | 'S3' | 'D3' | 'D4';
  accreditation?: string;
  isActive?: boolean;
}

export interface ImportResult {
  filename: string;
  total: number;
  inserted: number;
  updated: number;
  failed: Array<{ row: number; reason: string }>;
}

// ==== #5/#26 (Gelombang 3): Edit Profil — PUT /users/me/contact ====

export interface UpdateContactInput {
  fullName?: string;
  email?: string;
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

/* ==== T2.6 — Finance / Payment ==== */

export type PaymentStatus = 'belum_lunas' | 'partial' | 'lunas';

export interface PaymentItem {
  id?: number;
  type: string;
  description: string;
  amount: number;
  isMandatory: boolean;
}

export interface Payment {
  id: number;
  studentId: number;
  nim: string;
  fullName: string;
  prodiId: number;
  prodiName: string;
  semesterId: number;
  semesterCode: string;
  semesterName: string;
  totalAmount: number;
  paidAmount: number;
  status: PaymentStatus;
  dueDate: string;
  isWaived: boolean;
  waivedReason: string | null;
  proofUrl: string | null;
  createdAt: string;
  updatedAt: string;
  items: PaymentItem[];
}

export interface PaymentsResponse {
  items: Payment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** Opsi semester utk dropdown filter (GET /finance/semesters). */
export interface SemesterOption {
  id: number;
  code: string;
  name: string;
}
export type MyPayment = Payment;

export interface KrsAccessResult {
  canAccess: boolean;
  payment: {
    status: PaymentStatus;
    totalAmount: number;
    paidAmount: number;
    dueDate: string;
  } | null;
}

export interface StudentPaymentGroup {
  studentId: number;
  nim: string;
  fullName: string;
  prodiId: number;
  prodiName: string;
  totalSemesters: number;
  totalPaid: number;
  totalTagihan: number;
  allLunas: boolean;
}

export interface UpdatePaymentInput {
  paidAmount: number;
  proofUrl?: string | null;
}

/* ==== T2.5 — Notifikasi ==== */

export interface AppNotification {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  items: AppNotification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/* ==== Announcements (Informasi Penting) ==== */

export interface Announcement {
  id: number;
  title: string;
  message: string;
  targetRoles: string[];
  priority: number;
  isActive: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementsResponse {
  items: Announcement[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface CreateAnnouncementInput {
  title: string;
  message: string;
  targetRoles: string[];
  priority?: number;
  isActive?: boolean;
  publishedAt?: string | null;
  expiresAt?: string | null;
}

/* ==== T3.2 & Dosen Modules ==== */

export interface ClassSchedule {
  id: number;
  classCode: string;
  course: { code: string; name: string; credits: number };
  room: string | null;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  enrolledCount: number;
  meetingNumber: number;
}

export interface ClaimableClass {
  id: number;
  classCode: string;
  course: { code: string; name: string; credits: number };
  semesterCode: string;
  capacity: number;
  currentEnrolled: number;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
}

export interface ClaimableClassResponse {
  items: ClaimableClass[];
}

export interface MyClassesResponse {
  items: ClassSchedule[];
}

export interface SalarySlip {
  id: number;
  period: string;
  basicSalary: number;
  honorarium: number;
  totalAmount: number;
  status: 'draft' | 'approved' | 'paid';
  paidAt: string | null;
}

export interface SalarySlipsResponse {
  items: SalarySlip[];
}

export interface PayrollsResponse {
  items: unknown[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface LecturersResponse {
  items: unknown[];
}

export interface ScheduleAvailability {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface AttendanceSession {
  id: number;
  classId: number;
  meetingNumber: number;
  date: string;
  topic: string | null;
  status: 'open' | 'closed';
}

export interface CreateAttendanceInput {
  classId: number;
  meetingNumber: number;
  topic?: string;
}

export interface AttendanceRecordsResponse {
  session: AttendanceSession;
  records: Array<{
    studentId: number;
    nim: string;
    fullName: string;
    status: 'hadir' | 'izin' | 'sakit' | 'alpa';
    notes: string | null;
  }>;
}

export interface UpdateAttendanceRecordInput {
  status: 'hadir' | 'izin' | 'sakit' | 'alpa';
  notes?: string;
}

export interface AttendanceRecapResponse {
  items: unknown[];
}

export interface Mentee {
  studentId: number;
  nim: string;
  studentName: string;
  email: string;
  status: string;
  prodiCode: string;
  fullName?: string;
  prodiName?: string;
  currentSemester?: number;
  ipk?: number;
}

export interface GuidanceSession {
  id: number;
  studentId: number;
  date: string;
  notes: string;
}

export interface CreateGuidanceInput {
  studentId: number;
  date: string;
  notes: string;
}

export interface SubstituteRequest {
  id: number;
  classId: number;
  targetDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface SubstituteRequestResponse {
  items: SubstituteRequest[];
}

export interface CreateSubstituteInput {
  classId: number;
  targetDate: string;
  reason: string;
}

export interface GradesClassResponse {
  items: unknown[];
}

export interface GradeInput {
  studentId: number;
  tugasScore?: number;
  utsScore?: number;
  uasScore?: number;
}

export interface LecturerCourseAvailable {
  id: number;
  courseCode: string;
  courseName: string;
  credits: number;
  curriculum_id?: number;
  selection_status?: string;
}

export interface LecturerCourseAvailableResponse {
  items: LecturerCourseAvailable[];
}

export interface CourseSelectionInput {
  classIds: number[];
}

export interface CourseSelectionResult {
  success: boolean;
  message?: string;
}

export interface MyCourseSelection {
  id: number;
  classId: number;
  status: 'pending' | 'approved' | 'rejected';
}

export interface MyCourseSelectionsResponse {
  items: MyCourseSelection[];
}

export interface CourseSelectionForReview {
  id: number;
  lecturerId: number;
  nik: string;
  lecturerName: string;
  prodiName: string;
  courseCode: string;
  courseName: string;
  credits: number;
  semesterNumber: number;
  semesterCode: string;
  isMandatory: boolean;
  priority: number;
  status: 'belum_diajukan' | 'diajukan' | 'diterima' | 'ditolak';
  reviewedByName: string | null;
  reviewedAt: string | null;
  nidn?: string;
  notes?: string;
}

export interface CourseSelectionsForReviewResponse {
  items: CourseSelectionForReview[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/* ==== Skripsi (T4 & T5) ==== */

export interface SkripsiProposal {
  id: number;
  studentId: number;
  nim: string;
  fullName: string;
  studentName: string;
  prodiName: string;
  title: string;
  status: SkripsiProposalStatus;
  statusNotes: string | null;
  abstract: string | null;
  proposalFile: string | null;
  submissionDate: string;
  approvalDate: string | null;
  createdAt: string;
  supervisors?: SkripsiSupervisor[];
}

export type SkripsiProposalStatus =
  | 'draft'
  | 'diajukan'
  | 'dilihat_dosen'
  | 'disetujui_dosen'
  | 'ditolak_dosen'
  | 'disetujui_admin'
  | 'ditolak_admin'
  | 'dalam_bimbingan'
  | 'siap_sidang'
  | 'lulus'
  | 'tidak_lulus';

export type SkripsiStatus = SkripsiProposalStatus;

export interface SkripsiProposalsResponse {
  items: SkripsiProposal[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SkripsiGuidanceLog {
  id: number;
  proposalId: number;
  date: string;
  notes: string;
  isFinal: boolean;
  createdAt: string;
}

export interface CreateSkripsiGuidanceLogInput {
  date: string;
  notes: string;
  isFinal?: boolean;
}

export interface SkripsiEligibility {
  eligible: boolean;
  reason?: string;
  totalSks: number;
  currentSemester: number;
}

export interface SkripsiStatusHistory {
  id: number;
  status: string;
  notes: string | null;
  changedByName: string;
  changedAt: string;
}

export interface SkripsiSupervisor {
  id: number;
  fullName: string;
  nidn: string;
}
