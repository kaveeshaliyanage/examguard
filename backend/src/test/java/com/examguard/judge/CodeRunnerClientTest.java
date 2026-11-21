package com.examguard.judge;

import com.examguard.judge.CodeRunnerDtos.RunnerRequest;
import com.examguard.judge.CodeRunnerDtos.RunnerResponse;
import com.examguard.judge.CodeRunnerDtos.RunnerTest;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class CodeRunnerClientTest {

    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    private String startServer(AtomicReference<String> tokenHeader) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/run", exchange -> {
            tokenHeader.set(exchange.getRequestHeaders().getFirst("X-Runner-Token"));
            byte[] body = "{\"compileError\":null,\"tests\":[]}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    private RunnerRequest request() {
        return new RunnerRequest("PYTHON", "print(1)", List.of(new RunnerTest("", "1")), 2000);
    }

    @Test
    void sendsTheSharedRunnerToken() throws IOException {
        AtomicReference<String> seen = new AtomicReference<>();
        String baseUrl = startServer(seen);
        CodeRunnerClient client = new CodeRunnerClient(baseUrl, "shared-secret", 1000, 5000);

        RunnerResponse response = client.run(request());

        assertThat(seen.get()).isEqualTo("shared-secret");
        assertThat(response.tests()).isEmpty();
    }

    @Test
    void omitsTheHeaderWhenNoTokenIsConfigured() throws IOException {
        AtomicReference<String> seen = new AtomicReference<>("unset");
        String baseUrl = startServer(seen);
        CodeRunnerClient client = new CodeRunnerClient(baseUrl, "", 1000, 5000);

        client.run(request());

        assertThat(seen.get()).isNull();
    }
}
