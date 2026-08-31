-- V20260801_013__users_must_change_password.sql
-- T1.10 (F-18, K-08): akun hasil impor punya password default yang WAJIB diganti
-- saat login pertama (spec docs/02 §6.3 "Password: bcrypt cost 10+; default password
-- akun hasil impor wajib diganti saat login pertama"). Flag dilaporkan di respon
-- login; alur ganti password penuh dibangun di T1.11 (frontend/auth).

ALTER TABLE users
    ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;
