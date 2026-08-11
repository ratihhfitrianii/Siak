import PDFDocument from 'pdfkit';
import { pgPool } from '../../lib/pg';
import { AppError } from '../../middleware/error-handler';

/**
 * KRS PDF (T1.5 + keluhan lama: "KRS yang sudah disetujui bisa di download PDF").
 * Menghasilkan PDF Kartu Rencana Studi mahasiswa untuk periode KRS tertentu.
 */

export interface KrsPdfItem {
  courseCode: string;
  courseName: string;
  credits: number;
  lecturerName: string | null;
}

export interface KrsPdfData {
  student: {
    nim: string;
    fullName: string;
    prodiCode: string;
    prodiName: string;
    academicYearCode: string;
  };
  period: {
    semesterName: string;
    startDate: Date;
    endDate: Date;
  };
  status: string;
  submittedAt: Date | null;
  totalCredits: number;
  items: KrsPdfItem[];
}

/** Ambil data KRS + identitas mahasiswa untuk PDF (status submitted/approved). */
export async function fetchKrsPdfData(studentId: number, periodId: number): Promise<KrsPdfData> {
  const studentRes = await pgPool.query(
    `SELECT s.nim, u.full_name, p.code AS prodi_code, p.name AS prodi_name,
            ay.code AS academic_year_code
     FROM students s
     JOIN users u ON u.id = s.user_id
     JOIN prodis p ON p.id = s.prodi_id
     JOIN academic_years ay ON ay.id = s.academic_year_id
     WHERE s.id = $1`,
    [studentId],
  );
  if (studentRes.rows.length === 0) {
    throw new AppError('NOT_FOUND', 'Data mahasiswa tidak ditemukan', 404);
  }
  const student = studentRes.rows[0];

  const submissionRes = await pgPool.query(
    `SELECT ks.id, ks.status, ks.submitted_at
     FROM krs_submissions ks
     WHERE ks.student_id = $1 AND ks.krs_period_id = $2`,
    [studentId, periodId],
  );
  if (submissionRes.rows.length === 0) {
    throw new AppError(
      'NOT_FOUND',
      'KRS belum diisi untuk periode ini — PDF hanya untuk KRS yang sudah disubmit',
      404,
    );
  }
  const submission = submissionRes.rows[0];
  // Keluhan lama: "KRS yang sudah disetujui bisa di download PDF" — PDF hanya untuk status approved.
  if (submission.status !== 'approved') {
    throw new AppError(
      'VALIDATION_ERROR',
      'KRS belum disetujui — PDF tersedia setelah KRS disetujui',
      400,
    );
  }

  const periodRes = await pgPool.query(
    `SELECT kp.start_date, kp.end_date, s.name AS semester_name
     FROM krs_periods kp
     JOIN semesters s ON s.id = kp.semester_id
     WHERE kp.id = $1`,
    [periodId],
  );
  const period = periodRes.rows[0];

  const itemsRes = await pgPool.query(
    `SELECT c.code AS course_code, c.name AS course_name, c.credits,
            u.full_name AS lecturer_name
     FROM krs_items ki
     JOIN classes cl ON cl.id = ki.class_id
     JOIN curricula cur ON cur.id = cl.curriculum_id
     JOIN courses c ON c.id = cur.course_id
     LEFT JOIN users u ON u.id = cl.lecturer_id
     WHERE ki.krs_submission_id = $1
     ORDER BY c.code`,
    [submission.id],
  );

  const items = itemsRes.rows.map((r) => ({
    courseCode: r.course_code,
    courseName: r.course_name,
    credits: Number(r.credits),
    lecturerName: r.lecturer_name,
  }));

  return {
    student: {
      nim: student.nim,
      fullName: student.full_name,
      prodiCode: student.prodi_code,
      prodiName: student.prodi_name,
      academicYearCode: student.academic_year_code,
    },
    period: {
      semesterName: period.semester_name,
      startDate: period.start_date,
      endDate: period.end_date,
    },
    status: submission.status,
    submittedAt: submission.submitted_at,
    totalCredits: items.reduce((sum, it) => sum + it.credits, 0),
    items,
  };
}

/** Generate PDF KRS menggunakan pdfkit (pola sama dengan transkrip T2.4). */
export function generateKrsPdf(data: KrsPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
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
    text('KARTU RENCANA STUDI (KRS)', 50, y, { size: 14, bold: true, align: 'center' });
    y += 28;
    line(y);
    y += 10;

    const infoRows: Array<[string, string]> = [
      ['Nama', data.student.fullName],
      ['NIM', data.student.nim],
      ['Program Studi', `${data.student.prodiCode} - ${data.student.prodiName}`],
      ['Angkatan', data.student.academicYearCode],
      ['Semester', data.period.semesterName],
      [
        'Periode KRS',
        `${new Date(data.period.startDate).toLocaleDateString('id-ID')} s.d. ${new Date(data.period.endDate).toLocaleDateString('id-ID')}`,
      ],
      ['Status', data.status === 'approved' ? 'DISETUJUI' : 'SUBMITTED'],
    ];
    for (const [label, value] of infoRows) {
      text(label, 50, y, { size: 10, bold: true });
      text(value, 200, y, { size: 10 });
      y += 18;
    }
    y += 10;
    line(y);
    y += 10;

    // TABEL MATA KULIAH — keluhan lama: PDF KRS hanya menampilkan kode, nama, SKS, Dosen.
    const colWidths = [30, 60, 170, 30, 200];
    const headers = ['No', 'Kode', 'Mata Kuliah', 'SKS', 'Dosen'];
    const colX = [50, 80, 140, 310, 340];

    // header row
    doc.font('Helvetica-Bold').fontSize(9);
    headers.forEach((h, i) => {
      doc.text(h, colX[i], y, { width: colWidths[i], align: i === 3 ? 'center' : 'left' });
    });
    y += 16;
    line(y);

    doc.font('Helvetica').fontSize(9);
    data.items.forEach((item, idx) => {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 50;
      }
      const cells = [
        String(idx + 1),
        item.courseCode,
        item.courseName,
        String(item.credits),
        item.lecturerName ?? '-',
      ];
      cells.forEach((c, i) => {
        doc.text(c, colX[i], y, {
          width: colWidths[i],
          align: i === 3 ? 'center' : 'left',
        });
      });
      y += 16;
    });

    y += 6;
    line(y);
    y += 12;
    text(`Total SKS: ${data.totalCredits}`, 50, y, { size: 11, bold: true, align: 'right' });

    doc.end();
  });
}
