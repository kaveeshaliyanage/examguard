package com.examguard.report;

import com.openhtmltopdf.extend.FSSupplier;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.thymeleaf.context.Context;
import org.thymeleaf.spring6.SpringTemplateEngine;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Locale;
import java.util.Map;

@Component
public class PdfRenderer {

    private final SpringTemplateEngine templates;

    public PdfRenderer(SpringTemplateEngine templates) {
        this.templates = templates;
    }

    public byte[] render(String template, Map<String, Object> model) {
        Context context = new Context(Locale.ROOT);
        context.setVariables(model);
        String html = templates.process(template, context);

        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFastMode();
            builder.useFont(font("/fonts/NotoSans-Regular.ttf"), "Report");
            builder.useFont(font("/fonts/NotoSans-Bold.ttf"), "ReportBold");
            builder.useFont(font("/fonts/NotoSansMono-Regular.ttf"), "ReportMono");
            builder.withHtmlContent(html, "classpath:/");
            builder.toStream(out);
            builder.run();
            return out.toByteArray();
        } catch (IOException ex) {
            throw new UncheckedIOException("Could not render PDF report", ex);
        } catch (Exception ex) {
            throw new IllegalStateException("Could not render PDF report", ex);
        }
    }

    private static FSSupplier<InputStream> font(String path) {
        return () -> {
            try {
                return new ClassPathResource(path).getInputStream();
            } catch (IOException ex) {
                throw new UncheckedIOException("Missing bundled font " + path, ex);
            }
        };
    }
}
