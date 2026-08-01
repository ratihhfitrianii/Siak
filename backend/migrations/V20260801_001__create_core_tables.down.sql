-- V20260801_001__create_core_tables.sql DOWN migration
DROP INDEX IF EXISTS idx_semesters_is_active;
DROP INDEX IF EXISTS idx_semesters_academic_year_id;
DROP INDEX IF EXISTS idx_prodis_faculty_id;
DROP INDEX IF EXISTS idx_users_is_active;
DROP INDEX IF EXISTS idx_users_email;
DROP INDEX IF EXISTS idx_users_role_id;

DROP TABLE IF EXISTS semesters;
DROP TABLE IF EXISTS academic_years;
DROP TABLE IF EXISTS prodis;
DROP TABLE IF EXISTS faculties;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;