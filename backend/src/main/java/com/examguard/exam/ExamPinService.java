package com.examguard.exam;

import com.examguard.domain.Exam;
import com.examguard.domain.ExamEnrollment;
import com.examguard.exam.ExamDtos.ExamPinView;
import com.examguard.repo.ExamEnrollmentRepository;
import com.examguard.repo.ExamRepository;
import com.examguard.service.AccessService;
import com.examguard.service.AuditService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class ExamPinService {

    private static final Logger log = LoggerFactory.getLogger(ExamPinService.class);
    private static final DateTimeFormatter WINDOW_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm 'UTC'").withZone(java.time.ZoneOffset.UTC);

    private final ExamRepository examRepository;
    private final ExamEnrollmentRepository enrollmentRepository;
    private final PasswordEncoder passwordEncoder;
    private final AccessService accessService;
    private final AuditService auditService;
    private final ObjectProvider<JavaMailSender> mailSender;
    private final SecureRandom random = new SecureRandom();
    private final boolean mailEnabled;
    private final String mailFrom;

    public ExamPinService(
            ExamRepository examRepository,
            ExamEnrollmentRepository enrollmentRepository,
            PasswordEncoder passwordEncoder,
            AccessService accessService,
            AuditService auditService,
            ObjectProvider<JavaMailSender> mailSender,
            @Value("${app.mail.enabled:false}") boolean mailEnabled,
            @Value("${app.mail.from:no-reply@examguard.local}") String mailFrom) {
        this.examRepository = examRepository;
        this.enrollmentRepository = enrollmentRepository;
        this.passwordEncoder = passwordEncoder;
        this.accessService = accessService;
        this.auditService = auditService;
        this.mailSender = mailSender;
        this.mailEnabled = mailEnabled;
        this.mailFrom = mailFrom;
    }

    /**
     * Rotates the exam's PIN and emails it to every enrolled student. The plaintext PIN is
     * returned exactly once so a lecturer without mail delivery can read it out; only the hash
     * is persisted and it is never written to logs or audit detail.
     */
    @Transactional
    public ExamPinView issue(Authentication auth, Long examId) {
        accessService.requireExamOwner(auth, examId);
        Exam exam = examRepository.findById(examId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Exam not found"));

        String pin = String.format("%06d", random.nextInt(1_000_000));
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        exam.setRequiresPin(true);
        exam.setAccessPinHash(passwordEncoder.encode(pin));
        exam.setAccessPinIssuedAt(now);
        exam.setAccessPinSentAt(null);

        List<String> recipients = enrollmentRepository.findByExamIdOrderByEmailAsc(examId).stream()
                .map(ExamEnrollment::getEmail)
                .toList();
        List<String> failed = new ArrayList<>();
        int emailed = 0;
        if (mailEnabled && !recipients.isEmpty()) {
            JavaMailSender sender = mailSender.getIfAvailable();
            if (sender == null) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "Mail is enabled but no mail sender is configured");
            }
            for (String recipient : recipients) {
                try {
                    sender.send(message(exam, pin, recipient));
                    emailed++;
                } catch (RuntimeException ex) {
                    failed.add(recipient);
                    log.warn("Could not email the exam PIN for {} to {}: {}",
                            exam.getCode(), recipient, ex.getMessage());
                }
            }
            if (emailed > 0) {
                exam.setAccessPinSentAt(now);
            }
        }
        examRepository.save(exam);

        auditService.record(accessService.currentUser(auth), examId, "EXAM_PIN_ISSUED", "EXAM", examId,
                Map.of("recipients", recipients.size(), "emailed", emailed, "failed", failed.size()));

        boolean mailConfigured = mailEnabled && mailSender.getIfAvailable() != null;
        log.info("Issued an exam PIN for {} to {} enrolled student(s) ({} emailed)",
                exam.getCode(), recipients.size(), emailed);
        return new ExamPinView(pin, recipients.size(), emailed, failed, now,
                exam.getAccessPinSentAt(), exam.isRequiresPin(), mailConfigured);
    }

    private SimpleMailMessage message(Exam exam, String pin, String recipient) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(mailFrom);
        message.setTo(recipient);
        message.setSubject("Your ExamGuard PIN for " + exam.getCode());
        StringBuilder body = new StringBuilder()
                .append("Your lecturer issued an access PIN for \"").append(exam.getTitle())
                .append("\" (").append(exam.getCode()).append(").\n\n")
                .append("PIN: ").append(pin).append("\n\n")
                .append("Sign in to ExamGuard with your student email and password, then enter this PIN ")
                .append("when you join the exam. The PIN replaces any earlier one and must not be shared.\n");
        if (exam.getOpensAt() != null) {
            body.append("\nOpens: ").append(WINDOW_FORMAT.format(exam.getOpensAt()));
        }
        if (exam.getClosesAt() != null) {
            body.append("\nCloses: ").append(WINDOW_FORMAT.format(exam.getClosesAt()));
        }
        message.setText(body.toString());
        return message;
    }
}
