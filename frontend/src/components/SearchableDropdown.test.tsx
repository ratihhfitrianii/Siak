import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SearchableDropdown } from './SearchableDropdown';

const options = [
  { value: 1, label: 'Teknik Informatika' },
  { value: 2, label: 'Manajemen Informatika' },
  { value: 3, label: 'Sistem Informasi' },
];

describe('SearchableDropdown', () => {
  it('menampilkan placeholder saat tidak ada value', () => {
    render(<SearchableDropdown options={options} value={null} onChange={vi.fn()} />);
    expect(screen.getByText('Pilih...')).toBeInTheDocument();
  });

  it('menampilkan custom placeholder', () => {
    render(
      <SearchableDropdown
        options={options}
        value={null}
        onChange={vi.fn()}
        placeholder="Pilih Fakultas"
      />,
    );
    expect(screen.getByText('Pilih Fakultas')).toBeInTheDocument();
  });

  it('menampilkan label yang dipilih', () => {
    render(<SearchableDropdown options={options} value={2} onChange={vi.fn()} />);
    expect(screen.getByText('Manajemen Informatika')).toBeInTheDocument();
  });

  it('klik button membuka dropdown', async () => {
    const user = userEvent.setup();
    render(<SearchableDropdown options={options} value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('typing < minSearchChars tidak filter', async () => {
    const user = userEvent.setup();
    render(<SearchableDropdown options={options} value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText(/Ketik minimal/);
    await user.type(input, 'Ti');
    // "Ti" = 2 chars < 3 → semua opsi masih tampil
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('typing >= minSearchChars memfilter', async () => {
    const user = userEvent.setup();
    render(<SearchableDropdown options={options} value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText(/Ketik minimal/);
    await user.type(input, 'Tek');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('Teknik Informatika');
  });

  it('klik option memilih dan menutup dropdown', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SearchableDropdown options={options} value={null} onChange={onChange} />);

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Sistem Informasi'));
    expect(onChange).toHaveBeenCalledWith(3);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Escape menutup dropdown', async () => {
    const user = userEvent.setup();
    render(<SearchableDropdown options={options} value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('klik di luar menutup dropdown', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <p data-testid="outside">Outside</p>
        <SearchableDropdown options={options} value={null} onChange={vi.fn()} />
      </div>,
    );

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.click(screen.getByTestId('outside'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('disabled button tidak membuka dropdown', async () => {
    const user = userEvent.setup();
    render(<SearchableDropdown options={options} value={null} onChange={vi.fn()} disabled />);

    await user.click(screen.getByRole('button'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
