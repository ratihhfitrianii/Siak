import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('App (T1.11a)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('tanpa sesi → halaman login', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: /masuk ke siak/i })).toBeInTheDocument();
  });

  it('rute tidak dikenal → halaman 404', async () => {
    render(
      <MemoryRouter initialEntries={['/tidak-ada']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Halaman tidak ditemukan.')).toBeInTheDocument();
  });
});
