/* eslint-disable react-refresh/only-export-components -- useTableTools + SortIcon co-export */
import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

/**
 * Alat tabel universal: pencarian semua kolom (client-side pada data yang tampil)
 * + urutkan per kolom dengan ikon ▲/▼/↕. Tidak mengubah sumber data (server-side
 * pagination tetap jalan); filter & sort berlaku pada array items yang dirender.
 */
export function useTableTools<T extends object>(items: T[]) {
  const [query, setQuery] = useState('');
  // keyof T | (string & {}) memungkinkan sort kolom "virtual"/nested (mis. student.nim)
  const [sortKey, setSortKey] = useState<keyof T | (string & {}) | ''>('');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

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
  }, [items, query, sortKey, sortDir]);

  const toggleSort = (key: keyof T | string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return { query, setQuery, sortKey, sortDir, toggleSort, filtered };
}

export { SortIcon } from './SortIcon';
