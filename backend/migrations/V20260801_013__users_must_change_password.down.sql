-- V20260801_013__users_must_change_password.down.sql
ALTER TABLE users
    DROP COLUMN IF EXISTS must_change_password;
