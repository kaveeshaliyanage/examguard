import type {
  AttemptReport,
  AttemptState,
  FindingDetail,
  JoinResponse,
  StudentAttemptSummary,
  User,
} from '../api/types';

export const staffUser: User = {
  id: 2,
  email: 'lecturer@examguard.local',
  displayName: 'Demo Lecturer',
  role: 'LECTURER',
};

export const joinResponse: JoinResponse = {
  attemptId: 7,
  sessionToken: 'attempt-token',
  collectorToken: 'collector-token',
  status: 'IN_PROGRESS',
  startedAt: '2026-11-01T09:00:00Z',
  activeStartedAt: '2026-11-01T09:00:00Z',
  preflightCompletedAt: '2026-11-01T09:00:00Z',
  requiresPreflight: false,
  autoSubmitted: false,
  submittedAt: null,
  serverNow: '2026-11-01T09:10:00Z',
  extensionConnected: false,
  exam: {
    id: 1,
    code: 'DEMO-101',
    title: 'Demo Examination',
    durationMinutes: 60,
    instructions: 'Answer every question in your own words.',
    maxStrikes: 3,
    questions: [
      {
        id: 101,
        orderIndex: 1,
        prompt: 'Explain the concept.',
        type: 'ESSAY',
        points: 10,
        maxWords: 120,
        content: {},
      },
    ],
  },
  answers: [{ questionId: 101, text: '', revisionNo: 0, savedAt: null }],
};

export const pairFinding: FindingDetail = {
  id: 1,
  type: 'CANDIDATE_PAIR',
  priorityScore: 81.2,
  priorityBand: 'CRITICAL',
  status: 'OPEN',
  candidateA: 'C001',
  candidateB: 'C002',
  summary: 'Strong lexical and rare-phrase overlap on question 1.',
  coverageWarning: true,
  createdAt: '2026-11-01T10:00:00Z',
  exam: { id: 1, code: 'DEMO-101', title: 'Demo Examination' },
  evidence: [
    {
      id: 10,
      source: 'SIMILARITY',
      weight: 30.4,
      questionId: 101,
      detail: 'Lexical overlap is above the cohort baseline.',
      metadata: {
        perQuestion: [
          { questionId: 101, rawCosine: 0.91, cohortMean: 0.42, normalizedExcess: 0.84 },
        ],
      },
      createdAt: '2026-11-01T10:00:00Z',
    },
    {
      id: 11,
      source: 'ACTIVITY',
      weight: 5,
      questionId: null,
      detail: 'PROHIBITED-ACTIVITY-SENTINEL should never appear in a pair view.',
      metadata: { visits: [{ domain: 'chegg.com', occurredAt: '2026-11-01T09:30:00Z' }] },
      createdAt: '2026-11-01T10:00:00Z',
    },
  ],
  decisions: [],
  pairContext: {
    questions: [
      {
        id: 101,
        orderIndex: 1,
        prompt: 'Explain the concept.',
        type: 'ESSAY',
        points: 10,
        maxWords: 120,
        content: {},
      },
    ],
    candidates: [
      {
        candidateCode: 'C001',
        answers: [
          {
            questionId: 101,
            text: 'The same invented example about alpha beta appears here.',
            revisions: [
              {
                revisionNo: 1,
                text: 'The same invented example about alpha beta appears here.',
                savedAt: '2026-11-01T09:20:00Z',
              },
            ],
          },
        ],
      },
      {
        candidateCode: 'C002',
        answers: [
          {
            questionId: 101,
            text: 'An identical invented example about alpha beta appears here.',
            revisions: [
              {
                revisionNo: 1,
                text: 'An identical invented example about alpha beta appears here.',
                savedAt: '2026-11-01T09:21:00Z',
              },
            ],
          },
        ],
      },
    ],
  },
  incidentContext: null,
};

