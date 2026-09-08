import type { SortDir } from './useTableTools';

/** Ikon urut untuk header tabel: ↕ (idle) / ▲ / ▼ (aktif). */
export function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return <span aria-hidden="true">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>;
}
