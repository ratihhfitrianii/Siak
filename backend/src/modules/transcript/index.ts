import { Router, type Request, type Response, type NextFunction } from 'express';
import { pgPool } from '../../lib/pg';
import { AppError } from '../../middleware/error-handler';
import { authenticate, authorize, authorizeWali } from '../../lib/auth-middleware';
import PDFDocument from 'pdfkit';

/**
 * Modul Transkrip — T2.4 (F-12, F-15, AC-03, AC-08)
 * - GET /transcript/my — mahasiswa lihat transkrip sendiri (permission transcript.view_own)
 * - GET /transcript/student/:studentId — dosen wali lihat binaan (transcript.view_mentee)
 * - GET /transcript/my/download — download PDF
 * - GET /transcript/student/:studentId/download — download PDF (wali)
 *
 * Skala nilai: A=4.0, A-=3.7, B+=3.3, B=3.0, B-=2.7, C+=2.3, C=2.0, D=1.0, E=0.0
 * Matkul diulang: hanya nilai terbaik masuk IPK, yang lama ditandai diulang
 */

interface GradeRow {
  id: string;
  grade_letter: string | null;
  grade_point: string | null;
  final_score: string | null;
  is_remedial: boolean;
  class_id: string;
  course_code: string;
  course_name: string;
  credits: string;
  period_name: string;
  semester_code: string;
  semester_name: string;
  semester_id: string;
  krs_period_id: string;
}

interface TranscriptCourse {
  id: number;
  courseCode: string;
  courseName: string;
  credits: number;
  semesterCode: string;
  semesterName: string;
  periodName: string;
  gradeLetter: string;
  gradePoint: number;
  finalScore: number | null;
  isRemedial: boolean;
  isRepeated: boolean; // true jika matkul ini diulang dan BUKAN nilai terbaik
  bestAttemptId: number; // id nilai terbaik untuk matkul ini
}

interface TranscriptSemester {
  semesterId: number;
  semesterCode: string;
  semesterName: string;
  courses: TranscriptCourse[];
  ips: number; // IP Semester
  sksLulus: number;
  sksDiambil: number;
}

interface TranscriptData {
  student: {
    nim: string;
    fullName: string;
    prodiCode: string;
    prodiName: string;
    academicYearCode: string;
    entryType: string;
  };
  semesters: TranscriptSemester[];
  ipk: number;
  totalSksLulus: number;
  totalSksDiambil: number;
  generatedAt: string;
}

/**
 * Ambil data transkrip lengkap untuk mahasiswa.
 * Matkul diulang: hanya grade terbaik per course_code masuk IPS/IPK,
 * attempt lama ditandai isRepeated=true (tidak dihitung).
 * Optional: filter by academicYearId (tahun akademik).
 */
