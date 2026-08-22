import PDFDocument from 'pdfkit';

/** Format Rupiah: 5000000 → "Rp 5.000.000" */
function formatRupiah(n: number): string {
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

const BULAN_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/**
 * Generate PDF slip gaji dosen — layout rapi:
 * - Header dokumen + info dosen
 * - Tabel kolom fixed-width, angka rata kanan, header berulang tiap halaman
 * - Baris zebra + garis kolom tipis, footer total
 * - Page break otomatis sebelum menabrak margin bawah
 */
export function generateSalarySlipPdf(
  lecturerName: string,
  items: Array<{
    periodStart: string;
    periodEnd: string;
    baseSalary: number;
    honorPerMeeting: number;
    totalMeetings: number;
    totalHonor: number;
    deductions: number;
    netAmount: number;
    status: string;
  }>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PAGE_LEFT = 40;
    const PAGE_RIGHT = 555; // A4 width 595 − margin kanan 40

    // ── Layout tabel: [label, x0, x1, align] ──
    const COLS = [
      { label: 'Periode', x0: 40, x1: 130, align: 'left' as const },
      { label: 'Gaji Pokok', x0: 130, x1: 215, align: 'right' as const },
      { label: 'Honor Mengajar', x0: 215, x1: 310, align: 'right' as const },
      { label: 'Potongan', x0: 310, x1: 385, align: 'right' as const },
      { label: 'Total Diterima', x0: 385, x1: 480, align: 'right' as const },
      { label: 'Status', x0: 480, x1: 555, align: 'center' as const },
    ];

    const STATUS_ID: Record<string, string> = {
      draft: 'Draft',
      approved: 'Disetujui',
      paid: 'Dibayar',
    };

    const drawHeaderBlock = (): void => {
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('SLIP GAJI DOSEN', PAGE_LEFT, 40, {
          width: PAGE_RIGHT - PAGE_LEFT,
          align: 'center',
        });
      doc.moveDown(0.2);
      doc
        .fontSize(10)
        .font('Helvetica')
        .text('Sistem Informasi Akademik (SIAK)', PAGE_LEFT, doc.y, {
          width: PAGE_RIGHT - PAGE_LEFT,
          align: 'center',
        });
      doc.moveDown(1.2);

      doc.fontSize(10).font('Helvetica');
      const firstPeriod = items[items.length - 1]?.periodStart;
      const lastPeriod = items[0]?.periodEnd;
      doc.text(`Nama Dosen : ${lecturerName}`, PAGE_LEFT, doc.y);
      if (firstPeriod && lastPeriod) {
        const fmt = (iso: string) => {
          const d = new Date(iso);
          return `${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
        };
        doc.text(`Periode     : ${fmt(firstPeriod)} s/d ${fmt(lastPeriod)}`, PAGE_LEFT, doc.y);
      }
      doc.moveDown(1);
    };

    /** Gambar header tabel; kembalikan y setelah header. */
    const drawTableHead = (yTop: number): number => {
      const rowH = 22;
      // Latar header
      doc.save();
      doc.rect(PAGE_LEFT, yTop, PAGE_RIGHT - PAGE_LEFT, rowH).fill('#e8edf5');
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e293b');
      for (const c of COLS) {
        const w = c.x1 - c.x0;
        doc.text(c.label, c.x0 + 4, yTop + 7, { width: w - 8, align: c.align });
      }
      // Garis bawah header
      doc
        .moveTo(PAGE_LEFT, yTop + rowH)
        .lineTo(PAGE_RIGHT, yTop + rowH)
        .lineWidth(1)
        .strokeColor('#94a3b8')
        .stroke();
      doc.fillColor('#111827');
      return yTop + rowH;
    };

    drawHeaderBlock();
    let y = drawTableHead(doc.y + 4);

    let totalNet = 0;
    items.forEach((it, idx) => {
      const honorMengajar =
        it.totalHonor > 0 ? it.totalHonor : it.honorPerMeeting * it.totalMeetings;
      totalNet += it.netAmount;

      // Page break: butuh ruang baris (28px) + footer total (30px)
      if (y > 760) {
        doc.addPage();
        y = drawTableHead(40);
      }

      const rowH = 24;
      // Zebra stripe
      if (idx % 2 === 1) {
        doc.save();
        doc.rect(PAGE_LEFT, y, PAGE_RIGHT - PAGE_LEFT, rowH).fill('#f6f8fb');
        doc.restore();
      }

      const start = new Date(it.periodStart);
      const periode = `${BULAN_ID[start.getMonth()]} ${start.getFullYear()}`;
      const cells: Array<{ text: string; align: 'left' | 'right' | 'center'; ci: number }> = [
        { text: periode, align: 'left', ci: 0 },
        { text: formatRupiah(it.baseSalary), align: 'right', ci: 1 },
        { text: formatRupiah(honorMengajar), align: 'right', ci: 2 },
        { text: formatRupiah(it.deductions), align: 'right', ci: 3 },
        { text: formatRupiah(it.netAmount), align: 'right', ci: 4 },
        { text: STATUS_ID[it.status] ?? it.status, align: 'center', ci: 5 },
      ];
      doc.font('Helvetica').fontSize(9.5).fillColor('#111827');
      for (const cell of cells) {
        const c = COLS[cell.ci];
        if (!c) continue;
        const w = c.x1 - c.x0;
        doc.text(cell.text, c.x0 + 4, y + 7, { width: w - 8, align: cell.align });
      }
      // Garis horizontal tipis antar baris
      doc
        .moveTo(PAGE_LEFT, y + rowH)
        .lineTo(PAGE_RIGHT, y + rowH)
        .lineWidth(0.5)
        .strokeColor('#d7dde5')
        .stroke();

      y += rowH;
    });

    // Footer total — dijamin muat (page break sudah menyisakan ruang)
    doc
      .moveTo(PAGE_LEFT, y + 4)
      .lineTo(PAGE_RIGHT, y + 4)
      .lineWidth(1)
      .strokeColor('#94a3b8')
      .stroke();
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a');
    doc.text(`TOTAL DITERIMA (${items.length} periode)`, PAGE_LEFT + 4, y + 12, {
      width: 340,
      align: 'left',
    });
    doc.text(formatRupiah(totalNet), 389, y + 12, { width: 91, align: 'right' });

    doc.end();
  });
}
