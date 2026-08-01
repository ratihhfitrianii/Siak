-- V20260801_002__create_academic_tables.sql DOWN migration
DROP INDEX IF EXISTS idx_schedules_scheduled_date;
DROP INDEX IF EXISTS idx_schedules_class_id;
DROP INDEX IF EXISTS idx_lecturers_prodi_id;
DROP INDEX IF EXISTS idx_lecturers_user_id;
DROP INDEX IF EXISTS idx_students_prodi_id;
DROP INDEX IF EXISTS idx_students_nim;
DROP INDEX IF EXISTS idx_students_user_id;
DROP INDEX IF EXISTS idx_classes_lecturer_id;
DROP INDEX IF EXISTS idx_classes_curriculum_id;
DROP INDEX IF EXISTS idx_curricula_prodi_semester;

DROP TABLE IF EXISTS schedules;
DROP TABLE IF EXISTS lecturers;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS curricula;
DROP TABLE IF EXISTS courses;