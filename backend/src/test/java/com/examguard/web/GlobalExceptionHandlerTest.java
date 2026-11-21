package com.examguard.web;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class GlobalExceptionHandlerTest {

    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new BrokenController())
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();

    @Test
    void unexpectedErrorsDoNotLeakInternalDetails() throws Exception {
        mvc.perform(get("/boom"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.message").value("Unexpected server error"))
                .andExpect(jsonPath("$.error").value("Internal Server Error"));
    }

    @RestController
    static class BrokenController {

        @GetMapping("/boom")
        String boom() {
            throw new IllegalStateException("jdbc password=hunter2");
        }
    }
}
