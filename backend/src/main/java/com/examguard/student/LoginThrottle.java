package com.examguard.student;

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
 * Best-effort login throttling: counters live in this instance's memory, so they are lost on
 * restart and not shared between replicas. A shared store is required for a hard guarantee.
 */
@Component
public class LoginThrottle {

    private static final int MAX_FAILURES = 5;
    private static final Duration WINDOW = Duration.ofMinutes(5);

    private final Map<String, Deque<Instant>> failures = new ConcurrentHashMap<>();

    public void check(String client) {
        Deque<Instant> attempts = failures.get(client);
        if (attempts == null) {
            return;
        }
        synchronized (attempts) {
            prune(attempts);
            if (attempts.size() >= MAX_FAILURES) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "Too many failed login attempts; try again later");
            }
        }
    }

    public void recordFailure(String client) {
        Deque<Instant> attempts = failures.computeIfAbsent(client, key -> new ArrayDeque<>());
        synchronized (attempts) {
            prune(attempts);
            attempts.addLast(Instant.now());
        }
    }

    public void clear(String client) {
        failures.remove(client);
    }

    private void prune(Deque<Instant> attempts) {
        Instant cutoff = Instant.now().minus(WINDOW);
        while (!attempts.isEmpty() && attempts.peekFirst().isBefore(cutoff)) {
            attempts.removeFirst();
        }
    }
}
