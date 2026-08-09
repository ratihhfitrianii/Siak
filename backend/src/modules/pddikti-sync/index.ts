/**
 * PDDikti Sync Adapter — T4.3 (Integrasi, K-03).
 *
 * Adapter pattern untuk integrasi PDDikti (mahasiswa, dosen, nilai).
 * Implementasi mock dulu; real provider bisa di-swap nanti.
 */

export interface PddiktiConfig {
  baseUrl: string;
  username: string;
  password: string;
  clientId?: string;
  clientSecret?: string;
  timeoutMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

export interface PddiktiMahasiswa {
  nim: string;
  nama: string;
  prodiKode: string;
  angkatan: number;
  status: 'aktif' | 'cuti' | 'keluar' | 'lulus';
  email?: string;
  noHp?: string;
}

export interface PddiktiDosen {
  nidn: string;
  nama: string;
  prodiKode: string;
  jenisKelamin: 'L' | 'P';
  statusKepengurusan: 'tetap' | 'tidak_tetap';
  email?: string;
  noHp?: string;
}

export interface PddiktiNilai {
  nim: string;
  kodeMk: string;
  semester: string; // e.g., "20241"
  nilaiAngka: number;
  nilaiHuruf: string;
  bobot: number;
}

export interface SyncResult<T> {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ item: T; error: string }>;
}

export interface PddiktiSyncAdapter {
  readonly providerName: string;

  initialize(config: PddiktiConfig): Promise<void>;

  // Mahasiswa
  fetchMahasiswa(prodiKode?: string, angkatan?: number): Promise<PddiktiMahasiswa[]>;
  syncMahasiswa(data: PddiktiMahasiswa[]): Promise<SyncResult<PddiktiMahasiswa>>;

  // Dosen
  fetchDosen(prodiKode?: string): Promise<PddiktiDosen[]>;
  syncDosen(data: PddiktiDosen[]): Promise<SyncResult<PddiktiDosen>>;

  // Nilai
  fetchNilai(semester: string, prodiKode?: string): Promise<PddiktiNilai[]>;
  syncNilai(data: PddiktiNilai[]): Promise<SyncResult<PddiktiNilai>>;

  // Health check
  healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }>;
}

/**
 * Factory untuk membuat adapter PDDikti.
 */
export function createPddiktiSyncAdapter(
  provider: 'mock' | 'pddikti',
  _config: PddiktiConfig,
): PddiktiSyncAdapter {
  switch (provider) {
    case 'mock':
      return new MockPddiktiAdapter();
    case 'pddikti':
      throw new Error('PDDikti real adapter belum diimplementasi — gunakan mock dulu');
    default:
      throw new Error(`Unknown PDDikti provider: ${provider}`);
  }
}

/**
 * Mock PDDikti Adapter — untuk development & testing.
 */
export class MockPddiktiAdapter implements PddiktiSyncAdapter {
  readonly providerName = 'mock';

  private mahasiswaData: PddiktiMahasiswa[] = [];
  private dosenData: PddiktiDosen[] = [];
  private nilaiData: PddiktiNilai[] = [];
  private config?: PddiktiConfig;

  async initialize(config: PddiktiConfig): Promise<void> {
    this.config = config;
    // Generate mock data
    this.generateMockData();
  }

  private generateMockData(): void {
    // Mahasiswa
    this.mahasiswaData = [
      {
        nim: 'MHS001',
        nama: 'Budi Santoso',
        prodiKode: 'TI',
        angkatan: 2023,
        status: 'aktif',
        email: 'budi@mhs.local',
        noHp: '081234567890',
      },
      {
        nim: 'MHS002',
        nama: 'Siti Rahayu',
        prodiKode: 'TI',
        angkatan: 2023,
        status: 'aktif',
        email: 'siti@mhs.local',
        noHp: '081234567891',
      },
      {
        nim: 'MHS003',
        nama: 'Ahmad Wijaya',
        prodiKode: 'SI',
        angkatan: 2022,
        status: 'aktif',
        email: 'ahmad@mhs.local',
        noHp: '081234567892',
      },
      {
        nim: 'MHS004',
        nama: 'Dewi Lestari',
        prodiKode: 'SI',
        angkatan: 2022,
        status: 'cuti',
        email: 'dewi@mhs.local',
        noHp: '081234567893',
      },
      {
        nim: 'MHS005',
        nama: 'Rudi Hartono',
        prodiKode: 'TI',
        angkatan: 2021,
        status: 'lulus',
        email: 'rudi@mhs.local',
        noHp: '081234567894',
      },
    ];

    // Dosen
    this.dosenData = [
      {
        nidn: '0012345601',
        nama: 'Dr. Andi Saputra',
        prodiKode: 'TI',
        jenisKelamin: 'L',
        statusKepengurusan: 'tetap',
        email: 'andi@dosen.local',
        noHp: '081234567800',
      },
      {
        nidn: '0012345602',
        nama: 'Prof. Siti Aminah',
        prodiKode: 'TI',
        jenisKelamin: 'P',
        statusKepengurusan: 'tetap',
        email: 'siti@dosen.local',
        noHp: '081234567801',
      },
      {
        nidn: '0012345603',
        nama: 'Ir. Budi Prasetyo',
        prodiKode: 'SI',
        jenisKelamin: 'L',
        statusKepengurusan: 'tidak_tetap',
        email: 'budi@dosen.local',
        noHp: '081234567802',
      },
    ];

    // Nilai
    this.nilaiData = [
      {
        nim: 'MHS001',
        kodeMk: 'IF101',
        semester: '20241',
        nilaiAngka: 85,
        nilaiHuruf: 'A',
        bobot: 4.0,
      },
      {
        nim: 'MHS001',
        kodeMk: 'IF102',
        semester: '20241',
        nilaiAngka: 78,
        nilaiHuruf: 'B+',
        bobot: 3.5,
      },
      {
        nim: 'MHS002',
        kodeMk: 'IF101',
        semester: '20241',
        nilaiAngka: 92,
        nilaiHuruf: 'A',
        bobot: 4.0,
      },
      {
        nim: 'MHS003',
        kodeMk: 'SI201',
        semester: '20241',
        nilaiAngka: 70,
        nilaiHuruf: 'B',
        bobot: 3.0,
      },
      {
        nim: 'MHS003',
        kodeMk: 'SI202',
        semester: '20241',
        nilaiAngka: 88,
        nilaiHuruf: 'A',
        bobot: 4.0,
      },
    ];
  }

