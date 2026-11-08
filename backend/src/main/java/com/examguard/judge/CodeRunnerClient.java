package com.examguard.judge;

import com.examguard.judge.CodeRunnerDtos.RunnerRequest;
import com.examguard.judge.CodeRunnerDtos.RunnerResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/** HTTP client for the sandboxed code runner. It holds no exam data beyond one submission. */
@Service
public class CodeRunnerClient {

    private final RestClient client;

    public CodeRunnerClient(
            @Value("${app.code-runner.base-url:http://localhost:8001}") String baseUrl,
            @Value("${app.code-runner.connect-timeout-ms:3000}") long connectTimeoutMs,
            @Value("${app.code-runner.read-timeout-ms:90000}") long readTimeoutMs) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofMillis(connectTimeoutMs));
        factory.setReadTimeout(Duration.ofMillis(readTimeoutMs));
        this.client = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .build();
    }

    public RunnerResponse run(RunnerRequest request) {
        return client.post()
                .uri("/run")
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .body(RunnerResponse.class);
    }
}
