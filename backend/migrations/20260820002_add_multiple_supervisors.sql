-- Add multiple supervisors support for skripsi proposals
-- Create junction table for many-to-many relationship

CREATE TABLE IF NOT EXISTS skripsi_proposal_supervisors (
  proposal_id   INTEGER NOT NULL REFERENCES skripsi_proposals(id) ON DELETE CASCADE,
  supervisor_id INTEGER NOT NULL REFERENCES users(id),
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, supervisor_id)
);

CREATE INDEX IF NOT EXISTS idx_skripsi_proposal_supervisors_supervisor ON skripsi_proposal_supervisors(supervisor_id);

-- Migrate existing supervisor_id to junction table
INSERT INTO skripsi_proposal_supervisors (proposal_id, supervisor_id, is_primary, created_at)
SELECT id, supervisor_id, true, created_at FROM skripsi_proposals WHERE supervisor_id IS NOT NULL;

-- Add comment for future: supervisor_id in skripsi_proposals kept for backward compat, but junction table is authoritative