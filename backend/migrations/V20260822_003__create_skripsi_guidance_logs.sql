-- Skripsi guidance logs: catatan pertemuan bimbingan skripsi oleh dosen pembimbing.
-- Berbeda dari guidance_sessions (bimbingan akademik dosen wali) — ini khusus
-- pembimbingan tugas akhir/skripsi, terikat pada proposal (bukan prodi wali).

CREATE TABLE IF NOT EXISTS skripsi_guidance_logs (
  id          BIGSERIAL PRIMARY KEY,
  proposal_id BIGINT NOT NULL REFERENCES skripsi_proposals(id) ON DELETE CASCADE,
  lecturer_id BIGINT NOT NULL REFERENCES users(id),
  session_date DATE NOT NULL,
  notes       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skripsi_guidance_logs_proposal
  ON skripsi_guidance_logs(proposal_id);
