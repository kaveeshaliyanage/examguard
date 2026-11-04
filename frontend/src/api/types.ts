export type Role = 'ADMIN' | 'LECTURER' | 'REVIEWER';
export type ExamStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'ANALYSED';
export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
export type FindingType = 'CANDIDATE_PAIR' | 'CANDIDATE_INCIDENT';
export type FindingStatus = 'OPEN' | 'CONFIRMED' | 'DISMISSED' | 'NEEDS_INFO' | 'ESCALATED' | 'SUPERSEDED';
export type PriorityBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type DecisionOutcome = 'CONFIRMED' | 'DISMISSED' | 'NEEDS_INFO' | 'ESCALATED';
export type ResourceCategory = 'PERMITTED' | 'PROHIBITED' | 'UNCLASSIFIED';
export type PermissionLevel = 'OWNER' | 'REVIEWER' | 'VIEWER';
export type AnalysisStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type EvidenceSource =
  | 'SIMILARITY'
  | 'PATTERN'
  | 'TIMING'
  | 'ACTIVITY'
  | 'ANSWER_CHANGE'
  | 'COVERAGE';
export type EventType =
  | 'NAVIGATION'
  | 'HEARTBEAT'
  | 'TAB_HIDDEN'
  | 'TAB_VISIBLE'
  | 'EXTENSION_CONNECTED'
  | 'EXTENSION_DISCONNECTED';

export interface User {
  id: number;
  email: string;
  displayName: string;
  role: Role;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface ExamRef {
  id: number;
  code: string;
  title: string;
}

export interface ExamQuestion {
  id: number;
  orderIndex: number;
  prompt: string;
  maxWords: number;
}

export interface ExamSummary {
  id: number;
  code: string;
  title: string;
  status: ExamStatus;
  durationMinutes: number;
  attemptCount: number;
  submittedCount: number;
  findingCount: number;
  openFindingCount: number;
  lastAnalysisAt: string | null;
  createdAt: string;
}

export interface RuleView {
  id: number;
  category: ResourceCategory;
  domainPattern: string;
  note: string | null;
}

export interface PermissionView {
  userId: number;
  email: string;
  displayName: string;
  level: PermissionLevel;
}

export interface ExamDetail {
  id: number;
  code: string;
  title: string;
  description: string | null;
  status: ExamStatus;
  durationMinutes: number;
  allowExtension: boolean;
  createdAt: string;
  attemptCount: number;
  submittedCount: number;
  findingCount: number;
  openFindingCount: number;
  lastAnalysisAt: string | null;
  questions: ExamQuestion[];
  resourceRules: RuleView[];
  permissions: PermissionView[];
}

export interface AttemptSummary {
  attemptId: number;
  candidateCode: string;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  lastSeenAt: string | null;
  answerCount: number;
  eventCount: number;
  coveragePercent: number;
  coverageWarning: boolean;
  lateSubmission: boolean;
}

export interface FindingSummary {
  id: number;
  type: FindingType;
  priorityScore: number;
  priorityBand: PriorityBand;
  status: FindingStatus;
  candidateA: string;
  candidateB: string | null;
  summary: string;
  coverageWarning: boolean;
  evidenceCount: number;
  createdAt: string;
}

export interface AnalysisRun {
  id: number;
  status: AnalysisStatus;
  modelVersion: string | null;
  inputHash: string | null;
  error: string | null;
  findingsCreated: number;
  startedAt: string;
  finishedAt: string | null;
}

export interface EvidenceView {
  id: number;
  source: EvidenceSource;
  weight: number;
  questionId: number | null;
  detail: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DecisionView {
  id: number;
  reviewerName: string;
  outcome: DecisionOutcome;
  rationale: string;
  createdAt: string;
}

export interface RevisionView {
  revisionNo: number;
  text: string;
  savedAt: string;
}

export interface PairAnswer {
  questionId: number;
  text: string;
  revisions: RevisionView[];
}

export interface PairCandidate {
  candidateCode: string;
  answers: PairAnswer[];
}

export interface PairContext {
  questions: ExamQuestion[];
  candidates: PairCandidate[];
}

export interface ObservedEvent {
  eventType: EventType;
  domain: string | null;
  occurredAt: string;
  classification: ResourceCategory | null;
  rulePattern: string | null;
}

export interface IncidentContext {
  candidateCode: string;
  monitoringStart: string | null;
  monitoringEnd: string | null;
  coveragePercent: number;
  coverageWarning: boolean;
  events: ObservedEvent[];
}

export interface FindingDetail {
  id: number;
  type: FindingType;
  priorityScore: number;
  priorityBand: PriorityBand;
  status: FindingStatus;
  candidateA: string;
  candidateB: string | null;
  summary: string;
  coverageWarning: boolean;
  createdAt: string;
  exam: ExamRef;
  evidence: EvidenceView[];
  decisions: DecisionView[];
  pairContext: PairContext | null;
  incidentContext: IncidentContext | null;
}

export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  entityType: string;
  entityId: number | null;
  detail: string | null;
  createdAt: string;
}

export interface AnswerView {
  questionId: number;
  text: string;
  revisionNo: number;
  savedAt: string | null;
}

export interface ExamForAttempt {
  id: number;
  code: string;
  title: string;
  durationMinutes: number;
  questions: ExamQuestion[];
}

export interface JoinResponse {
  attemptId: number;
  sessionToken: string;
  collectorToken: string;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  serverNow: string;
  extensionConnected: boolean;
  exam: ExamForAttempt;
  answers: AnswerView[];
}

export interface AttemptState {
  attemptId: number;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  lastSeenAt: string | null;
  serverNow: string;
  extensionConnected: boolean;
  exam: ExamForAttempt;
  answers: AnswerView[];
}

export interface SaveAnswerResponse {
  questionId: number;
  revisionNo: number;
  savedAt: string;
  wordCount: number;
}

export interface SubmitResponse {
  attemptId: number;
  status: AttemptStatus;
  submittedAt: string;
  late: boolean;
}

export interface CoverageView {
  coverageStart: string;
  lastSeenAt: string | null;
  eventCount: number;
  domainsObserved: number;
  extensionConnected: boolean;
  coveragePercent: number;
  warning: boolean;
}

export interface CreateQuestionInput {
  prompt: string;
  maxWords: number;
}

export interface CreateRuleInput {
  category: ResourceCategory;
  domainPattern: string;
  note: string | null;
}

export interface CreateExamInput {
  code: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  allowExtension: boolean;
  questions: CreateQuestionInput[];
  resourceRules: CreateRuleInput[];
}
