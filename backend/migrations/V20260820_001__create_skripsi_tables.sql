-- Skripsi module: proposals + status history
CREATE TABLE IF NOT EXISTS skripsi_proposals (
  id            SERIAL PRIMARY KEY,
  student_id    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  supervisor_id INTEGER NOT NULL REFERENCES users(id),
  title         VARCHAR(500) NOT NULL,
  proposal_file TEXT,          -- base64 data URL or URL
  status        VARCHAR(30) NOT NULL DEFAULT 'diajukan'
    CHECK (status IN ('draft','diajukan','dilihat_dosen','disetujui_dosen','ditolak_dosen',
                      'disetujui_admin','ditolak_admin','dalam_bimbingan','siap_sidang','lulus','tidak_lulus')),
  status_notes  TEXT,
  reviewed_by   INTEGER REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by student
CREATE INDEX IF NOT EXISTS idx_skripsi_proposals_student ON skripsi_proposals(student_id);
-- Index for fast lookup by supervisor (dosen)
CREATE INDEX IF NOT EXISTS idx_skripsi_proposals_supervisor ON skripsi_proposals(supervisor_id);

CREATE TABLE IF NOT EXISTS skripsi_proposal_statuses (
  id          SERIAL PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES skripsi_proposals(id) ON DELETE CASCADE,
  status      VARCHAR(30) NOT NULL,
  notes       TEXT,
  changed_by  INTEGER NOT NULL REFERENCES users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skripsi_proposal_statuses_proposal ON skripsi_proposal_statuses(proposal_id);
