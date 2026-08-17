-- Add proof_url to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_url TEXT;
