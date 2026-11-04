import type { FindingDetail, JoinResponse, User } from '../api/types';

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
  submittedAt: null,
  serverNow: '2026-11-01T09:10:00Z',
  extensionConnected: false,
  exam: {
    id: 1,
    code: 'DEMO-101',
    title: 'Demo Examination',
    durationMinutes: 60,
    questions: [{ id: 101, orderIndex: 1, prompt: 'Explain the concept.', maxWords: 120 }],
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
    questions: [{ id: 101, orderIndex: 1, prompt: 'Explain the concept.', maxWords: 120 }],
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
