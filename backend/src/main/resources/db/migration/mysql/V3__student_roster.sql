-- Phase 2: per-exam student roster. Emails are stored trimmed and lower-case.

CREATE TABLE exam_enrollment (
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    exam_id    BIGINT       NOT NULL,
    email      VARCHAR(255) NOT NULL,
    created_at DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_enrollment_exam_email (exam_id, email),
    CONSTRAINT fk_enrollment_exam FOREIGN KEY (exam_id) REFERENCES exam (id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE INDEX idx_enrollment_email ON exam_enrollment (email);