export const incidentFinding: FindingDetail = {
  id: 2,
  type: 'CANDIDATE_INCIDENT',
  priorityScore: 64,
  priorityBand: 'HIGH',
  status: 'OPEN',
  candidateA: 'C004',
  candidateB: null,
  summary: 'Two visits to a prohibited domain were observed.',
  coverageWarning: true,
  createdAt: '2026-11-01T10:05:00Z',
  exam: { id: 1, code: 'DEMO-101', title: 'Demo Examination' },
  evidence: [
    {
      id: 20,
      source: 'ACTIVITY',
      weight: 40,
      questionId: null,
      detail: '1 visit to a prohibited domain: chegg.com.',
      metadata: {
        visits: [
          {
            domain: 'chegg.com',
            occurredAt: '2026-11-01T09:30:00Z',
            rule: 'chegg.com',
            note: 'Contract cheating site',
          },
        ],
      },
      createdAt: '2026-11-01T10:05:00Z',
    },
  ],
  decisions: [],
  pairContext: null,
  incidentContext: {
    candidateCode: 'C004',
    monitoringStart: '2026-11-01T09:00:00Z',
    monitoringEnd: '2026-11-01T09:50:00Z',
    coveragePercent: 42,
    coverageWarning: true,
    events: [
      {
        eventType: 'NAVIGATION',
        domain: 'chegg.com',
        occurredAt: '2026-11-01T09:30:00Z',
        classification: 'PROHIBITED',
        rulePattern: 'chegg.com',
      },
      {
        eventType: 'HEARTBEAT',
        domain: null,
        occurredAt: '2026-11-01T09:31:00Z',
        classification: null,
        rulePattern: null,
      },
      {
        eventType: 'TAB_HIDDEN',
        domain: null,
        occurredAt: '2026-11-01T09:32:00Z',
        classification: null,
        rulePattern: null,
      },
    ],
  },
};


const attemptStart = new Date(Date.now() - 5 * 60_000).toISOString();
const attemptNow = new Date().toISOString();

export const attemptStateFixture: AttemptState = {
  attemptId: 1,
  status: 'IN_PROGRESS',
  startedAt: attemptStart,
  activeStartedAt: attemptStart,
  preflightCompletedAt: attemptStart,
  requiresPreflight: false,
  autoSubmitted: false,
  submittedAt: null,
  lastSeenAt: attemptNow,
  serverNow: attemptNow,
  extensionConnected: true,
  strikeCount: 0,
  maxStrikes: 3,
  terminatedAt: null,
  terminationReason: null,
  exam: {
    id: 1,
    code: 'DEMO-101',
    title: 'Demo Examination',
    durationMinutes: 60,
    instructions: 'Answer every question in your own words.',
    maxStrikes: 3,
    questions: [
      {
        id: 101,
        orderIndex: 1,
        prompt: 'Explain the concept.',
        type: 'ESSAY',
        points: 10,
        maxWords: 120,
        content: {},
      },
    ],
  },
  answers: [{ questionId: 101, text: '', selectedOptions: [], revisionNo: 0, savedAt: null }],
};

export const attemptReportFixture: AttemptReport = {
  attemptId: 1,
  examTitle: 'Demo Examination',
  candidateCode: 'C001',
  status: 'SUBMITTED',
  scorePoints: 7,
  maxPoints: 10,
  released: true,
  questions: [
    {
      prompt: 'Explain the concept.',
      type: 'ESSAY',
      points: 10,
      awardedPoints: 7,
      answerText: 'The concept is explained in my own words.',
      selectedOptions: [],
      correctKeys: ['A'],
      explanation: 'Clear structure; the example could be more specific.',
    },
  ],
  integrity: {
    strikes: 1,
    maxStrikes: 3,
    terminatedAt: null,
    events: [
      { signal: 'FOCUS_LOSS', occurredAt: '2026-11-01T09:12:00Z' },
      { signal: 'FOCUS_RETURN', occurredAt: '2026-11-01T09:12:30Z' },
    ],
  },
  reviewSignals: [
    { kind: 'OVERLAP', label: 'Moderate phrase overlap with another candidate', band: 'MEDIUM', score: 42 },
  ],
};

export const studentAttemptsFixture: StudentAttemptSummary[] = [
  {
    attemptId: 1,
    examCode: 'DEMO-101',
    examTitle: 'Demo Examination',
    status: 'IN_PROGRESS',
    startedAt: attemptStart,
    submittedAt: null,
    scorePoints: null,
    maxPoints: null,
    released: false,
    strikes: 1,
  },
  {
    attemptId: 2,
    examCode: 'DEMO-202',
    examTitle: 'Algorithms Midterm',
    status: 'SUBMITTED',
    startedAt: '2026-10-01T09:00:00Z',
    submittedAt: '2026-10-01T10:00:00Z',
    scorePoints: 14,
    maxPoints: 20,
    released: true,
    strikes: 0,
  },
];
