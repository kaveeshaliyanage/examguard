package com.examguard;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Boots the application against H2 with Flyway disabled. This validates entity mappings,
 * repository queries, security wiring and bean configuration without needing MySQL.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class ExamGuardApplicationTests {

    @Test
    void contextLoads() {
        // Intentionally empty: a failure here means the application context is broken.
    }
}
