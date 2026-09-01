// Unit test generateTranscriptPDF — murni, TANPA DB (tidak connect Postgres).
// Men-cover cabang PDF generator: multiple semester, matkul diulang, remedial,
// fakultas kosong, semesters kosong, dll.
import { generateTranscriptPDF } from './index';

const baseSemester = {
  semesterId: 1,
  semesterCode: '2024/2025-1',
  semesterName: 'Ganjil',
  ips: 3.9,
  sksLulus: 9,
  sksDiambil: 9,
};

const courseGanjil = {
  id: 1,
  courseCode: 'TI-101',
  courseName: 'Algoritma',
  credits: 3,
  semesterCode: '2024/2025-1',
  semesterName: 'Ganjil',
  periodName: 'P1',
  gradeLetter: 'A',
  gradePoint: 4.0,
  finalScore: 90,
  isRemedial: false,
  isRepeated: false,
  bestAttemptId: 1,
};

describe('generateTranscriptPDF (unit, tanpa DB)', () => {
  it('menghasilkan PDF valid dengan multiple semester + matkul diulang & remedial', async () => {
    const data = {
      student: {
        nim: '20231001',
        fullName: 'Budi Santoso',
        prodiCode: 'TI',
        prodiName: 'Teknik Informatika',
        facultyName: 'Teknik',
        academicYearCode: '2024/2025',
        entryType: 'SBMPTN',
      },
      ipk: 3.5,
      totalSksLulus: 15,
      totalSksDiambil: 18,
      generatedAt: new Date('2026-09-01T00:00:00Z').toISOString(),
      semesters: [
        {
          ...baseSemester,
          courses: [
            courseGanjil,
            {
              ...courseGanjil,
              id: 2,
              credits: 9,
              gradePoint: 3.0,
              gradeLetter: 'B',
              finalScore: 80,
              isRepeated: true,
            },
          ],
        },
        {
          semesterId: 2,
          semesterCode: '2024/2025-2',
          semesterName: 'Genap',
          ips: 3.0,
          sksLulus: 6,
          sksDiambil: 9,
          courses: [
            {
              ...courseGanjil,
              id: 3,
              credits: 3,
              courseName: 'Struktur Data',
              isRemedial: true,
              gradePoint: 2.0,
            },
          ],
        },
      ],
    };

    const pdf = await generateTranscriptPDF(data as never);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('menghasilkan PDF valid walau fakultas kosong & semesters kosong', async () => {
    const data = {
      student: {
        nim: '20231002',
        fullName: 'Siti',
        prodiCode: 'MI',
        prodiName: 'Manajemen Informatika',
        facultyName: '',
        academicYearCode: '2023/2024',
        entryType: 'Mandiri',
      },
      ipk: 0,
      totalSksLulus: 0,
      totalSksDiambil: 0,
      generatedAt: new Date('2026-09-01T00:00:00Z').toISOString(),
      semesters: [],
    };

    const pdf = await generateTranscriptPDF(data as never);
    expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
  });

  it('menghasilkan PDF valid dengan banyak matkul (memicu page break dalam tabel)', async () => {
    const manyCourses = Array.from({ length: 45 }, (_, i) => ({
      ...courseGanjil,
      id: 100 + i,
      courseName: `Course Panjang Nomor ${i + 1}`,
    }));
    const data = {
      student: {
        nim: '20231003',
        fullName: 'Andi',
        prodiCode: 'SI',
        prodiName: 'Sistem Informasi',
        facultyName: 'Teknik',
        academicYearCode: '2024/2025',
        entryType: 'SBMPTN',
      },
      ipk: 3.2,
      totalSksLulus: 135,
      totalSksDiambil: 144,
      generatedAt: new Date('2026-09-01T00:00:00Z').toISOString(),
      semesters: [
        {
          ...baseSemester,
          ips: 3.2,
          sksLulus: 135,
          sksDiambil: 144,
          courses: manyCourses,
        },
      ],
    };

    const pdf = await generateTranscriptPDF(data as never);
    expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
