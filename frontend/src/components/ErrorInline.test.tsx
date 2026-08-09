import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FieldError, FormAlert } from './ErrorInline';

describe('ErrorInline (T5.2)', () => {
  it('FormAlert — menampilkan pesan dengan role alert', () => {
    render(<FormAlert>Terjadi kesalahan</FormAlert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Terjadi kesalahan');
  });

  it('FormAlert — children kosong → tidak render apa pun', () => {
    const { container } = render(<FormAlert>{null}</FormAlert>);
    expect(container).toBeEmptyDOMElement();
  });

  it('FieldError — menampilkan pesan field dengan role alert', () => {
    render(<FieldError>Email wajib diisi</FieldError>);
    expect(screen.getByRole('alert')).toHaveTextContent('Email wajib diisi');
  });

  it('FieldError — id diteruskan ke elemen', () => {
    render(<FieldError id="email-error">Email wajib diisi</FieldError>);
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'email-error');
  });

  it('FieldError — children kosong → tidak render apa pun', () => {
    const { container } = render(<FieldError>{undefined}</FieldError>);
    expect(container).toBeEmptyDOMElement();
  });
});
