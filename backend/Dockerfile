# Build stage
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace

# Keep the dependency cache across builds and fail fast on a stalled connection instead of
# waiting on Maven's default socket timeouts (the cause of hour-long CI builds on slow links).
ENV MAVEN_OPTS="-Djava.net.preferIPv4Stack=true -Dmaven.wagon.http.connectionTimeout=20000 -Dmaven.wagon.http.readTimeout=60000"

COPY pom.xml ./
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -q -DskipTests package

# Runtime stage
FROM eclipse-temurin:21-jre

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system examguard \
    && useradd --system --gid examguard --home /app examguard

WORKDIR /app
COPY --from=build /workspace/target/examguard-backend-*.jar app.jar

USER examguard
EXPOSE 8080

HEALTHCHECK --interval=20s --timeout=5s --start-period=40s --retries=5 \
    CMD curl -fsS http://localhost:8080/api/health >/dev/null || exit 1

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
