-- Phase 3: per-test results for auto-judged coding questions.

ALTER TABLE answer_grade ADD COLUMN detail_json TEXT NULL;
