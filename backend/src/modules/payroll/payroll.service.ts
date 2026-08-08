/**
 * Payroll Service — T4.4 (F-26, K-05).
 * 
 * Skema Honor: Honor Tetap Bulanan + Honor per Sesi Mengajar (absensi completed) 
 * + Honor Substitute + Honor Bimbingan.
 */

import { pgPool } from '../../lib/pg';
import { logger } from '../../lib/logger';
import { AppError } from '../../middleware/error-handler';

export interface PayrollConfig {
  /** Honor tetap bulanan untuk dosen TETAP */
  baseSalaryTetap: number;
  /** Honor tetap bulanan untuk dosen KONTRAK */
  baseSalaryKontrak: number;
  /** Honor per pertemuan mengajar (completed attendance) */
  honorPerMeeting: number;
  /** Honor per sesi substitute */
  honorPerSubstitute: number;
  /** Honor per sesi bimbingan */
  honorPerGuidance: number;
}

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  baseSalaryTetap: 5_000_000,    // 5 juta/bulan
  baseSalaryKontrak: 3_000_000,  // 3 juta/bulan
  honorPerMeeting: 100_000,       // 100 ribu/pertemuan
  honorPerSubstitute: 150_000,    // 150 ribu/sesi
  honorPerGuidance: 75_000,       // 75 ribu/sesi
};

export interface PayrollItem {
  id: number;
  lecturerId: number;
  periodStart: string;
  periodEnd: string;
  baseSalary: number;
  honorPerMeeting: number;
  totalMeetings: number;
  totalHonor: number;
  deductions: number;
  netAmount: number;
  status: 'draft' | 'approved' | 'paid';
  inputBy: number;
  approvedBy?: number;
  approvedAt?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Detail breakdown */
  breakdown?: PayrollBreakdown;
}

export interface PayrollBreakdown {
  /** Detail pertemuan mengajar */
  meetings: Array<{
    scheduleId: number;
    classCode: string;
    courseName: string;
    meetingNumber: number;
    scheduledDate: string;
    completed: boolean;
  }>;
  /** Detail substitute */
  substitutes: Array<{
    id: number;
    originalLecturer: string;
    classCode: string;
    scheduledDate: string;
  }>;
  /** Detail bimbingan */
  guidance: Array<{
    id: number;
    studentNim: string;
    studentName: string;
    sessionDate: string;
    progress: string;
  }>;
  /** Summary */
  summary: {
    baseSalary: number;
    honorMeetings: number;
    honorSubstitutes: number;
    honorGuidance: number;
    totalHonor: number;
    deductions: number;
    netAmount: number;
  };
}

/**
 * Generate payroll for a lecturer for a given period.
 * Uses attendance (completed sessions), substitute, and guidance data.
 */
