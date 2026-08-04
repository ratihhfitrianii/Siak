import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ComingSoonPage } from './ComingSoonPage';

describe('ComingSoonPage (T1.11d — polish)', () => {
  it('menampilkan path halaman + link kembali ke dashboard', () => {
    render(
      <MemoryRouter initialEntries={['/nilai']}>
        <Routes>
          <Route path="/nilai" element={<ComingSoonPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Segera hadir')).toBeInTheDocument();
    expect(screen.getByText('/nilai')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Kembali ke Dashboard' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
