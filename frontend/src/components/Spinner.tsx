/**
 * T5.4 — Spinner loading bersama (design system).
 * Dipakai halaman/layout agar indikator loading konsisten & accessible (role="status").
 */
export function Spinner({
  label = 'Memuat',
  className = '',
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`flex items-center justify-center ${className}`}
    >
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
