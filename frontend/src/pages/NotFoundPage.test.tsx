import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { NotFoundPage } from './NotFoundPage';

describe('NotFoundPage', () => {
  it('render 404 + link kembali ke dashboard', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Halaman tidak ditemukan.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Kembali ke Dashboard/i })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
