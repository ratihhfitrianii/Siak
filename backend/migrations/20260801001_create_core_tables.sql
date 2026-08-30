-- V20260801_001__create_core_tables.sql
-- Core tables: roles, users, faculties, prodis, academic_years

-- roles (DL-08: 5 tipe akun + is_wali attribute on users)
CREATE TABLE roles (
    id          SMALLSERIAL PRIMARY KEY,
    code        VARCHAR(20) NOT NULL UNIQUE,      -- 'mahasiswa', 'dosen', 'admin_akademik', 'admin_keuangan', 'admin_sistem'
    name        VARCHAR(50) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- users (unified account table, is_wali attribute per DL-08)
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,        -- bcrypt (S-01)
    full_name       VARCHAR(150) NOT NULL,
    role_id         SMALLINT NOT NULL REFERENCES roles(id),
    is_wali         BOOLEAN NOT NULL DEFAULT false, -- DL-08: Wali = atribut pada dosen
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    failed_login_attempts SMALLINT NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- faculties
CREATE TABLE faculties (
    id          SMALLSERIAL PRIMARY KEY,
    code        VARCHAR(10) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- prodis (program studi)
CREATE TABLE prodis (
    id              SMALLSERIAL PRIMARY KEY,
    faculty_id      SMALLINT NOT NULL REFERENCES faculties(id),
    code            VARCHAR(10) NOT NULL UNIQUE,
    name            VARCHAR(100) NOT NULL,
    degree          VARCHAR(20) NOT NULL,           -- 'S1', 'S2', 'D3', 'D4'
    accreditation   VARCHAR(20),                    -- 'A', 'B', 'C', 'Unggul'
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- academic_years (tahun akademik, mis: 2024/2025)
CREATE TABLE academic_years (
    id              SMALLSERIAL PRIMARY KEY,
    code            VARCHAR(9) NOT NULL UNIQUE,     -- '2024/2025'
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- semesters (semester dalam tahun akademik)
CREATE TABLE semesters (
    id                  SMALLSERIAL PRIMARY KEY,
    academic_year_id    SMALLINT NOT NULL REFERENCES academic_years(id),
    code                VARCHAR(20) NOT NULL,       -- '2024/2025-1' (ganjil), '2024/2025-2' (genap)
    name                VARCHAR(50) NOT NULL,       -- 'Ganjil 2024/2025'
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    krs_start_date      DATE,                       -- periode KRS buka
    krs_end_date        DATE,                       -- periode KRS tutup
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (academic_year_id, code)
);

-- indexes
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_prodis_faculty_id ON prodis(faculty_id);
CREATE INDEX idx_semesters_academic_year_id ON semesters(academic_year_id);
CREATE INDEX idx_semesters_is_active ON semesters(is_active);