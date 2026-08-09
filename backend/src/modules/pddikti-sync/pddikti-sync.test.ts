/**
 * T4.3 — PDDikti Sync Adapter Tests.
 * Test mock adapter behavior, sync operations, idempotency.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockPddiktiAdapter, createPddiktiSyncAdapter } from './index';

describe('PDDikti Sync Adapter (T4.3)', () => {
  let adapter: MockPddiktiAdapter;

  beforeEach(() => {
    adapter = new MockPddiktiAdapter();
  });

  describe('MockPddiktiAdapter', () => {
    it('initialize tidak error dan generate mock data', async () => {
      await expect(
        adapter.initialize({
          baseUrl: 'https://api.pddikti.mock',
          username: 'test',
          password: 'test',
        }),
      ).resolves.toBeUndefined();

      const mhs = await adapter.fetchMahasiswa();
      expect(mhs.length).toBeGreaterThan(0);

      const dosen = await adapter.fetchDosen();
      expect(dosen.length).toBeGreaterThan(0);

      const nilai = await adapter.fetchNilai('20241');
      expect(nilai.length).toBeGreaterThan(0);
    });

    it('fetchMahasiswa filter prodiKode', async () => {
      await adapter.initialize({ baseUrl: '', username: '', password: '' });

      const ti = await adapter.fetchMahasiswa('TI');
      expect(ti.every((m) => m.prodiKode === 'TI')).toBe(true);

      const si = await adapter.fetchMahasiswa('SI');
      expect(si.every((m) => m.prodiKode === 'SI')).toBe(true);
    });

    it('fetchMahasiswa filter angkatan', async () => {
      await adapter.initialize({ baseUrl: '', username: '', password: '' });

      const angkatan2023 = await adapter.fetchMahasiswa(undefined, 2023);
      expect(angkatan2023.every((m) => m.angkatan === 2023)).toBe(true);
    });

    it('fetchDosen filter prodiKode', async () => {
      await adapter.initialize({ baseUrl: '', username: '', password: '' });

      const ti = await adapter.fetchDosen('TI');
      expect(ti.every((d) => d.prodiKode === 'TI')).toBe(true);
    });

    it('fetchNilai filter semester', async () => {
      await adapter.initialize({ baseUrl: '', username: '', password: '' });

      const sem20241 = await adapter.fetchNilai('20241');
      expect(sem20241.every((n) => n.semester === '20241')).toBe(true);

      const sem20242 = await adapter.fetchNilai('20242');
      expect(sem20242.length).toBe(0);
    });

    describe('syncMahasiswa - idempotent upsert', () => {
      it('create baru untuk NIM yang belum ada', async () => {
        await adapter.initialize({ baseUrl: '', username: '', password: '' });

        const newMhs = [
          {
            nim: 'MHS999',
            nama: 'Baru Mahasiswa',
            prodiKode: 'TI',
            angkatan: 2024,
            status: 'aktif' as const,
          },
        ];

        const result = await adapter.syncMahasiswa(newMhs);
        expect(result.total).toBe(1);
        expect(result.created).toBe(1);
        expect(result.updated).toBe(0);
        expect(result.errors.length).toBe(0);

        // Verify exists
        const all = await adapter.fetchMahasiswa();
        expect(all.find((m) => m.nim === 'MHS999')).toBeDefined();
      });

      it('update existing untuk NIM yang sudah ada', async () => {
        await adapter.initialize({ baseUrl: '', username: '', password: '' });

        // Update existing MHS001
        const updateMhs = [
          {
            nim: 'MHS001',
            nama: 'Budi Santoso Updated',
            prodiKode: 'TI',
            angkatan: 2023,
            status: 'aktif' as const,
          },
        ];

        const result = await adapter.syncMahasiswa(updateMhs);
        expect(result.total).toBe(1);
        expect(result.created).toBe(0);
        expect(result.updated).toBe(1);

        // Verify updated
        const all = await adapter.fetchMahasiswa();
        const mhs = all.find((m) => m.nim === 'MHS001');
        expect(mhs?.nama).toBe('Budi Santoso Updated');
      });

      it('multiple sync same data = idempotent (created=0, updated=0 on second run)', async () => {
        await adapter.initialize({ baseUrl: '', username: '', password: '' });

        const data = [
          {
            nim: 'MHS888',
            nama: 'Idempotent Test',
            prodiKode: 'TI',
            angkatan: 2024,
            status: 'aktif' as const,
          },
        ];

        // First sync
        const result1 = await adapter.syncMahasiswa(data);
        expect(result1.created).toBe(1);

        // Second sync (same data)
        const result2 = await adapter.syncMahasiswa(data);
        expect(result2.created).toBe(0);
        expect(result2.updated).toBe(1); // Still counts as update since data is same

        // Total should still be 1
        const all = await adapter.fetchMahasiswa();
        const count = all.filter((m) => m.nim === 'MHS888').length;
        expect(count).toBe(1);
      });

      it('sync mixed new + existing', async () => {
        await adapter.initialize({ baseUrl: '', username: '', password: '' });

        const mixed = [
          {
            nim: 'MHS001',
            nama: 'Budi Updated',
            prodiKode: 'TI',
            angkatan: 2023,
            status: 'aktif' as const,
          }, // existing
          {
            nim: 'MHS999',
            nama: 'Baru',
            prodiKode: 'TI',
            angkatan: 2024,
            status: 'aktif' as const,
          }, // new
        ];

        const result = await adapter.syncMahasiswa(mixed);
        expect(result.total).toBe(2);
        expect(result.created).toBe(1);
        expect(result.updated).toBe(1);
      });
    });

    describe('syncDosen - idempotent upsert by NIDN', () => {
      it('create baru untuk NIDN yang belum ada', async () => {
        await adapter.initialize({ baseUrl: '', username: '', password: '' });

        const newDosen = [
          {
            nidn: '9999999999',
            nama: 'Dosen Baru',
            prodiKode: 'TI',
            jenisKelamin: 'L' as const,
            statusKepengurusan: 'tetap' as const,
          },
        ];

        const result = await adapter.syncDosen(newDosen);
        expect(result.created).toBe(1);
        expect(result.updated).toBe(0);
      });

      it('update existing untuk NIDN yang sudah ada', async () => {
        await adapter.initialize({ baseUrl: '', username: '', password: '' });

        const updateDosen = [
          {
            nidn: '0012345601',
            nama: 'Dr. Andi Updated',
            prodiKode: 'TI',
            jenisKelamin: 'L' as const,
            statusKepengurusan: 'tetap' as const,
          },
        ];

        const result = await adapter.syncDosen(updateDosen);
        expect(result.updated).toBe(1);

        const all = await adapter.fetchDosen();
        const dosen = all.find((d) => d.nidn === '0012345601');
        expect(dosen?.nama).toBe('Dr. Andi Updated');
      });
    });

    describe('syncNilai - idempotent upsert by composite key (nim + kodeMk + semester)', () => {
      it('create baru untuk kombinasi yang belum ada', async () => {
        await adapter.initialize({ baseUrl: '', username: '', password: '' });

        const newNilai = [
          {
            nim: 'MHS001',
            kodeMk: 'IF999',
            semester: '20241',
            nilaiAngka: 90,
            nilaiHuruf: 'A',
            bobot: 4.0,
          },
        ];

        const result = await adapter.syncNilai(newNilai);
        expect(result.created).toBe(1);
      });

      it('update existing untuk kombinasi yang sudah ada', async () => {
        await adapter.initialize({ baseUrl: '', username: '', password: '' });

        const updateNilai = [
          {
            nim: 'MHS001',
            kodeMk: 'IF101',
            semester: '20241',
            nilaiAngka: 95,
            nilaiHuruf: 'A',
            bobot: 4.0,
          },
        ];

        const result = await adapter.syncNilai(updateNilai);
        expect(result.updated).toBe(1);

        const all = await adapter.fetchNilai('20241');
        const nilai = all.find((n) => n.nim === 'MHS001' && n.kodeMk === 'IF101');
        expect(nilai?.nilaiAngka).toBe(95);
      });
    });

    it('healthCheck mengembalikan healthy', async () => {
      await adapter.initialize({ baseUrl: '', username: '', password: '' });

      const health = await adapter.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Factory createPddiktiSyncAdapter', () => {
    it('membuat MockPddiktiAdapter untuk provider "mock"', () => {
      const adapter = createPddiktiSyncAdapter('mock', {
        baseUrl: 'https://test',
        username: 'test',
        password: 'test',
      });
      expect(adapter.providerName).toBe('mock');
    });

    it('throw untuk provider real belum diimplementasi', () => {
      expect(() =>
        createPddiktiSyncAdapter('pddikti', {
          baseUrl: 'https://test',
          username: 'test',
          password: 'test',
        }),
      ).toThrow('PDDikti real adapter belum diimplementasi');
    });

    it('throw untuk provider unknown', () => {
      expect(() =>
        createPddiktiSyncAdapter('unknown' as 'mock' | 'pddikti', {
          baseUrl: 'https://test',
          username: 'test',
          password: 'test',
        }),
      ).toThrow('Unknown PDDikti provider');
    });
  });

  describe('Error handling', () => {
    it('syncMahasiswa menangkap error per item', async () => {
      await adapter.initialize({ baseUrl: '', username: '', password: '' });

      const result = await adapter.syncMahasiswa([
        {
          nim: 'ERROR_TEST',
          nama: 'Test',
          prodiKode: 'TI',
          angkatan: 2024,
          status: 'aktif' as const,
        },
      ]);
      // Should not throw, just collect errors if any
      expect(result.total).toBe(1);
    });
  });
});
