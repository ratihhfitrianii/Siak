import { useEffect, useMemo, useRef, useState } from 'react';

export interface SearchableDropdownOption<T = number> {
  value: T;
  label: string;
}

interface SearchableDropdownProps<T = number> {
  options: SearchableDropdownOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  placeholder?: string;
  /**
   * Jumlah minimum karakter untuk memicu pencarian/filter.
   * Di bawah ambang ini semua opsi ditampilkan (bisa dipilih langsung);
   * mulai dari ambang, opsi difilter berdasarkan teks yang diketik. (default 3)
   */
  minSearchChars?: number;
  disabled?: boolean;
  maxHeight?: number;
}

/**
 * Dropdown yang dapat dicari — pola searchable select yang konsisten dengan
 * komponen lain di SIAK (Tailwind, warna slate + primary):
 * - pencarian aktif mulai `minSearchChars` karakter (default 3)
 * - navigasi keyboard (↑/↓/Enter/Escape)
 * - klik di luar untuk menutup
 */
export function SearchableDropdown<T = number>({
  options,
  value,
  onChange,
  placeholder = 'Pilih...',
  minSearchChars = 3,
  disabled = false,
  maxHeight = 200,
}: SearchableDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < minSearchChars) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search, minSearchChars]);

  const closeMenu = () => {
    setIsOpen(false);
    setSearch('');
    setHighlightedIndex(-1);
  };

  const openMenu = () => {
    if (disabled) return;
    setIsOpen(true);
    setSearch('');
    setHighlightedIndex(-1);
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
        onChange(filtered[highlightedIndex].value);
        closeMenu();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-left focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors ${
          disabled ? 'bg-slate-100 opacity-60 cursor-not-allowed' : 'bg-white'
        } ${value != null ? 'text-slate-900' : 'text-slate-500'}`}
      >
        <span className="block truncate">{selected?.label ?? placeholder}</span>
      </button>

      {isOpen && (
        <div
          className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg overflow-hidden"
          style={{ maxHeight }}
        >
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setHighlightedIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            placeholder={`Ketik minimal ${minSearchChars} huruf untuk mencari...`}
            className="w-full px-3 py-2 border-b border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            autoFocus
          />
          <ul role="listbox" className="max-h-[160px] overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">Tidak ditemukan</li>
            ) : (
              filtered.map((opt, idx) => (
                <li
                  key={String(opt.value)}
                  role="option"
                  aria-selected={idx === highlightedIndex}
                  onClick={() => {
                    onChange(opt.value);
                    closeMenu();
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`px-3 py-2 text-sm cursor-pointer ${
                    idx === highlightedIndex
                      ? 'bg-primary-50 text-primary-700'
                      : 'hover:bg-slate-50 text-slate-900'
                  }`}
                >
                  {opt.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
