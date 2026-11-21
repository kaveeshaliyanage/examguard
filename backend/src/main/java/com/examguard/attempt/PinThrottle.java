package com.examguard.attempt;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Best-effort throttle for exam PIN guesses. Like the login throttle the counters are per
 * instance and in memory, so a multi-replica deployment needs a shared store for a hard limit.
 */
@Component
public class PinThrottle {

    private static final int MAX_FAILURES = 5;
    private static final Duration WINDOW = Duration.ofMinutes(10);

    private final Map<String, Deque<Instant>> failures = new ConcurrentHashMap<>();

    public void check(String key) {
        Deque<Instant> attempts = failures.get(key);
        if (attempts == null) {
            return;
        }
        synchronized (attempts) {
            prune(attempts);
            if (attempts.size() >= MAX_FAILURES) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "Too many incorrect exam PIN attempts; try again in a few minutes");
            }
        }
    }

    public void recordFailure(String key) {
        Deque<Instant> attempts = failures.computeIfAbsent(key, ignored -> new ArrayDeque<>());
        synchronized (attempts) {
            prune(attempts);
            attempts.addLast(Instant.now());
        }
    }

    public void clear(String key) {
        failures.remove(key);
    }

    private void prune(Deque<Instant> attempts) {
        Instant cutoff = Instant.now().minus(WINDOW);
        while (!attempts.isEmpty() && attempts.peekFirst().isBefore(cutoff)) {
            attempts.removeFirst();
        }
    }
}
