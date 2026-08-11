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

export interface CreateMasterLecturerInput {
  nidn: string;
  fullName: string;
  prodiCode: string;
  email?: string;
}

export interface ImportResult {
  filename: string;
  total: number;
  inserted: number;
  updated: number;
  failed: Array<{ row: number; reason: string }>;
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
  createdAt: string;
  updatedAt: string;
  items: PaymentItem[];
}

export interface PaymentsResponse {
  data: Payment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// MyPayment is semantically a student's view of Payment (same shape, different permission context)
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

export interface UpdatePaymentInput {
  paidAmount: number;
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

/* ==== T3.8 — Dosen API Types (diselaraskan dengan kontrak backend nyata) ==== */

// --- Dosen Pilih MK (GET/POST /dosen/courses/*) ---
export interface LecturerCourseAvailable {
  curriculumId: number;
  courseCode: string;
  courseName: string;
  credits: number;
  semesterNumber: number;
  isMandatory: boolean;
  availableClasses: number;
  selectionStatus: 'belum_diajukan' | 'diajukan' | 'disetujui' | 'ditolak';
  priority: number | null;
  notes: string | null;
}

export interface LecturerCourseAvailableResponse {
  items: LecturerCourseAvailable[];
}

export interface CourseSelectionInput {
  curriculumId: number;
  priority: number;
  notes?: string;
}

export interface CourseSelectionResult {
  id: number;
  lecturerId: number;
  semesterId: number;
  curriculumId: number;
  status: string;
  priority: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MyCourseSelection {
  id: number;
  curriculumId: number;
  courseCode: string;
  courseName: string;
  credits: number;
  semesterNumber: number;
  isMandatory: boolean;
  semesterCode: string;
  semesterName: string;
  prodiName: string;
  status: string;
  priority: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MyCourseSelectionsResponse {
  items: MyCourseSelection[];
}

// --- Jadwal & Ketersediaan (GET /schedule/availability?date=YYYY-MM-DD) ---
export interface BusySlot {
  id: number; // schedule id — dipakai create sesi absensi / substitute
  meetingNumber: number;
  topic: string | null;
  isCompleted: boolean;
  classCode: string;
  courseCode: string;
  courseName: string;
}

export interface AvailableSlot {
  classId: number;
  classCode: string;
  startTime: string | null;
  endTime: string | null;
  courseCode: string;
  courseName: string;
  semesterNumber: number;
}

export interface ScheduleAvailability {
  date: string;
  dayOfWeek: number;
  busySlots: BusySlot[];
  availableSlots: AvailableSlot[];
  isAvailable: boolean;
}

// --- Kelas diampu dosen (GET /dosen/my-classes) ---
export interface ClassSchedule {
  id: number;
  meetingNumber: number;
  scheduledDate: string;
  topic: string | null;
  isCompleted: boolean;
}

export interface MyClass {
  id: number;
  classCode: string;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  capacity: number;
  currentEnrolled: number;
  curriculumId: number;
  semesterId: number;
  semesterNumber: number;
  courseCode: string;
  courseName: string;
  credits: number;
  schedules: ClassSchedule[];
}

export interface MyClassesResponse {
  items: MyClass[];
}

// --- Daftar dosen (GET /dosen/lecturers) — untuk substitute ---
export interface LecturerBrief {
  id: number; // lecturers.id
  userId: number;
  nidn: string;
  fullName: string;
  email: string;
  prodiCode: string;
}

export interface LecturersResponse {
  items: LecturerBrief[];
}

// --- Absensi (GET/POST /attendance/sessions, GET /attendance/sessions/:id/records, PUT /attendance/records/:id) ---
export type AttendanceStatus = 'hadir' | 'tidak_hadir' | 'izin' | 'sakit' | 'belum_absen';

export interface AttendanceSession {
  id: number;
  scheduleId: number;
  sessionDate: string;
  topic: string | null;
  isOpen: boolean;
  classCode: string;
  courseCode: string;
  courseName: string;
  meetingNumber: number;
  totalRecords: number;
  hadirCount: number;
}

export interface CreateAttendanceInput {
  scheduleId: number;
  topic: string;
}

export interface AttendanceRecordItem {
  studentId: number;
  nim: string;
  fullName: string;
  email: string;
  recordId: number | null;
  status: AttendanceStatus;
  markedAt: string | null;
  markedBy: number | null;
}

export interface AttendanceRecordsResponse {
  session: {
    id: number;
    sessionDate: string;
    topic: string | null;
    isOpen: boolean;
    qrCode: string | null;
  };
  records: AttendanceRecordItem[];
}

export interface UpdateAttendanceRecordInput {
  status: 'hadir' | 'tidak_hadir' | 'izin' | 'sakit';
}

// --- Bimbingan (GET /guidance/mentees, GET/POST /guidance/sessions) ---
export interface Mentee {
  studentId: number;
  nim: string;
  studentName: string;
  email: string;
  status: string;
  prodiCode: string;
}

export interface GuidanceSession {
  id: number;
  studentId: number;
  nim: string;
  studentName: string;
  lecturerId: number;
  lecturerName: string;
  sessionDate: string;
  notes: string | null;
  progress: 'berjalan' | 'selesai' | 'bermasalah';
  isVisibleToStudent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGuidanceInput {
  studentId: number;
  sessionDate: string; // YYYY-MM-DD
  progress: 'berjalan' | 'selesai' | 'bermasalah';
  notes?: string;
}

// --- Substitute (GET/POST /substitute) ---
export interface SubstituteRequest {
  id: number;
  originalLecturerId: number; // lecturers.id
  originalLecturerName: string;
  substituteLecturerId: number | null;
  substituteLecturerName: string | null;
  classId: number;
  classCode: string;
  scheduleId: number;
  meetingNumber: number;
  scheduledDate: string;
  topic: string | null;
  courseCode: string;
  courseName: string;
  reason: string | null;
  status: 'active' | 'cancelled';
  requestedByName: string;
  approvedByName: string | null;
  createdAt: string;
}

export interface SubstituteRequestResponse {
  items: SubstituteRequest[];
}

export interface CreateSubstituteInput {
  originalLecturerId: number;
  substituteLecturerId: number;
  classId: number;
  scheduleId: number;
  reason?: string;
}

// --- Nilai per kelas (GET /grades/class/:classId, POST /grades) ---
export interface GradeClassItem {
  id: number;
  krsItemId: number;
  tugasScore: number | null;
  utsScore: number | null;
  uasScore: number | null;
  finalScore: number | null;
  gradeLetter: string | null;
  gradePoint: number | null;
  remedialTugasScore: number | null;
  remedialUtsScore: number | null;
  remedialUasScore: number | null;
  inputBy: number;
  inputAt: string;
  updatedBy: number | null;
  updatedAt: string | null;
  student: { nim: string; name: string };
}

export interface GradesClassResponse {
  class: { id: number; classCode: string; courseCode: string; courseName: string };
  items: GradeClassItem[];
}

export interface GradeInput {
  krsItemId: number;
  tugasScore: number | null;
  utsScore: number | null;
  uasScore: number | null;
  remedialTugasScore: number | null;
  remedialUtsScore: number | null;
  remedialUasScore: number | null;
}
