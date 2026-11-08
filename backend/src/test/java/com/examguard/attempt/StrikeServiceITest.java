package com.examguard.attempt;

/**
 * Surefire's default includes only pick up *Test/*Tests classes, so this empty subclass makes the
 * *IT scenario run during {@code mvn test} without changing the shared build configuration.
 */
class StrikeServiceITest extends StrikeServiceIT {
}