async function fetchTranscriptData(
  studentId: number,
  academicYearId?: number,
): Promise<TranscriptData> {
  const studentRes = await pgPool.query(
    `SELECT s.nim, u.full_name, s.prodi_id, s.academic_year_id, s.entry_type,
            p.code as prodi_code, p.name as prodi_name, ay.code as academic_year_code
     FROM students s
     JOIN users u ON u.id = s.user_id
     JOIN prodis p ON p.id = s.prodi_id
     JOIN academic_years ay ON ay.id = s.academic_year_id
     WHERE s.id = $1`,
    [studentId],
  );
  if (studentRes.rows.length === 0) {
    throw new AppError('NOT_FOUND', 'Mahasiswa tidak ditemukan', 404);
  }
  const student = studentRes.rows[0] as {
    nim: string;
    full_name: string;
    entry_type: string;
    prodi_code: string;
    prodi_name: string;
    academic_year_code: string;
  };

  // Build academic year filter
  const ayFilter = academicYearId ? `AND s.academic_year_id = $2` : '';
  const params = academicYearId ? [studentId, academicYearId] : [studentId];

  const gradesRes = await pgPool.query(
    `SELECT g.id, g.grade_letter, g.grade_point, g.final_score, g.is_remedial,
            ki.class_id,
            cl.code as course_code, cl.name as course_name, cl.credits,
            kp.name as period_name, s.code as semester_code, s.name as semester_name, s.id as semester_id,
            ks.krs_period_id
     FROM grades g
     JOIN krs_items ki ON ki.id = g.krs_item_id
     JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
     JOIN krs_periods kp ON kp.id = ks.krs_period_id
     JOIN semesters s ON s.id = kp.semester_id
     JOIN classes c ON c.id = ki.class_id
     JOIN curricula cur ON cur.id = c.curriculum_id
     JOIN courses cl ON cl.id = cur.course_id
     WHERE ks.student_id = $1 ${ayFilter}
     ORDER BY kp.start_date DESC, cl.code`,
    params,
  );
  const rows = gradesRes.rows as unknown as GradeRow[];

  // Nilai terbaik per course_code (untuk handling matkul diulang)
  const bestByCourse = new Map<string, { gradeId: number; point: number }>();
  for (const row of rows) {
    const point = row.grade_point !== null ? Number(row.grade_point) : 0;
    const existing = bestByCourse.get(row.course_code);
    if (!existing || point > existing.point) {
      bestByCourse.set(row.course_code, { gradeId: Number(row.id), point });
    }
  }

  // Group by semester
  const semesterMap = new Map<number, TranscriptSemester>();
  for (const row of rows) {
    const semId = Number(row.semester_id);
    if (!semesterMap.has(semId)) {
      semesterMap.set(semId, {
        semesterId: semId,
        semesterCode: row.semester_code,
        semesterName: row.semester_name,
        courses: [],
        ips: 0,
        sksLulus: 0,
        sksDiambil: 0,
      });
    }
    const sem = semesterMap.get(semId)!;
    const point = row.grade_point !== null ? Number(row.grade_point) : 0;
    const best = bestByCourse.get(row.course_code)!;
    const isBest = best.gradeId === Number(row.id);
    const isRepeated = !isBest;

    sem.courses.push({
      id: Number(row.id),
      courseCode: row.course_code,
      courseName: row.course_name,
      credits: Number(row.credits),
      semesterCode: row.semester_code,
      semesterName: row.semester_name,
      periodName: row.period_name,
      gradeLetter: row.grade_letter ?? '',
      gradePoint: point,
      finalScore: row.final_score !== null ? Number(row.final_score) : null,
      isRemedial: row.is_remedial,
      isRepeated,
      bestAttemptId: best.gradeId,
    });

    // Akumulasi SKS hanya attempt terbaik
    if (isBest) {
      sem.sksDiambil += Number(row.credits);
      if (point > 0) sem.sksLulus += Number(row.credits);
    }
  }

  let totalBobot = 0;
  let totalSksLulusAll = 0;
  let totalSksDiambilAll = 0;
  const semesters: TranscriptSemester[] = [];

  for (const sem of semesterMap.values()) {
    let bobotSem = 0;
    for (const c of sem.courses) {
      if (!c.isRepeated && c.gradePoint > 0) {
        bobotSem += c.gradePoint * c.credits;
      }
    }
    sem.ips = sem.sksLulus > 0 ? Math.round((bobotSem / sem.sksLulus) * 100) / 100 : 0;

    totalBobot += bobotSem;
    totalSksLulusAll += sem.sksLulus;
    totalSksDiambilAll += sem.sksDiambil;
    semesters.push(sem);
  }

  semesters.sort((a, b) => a.semesterCode.localeCompare(b.semesterCode));
  const ipk = totalSksLulusAll > 0 ? Math.round((totalBobot / totalSksLulusAll) * 100) / 100 : 0;

  return {
    student: {
      nim: student.nim,
      fullName: student.full_name,
      prodiCode: student.prodi_code,
      prodiName: student.prodi_name,
      academicYearCode: student.academic_year_code,
      entryType: student.entry_type,
    },
    semesters,
    ipk,
    totalSksLulus: totalSksLulusAll,
    totalSksDiambil: totalSksDiambilAll,
    generatedAt: new Date().toISOString(),
  };
}

