import type { ReactNode } from 'react';

/**
 * T5.2 — Error Inline Standardization.
 * Komponen tunggal untuk pesan error form/aksi (banner).
 * Dipakai di semua halaman agar tampilan & a11y konsisten (role="alert").
 */
export function FormAlert({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {children}
    </div>
  );
}
/**
 * T5.2 — Error per-field (di bawah input).
 * aria-describedby dipasang oleh pemanggil (id unik per field).
 */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1 text-xs text-red-600" role="alert">
      {children}
    </p>
  );
}
