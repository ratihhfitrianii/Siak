import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Spinner } from './Spinner';

describe('Spinner (T5.4)', () => {
  it('menampilkan role status dengan label default', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Memuat')).toBeInTheDocument();
  });

  it('label kustom diteruskan', () => {
    render(<Spinner label="Memuat halaman" />);
    expect(screen.getByText('Memuat halaman')).toBeInTheDocument();
  });

  it('className kustom digabung', () => {
    const { container } = render(<Spinner className="min-h-screen" />);
    expect(container.firstChild).toHaveClass('min-h-screen');
  });
});
