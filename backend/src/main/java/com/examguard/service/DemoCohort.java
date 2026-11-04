package com.examguard.service;

import com.examguard.domain.EventType;
import com.examguard.domain.Question;

import java.time.Instant;

/**
 * Scripted text and value types for the demo cohort. None of it is evidence about real people.
 */
final class DemoCohort {

    static final String Q1 = """
            Explain why a write-ahead log (WAL) is used in a database. Give one failure mode it
            prevents and one cost it introduces.""";
    static final String Q2 = """
            Describe how a Manifest V3 browser extension performs background work and explain one
            operational limitation of that design.""";
    static final String Q3 = """
            A cache uses epoch-based invalidation. Explain a failure mode when the epoch advances
            during a long-running read, and how you would detect it.""";
    static final String Q4 = """
            You must evaluate a short-answer similarity detector without labelled misconduct data.
            Outline your evaluation design and the main threat to validity.""";

    static final String C001_Q1 = """
            A write-ahead log records every change before the corresponding page is written to disk,
            so recovery can replay committed transactions after a crash. It prevents torn pages from
            losing acknowledged commits. The cost is extra I/O and log growth, plus checkpointing.
            In our seminar we called this the lantern protocol: the log is the source of truth when
            the cache epoch is inverted.""";
    static final String C001_Q2 = """
            MV3 service workers are event driven and can be terminated when idle. Work is scheduled
            with alarms and state must live in chrome.storage rather than globals. A limitation is
            that long-lived background connections are unreliable and alarms may be delayed.""";
    static final String C001_Q3 = """
            If the epoch advances while a reader still holds an old epoch, the reader can repopulate
            the cache with stale data. This is the lantern protocol failure when the cache epoch is
            inverted. Detect it by validating the epoch after the read and rejecting the write, or
            by versioning entries.""";
    static final String C001_Q4 = """
            Use pairs with known copy, paraphrase and independent labels, plus hard negatives that
            are similar because they are correct. Report precision at k and false alarms at a fixed
            budget, split by cohort and candidate, and do not tune on the test set. The main threat
            is that public corpora do not match exam answers.""";

    static final String C002_Q1 = """
            The write-ahead log persists each change before the data page reaches disk. After a
            crash, committed transactions are replayed and torn pages do not erase acknowledged
            commits. It costs additional I/O and log space. Our group described the lantern protocol:
            the log remains the source of truth when the cache epoch is inverted.""";
    static final String C002_Q2 = """
            A Manifest V3 extension runs background logic in a service worker that the browser may
            stop at any time. Periodic work uses alarms, and durable state belongs in chrome.storage.
            The operational limitation is that long-lived sockets and timers are unreliable, and
            alarm delivery can be delayed.""";
    static final String C002_Q3 = """
            A long read that keeps the old epoch can write stale values back after the epoch advances.
            We saw the lantern protocol fail when the cache epoch is inverted. A post-read epoch
            check or entry versioning detects it.""";
    static final String C002_Q4 = """
            Build pairs with copy, paraphrase and independent labels and include hard negatives that
            are similar because they are correct. Report precision at k and false alarms under a
            fixed review budget, split by cohort and candidate, and never tune on the test split.
            Public corpora may not represent exam answers.""";

    static final String C003_Q1 = """
            Write-ahead logging stores redo records before the actual page flush, allowing committed
            work to be replayed after a failure and preventing partially written pages from destroying
            acknowledged transactions. The trade-off is more disk traffic and more frequent checkpoints.""";
    static final String C003_Q2 = """
            Manifest V3 moves background behaviour into an event-driven service worker. Because the
            worker can be evicted, durable state must be stored externally and periodic tasks need
            alarms. Long-lived connections are therefore a design constraint.""";
    static final String C003_Q3 = """
            When readers cache by epoch, advancing the epoch during a slow read can let an old reader
            insert stale entries. Validate the epoch after the read or tag entries with a version.""";
    static final String C003_Q4 = """
            Use labelled paraphrase and copy pairs, but add hard negatives that are correct and
            therefore similar. Evaluate ranking with precision at k and false alarms per review
            budget, split by cohort, and avoid tuning on test data.""";

    static final String C004_Q1 = """
            A WAL writes changes before pages, so recovery replays committed transactions and prevents
            torn pages from losing committed data. It adds I/O overhead.""";
    static final String C004_Q2 = """
            MV3 service workers are event driven and can be stopped, so state must be persisted and
            alarms used for periodic work.""";
    static final String C004_Q3 = """
            Epoch invalidation can fail because a reader that began before the epoch change may write
            an old value after the epoch advances. A solution is to read the epoch before and after
            and retry if it changed.""";
    static final String C004_Q4 = """
            Use copy and paraphrase pairs with hard negatives, report precision at k, and split by
            cohort.""";

    static final String C005_Q1 = """
            A write-ahead log makes committed changes durable before pages are flushed. Recovery
            replays the log, which prevents torn pages from erasing acknowledged commits.""";
    static final String C005_Q2 = """
            MV3 background code runs in a service worker that can be terminated, so alarms schedule
            work and chrome.storage keeps state.""";
    static final String C005_Q3 = """
            An old reader can write back after the epoch changes. Check the epoch after reading and
            retry.""";
    static final String C005_Q4 = """
            Evaluate with copy, paraphrase and independent pairs, plus hard negatives. Use precision
            at k and split by cohort.""";

    static final String C006_Q1 = """
            The WAL guarantees durability by recording changes before page writes. After a crash the
            redo log is replayed and committed transactions survive.""";
    static final String C006_Q2 = """
            A Manifest V3 service worker handles events and can be unloaded; alarms and storage are
            used for state and scheduling.""";
    static final String C006_Q3 = """
            If the epoch advances during a read, a stale value may be cached. Compare the epoch before
            and after the read.""";
    static final String C006_Q4 = """
            Build a labelled pair set with hard negatives, report precision at k, and hold out whole
            cohorts.""";

    static final String C007_Q1 = """
            A WAL records changes first so the database can recover committed transactions after a
            crash.""";
    static final String C007_Q2 = """
            MV3 uses a service worker that can stop, so we use alarms and storage.""";
    static final String C007_Q3 = """
            Old readers can write stale data when the epoch changes, so checking the epoch helps.""";
    static final String C007_Q4 = """
            Use labelled pairs and precision at k with cohort splits.""";

    static final String C008_Q1 = """
            Write-ahead logging flushes redo records before data pages, allowing committed transactions
            to be replayed after a failure.""";
    static final String C008_Q2 = """
            Manifest V3 background work uses event-driven service workers, alarms and chrome.storage.""";
    static final String C008_Q3 = """
            A reader holding an old epoch may write stale entries; version the entries or validate
            the epoch after reading.""";
    static final String C008_Q4 = """
            Evaluate on copy, paraphrase and independent pairs with hard negatives and cohort-level
            splits.""";

    private DemoCohort() {
    }

    record AnswerSpec(Question question, String text, Instant at) {
    }

    record EventSpec(EventType type, String domain, Instant at) {
    }
}
