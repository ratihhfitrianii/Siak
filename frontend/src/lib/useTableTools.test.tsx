import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTableTools } from './useTableTools';
import { render, screen } from '@testing-library/react';
import { SortIcon } from './SortIcon';

const DATA = [
  { id: 3, name: 'Charlie', score: 10, meta: { code: 'C-3' } },
  { id: 1, name: 'alice', score: 90, meta: { code: 'A-1' } },
  { id: 2, name: 'Bob', score: 5, meta: { code: 'B-2' } },
];

describe('useTableTools', () => {
  it('tanpa query & sort → mengembalikan items asli', () => {
    const { result } = renderHook(() => useTableTools(DATA));
    expect(result.current.filtered).toEqual(DATA);
  });

  it('filter deep-search semua kolom (termasuk nested)', () => {
    const { result } = renderHook(() => useTableTools(DATA));
    act(() => result.current.setQuery('A-1'));
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe(1);

    act(() => result.current.setQuery('charlie'));
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe(3);
  });

  it('filter tidak match → array kosong', () => {
    const { result } = renderHook(() => useTableTools(DATA));
    act(() => result.current.setQuery('tidak-ada'));
    expect(result.current.filtered).toHaveLength(0);
  });

  it('sort asc default → toggleSort set key & urut naik', () => {
    const { result } = renderHook(() => useTableTools(DATA));
    act(() => result.current.toggleSort('name'));
    expect(result.current.sortKey).toBe('name');
    expect(result.current.sortDir).toBe('asc');
    expect(result.current.filtered.map((r) => r.name)).toEqual(['alice', 'Bob', 'Charlie']);
  });

  it('toggleSort dua kali → desc', () => {
    const { result } = renderHook(() => useTableTools(DATA));
    act(() => result.current.toggleSort('name'));
    act(() => result.current.toggleSort('name'));
    expect(result.current.sortDir).toBe('desc');
    expect(result.current.filtered.map((r) => r.name)).toEqual(['Charlie', 'Bob', 'alice']);
  });

  it('sort angka (score) → numerik bukan leksikografis', () => {
    const { result } = renderHook(() => useTableTools(DATA));
    act(() => result.current.toggleSort('score'));
    expect(result.current.filtered.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('sort string dengan angka (mis. kode) → numerik bila keduanya angka', () => {
    const { result } = renderHook(() => useTableTools(DATA));
    act(() => result.current.toggleSort('id'));
    expect(result.current.filtered.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('sort + filter bekerja bersama', () => {
    const { result } = renderHook(() => useTableTools(DATA));
    act(() => result.current.setQuery('a'));
    act(() => result.current.toggleSort('name'));
    const rows = result.current.filtered;
    expect(rows.length).toBeGreaterThan(0);
    expect([...rows].every((r) => /a/i.test(String(r.name)))).toBe(true);
  });
});

describe('SortIcon', () => {
  it('idle → ↕', () => {
    render(<SortIcon active={false} dir="asc" />);
    expect(screen.getByText('↕')).toBeInTheDocument();
  });

  it('active asc → ▲', () => {
    render(<SortIcon active dir="asc" />);
    expect(screen.getByText('▲')).toBeInTheDocument();
  });

  it('active desc → ▼', () => {
    render(<SortIcon active dir="desc" />);
    expect(screen.getByText('▼')).toBeInTheDocument();
  });
});
