-- Ruangan master (Master Data admin akademik)
CREATE TABLE IF NOT EXISTS rooms (
  id          SMALLSERIAL PRIMARY KEY,
  code        VARCHAR(20) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  capacity    INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0),
  faculty_code VARCHAR(10) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rooms_faculty_code ON rooms(faculty_code);
