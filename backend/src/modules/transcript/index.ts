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
    facultyName: string;
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
 * Ubah semesterCode "2025/2026-1" → "2025/2026 Ganjil".
 * Format input: `<TA>-<n>` dengan n ganjil = Ganjil, n genap = Genap.
 * Jika tidak cocok, kembalikan input apa adanya.
 */
function formatSemesterCode(semesterCode: string): string {
  const dash = semesterCode.lastIndexOf('-');
  if (dash <= 0) return semesterCode;
  const ta = semesterCode.slice(0, dash);
  const num = parseInt(semesterCode.slice(dash + 1), 10);
  if (Number.isNaN(num)) return semesterCode;
  return `${ta} ${num % 2 === 1 ? 'Ganjil' : 'Genap'}`;
}

/**
 * Ambil data transkrip lengkap untuk mahasiswa.
 * Matkul diulang: hanya grade terbaik per course_code masuk IPS/IPK,
 * attempt lama ditandai isRepeated=true (tidak dihitung).
 * Optional: filter by academicYearId (tahun akademik) dan/atau semesterCode (1 semester).
 */
async function fetchTranscriptData(
  studentId: number,
  academicYearId?: number,
  semesterCode?: string,
): Promise<TranscriptData> {
  const studentRes = await pgPool.query(
    `SELECT s.nim, u.full_name, s.prodi_id, s.academic_year_id, s.entry_type,
            p.code as prodi_code, p.name as prodi_name, ay.code as academic_year_code,
            f.name as faculty_name
     FROM students s
     JOIN users u ON u.id = s.user_id
     JOIN prodis p ON p.id = s.prodi_id
     JOIN faculties f ON f.id = p.faculty_id
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
    faculty_name: string;
    academic_year_code: string;
  };

  // Build filters: academic_year_id (tahun akademik) dan/atau semester_code (1 semester)
  const filters: string[] = [];
  const params: unknown[] = [studentId];
  if (academicYearId) {
    params.push(academicYearId);
    filters.push(
      `kp.semester_id IN (SELECT id FROM semesters WHERE academic_year_id = $${params.length})`,
    );
  }
  if (semesterCode) {
    params.push(semesterCode);
    filters.push(`s.code = $${params.length}`);
  }
  const whereFilter = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';

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
     WHERE ks.student_id = $1 ${whereFilter}
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
      facultyName: student.faculty_name,
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

/** Generate PDF transkrip (gaya KHS UMM) menggunakan pdfkit. */
async function generateTranscriptPDFInternal(data: TranscriptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100; // 495
    let y = 50;

    const text = (
      t: string,
      x: number,
      yPos: number,
      o: {
        size?: number;
        bold?: boolean;
        color?: string;
        align?: 'left' | 'center' | 'right';
        width?: number;
      } = {},
    ) => {
      const { size = 10, bold = false, color = '#000', align = 'left', width = pageWidth } = o;
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(size)
        .fillColor(color);
      doc.text(t, x, yPos, { width, align });
    };
    const line = (yPos: number, stroke = '#999') => {
      doc
        .moveTo(50, yPos)
        .lineTo(doc.page.width - 50, yPos)
        .strokeColor(stroke)
        .lineWidth(0.6)
        .stroke();
    };

    // ── KOLOM TABEL (7 kolom): NO, KODE, NAMA MATA KULIAH, NILAI HURUF, SKS, Keterangan, NILAI X SKS
    const colWidths = [24, 70, 165, 46, 30, 70, 60]; // total = 465 (muat 495)
    const headers = [
      'NO',
      'KODE',
      'NAMA MATA KULIAH',
      'NILAI HURUF',
      'SKS',
      'Keterangan',
      'NILAI X SKS',
    ];
    const tableLeft = 50;
    const tableRight = tableLeft + colWidths.reduce((a, b) => a + b, 0);
    const colStarts: number[] = [];
    {
      let acc = tableLeft;
      for (const w of colWidths) {
        colStarts.push(acc);
        acc += w;
      }
    }

    // Header KHS (judul + info) — muncul di setiap halaman
    const drawHeader = () => {
      text('UNIVERSITAS SIAK', 50, y, { size: 16, bold: true, align: 'center' });
      y += 22;
      text('KARTU HASIL STUDI (KHS)', 50, y, {
        size: 14,
        bold: true,
        align: 'center',
        color: '#b91c1c',
      });
      y += 8;
      line(y, '#999');
      y += 14;

      const infoRows: Array<[string, string]> = [
        ['Nama', data.student.fullName],
        ['NIM', data.student.nim],
        ['Program Studi', `${data.student.prodiCode} - ${data.student.prodiName}`],
        ['Fakultas', data.student.facultyName || '-'],
        ['Tahun Akademik', data.student.academicYearCode],
        ['Jalur Masuk', data.student.entryType],
      ];
      for (const [label, value] of infoRows) {
        text(label, 50, y, { size: 9, bold: true });
        text(value, 160, y, { size: 9 });
        y += 15;
      }
      y += 6;
      line(y, '#999');
      y += 12;
    };

    // Draw satu baris tabel (rata kiri; header biru).
    const drawTableRow = (
      cells: string[],
      yPos: number,
      rowHeight: number,
      isHeader: boolean,
      opts: { color?: string } = {},
    ) => {
      const color = opts.color ?? '#000';
      const padding = 4;

      if (isHeader) {
        doc
          .fillColor('#f1f5f9')
          .rect(tableLeft, yPos, tableRight - tableLeft, rowHeight)
          .fill();
      }

      cells.forEach((cell, i) => {
        const x = colStarts[i]!;
        const w = colWidths[i]!;
        const maxWidth = w - padding * 2;

        doc
          .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(isHeader ? 8 : 8)
          .fillColor(isHeader ? '#1d4ed8' : color);
        doc.text(truncate(cell, maxWidth), x + padding, yPos + (rowHeight - 8) / 2, {
          width: maxWidth,
          align: i === 4 ? 'center' : 'left',
          lineBreak: false,
          height: rowHeight,
          ellipsis: false,
        });
      });

      doc
        .moveTo(tableLeft, yPos + rowHeight)
        .lineTo(tableRight, yPos + rowHeight)
        .strokeColor('#e2e8f0')
        .lineWidth(0.5)
        .stroke();
    };

    // Truncate text agar muat 1 baris dalam kolom.
    const truncate = (value: string, maxWidth: number): string => {
      if (value.length === 0) return value;
      const charWidth = 4.4;
      const maxChars = Math.floor(maxWidth / charWidth);
      if (value.length <= maxChars) return value;
      return value.slice(0, maxChars - 1) + '…';
    };

    // ── PER SEMESTER: 1 blok KHS (header berulang tiap blok)
    data.semesters.forEach((sem, semIdx) => {
      const isFirstSection = semIdx === 0;
      if (isFirstSection) {
        // Halaman pertama: langsung header
        drawHeader();
      } else {
        // Section berikutnya: halaman baru (agar tiap KHS bersih)
        if (y > 100) {
          doc.addPage();
          y = 50;
        }
        drawHeader();
      }

      // Info semester
      text(`Semester/Tahun : ${formatSemesterCode(sem.semesterCode)}`, 50, y, {
        size: 10,
        bold: true,
      });
      y += 20;

      // Header tabel
      const headerRowHeight = 16;
      drawTableRow(headers, y, headerRowHeight, true);
      y += headerRowHeight;

      // Baris data
      let totalSks = 0;
      let totalBobot = 0;
      sem.courses.forEach((course, idx) => {
        if (y > 720) {
          doc.addPage();
          y = 50;
          drawHeader();
          text(`Semester/Tahun : ${formatSemesterCode(sem.semesterCode)}`, 50, y, {
            size: 10,
            bold: true,
          });
          y += 20;
          drawTableRow(headers, y, headerRowHeight, true);
          y += headerRowHeight;
        }
        const ket = course.isRepeated ? 'Diulang' : course.isRemedial ? 'Remedial' : 'Reguler';
        const bobot = course.isRepeated ? 0 : course.gradePoint * course.credits;
        if (!course.isRepeated) {
          totalSks += course.credits;
          totalBobot += bobot;
        }
        drawTableRow(
          [
            String(idx + 1),
            course.courseCode,
            course.courseName,
            course.gradeLetter || '-',
            String(course.credits),
            ket,
            course.isRepeated ? '' : bobot.toFixed(2),
          ],
          y,
          16,
          false,
          { color: course.isRepeated ? '#dc2626' : '#000' },
        );
        y += 16;
      });

      // Baris TOTAL (biru, seperti referensi)
      const rowY = y;
      // Latar + garis batas baris
      doc
        .moveTo(tableLeft, rowY)
        .lineTo(tableRight, rowY)
        .strokeColor('#94a3b8')
        .lineWidth(0.6)
        .stroke();
      doc
        .moveTo(tableLeft, rowY + 16)
        .lineTo(tableRight, rowY + 16)
        .strokeColor('#94a3b8')
        .lineWidth(0.6)
        .stroke();
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#1d4ed8')
        .text('TOTAL', colStarts[2]! + 4, rowY + 4, { width: 40, align: 'left', lineBreak: false })
        .text(String(totalSks), colStarts[4]! + 4, rowY + 4, {
          width: 30,
          align: 'left',
          lineBreak: false,
        })
        .text(totalBobot.toFixed(2), colStarts[6]! + 4, rowY + 4, {
          width: 30,
          align: 'left',
          lineBreak: false,
        });
      y += 16;

      // Jika masih ada ruang → summary IPS/IPK di bawah tabel
      if (y > 660) {
        doc.addPage();
        y = 50;
      }
      y += 10;
      text(`Index Prestasi Semester ini        : ${sem.ips.toFixed(2)}`, 50, y, {
        size: 9,
        bold: true,
      });
      y += 16;
      text(`Index Prestasi Kumulatif           : ${data.ipk.toFixed(2)}`, 50, y, {
        size: 9,
        bold: true,
      });
      y += 16;
      text(`SKS Max. Semester Depan            : ${sem.sksLulus}`, 50, y, { size: 9, bold: true });
      y += 16;
      text(`SKS Kumulatif                      : ${data.totalSksLulus}`, 50, y, {
        size: 9,
        bold: true,
      });
      y += 20;
      line(y, '#999');
    });

    // ── FOOTER (halaman terakhir): tanda tangan + catatan
    if (y > 680) {
      doc.addPage();
      y = 50;
    }
    y += 14;
    text(
      `Malang, ${new Date(data.generatedAt).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })}`,
      50,
      y,
      { size: 9 },
    );
    y += 8;
    text('Pembimbing Akademik', 50, y, { size: 9, bold: true });
    y += 24;
    text('( _____________________________ )', 50, y, { size: 9 });
    y += 18;
    text('Catatan:', 50, y, { size: 8, bold: true, color: '#666' });
    y += 12;
    text(
      '1. KHS dinyatakan sah bila ditandatangani Pembimbing Akademik dan stempel basah Program Studi.',
      50,
      y,
      { size: 8, color: '#666', width: pageWidth - 40 },
    );
    y += 12;
    text(
      '2. Data KHS yang sah adalah yang sesuai dengan database SIAK; jika ada perbedaan versi cetak dengan database maka KHS Cetak dinyatakan tidak sah.',
      50,
      y,
      { size: 8, color: '#666', width: pageWidth - 40 },
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

/** Exported untuk unit test — generate PDF KHS dari data transkrip. */
export async function generateTranscriptPDF(data: TranscriptData): Promise<Buffer> {
  return generateTranscriptPDFInternal(data);
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
        const semesterCode = req.query.semesterCode
          ? String(req.query.semesterCode as string)
          : undefined;
        const data = await fetchTranscriptData(req.user.studentId, academicYearId, semesterCode);
        if (data.semesters.length === 0) {
          // Tahun akademik / semester yang dipilih tidak punya nilai → pesan jelas, bukan 500.
          throw new AppError(
            'NOT_FOUND',
            academicYearId
              ? 'Belum ada nilai untuk tahun akademik yang dipilih.'
              : semesterCode
                ? 'Belum ada nilai untuk semester yang dipilih.'
                : 'Belum ada nilai yang tercatat untuk transkrip.',
            404,
          );
        }
        const pdf = await generateTranscriptPDFInternal(data);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          // Keluhan lama: filename pakai internal studentId (angka) → tidak informatif.
          // Konsisten dengan endpoint wali: pakai NIM.
          `attachment; filename="transkrip-${data.student.nim}${academicYearId ? `-${academicYearId}` : ''}${semesterCode ? `-${semesterCode}` : ''}.pdf"`,
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
        const semesterCode = req.query.semesterCode
          ? String(req.query.semesterCode as string)
          : undefined;
        const data = await fetchTranscriptData(studentId, academicYearId, semesterCode);
        const pdf = await generateTranscriptPDFInternal(data);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="transkrip-${data.student.nim}${academicYearId ? `-${academicYearId}` : ''}${semesterCode ? `-${semesterCode}` : ''}.pdf"`,
        );
        res.send(pdf);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
