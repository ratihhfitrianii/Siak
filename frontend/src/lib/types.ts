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
}

/* ==== T3.8 — Dosen API Types ==== */

// Dosen Pilih MK
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

// Jadwal (Schedule)
export interface ScheduleItem {
  id: number;
  classId: number;
  classCode: string;
  courseCode: string;
  courseName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  lecturerId: number | null;
}

export interface ScheduleResponse {
  items: ScheduleItem[];
}

export interface CreateScheduleInput {
  classId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string;
}

// Absensi
export interface AttendanceSession {
  id: number;
  classId: number;
  classCode: string;
  courseCode: string;
  courseName: string;
  sessionDate: string;
  topic: string;
  material: string;
  createdAt: string;
}

export interface AttendanceSessionResponse {
  items: AttendanceSession[];
}

export interface CreateAttendanceInput {
  classId: number;
  sessionDate: string;
  topic: string;
  material: string;
}

export interface AttendanceRecord {
  id: number;
  sessionId: number;
  studentId: number;
  nim: string;
  studentName: string;
  status: 'hadir' | 'tidak_hadir';
  createdAt: string;
}

export interface AttendanceRecordsResponse {
  items: AttendanceRecord[];
}

export interface SubmitAttendanceInput {
  sessionId: number;
  records: Array<{ studentId: number; status: 'hadir' | 'tidak_hadir' }>;
}

// Bimbingan
export interface GuidanceSession {
  id: number;
  studentId: number;
  nim: string;
  studentName: string;
  lecturerId: number;
  type: string;
  date: string;
  description: string;
  createdAt: string;
}

export interface GuidanceSessionResponse {
  items: GuidanceSession[];
}

export interface CreateGuidanceInput {
  studentId: number;
  type: string;
  date: string;
  description: string;
}

// Substitute
export interface SubstituteRequest {
  id: number;
  originalLecturerId: number;
  originalLecturerName: string;
  substituteLecturerId: number | null;
  substituteLecturerName: string | null;
  classId: number;
  classCode: string;
  courseCode: string;
  courseName: string;
  sessionDate: string;
  type: string;
  status: string;
  notes: string | null;
  createdAt: string;
}

export interface SubstituteRequestResponse {
  items: SubstituteRequest[];
}

export interface CreateSubstituteInput {
  originalLecturerId: number;
  substituteLecturerId: number;
  classId: number;
  sessionDate: string;
  type: string;
  notes?: string;
}

// Grades (sudah ada GradeItem di T1.11b, tambahkan remedial per komponen)
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
  // T3.6 remedial per komponen
  remedialTugasScore: number | null;
  remedialUtsScore: number | null;
  remedialUasScore: number | null;
  // Student info (from joins in backend)
  nim: string;
  studentName: string;
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

export interface GradesClassResponse {
  items: GradeItem[];
}
