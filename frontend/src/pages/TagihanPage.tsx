import { useEffect, useState, useCallback } from 'react';
import { getKrsAccess, getKrsPeriod, getMyPayments, ApiError } from '../lib/api';
import type { MyPayment, KrsAccessResult } from '../lib/types';

/**
 * Halaman Tagihan Mahasiswa — detail tagihan semester yang sedang berjalan (KRS aktif).
 * Submenu "Tagihan" di bawah menu Keuangan.
 */
export function TagihanPage() {
  const [payment, setPayment] = useState<MyPayment | null>(null);
  const [krsAccess, setKrsAccess] = useState<KrsAccessResult | null>(null);
  const [semesterLabel, setSemesterLabel] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Semester KRS aktif (periode yang sedang berjalan)
      const period = await getKrsPeriod().catch(() => null);
      const activeSemesterId = period?.semesterId;

      // Ambil tagihan semester itu (atau semester terbaru jika periode tidak open)
      const payments = await getMyPayments(activeSemesterId);
      // getMyPayments dengan semester_id mengembalikan maksimal 1 baris untuk semester tsb
      const current =
        payments.find((p) => p.semesterId === activeSemesterId) ?? payments[0] ?? null;

      setPayment(current);
      if (current) {
        setSemesterLabel(`${current.semesterName} (${current.semesterCode})`);
      } else if (period) {
        setSemesterLabel(`${period.name} (${period.semesterCode})`);
      }

      // Indikator akses KRS — konsisten dengan kebijakan: tanpa tagihan = boleh akses
      if (activeSemesterId) {
        const access = await getKrsAccess(activeSemesterId).catch(() => null);
        setKrsAccess(access);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Gagal memuat tagihan';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function formatRupiah(n: number): string {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(n);
  }

  function getStatusBadge(status: MyPayment['status']) {
    const map: Record<string, { label: string; cls: string }> = {
      lunas: { label: 'Lunas', cls: 'bg-green-100 text-green-800' },
      partial: { label: 'Cicil', cls: 'bg-yellow-100 text-yellow-800' },
      belum_lunas: { label: 'Belum Lunas', cls: 'bg-red-100 text-red-800' },
    };
    const m = map[status] || { label: status, cls: 'bg-slate-100 text-slate-800' };
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${m.cls}`}>{m.label}</span>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KRS Access Indicator */}
      {krsAccess && (
        <div
          className={`p-3 rounded-lg border ${krsAccess.canAccess ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={krsAccess.canAccess ? 'text-green-600' : 'text-red-600'}>
              {krsAccess.canAccess ? '✓' : '✕'}
            </span>
            <span className="font-medium text-slate-800">
              {krsAccess.canAccess
                ? 'Anda dapat mengisi KRS (tidak ada tunggakan)'
                : 'KRS DIBLOKIR — Silakan lunasi tagihan terlebih dahulu'}
            </span>
          </div>
        </div>
      )}

      {/* Tagihan Semester Berjalan */}
      {payment ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-slate-900">Tagihan {semesterLabel}</h3>
              <p className="text-xs text-slate-500">Semester berjalan</p>
            </div>
            {getStatusBadge(payment.status)}
          </div>

          {/* Ringkasan */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-6 py-4 border-b border-slate-100">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Total Tagihan</p>
              <p className="text-lg font-semibold text-slate-900">
                {formatRupiah(payment.totalAmount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Terbayar</p>
              <p className="text-lg font-semibold text-green-600">
                {formatRupiah(payment.paidAmount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Sisa</p>
              <p className="text-lg font-semibold text-slate-900">
                {formatRupiah(Math.max(payment.totalAmount - payment.paidAmount, 0))}
              </p>
            </div>
          </div>

          {/* Rincian Items */}
          {payment.items && payment.items.length > 0 && (
            <div className="px-6 py-4">
              <h4 className="font-medium text-slate-900 mb-2">Rincian Tagihan</h4>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Item
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Jumlah
                      </th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Wajib
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payment.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          <div className="font-medium">{item.description}</div>
                          {item.type && (
                            <div className="text-xs text-slate-500 uppercase">{item.type}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-900">
                          {formatRupiah(item.amount)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm">
                          {item.isMandatory ? (
                            <span className="text-green-600">Wajib</span>
                          ) : (
                            <span className="text-slate-400">Opsional</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-slate-200">
                    <tr>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">Total</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                        {formatRupiah(payment.totalAmount)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Info bayar */}
          <div className="px-6 py-4 bg-primary-50 border-t border-primary-100">
            <h4 className="font-medium text-primary-800 mb-1">Informasi Pembayaran</h4>
            <ul className="text-sm text-primary-700 space-y-1">
              <li>• Pembayaran dilakukan manual di bagian keuangan kampus</li>
              <li>
                • KRS hanya bisa diisi setelah status <strong>Lunas</strong>
              </li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <svg
            className="mx-auto h-12 w-12 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-lg font-medium text-slate-900">Belum ada tagihan</h3>
          <p className="mt-1 text-slate-500">
            Tidak ada tagihan untuk {semesterLabel || 'semester berjalan'} — tagihan akan muncul
            setelah admin generate untuk semester aktif.
          </p>
        </div>
      )}
    </div>
  );
}