/** Generate PDF transkrip menggunakan pdfkit. */
async function generateTranscriptPDF(data: TranscriptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100;
    let y = 50;

    const text = (
      t: string,
      x: number,
      yPos: number,
      o: {
        size?: number;
        bold?: boolean;
        align?: 'left' | 'center' | 'right';
        color?: string;
        width?: number;
      } = {},
    ) => {
      const { size = 10, bold = false, align = 'left', color = '#000', width = pageWidth } = o;
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(size)
        .fillColor(color);
      doc.text(t, x, yPos, { width, align });
    };
    const line = (yPos: number, stroke = '#ccc') => {
      doc
        .moveTo(50, yPos)
        .lineTo(doc.page.width - 50, yPos)
        .strokeColor(stroke)
        .stroke();
    };

    // HEADER
    text('UNIVERSITAS SIAK', 50, y, { size: 16, bold: true, align: 'center' });
    y += 22;
    text('TRANSKRIP NILAI MAHASISWA', 50, y, { size: 14, bold: true, align: 'center' });
    y += 28;
    line(y);
    y += 10;

    const infoRows: Array<[string, string]> = [
      ['Nama', data.student.fullName],
      ['NIM', data.student.nim],
      ['Program Studi', `${data.student.prodiCode} - ${data.student.prodiName}`],
      ['Angkatan / Tahun Akademik', data.student.academicYearCode],
      ['Jalur Masuk', data.student.entryType],
    ];
    for (const [label, value] of infoRows) {
      text(label, 50, y, { size: 10, bold: true });
      text(value, 200, y, { size: 10 });
      y += 18;
    }
    y += 10;
    line(y);
    y += 10;

    // SEMESTER TABLES
        // Kolom: No, Mata Kuliah, SKS, Angka, Huruf, Status (Kode MK dihapus per keluhan)
        // Keluhan: kolom "No." terlalu lebar — cukup 16pt untuk nomor urut 1-2 digit.
        // Fixed: gunakan kolom No 16pt dengan absolute positioning, manual truncate (no wrap)
        const colWidths = [16, 264, 40, 60, 50, 60];
        const headers = ['No', 'Mata Kuliah', 'SKS', 'Angka', 'Huruf', 'Status'];
        // Cumulative x-position per column for pdfkit (base 50 margin).
        const colStarts: number[] = [];
        for (const w of colWidths) {
          colStarts.push(colStarts.length === 0 ? 50 : colStarts[colStarts.length - 1]! + w);
        }

        // Helper: truncate text to fit width (approx 1 char = 4.8pt at fontSize 8)
        const truncate = (value: string, maxWidth: number): string => {
          const charWidth = 4.8; // approximate for Helvetica 8pt
          const maxChars = Math.floor(maxWidth / charWidth);
          if (value.length <= maxChars) return value;
          return value.slice(0, maxChars - 1) + '…';
        };

        // Helper: draw table cell (no wrap, single line, truncated)
        const drawCell = (
          value: string,
          colIndex: number,
          yPos: number,
          options: { bold?: boolean; color?: string; align?: 'left' | 'center' | 'right' } = {}
        ) => {
          const { bold = false, color = '#000', align = 'left' } = options;
          const x = colStarts[colIndex]!;
          const w = colWidths[colIndex]!;
          const padding = 2;
          const textX =
            align === 'center' ? x + w / 2 : align === 'right' ? x + w - padding : x + padding;
          const textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
          const maxWidth = w - padding * 2;

          doc
            .font(bold ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(8)
            .fillColor(color);

          // Truncate to fit column width (single line)
          const truncated = truncate(value, maxWidth);
          doc.text(truncated, textX, yPos, {
            width: maxWidth,
            align: textAlign,
          });
        };

        for (const sem of data.semesters) {
          if (y > 700) {
            doc.addPage();
            y = 50;
          }
          text(`${sem.semesterName} (${sem.semesterCode})`, 50, y, { size: 12, bold: true });
          y += 20;

          // Header row
          headers.forEach((h, i) => {
            drawCell(h, i, y, { bold: true, align: i === 0 || i >= 3 ? 'center' : 'left' });
          });
          y += 16;
          line(y, '#333');
          y += 4;

          let rowNum = 0;
          for (const course of sem.courses) {
            rowNum++;
            if (y > 720) {
              doc.addPage();
              y = 50;
            }
            const status = course.isRepeated ? 'Diulang' : course.isRemedial ? 'Remedial' : '';
            const rowData = [
              String(rowNum),
              course.courseName,
              String(course.credits),
              course.finalScore !== null ? course.finalScore.toFixed(2) : '-',
              course.gradeLetter || '-',
              status,
            ];
            rowData.forEach((v, i) => {
              drawCell(v, i, y, {
                align: i === 0 || i >= 3 ? 'center' : 'left',
                color: course.isRepeated ? '#dc2626' : '#000',
              });
            });
            y += 14;
          }

          y += 6;
          text(
            `IPS: ${sem.ips.toFixed(2)}  |  SKS Lulus: ${sem.sksLulus}  |  SKS Diambil: ${sem.sksDiambil}`,
            50,
            y,
            { size: 9, bold: true },
          );
          y += 20;
          line(y);
          y += 10;
        }

    // SUMMARY
    if (y > 650) {
      doc.addPage();
      y = 50;
    }
    text('RINGKASAN', 50, y, { size: 12, bold: true });
    y += 20;
    const summaryRows: Array<[string, string]> = [
      ['Total SKS Diambil', String(data.totalSksDiambil)],
      ['Total SKS Lulus', String(data.totalSksLulus)],
      ['IP Kumulatif (IPK)', data.ipk.toFixed(2)],
    ];
    for (const [label, value] of summaryRows) {
      text(label, 50, y, { size: 10, bold: true, width: 200 });
      text(value, 250, y, { size: 10, bold: true });
      y += 22;
    }
    y += 20;
    line(y);
    y += 10;

    text(
      `Dicetak pada: ${new Date(data.generatedAt).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`,
      50,
      y,
      { size: 8, color: '#666' },
    );
    y += 14;
    text(
      'Transkrip ini sah tanpa tanda tangan basah (digital signature). Verifikasi via sistem SIAK.',
      50,
      y,
      { size: 8, color: '#666', align: 'center' },
    );

    doc.end();
  });
}

