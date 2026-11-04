package com.examguard.web;

import com.examguard.dto.CommonDtos.HealthView;
import com.examguard.service.AnalysisClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;

@RestController
public class HealthController {

    private final DataSource dataSource;
    private final AnalysisClient analysisClient;

    public HealthController(DataSource dataSource, AnalysisClient analysisClient) {
        this.dataSource = dataSource;
        this.analysisClient = analysisClient;
    }

    @GetMapping("/api/health")
    public HealthView health() {
        String database = "DOWN";
        try (Connection connection = dataSource.getConnection()) {
            if (connection.isValid(2)) {
                database = "UP";
            }
        } catch (Exception ignored) {
            // reported below
        }

        String analysis = analysisClient.isHealthy() ? "UP" : "DOWN";
        String status = "UP".equals(database) && "UP".equals(analysis) ? "UP" : "DEGRADED";
        return new HealthView(status, database, analysis);
    }
}
