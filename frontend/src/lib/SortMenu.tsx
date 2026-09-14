import { useEffect, useRef, useState } from 'react';
import type { SortDir } from './useTableTools';
import { SortIcon } from './SortIcon';

/** Opsi kolom yang bisa dijadikan dasar urutan. */
export interface SortOption<K extends string = string> {
  key: K;
  label: string;
}

/**
 * Ikon urutkan universal: tombol ikon ↕/▲/▼ → klik membuka dropdown pilihan
 * "Urutkan berdasarkan". Dipakai menggantikan baris "Urutkan:" / tombol sort
 * di header kolom tabel, agar UI seragam di semua halaman & peran.
 */
export function SortMenu<K extends string = string>({
  options,
  sortKey,
  sortDir,
  toggleSort,
  align = 'right',
}: {
  options: SortOption<K>[];
  sortKey?: K | '';
  sortDir?: SortDir;
  toggleSort: (key: K) => void;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const active = options.find((o) => o.key === sortKey);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label="Urutkan"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-3 py-2.5 border rounded-lg text-sm bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
          active ? 'border-primary-300 text-primary-700' : 'border-slate-300 text-slate-600'
        }`}
      >
        <SortIcon active={!!active} dir={sortDir ?? 'asc'} />
        <span>{active ? active.label : 'Urutkan'}</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Pilihan urutan"
          className={`absolute z-30 mt-1 w-60 rounded-lg border border-slate-200 bg-white shadow-lg py-1 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <p className="px-3 py-1.5 text-xs font-medium text-slate-400 uppercase tracking-wide">
            Urutkan berdasarkan
          </p>
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              role="option"
              aria-selected={o.key === sortKey}
              onClick={() => {
                toggleSort(o.key);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 ${
                o.key === sortKey ? 'font-medium text-primary-600' : 'text-slate-700'
              }`}
            >
              {o.label}
              {o.key === sortKey && <span aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
