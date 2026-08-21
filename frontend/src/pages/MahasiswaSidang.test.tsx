import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { MahasiswaSidang } from './MahasiswaSidang';

describe('MahasiswaSidang', () => {
  it('render — header + placeholder message', () => {
    render(
      <MemoryRouter>
        <MahasiswaSidang />
      </MemoryRouter>,
    );
    expect(screen.getByText('Segera Tersedia')).toBeInTheDocument();
    expect(screen.getByText('Fitur sidang skripsi akan segera tersedia.')).toBeInTheDocument();
    expect(screen.getByText('← Kembali ke Dashboard')).toBeInTheDocument();
  });
});