export async function generatePayroll(
  lecturerId: number,
  periodStart: string, // YYYY-MM-DD
  periodEnd: string,   // YYYY-MM-DD
  inputBy: number,
  config: PayrollConfig = DEFAULT_PAYROLL_CONFIG
): Promise<PayrollItem> {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    
    // Get lecturer info
    const lecturerRes = await client.query(
      `SELECT l.id, l.user_id, l.employment_type, u.full_name 
       FROM lecturers l JOIN users u ON u.id = l.user_id 
       WHERE l.id = $1`,
      [lecturerId]
    );
    if (lecturerRes.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Lecturer not found', 404);
    }
    const lecturer = lecturerRes.rows[0];
    
    // Determine base salary by employment type
    const baseSalary = lecturer.employment_type === 'tetap' 
      ? config.baseSalaryTetap 
      : config.baseSalaryKontrak;
    
    // 1. Count completed meetings (attendance sessions linked to schedules)
    const meetingsRes = await client.query(
      `SELECT s.id as schedule_id, c.class_code, cr.course_name, s.meeting_number, 
              s.scheduled_date, s.is_completed
       FROM schedules s
       JOIN classes c ON c.id = s.class_id
       JOIN curriculums cr ON cr.id = c.curriculum_id
       WHERE c.lecturer_id = (SELECT user_id FROM lecturers WHERE id = $1)
         AND s.scheduled_date BETWEEN $2 AND $3
         AND s.is_completed = true
       ORDER BY s.scheduled_date`,
      [lecturerId, periodStart, periodEnd]
    );
    const totalMeetings = meetingsRes.rows.length;
    const honorMeetings = totalMeetings * config.honorPerMeeting;
    
    // 2. Count substitute sessions (where this lecturer is the substitute)
    const substituteRes = await client.query(
      `SELECT st.id, l2.user_id as original_user_id, u2.full_name as original_name,
              c.class_code, s.scheduled_date
       FROM substitute_teaching st
       JOIN schedules s ON s.id = st.schedule_id
       JOIN classes c ON c.id = s.class_id
       JOIN lecturers l2 ON l2.id = st.original_lecturer_id
       JOIN users u2 ON u2.id = l2.user_id
       WHERE st.substitute_lecturer_id = $1
         AND s.scheduled_date BETWEEN $2 AND $3
         AND st.status = 'approved'
       ORDER BY s.scheduled_date`,
      [lecturerId, periodStart, periodEnd]
    );
    const totalSubstitutes = substituteRes.rows.length;
    const honorSubstitutes = totalSubstitutes * config.honorPerSubstitute;
    
    // 3. Count guidance sessions
    const guidanceRes = await client.query(
      `SELECT gs.id, s.nim, u.full_name as student_name, gs.session_date, gs.progress
       FROM guidance_sessions gs
       JOIN students s ON s.id = gs.student_id
       JOIN users u ON u.id = s.user_id
       WHERE gs.lecturer_id = $1
         AND gs.session_date BETWEEN $2 AND $3
       ORDER BY gs.session_date`,
      [lecturerId, periodStart, periodEnd]
    );
    const totalGuidance = guidanceRes.rows.length;
    const honorGuidance = totalGuidance * config.honorPerGuidance;
    
    const totalHonor = honorMeetings + honorSubstitutes + honorGuidance;
    const netAmount = baseSalary + totalHonor; // deductions default 0
    
    // Insert payroll record
    const payrollRes = await client.query(
      `INSERT INTO payrolls 
        (lecturer_id, period_start, period_end, base_salary, honor_per_meeting, 
         total_meetings, total_honor, deductions, net_amount, status, input_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10)
       ON CONFLICT (lecturer_id, period_start, period_end) 
       DO UPDATE SET 
         base_salary = EXCLUDED.base_salary,
         honor_per_meeting = EXCLUDED.honor_per_meeting,
         total_meetings = EXCLUDED.total_meetings,
         total_honor = EXCLUDED.total_honor,
         deductions = EXCLUDED.deductions,
         net_amount = EXCLUDED.net_amount,
         input_by = EXCLUDED.input_by,
         updated_at = now()
       RETURNING *`,
      [lecturerId, periodStart, periodEnd, baseSalary, config.honorPerMeeting,
       totalMeetings, totalHonor, 0, netAmount, inputBy]
    );
    
    const payroll = payrollRes.rows[0];
    
    await client.query('COMMIT');
    
    return formatPayrollItem(payroll, {
      meetings: meetingsRes.rows,
      substitutes: substituteRes.rows,
      guidance: guidanceRes.rows,
      summary: {
        baseSalary,
        honorMeetings,
        honorSubstitutes,
        honorGuidance,
        totalHonor,
        deductions: 0,
        netAmount,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get payroll detail with breakdown.
 */
export async function getPayrollDetail(payrollId: number): Promise<PayrollItem | null> {
  const payrollRes = await pgPool.query(
    `SELECT p.*, l.user_id as lecturer_user_id, l.employment_type, u.full_name as lecturer_name
     FROM payrolls p
     JOIN lecturers l ON l.id = p.lecturer_id
     JOIN users u ON u.id = l.user_id
     WHERE p.id = $1`,
    [payrollId]
  );
  if (payrollRes.rows.length === 0) return null;
  
  const payroll = payrollRes.rows[0];
  
  // Fetch breakdown data
  const breakdown = await getPayrollBreakdown(payroll.lecturer_id, payroll.period_start, payroll.period_end);
  
  return formatPayrollItem(payroll, breakdown);
}

/**
 * List payrolls with filters.
 */
export async function listPayrolls(filters: {
  lecturerId?: number;
  periodStart?: string;
  periodEnd?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: PayrollItem[]; total: number; page: number; limit: number; totalPages: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const offset = (page - 1) * limit;
  
  let where = 'WHERE 1=1';
  const params: (string | number)[] = [];
  let paramIdx = 1;
  
  if (filters.lecturerId) {
    where += ` AND p.lecturer_id = $${paramIdx++}`;
    params.push(filters.lecturerId);
  }
  if (filters.periodStart) {
    where += ` AND p.period_start >= $${paramIdx++}`;
    params.push(filters.periodStart);
  }
  if (filters.periodEnd) {
    where += ` AND p.period_end <= $${paramIdx++}`;
    params.push(filters.periodEnd);
  }
  if (filters.status) {
    where += ` AND p.status = $${paramIdx++}`;
    params.push(filters.status);
  }
  
  const countSql = `SELECT COUNT(*) FROM payrolls p ${where}`;
  const countRes = await pgPool.query(countSql, params);
  const total = parseInt(countRes.rows[0].count, 10);
  
  const dataSql = `
    SELECT p.*, l.user_id as lecturer_user_id, u.full_name as lecturer_name, l.employment_type
    FROM payrolls p
    JOIN lecturers l ON l.id = p.lecturer_id
    JOIN users u ON u.id = l.user_id
    ${where}
    ORDER BY p.period_start DESC, p.lecturer_id
    LIMIT $${paramIdx++} OFFSET $${paramIdx}
  `;
  params.push(limit, offset);
  const dataRes = await pgPool.query(dataSql, params);
  
  // Fetch breakdowns for each (batch)
  const items: PayrollItem[] = [];
  for (const row of dataRes.rows) {
    const breakdown = await getPayrollBreakdown(row.lecturer_id, row.period_start, row.period_end);
    items.push(formatPayrollItem(row, breakdown));
  }
  
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Approve payroll (admin keuangan).
 */
export async function approvePayroll(payrollId: number, approvedBy: number): Promise<PayrollItem> {
  const res = await pgPool.query(
    `UPDATE payrolls 
     SET status = 'approved', approved_by = $1, approved_at = now(), updated_at = now()
     WHERE id = $2 AND status = 'draft'
     RETURNING *`,
    [approvedBy, payrollId]
  );
  if (res.rows.length === 0) {
    throw new AppError('NOT_FOUND', 'Payroll not found or not in draft status', 404);
  }
  const payroll = res.rows[0];
  const breakdown = await getPayrollBreakdown(payroll.lecturer_id, payroll.period_start, payroll.period_end);
  return formatPayrollItem(payroll, breakdown);
}

/**
 * Mark payroll as paid.
 */
export async function payPayroll(payrollId: number): Promise<PayrollItem> {
  const res = await pgPool.query(
    `UPDATE payrolls 
     SET status = 'paid', paid_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'approved'
     RETURNING *`,
    [payrollId]
  );
  if (res.rows.length === 0) {
    throw new AppError('NOT_FOUND', 'Payroll not found or not approved', 404);
  }
  const payroll = res.rows[0];
  const breakdown = await getPayrollBreakdown(payroll.lecturer_id, payroll.period_start, payroll.period_end);
  return formatPayrollItem(payroll, breakdown);
}

/**
 * Batch generate payroll for all active lecturers for a period.
 */
export async function batchGeneratePayroll(
  periodStart: string,
  periodEnd: string,
  inputBy: number,
  config: PayrollConfig = DEFAULT_PAYROLL_CONFIG
): Promise<PayrollItem[]> {
  const lecturersRes = await pgPool.query(
    `SELECT id FROM lecturers WHERE is_active = true`
  );
  
  const results: PayrollItem[] = [];
  for (const lecturer of lecturersRes.rows) {
    try {
      const payroll = await generatePayroll(lecturer.id, periodStart, periodEnd, inputBy, config);
      results.push(payroll);
    } catch (err) {
      logger.warn({ err, lecturerId: lecturer.id }, 'Failed to generate payroll');
    }
  }
  return results;
}

/** Helper: get breakdown data for a lecturer-period */
async function getPayrollBreakdown(
  lecturerId: number,
  periodStart: string,
  periodEnd: string
): Promise<PayrollBreakdown> {
  // Meetings
  const meetingsRes = await pgPool.query(
    `SELECT s.id as schedule_id, c.class_code, cr.course_name, s.meeting_number, 
            s.scheduled_date, s.is_completed
     FROM schedules s
     JOIN classes c ON c.id = s.class_id
     JOIN curriculums cr ON cr.id = c.curriculum_id
     WHERE c.lecturer_id = (SELECT user_id FROM lecturers WHERE id = $1)
       AND s.scheduled_date BETWEEN $2 AND $3
       AND s.is_completed = true
     ORDER BY s.scheduled_date`,
    [lecturerId, periodStart, periodEnd]
  );
  
  // Substitutes
  const substituteRes = await pgPool.query(
    `SELECT st.id, u2.full_name as original_name, c.class_code, s.scheduled_date
     FROM substitute_teaching st
     JOIN schedules s ON s.id = st.schedule_id
     JOIN classes c ON c.id = s.class_id
     JOIN lecturers l2 ON l2.id = st.original_lecturer_id
     JOIN users u2 ON u2.id = l2.user_id
     WHERE st.substitute_lecturer_id = $1
       AND s.scheduled_date BETWEEN $2 AND $3
       AND st.status = 'approved'
     ORDER BY s.scheduled_date`,
    [lecturerId, periodStart, periodEnd]
  );
  
  // Guidance
  const guidanceRes = await pgPool.query(
    `SELECT gs.id, s.nim, u.full_name as student_name, gs.session_date, gs.progress
     FROM guidance_sessions gs
     JOIN students s ON s.id = gs.student_id
     JOIN users u ON u.id = s.user_id
     WHERE gs.lecturer_id = $1
       AND gs.session_date BETWEEN $2 AND $3
     ORDER BY gs.session_date`,
    [lecturerId, periodStart, periodEnd]
  );
  
  // Calculate summary
  const honorPerMeeting = DEFAULT_PAYROLL_CONFIG.honorPerMeeting;
  const honorPerSubstitute = DEFAULT_PAYROLL_CONFIG.honorPerSubstitute;
  const honorPerGuidance = DEFAULT_PAYROLL_CONFIG.honorPerGuidance;
  
  // Get base salary from latest payroll or config
  const payrollRes = await pgPool.query(
    `SELECT base_salary, honor_per_meeting, total_honor, deductions, net_amount
     FROM payrolls 
     WHERE lecturer_id = $1 AND period_start = $2 AND period_end = $3
     ORDER BY created_at DESC LIMIT 1`,
    [lecturerId, periodStart, periodEnd]
  );
  
  const baseSalary = payrollRes.rows[0]?.base_salary ?? 
    (await pgPool.query(`SELECT employment_type FROM lecturers WHERE id = $1`, [lecturerId]))
      .rows[0]?.employment_type === 'tetap' 
      ? DEFAULT_PAYROLL_CONFIG.baseSalaryTetap 
      : DEFAULT_PAYROLL_CONFIG.baseSalaryKontrak;
  
  const totalMeetings = meetingsRes.rows.length;
  const totalSubstitutes = substituteRes.rows.length;
  const totalGuidance = guidanceRes.rows.length;
  
  const honorMeetings = totalMeetings * honorPerMeeting;
  const honorSubstitutes = totalSubstitutes * honorPerSubstitute;
  const honorGuidance = totalGuidance * honorPerGuidance;
  const totalHonor = honorMeetings + honorSubstitutes + honorGuidance;
  const netAmount = Number(baseSalary) + totalHonor;
  
  return {
    meetings: meetingsRes.rows.map(r => ({
      scheduleId: r.schedule_id,
      classCode: r.class_code,
      courseName: r.course_name,
      meetingNumber: r.meeting_number,
      scheduledDate: r.scheduled_date,
      completed: r.is_completed,
    })),
    substitutes: substituteRes.rows.map(r => ({
      id: r.id,
      originalLecturer: r.original_name,
      classCode: r.class_code,
      scheduledDate: r.scheduled_date,
    })),
    guidance: guidanceRes.rows.map(r => ({
      id: r.id,
      studentNim: r.nim,
      studentName: r.student_name,
      sessionDate: r.session_date,
      progress: r.progress,
    })),
    summary: {
      baseSalary: Number(baseSalary),
      honorMeetings,
      honorSubstitutes,
      honorGuidance,
      totalHonor,
      deductions: 0,
      netAmount,
    },
  };
}

/** Format DB row to PayrollItem */
function formatPayrollItem(row: Record<string, unknown>, breakdown: PayrollBreakdown): PayrollItem {
  const r = row as { 
    id: number; lecturer_id: number; period_start: string; period_end: string;
    base_salary: string | number; honor_per_meeting: string | number;
    total_meetings: number; total_honor: string | number; deductions: string | number;
    net_amount: string | number; status: string; input_by: number;
    approved_by: number | null; approved_at: string | null; paid_at: string | null;
    created_at: string; updated_at: string;
  };
  return {
    id: r.id,
    lecturerId: r.lecturer_id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    baseSalary: Number(r.base_salary),
    honorPerMeeting: Number(r.honor_per_meeting),
    totalMeetings: r.total_meetings,
    totalHonor: Number(r.total_honor),
    deductions: Number(r.deductions),
    netAmount: Number(r.net_amount),
    status: r.status as 'draft' | 'approved' | 'paid',
    inputBy: r.input_by,
    approvedBy: r.approved_by ?? undefined,
    approvedAt: r.approved_at ?? undefined,
    paidAt: r.paid_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    breakdown,
  };
}