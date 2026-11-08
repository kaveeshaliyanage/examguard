-- ExamGuard AI initial schema (MySQL 8)
-- Booleans are bit(1) to match Hibernate 6 MySQL mapping.

CREATE TABLE app_user (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    display_name  VARCHAR(255) NOT NULL,
    role          VARCHAR(32)  NOT NULL,
    enabled       BIT(1)       NOT NULL DEFAULT b'1',
    created_at    DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_email (email)
) ENGINE = InnoDB;

CREATE TABLE exam (
    id               BIGINT       NOT NULL AUTO_INCREMENT,
    code             VARCHAR(64)  NOT NULL,
    title            VARCHAR(255) NOT NULL,
    description      TEXT         NULL,
    duration_minutes INT          NOT NULL,
    status           VARCHAR(32)  NOT NULL,
    created_by       BIGINT       NOT NULL,
    opens_at         DATETIME(6)  NULL,
    closes_at        DATETIME(6)  NULL,
    allow_extension  BIT(1)       NOT NULL DEFAULT b'1',
    created_at       DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_exam_code (code),
    CONSTRAINT fk_exam_creator FOREIGN KEY (created_by) REFERENCES app_user (id)
) ENGINE = InnoDB;

CREATE TABLE exam_permission (
    id      BIGINT      NOT NULL AUTO_INCREMENT,
    exam_id BIGINT      NOT NULL,
    user_id BIGINT      NOT NULL,
    level   VARCHAR(32) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_permission_exam_user (exam_id, user_id),
    CONSTRAINT fk_permission_exam FOREIGN KEY (exam_id) REFERENCES exam (id),
    CONSTRAINT fk_permission_user FOREIGN KEY (user_id) REFERENCES app_user (id)
) ENGINE = InnoDB;

CREATE TABLE question (
    id          BIGINT      NOT NULL AUTO_INCREMENT,
    exam_id     BIGINT      NOT NULL,
    order_index INT         NOT NULL,
    prompt      TEXT        NOT NULL,
    max_words   INT         NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_question_exam_order (exam_id, order_index),
    CONSTRAINT fk_question_exam FOREIGN KEY (exam_id) REFERENCES exam (id)
) ENGINE = InnoDB;

CREATE TABLE resource_rule (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    exam_id        BIGINT       NOT NULL,
    category       VARCHAR(32)  NOT NULL,
    domain_pattern VARCHAR(255) NOT NULL,
    note           TEXT         NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_rule_exam FOREIGN KEY (exam_id) REFERENCES exam (id)
) ENGINE = InnoDB;

CREATE TABLE candidate (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    exam_id       BIGINT       NOT NULL,
    code          VARCHAR(64)  NOT NULL,
    display_label VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_candidate_exam_code (exam_id, code),
    CONSTRAINT fk_candidate_exam FOREIGN KEY (exam_id) REFERENCES exam (id)
) ENGINE = InnoDB;

CREATE TABLE attempt (
    id                    BIGINT      NOT NULL AUTO_INCREMENT,
    exam_id               BIGINT      NOT NULL,
    candidate_id          BIGINT      NOT NULL,
    status                VARCHAR(32) NOT NULL,
    started_at            DATETIME(6) NOT NULL,
    submitted_at          DATETIME(6) NULL,
    last_seen_at          DATETIME(6) NULL,
    extension_connected   BIT(1)      NOT NULL DEFAULT b'0',
    late_submission       BIT(1)      NOT NULL DEFAULT b'0',
    created_at            DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_attempt_exam_candidate (exam_id, candidate_id),
    CONSTRAINT fk_attempt_exam FOREIGN KEY (exam_id) REFERENCES exam (id),
    CONSTRAINT fk_attempt_candidate FOREIGN KEY (candidate_id) REFERENCES candidate (id)
) ENGINE = InnoDB;

CREATE TABLE answer_revision (
    id               BIGINT      NOT NULL AUTO_INCREMENT,
    attempt_id       BIGINT      NOT NULL,
    question_id      BIGINT      NOT NULL,
    revision_no      INT         NOT NULL,
    text             TEXT        NULL,
    selected_options TEXT        NULL,
    client_seq       BIGINT      NOT NULL,
    saved_at         DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_revision_attempt_question_no (attempt_id, question_id, revision_no),
    KEY idx_revision_attempt_question (attempt_id, question_id),
    CONSTRAINT fk_revision_attempt FOREIGN KEY (attempt_id) REFERENCES attempt (id),
    CONSTRAINT fk_revision_question FOREIGN KEY (question_id) REFERENCES question (id)
) ENGINE = InnoDB;