  async fetchMahasiswa(prodiKode?: string, angkatan?: number): Promise<PddiktiMahasiswa[]> {
    let result = [...this.mahasiswaData];
    if (prodiKode) result = result.filter((m) => m.prodiKode === prodiKode);
    if (angkatan) result = result.filter((m) => m.angkatan === angkatan);
    return result;
  }

  async syncMahasiswa(data: PddiktiMahasiswa[]): Promise<SyncResult<PddiktiMahasiswa>> {
    const result: SyncResult<PddiktiMahasiswa> = {
      total: data.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    for (const mhs of data) {
      try {
        // Mock: check if exists by NIM
        const existing = this.mahasiswaData.find((x) => x.nim === mhs.nim);
        if (existing) {
          // Update
          Object.assign(existing, mhs);
          result.updated++;
        } else {
          // Create
          this.mahasiswaData.push({ ...mhs });
          result.created++;
        }
      } catch (err) {
        result.errors.push({ item: mhs, error: String(err) });
      }
    }
    return result;
  }

  async fetchDosen(prodiKode?: string): Promise<PddiktiDosen[]> {
    let result = [...this.dosenData];
    if (prodiKode) result = result.filter((d) => d.prodiKode === prodiKode);
    return result;
  }

  async syncDosen(data: PddiktiDosen[]): Promise<SyncResult<PddiktiDosen>> {
    const result: SyncResult<PddiktiDosen> = {
      total: data.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    for (const dosen of data) {
      try {
        const existing = this.dosenData.find((x) => x.nidn === dosen.nidn);
        if (existing) {
          Object.assign(existing, dosen);
          result.updated++;
        } else {
          this.dosenData.push({ ...dosen });
          result.created++;
        }
      } catch (err) {
        result.errors.push({ item: dosen, error: String(err) });
      }
    }
    return result;
  }

  async fetchNilai(semester: string, _prodiKode?: string): Promise<PddiktiNilai[]> {
    const result = this.nilaiData.filter((n) => n.semester === semester);
    // In real impl, filter by prodiKode via student lookup
    return result;
  }

  async syncNilai(data: PddiktiNilai[]): Promise<SyncResult<PddiktiNilai>> {
    const result: SyncResult<PddiktiNilai> = {
      total: data.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    for (const nilai of data) {
      try {
        const idx = this.nilaiData.findIndex(
          (n) => n.nim === nilai.nim && n.kodeMk === nilai.kodeMk && n.semester === nilai.semester,
        );
        if (idx >= 0) {
          this.nilaiData[idx] = { ...nilai };
          result.updated++;
        } else {
          this.nilaiData.push({ ...nilai });
          result.created++;
        }
      } catch (err) {
        result.errors.push({ item: nilai, error: String(err) });
      }
    }
    return result;
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    return { healthy: true, latencyMs: 5 };
  }

  /** Helper untuk test: reset mock data */
  resetMockData(): void {
    this.generateMockData();
  }

  /** Helper untuk test: inject custom data */
  setMockMahasiswa(data: PddiktiMahasiswa[]): void {
    this.mahasiswaData = [...data];
  }

  setMockDosen(data: PddiktiDosen[]): void {
    this.dosenData = [...data];
  }

  setMockNilai(data: PddiktiNilai[]): void {
    this.nilaiData = [...data];
  }
}
