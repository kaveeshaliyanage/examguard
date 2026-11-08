package com.examguard;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * Runs the Flyway schema and Hibernate validation against a real PostgreSQL instance.
 * Disabled unless TEST_PG_URL is set, so the default H2 test run stays dependency-free.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("postgres")
@EnabledIfEnvironmentVariable(named = "TEST_PG_URL", matches = ".+")
class PostgresSchemaTests {

    @Test
    void flywayMigrationsMatchEntityMappings() {
        // Context startup runs Flyway and then ddl-auto: validate.
    }
}
