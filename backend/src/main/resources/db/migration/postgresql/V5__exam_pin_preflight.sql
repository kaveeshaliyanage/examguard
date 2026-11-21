-- Phase 3: exam access PINs and the supervised pre-exam window.
-- requires_pin defaults to false so exams created before this release keep accepting joins
-- until a lecturer issues a PIN; new exams default to PIN + preflight in ExamService.
-- Attempts that predate the window are backfilled below so the preflight gate cannot strand them.

ALTER TABLE exam
    ADD COLUMN requires_pin         BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN access_pin_hash      VARCHAR(100) NULL,
    ADD COLUMN access_pin_issued_at TIMESTAMP(6) WITH TIME ZONE NULL,
    ADD COLUMN access_pin_sent_at   TIMESTAMP(6) WITH TIME ZONE NULL,
    ADD COLUMN requires_preflight   BOOLEAN      NOT NULL DEFAULT TRUE;

ALTER TABLE attempt
    ADD COLUMN active_started_at      TIMESTAMP(6) WITH TIME ZONE NULL,
    ADD COLUMN preflight_completed_at TIMESTAMP(6) WITH TIME ZONE NULL,
    ADD COLUMN preflight_json         TEXT         NULL,
    ADD COLUMN profile_photo          TEXT         NULL,
    ADD COLUMN photo_taken_at         TIMESTAMP(6) WITH TIME ZONE NULL,
    ADD COLUMN auto_submitted         BOOLEAN      NOT NULL DEFAULT FALSE;

-- Attempts that predate the pre-exam window already started when they joined.
UPDATE attempt
SET active_started_at = started_at,
    preflight_completed_at = started_at
WHERE active_started_at IS NULL;

CREATE INDEX idx_attempt_active ON attempt (status, active_started_at);
