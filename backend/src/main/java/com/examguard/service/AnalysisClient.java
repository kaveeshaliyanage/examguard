package com.examguard.service;

import com.examguard.dto.AnalysisDtos.AnalysisResponse;
import com.examguard.dto.AnalysisDtos.AuthorshipRequest;
import com.examguard.dto.AnalysisDtos.AuthorshipResponse;
import com.examguard.dto.AnalysisDtos.IncidentAnalysisRequest;
import com.examguard.dto.AnalysisDtos.PairAnalysisRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * Thin HTTP client for the Python analysis service. The next builder only needs to call
 * {@link #analyzePairs} and {@link #analyzeIncidents} from the analysis orchestrator.
 */
@Service
public class AnalysisClient {

    private final RestClient client;

    public AnalysisClient(
            @Value("${app.analysis.base-url:http://localhost:8000}") String baseUrl,
            @Value("${app.analysis.connect-timeout-ms:5000}") long connectTimeoutMs,
            @Value("${app.analysis.read-timeout-ms:120000}") long readTimeoutMs) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofMillis(connectTimeoutMs));
        factory.setReadTimeout(Duration.ofMillis(readTimeoutMs));
        this.client = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .build();
    }

    public boolean isHealthy() {
        try {
            HealthResponse health = client.get()
                    .uri("/health")
                    .retrieve()
                    .body(HealthResponse.class);
            return health != null && "UP".equalsIgnoreCase(health.status());
        } catch (Exception ex) {
            return false;
        }
    }

    public AnalysisResponse analyzePairs(PairAnalysisRequest request) {
        return client.post()
                .uri("/analyze/pairs")
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .body(AnalysisResponse.class);
    }

    public AnalysisResponse analyzeIncidents(IncidentAnalysisRequest request) {
        return client.post()
                .uri("/analyze/incidents")
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .body(AnalysisResponse.class);
    }

    public AuthorshipResponse analyzeAuthorship(AuthorshipRequest request) {
        return client.post()
                .uri("/analyze/authorship")
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .body(AuthorshipResponse.class);
    }

    public record HealthResponse(String status) {
    }
}
