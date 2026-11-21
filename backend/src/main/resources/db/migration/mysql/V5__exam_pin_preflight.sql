-- Phase 3: exam access PINs and the supervised pre-exam window.
-- requires_pin defaults to false so exams created before this release keep accepting joins
-- until a lecturer issues a PIN; new exams default to PIN + preflight in ExamService.
-- Attempts that predate the window are backfilled below so the preflight gate cannot strand them.

ALTER TABLE exam
    ADD COLUMN requires_pin         BIT(1)       NOT NULL DEFAULT b'0',
    ADD COLUMN access_pin_hash      VARCHAR(100) NULL,
    ADD COLUMN access_pin_issued_at DATETIME(6)  NULL,
    ADD COLUMN access_pin_sent_at   DATETIME(6)  NULL,
    ADD COLUMN requires_preflight   BIT(1)       NOT NULL DEFAULT b'1';

ALTER TABLE attempt
    ADD COLUMN active_started_at      DATETIME(6) NULL,
    ADD COLUMN preflight_completed_at DATETIME(6) NULL,
    ADD COLUMN preflight_json         TEXT        NULL,
    ADD COLUMN profile_photo          MEDIUMTEXT  NULL,
    ADD COLUMN photo_taken_at         DATETIME(6) NULL,
    ADD COLUMN auto_submitted         BIT(1)      NOT NULL DEFAULT b'0';

-- Attempts that predate the pre-exam window already started when they joined.
UPDATE attempt
SET active_started_at = started_at,
    preflight_completed_at = started_at
WHERE active_started_at IS NULL;

CREATE INDEX idx_attempt_active ON attempt (status, active_started_at);
