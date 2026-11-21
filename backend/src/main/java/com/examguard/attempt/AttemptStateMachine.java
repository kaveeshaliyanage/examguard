package com.examguard.attempt;

import com.examguard.domain.Attempt;
import com.examguard.domain.AttemptStatus;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.EnumSet;
import java.util.Set;

@Service
public class AttemptStateMachine {

    private static final Set<AttemptStatus> OPEN_TARGETS =
            EnumSet.of(AttemptStatus.SUBMITTED, AttemptStatus.TERMINATED, AttemptStatus.EXPIRED);

    public void requireInProgress(Attempt attempt) {
        if (attempt.getStatus() != AttemptStatus.IN_PROGRESS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Attempt is no longer accepting answers");
        }
    }

    public void transition(Attempt attempt, AttemptStatus target) {
        AttemptStatus current = attempt.getStatus();
        if (current == target) {
            return;
        }
        if (current == AttemptStatus.IN_PROGRESS && OPEN_TARGETS.contains(target)) {
            attempt.setStatus(target);
            return;
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Attempt cannot move from " + current + " to " + target);
    }
}