/** Verifikasi akses dosen wali terhadap seorang mahasiswa binaan. */
async function assertWaliMentee(userId: number, studentId: number): Promise<void> {
  const res = await pgPool.query(
    'SELECT 1 FROM students WHERE id = $1 AND prodi_id IN (SELECT prodi_id FROM lecturers WHERE user_id = $2)',
    [studentId, userId],
  );
  if (res.rows.length === 0) {
    throw new AppError('FORBIDDEN', 'Bukan binaan Anda', 403);
  }
}

export function createTranscriptRouter(): Router {
  const router = Router();
  router.use(authenticate);

  // GET /transcript/my — transkrip mahasiswa sendiri (JSON)
  router.get(
    '/my',
    authorize('transcript.view_own'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user?.studentId) {
          throw new AppError(
            'FORBIDDEN',
            'Hanya mahasiswa yang bisa mengakses transkrip sendiri',
            403,
          );
        }
        const data = await fetchTranscriptData(req.user.studentId);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /transcript/student/:studentId — wali/admin (JSON)
  router.get(
    '/student/:studentId',
    authorizeWali('transcript.view_mentee'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const studentId = Number(req.params.studentId);
        if (!Number.isInteger(studentId) || studentId <= 0) {
          throw new AppError('VALIDATION_ERROR', 'Student ID tidak valid', 400);
        }
        if (req.user!.roleCode === 'dosen' && req.user!.isWali) {
          await assertWaliMentee(req.user!.id, studentId);
        }
        const data = await fetchTranscriptData(studentId);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /transcript/my/download — PDF mahasiswa sendiri
  router.get(
    '/my/download',
    authorize('transcript.download'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user?.studentId) {
          throw new AppError(
            'FORBIDDEN',
            'Hanya mahasiswa yang bisa download transkrip sendiri',
            403,
          );
        }
        const academicYearId = req.query.academicYearId
          ? Number(req.query.academicYearId as string)
          : undefined;
        const data = await fetchTranscriptData(req.user.studentId, academicYearId);
        if (data.semesters.length === 0) {
          // Tahun akademik yang dipilih tidak punya nilai → pesan jelas, bukan 500.
          throw new AppError(
            'NOT_FOUND',
            academicYearId
              ? 'Belum ada nilai untuk tahun akademik yang dipilih.'
              : 'Belum ada nilai yang tercatat untuk transkrip.',
            404,
          );
        }
        const pdf = await generateTranscriptPDF(data);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          // Keluhan lama: filename pakai internal studentId (angka) → tidak informatif.
          // Konsisten dengan endpoint wali: pakai NIM.
          `attachment; filename="transkrip-${data.student.nim}${academicYearId ? `-${academicYearId}` : ''}.pdf"`,
        );
        res.send(pdf);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /transcript/student/:studentId/download — PDF wali/admin
  router.get(
    '/student/:studentId/download',
    authorizeWali('transcript.download'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const studentId = Number(req.params.studentId);
        if (!Number.isInteger(studentId) || studentId <= 0) {
          throw new AppError('VALIDATION_ERROR', 'Student ID tidak valid', 400);
        }
        if (req.user!.roleCode === 'dosen' && req.user!.isWali) {
          await assertWaliMentee(req.user!.id, studentId);
        }
        const academicYearId = req.query.academicYearId
          ? Number(req.query.academicYearId as string)
          : undefined;
        const data = await fetchTranscriptData(studentId, academicYearId);
        const pdf = await generateTranscriptPDF(data);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="transkrip-${data.student.nim}${academicYearId ? `-${academicYearId}` : ''}.pdf"`,
        );
        res.send(pdf);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
