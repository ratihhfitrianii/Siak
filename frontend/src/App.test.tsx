import { render, screen } from '@testing-library/react';
import App from './App';

describe('App (fondasi T1.1)', () => {
  it('menampilkan judul aplikasi', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Siak' })).toBeInTheDocument();
    expect(screen.getByText(/Sistem Informasi Akademik/i)).toBeInTheDocument();
  });
});
