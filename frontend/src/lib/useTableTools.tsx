/* eslint-disable react-refresh/only-export-components -- useTableTools + SortIcon co-export */
import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

/**
 * Alat tabel universal: pencarian semua kolom (client-side pada data yang tampil)
 * + urutkan per kolom dengan ikon ▲/▼/↕. Tidak mengubah sumber data (server-side
 * pagination tetap jalan); filter & sort berlaku pada array items yang dirender.
 *
 * Perilaku pencarian: query < `minLength` (default 3) TIDAK memfilter (daftar
 * penuh) — pencarian aktif setelah minimal 3 karakter, atau segera saat tombol
 * Enter ditekan (`submit()`). Ini mencegah fetch/loading saat mengetik 1-2
 * karakter pertama.
 */
export function useTableTools<T extends object>(items: T[], minLength = 3) {
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  // keyof T | (string & {}) memungkinkan sort kolom "virtual"/nested (mis. student.nim)
  const [sortKey, setSortKey] = useState<keyof T | (string & {}) | ''>('');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const filtered = useMemo(() => {
    const q = appliedQuery.trim().toLowerCase();

    const allValues = (row: T): unknown[] => {
      const out: unknown[] = [];
      const walk = (v: unknown): void => {
        if (v === null || v === undefined || typeof v === 'boolean') {
          out.push(v);
        } else if (Array.isArray(v)) {
          v.forEach(walk);
        } else if (typeof v === 'object') {
          Object.values(v).forEach(walk);
        } else {
          out.push(v);
        }
      };
      walk(row);
      return out;
    };

    const arr = q
      ? items.filter((row) =>
          allValues(row).some((v) =>
            String(v ?? '')
              .toLowerCase()
              .includes(q),
          ),
        )
      : [...items];

    if (sortKey) {
      const key = sortKey as string;
      arr.sort((a, b) => {
        const av = String((a as Record<string, unknown>)[key] ?? '');
        const bv = String((b as Record<string, unknown>)[key] ?? '');
        const numA = Number(av);
        const numB = Number(bv);
        const cmp =
          av !== '' && bv !== '' && !Number.isNaN(numA) && !Number.isNaN(numB)
            ? numA - numB
            : av.localeCompare(bv, 'id');
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return arr;
  }, [items, appliedQuery, sortKey, sortDir]);

  const toggleSort = (key: keyof T | string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  /**
   * Commit query saat memenuhi syarat: minimal `minLength` karakter, kosong,
   * atau `force` (tekan Enter eksplisit oleh user). `< minLength` tanpa force
   * (mis. 1-2 karakter) → reset ke daftar penuh (tidak memfilter).
   */
  const submit = (value: string, force = false) => {
    const v = value.trim();
    if (v.length >= minLength || v.length === 0 || force) {
      setAppliedQuery(v);
    } else {
      setAppliedQuery('');
    }
  };

  // TODO: backspace dari `appliedQuery` panjang → setQuery kosong → reset dilakukan submit()
  const pending = query.length > 0 && query.length < minLength;

  return {
    query,
    setQuery,
    appliedQuery,
    setAppliedQuery,
    submit,
    pending,
    sortKey,
    sortDir,
    toggleSort,
    filtered,
  };
}

export { SortIcon } from './SortIcon';
