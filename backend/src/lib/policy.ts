/**
 * Policy Service — Single Source of Truth RBAC (docs/02 §6.1).
 * Matriks 6 kolom (5 tipe akun + atribut Wali). Setiap sel ✅ di-enforce di sini,
 * lalu middleware `authorizePermission` memakainya di route.
 *
 * Atribut Wali (is_wali) hanya bermakna untuk role `dosen` (DL-08).
 * UI hanya cermin — backend otoritas final (AC-10).
 */

export type RoleCode = 'mahasiswa' | 'dosen' | 'admin_akademik' | 'admin_keuangan' | 'admin_sistem';

export const ROLE_CODES: RoleCode[] = [
  'mahasiswa',
  'dosen',
  'admin_akademik',
  'admin_keuangan',
  'admin_sistem',
];

/** Nama permission = sel baris pada matriks §6.1 (untuk RBAC UI: menu key). */
export const PERMISSIONS = [
  'auth.profile', // Login / Profil
  'user.edit_contact', // Edit Kontak
  'transcript.view_own', // Lihat Transkrip / IPK sendiri
  'transcript.view_mentee', // Lihat Transkrip binaan
  'transcript.download', // Unduh Transkrip
  'krs.fill', // Isi KRS (syarat lunas)
  'krs.view_classes', // Lihat Kelas Tersedia
  'krs.approve', // Approve/Reject KRS
  'class.view_students', // Lihat daftar mhs di kelasnya
  'grade.input', // Input Nilai
  'grade.edit', // Edit Nilai (atribusi wajib)
  'lecturer.select_course', // Pilih MK (filter prodi)
  'lecturer.availability', // Ketersediaan Jadwal
  'attendance.input', // Absensi (wajib materi)
  'guidance.manage', // Bimbingan (catatan)
  'substitute.manage', // Substitute Teaching
  'payroll.view', // Lihat Payroll
  'payroll.input', // Input Payroll
  'payment.generate', // Generate Tagihan
  'payment.update', // Update Status Bayar
  'user.manage', // User Management (CRUD)
  'audit.view', // Audit Log View
  'import.data', // Impor Data
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Matriks RBAC (docs/02 §6.1) — direpresentasikan sebagai role → set permission.
 * Sel ⚠️ (asumsi, mis. transcript.view_mentee) tidak dimasukkan sampai dikonfirmasi;
 * Admin Akademik dapat akses via admin_sistem-style pengecualian di policy bila perlu.
 */
const ROLE_PERMISSIONS: Record<RoleCode, ReadonlySet<Permission>> = {
  mahasiswa: new Set([
    'auth.profile',
    'user.edit_contact',
    'transcript.view_own',
    'transcript.download',
    'krs.fill',
    'krs.view_classes',
    'guidance.manage',
  ]),
  dosen: new Set([
    'auth.profile',
    'transcript.view_own',
    'class.view_students',
    'grade.input',
    'grade.edit',
    'lecturer.select_course',
    'lecturer.availability',
    'attendance.input',
    'substitute.manage',
    'payroll.view',
  ]),
  admin_akademik: new Set([
    'auth.profile',
    'transcript.view_own',
    'transcript.view_mentee',
    'transcript.download',
    'krs.view_classes',
    'krs.approve',
    'class.view_students',
    'grade.input',
    'grade.edit',
    'attendance.input',
    'guidance.manage',
    'substitute.manage',
    'audit.view',
  ]),
  admin_keuangan: new Set([
    'auth.profile',
    'transcript.view_own',
    'payroll.view',
    'payroll.input',
    'payment.generate',
    'payment.update',
    'audit.view',
  ]),
  admin_sistem: new Set([
    'auth.profile',
    'user.edit_contact',
    'transcript.view_own',
    'transcript.view_mentee',
    'transcript.download',
    'krs.fill',
    'krs.view_classes',
    'krs.approve',
    'class.view_students',
    'grade.input',
    'grade.edit',
    'lecturer.select_course',
    'lecturer.availability',
    'attendance.input',
    'guidance.manage',
    'substitute.manage',
    'payroll.view',
    'payroll.input',
    'payment.generate',
    'payment.update',
    'user.manage',
    'audit.view',
    'import.data',
  ]),
};

/** Superuser = Admin Sistem (superuser per DL-08). */
export function isSuperuser(roleCode: string): boolean {
  return roleCode === 'admin_sistem';
}

/** Cek akses satu permission. */
export function can(roleCode: string, permission: Permission): boolean {
  if (isSuperuser(roleCode)) return true;
  const set = ROLE_PERMISSIONS[roleCode as RoleCode];
  return set ? set.has(permission) : false;
}

/** Ambil semua permission yang boleh diakses suatu role (untuk GET /users/me → menu). */
export function permissionsFor(roleCode: string): Permission[] {
  return PERMISSIONS.filter((p) => can(roleCode, p));
}

/** Wali = atribut; hanya bermakna untuk role dosen (DL-08, Confirmed Fact #16). */
export function isWaliRole(roleCode: string, isWali: boolean): boolean {
  return roleCode === 'dosen' && isWali;
}