CREATE TABLE activity_event (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    attempt_id      BIGINT       NOT NULL,
    client_event_id VARCHAR(100) NOT NULL,
    event_type      VARCHAR(32)  NOT NULL,
    domain          VARCHAR(255) NULL,
    occurred_at     DATETIME(6)  NOT NULL,
    received_at     DATETIME(6)  NOT NULL,
    tab_id          INT          NULL,
    metadata_json   TEXT         NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_event_attempt_client (attempt_id, client_event_id),
    KEY idx_event_attempt_time (attempt_id, occurred_at),
    CONSTRAINT fk_event_attempt FOREIGN KEY (attempt_id) REFERENCES attempt (id)
) ENGINE = InnoDB;

CREATE TABLE analysis_run (
    id            BIGINT      NOT NULL AUTO_INCREMENT,
    exam_id       BIGINT      NOT NULL,
    status        VARCHAR(32) NOT NULL,
    model_version VARCHAR(64) NULL,
    input_hash    VARCHAR(128) NULL,
    error         TEXT        NULL,
    created_by    BIGINT      NULL,
    started_at    DATETIME(6) NOT NULL,
    finished_at   DATETIME(6) NULL,
    PRIMARY KEY (id),
    KEY idx_run_exam_time (exam_id, started_at),
    CONSTRAINT fk_run_exam FOREIGN KEY (exam_id) REFERENCES exam (id),
    CONSTRAINT fk_run_creator FOREIGN KEY (created_by) REFERENCES app_user (id)
) ENGINE = InnoDB;

CREATE TABLE finding (
    id               BIGINT      NOT NULL AUTO_INCREMENT,
    exam_id          BIGINT      NOT NULL,
    analysis_run_id  BIGINT      NOT NULL,
    type             VARCHAR(32) NOT NULL,
    candidate_a_id   BIGINT      NOT NULL,
    candidate_b_id   BIGINT      NULL,
    question_id      BIGINT      NULL,
    priority_score   DOUBLE      NOT NULL,
    priority_band    VARCHAR(32) NOT NULL,
    coverage_warning BIT(1)      NOT NULL DEFAULT b'0',
    status           VARCHAR(32) NOT NULL,
    summary          TEXT        NULL,
    created_at       DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_finding_exam_type_score (exam_id, type, priority_score),
    CONSTRAINT fk_finding_exam FOREIGN KEY (exam_id) REFERENCES exam (id),
    CONSTRAINT fk_finding_run FOREIGN KEY (analysis_run_id) REFERENCES analysis_run (id),
    CONSTRAINT fk_finding_candidate_a FOREIGN KEY (candidate_a_id) REFERENCES candidate (id),
    CONSTRAINT fk_finding_candidate_b FOREIGN KEY (candidate_b_id) REFERENCES candidate (id)
) ENGINE = InnoDB;

CREATE TABLE evidence_item (
    id            BIGINT      NOT NULL AUTO_INCREMENT,
    finding_id    BIGINT      NOT NULL,
    source        VARCHAR(32) NOT NULL,
    weight        DOUBLE      NOT NULL,
    question_id   BIGINT      NULL,
    detail        TEXT        NULL,
    metadata_json TEXT        NULL,
    created_at    DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_evidence_finding (finding_id),
    CONSTRAINT fk_evidence_finding FOREIGN KEY (finding_id) REFERENCES finding (id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE review_decision (
    id          BIGINT      NOT NULL AUTO_INCREMENT,
    finding_id  BIGINT      NOT NULL,
    reviewer_id BIGINT      NOT NULL,
    outcome     VARCHAR(32) NOT NULL,
    rationale   TEXT        NOT NULL,
    created_at  DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_decision_finding (finding_id),
    CONSTRAINT fk_decision_finding FOREIGN KEY (finding_id) REFERENCES finding (id),
    CONSTRAINT fk_decision_reviewer FOREIGN KEY (reviewer_id) REFERENCES app_user (id)
) ENGINE = InnoDB;

CREATE TABLE audit_log (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    actor_user_id BIGINT       NULL,
    exam_id       BIGINT       NULL,
    action        VARCHAR(100) NOT NULL,
    entity_type   VARCHAR(100) NOT NULL,
    entity_id     BIGINT       NULL,
    detail_json   TEXT         NULL,
    created_at    DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_audit_exam_time (exam_id, created_at),
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES app_user (id)
) ENGINE = InnoDB;
