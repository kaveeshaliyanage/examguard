package com.examguard.attempt;

import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AttemptStateMachineTest {

    private final AttemptStateMachine machine = new AttemptStateMachine();

    private Attempt attempt(AttemptStatus status) {
        Attempt attempt = new Attempt();
        attempt.setStatus(status);
        return attempt;
    }

    @Test
    void inProgressCanReachEveryTerminalState() {
        Attempt submitted = attempt(AttemptStatus.IN_PROGRESS);
        machine.transition(submitted, AttemptStatus.SUBMITTED);
        assertThat(submitted.getStatus()).isEqualTo(AttemptStatus.SUBMITTED);

        Attempt terminated = attempt(AttemptStatus.IN_PROGRESS);
        machine.transition(terminated, AttemptStatus.TERMINATED);
        assertThat(terminated.getStatus()).isEqualTo(AttemptStatus.TERMINATED);

        Attempt expired = attempt(AttemptStatus.IN_PROGRESS);
        machine.transition(expired, AttemptStatus.EXPIRED);
        assertThat(expired.getStatus()).isEqualTo(AttemptStatus.EXPIRED);
    }

    @Test
    void repeatingTheSameStateIsIdempotent() {
        for (AttemptStatus status : AttemptStatus.values()) {
            Attempt attempt = attempt(status);
            assertThatCode(() -> machine.transition(attempt, status)).doesNotThrowAnyException();
            assertThat(attempt.getStatus()).isEqualTo(status);
        }
    }

    @Test
    void closedAttemptsCannotMoveAgain() {
        assertConflict(AttemptStatus.SUBMITTED, AttemptStatus.TERMINATED);
        assertConflict(AttemptStatus.SUBMITTED, AttemptStatus.EXPIRED);
        assertConflict(AttemptStatus.TERMINATED, AttemptStatus.SUBMITTED);
        assertConflict(AttemptStatus.EXPIRED, AttemptStatus.SUBMITTED);
        assertConflict(AttemptStatus.TERMINATED, AttemptStatus.EXPIRED);
    }

    @Test
    void requireInProgressRejectsClosedAttempts() {
        assertThatCode(() -> machine.requireInProgress(attempt(AttemptStatus.IN_PROGRESS)))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> machine.requireInProgress(attempt(AttemptStatus.TERMINATED)))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        ex -> assertThat(ex.getStatusCode().value()).isEqualTo(409));
    }

    private void assertConflict(AttemptStatus from, AttemptStatus to) {
        Attempt attempt = attempt(from);
        assertThatThrownBy(() -> machine.transition(attempt, to))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        ex -> assertThat(ex.getStatusCode().value()).isEqualTo(409));
        assertThat(attempt.getStatus()).isEqualTo(from);
    }
}
