export type Role = 'ADMIN' | 'LECTURER' | 'REVIEWER';
export type ExamStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'ANALYSED';
export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'TERMINATED' | 'EXPIRED';
export type QuestionType =
  | 'SINGLE_CHOICE'
  | 'MULTI_CHOICE'
  | 'TRUE_FALSE'
  | 'SHORT_ANSWER'
  | 'ESSAY';
export type GradingMode = 'AUTO' | 'MANUAL';
export type IntegritySignal = 'FOCUS_LOSS' | 'FOCUS_RETURN';
export type FindingType = 'CANDIDATE_PAIR' | 'CANDIDATE_INCIDENT' | 'CANDIDATE_AUTHORSHIP';
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
  | 'COVERAGE'
  | 'AUTHORSHIP';
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

export interface QuestionOption {
  key: string;
  text: string;
}

export interface QuestionContent {
  options?: QuestionOption[];
}

export interface AnswerKey {
  selectedKeys?: string[];
  acceptedAnswers?: string[];
  modelAnswer?: string | null;
  rubric?: string | null;
}

export interface ExamQuestion {
  id: number;
  orderIndex: number;
  prompt: string;
  type: QuestionType;
  points: number;
  gradingMode?: GradingMode;
  maxWords: number;
  content: QuestionContent;
  answerKey?: AnswerKey | null;
  explanation?: string | null;
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
  maxStrikes?: number;
  instructions?: string | null;
  opensAt: string | null;
  closesAt: string | null;
  createdAt: string;
  attemptCount: number;
  submittedCount: number;
  findingCount: number;
  openFindingCount: number;
  lastAnalysisAt: string | null;
  enrollmentCount: number;
  releasedCount: number;
  awaitingReleaseCount: number;
  questions: ExamQuestion[];
  resourceRules: RuleView[];
  permissions: PermissionView[];
}

export interface RosterEntry {
  id: number;
  email: string;
  createdAt: string;
}

export interface UpdateExamInput {
  title: string;
  description: string | null;
  durationMinutes: number;
  allowExtension: boolean;
  maxStrikes: number;
  instructions: string | null;
  opensAt: string | null;
  closesAt: string | null;
  resourceRules: CreateRuleInput[];
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
  selectedOptions?: string[];
  revisionNo: number;
  savedAt: string | null;
}

export interface ExamForAttempt {
  id: number;
  code: string;
  title: string;
  durationMinutes: number;
  instructions: string;
  maxStrikes: number;
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
  strikeCount: number;
  maxStrikes: number;
  terminatedAt: string | null;
  terminationReason: string | null;
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
  type: QuestionType;
  points: number;
  maxWords: number;
  content?: QuestionContent;
  answerKey?: AnswerKey;
  explanation?: string | null;
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
  maxStrikes: number;
  instructions: string | null;
  opensAt: string | null;
  closesAt: string | null;
  questions: CreateQuestionInput[];
  resourceRules: CreateRuleInput[];
}

export interface IntegritySignalResponse {
  strikeCount: number;
  maxStrikes: number;
  terminated: boolean;
  status: AttemptStatus;
}

export interface StudentUser {
  id: number;
  email: string;
  displayName: string;
}

export interface StudentLoginResponse {
  token: string;
  user: StudentUser;
}

export interface StudentAttemptSummary {
  attemptId: number;
  examCode: string;
  examTitle: string;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  scorePoints: number | null;
  maxPoints: number | null;
  released: boolean;
  strikes: number;
}

export interface ReportQuestion {
  prompt: string;
  type: QuestionType;
  points: number;
  awardedPoints: number | null;
  answerText: string;
  selectedOptions: string[];
  correctKeys: string[] | null;
  explanation: string | null;
}

export interface ReportIntegrityEvent {
  signal: IntegritySignal | string;
  occurredAt: string;
}

export interface ReportIntegrity {
  strikes: number;
  maxStrikes: number;
  terminatedAt: string | null;
  events: ReportIntegrityEvent[];
}

export interface ReviewSignal {
  kind: string;
  label: string;
  band: PriorityBand;
  score: number;
}

export interface AttemptReport {
  attemptId: number;
  examTitle: string;
  candidateCode: string;
  status: AttemptStatus;
  scorePoints: number;
  maxPoints: number;
  released: boolean;
  questions: ReportQuestion[];
  integrity: ReportIntegrity;
  reviewSignals: ReviewSignal[];
}

export interface StudentStats {
  totalAttempts: number;
  submitted: number;
  terminated: number;
  released: number;
  averagePercentage: number | null;
  strikesThisTerm: number;
}

export interface UpcomingExam {
  examId: number;
  code: string;
  title: string;
  opensAt: string | null;
  closesAt: string | null;
  openNow: boolean;
}

export interface StudentDashboardData {
  profile: StudentUser;
  stats: StudentStats;
  upcoming: UpcomingExam[];
  attempts: StudentAttemptSummary[];
}

export interface ExamHealthRow {
  examId: number;
  code: string;
  title: string;
  status: ExamStatus;
  attempts: number;
  submitted: number;
  ungraded: number;
  openFindings: number;
  flaggedCandidates: number;
  awaitingRelease: number;
  lastAnalysisAt: string | null;
}

export interface UngradedAttempt {
  attemptId: number;
  examId: number;
  examTitle: string;
  candidateCode: string;
  status: AttemptStatus;
  pendingQuestions: number;
}

export interface FlaggedCandidate {
  findingId: number;
  examId: number;
  examTitle: string;
  candidateCode: string;
  priorityScore: number;
  band: PriorityBand;
  type: FindingType;
}

export interface ScoreBucket {
  label: string;
  count: number;
}

export interface FocusLossPoint {
  date: string;
  focusLossSignals: number;
}

export interface BandCount {
  band: PriorityBand;
  count: number;
}

export interface FunnelStage {
  stage: string;
  count: number;
}

export interface LecturerDashboardData {
  exams: ExamHealthRow[];
  ungradedQueue: UngradedAttempt[];
  flagged: FlaggedCandidate[];
  distribution: ScoreBucket[];
  integrityTrend: FocusLossPoint[];
  bandMix: BandCount[];
  funnel: FunnelStage[];
  ungradedTotal: number;
  flaggedTotal: number;
  awaitingRelease: number;
}

export interface AdminCounts {
  users: number;
  students: number;
  lecturers: number;
  admins: number;
  exams: number;
  attempts: number;
  findings: number;
}

export interface AdminRunRow {
  id: number;
  examId: number;
  examTitle: string;
  status: AnalysisStatus;
  modelVersion: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface AdminAuditRow {
  id: number;
  action: string;
  entityType: string;
  entityId: number | null;
  examId: number | null;
  actor: string;
  createdAt: string;
}

export interface AdminDashboardData {
  counts: AdminCounts;
  aiHealthy: boolean;
  recentRuns: AdminRunRow[];
  recentAudit: AdminAuditRow[];
}

export interface GradingRow {
  attemptId: number;
  candidateCode: string;
  questionId: number;
  prompt: string;
  type: QuestionType;
  points: number;
  text: string;
  selectedOptions: string[];
  revisionNo: number;
  savedAt: string | null;
  answerKey: AnswerKey | null;
  explanation: string | null;
  awardedPoints: number | null;
  comment: string | null;
}

export interface GradeResponse {
  questionId: number;
  awardedPoints: number;
  maxPoints: number;
  gradedAt: string;
}

export interface ReleaseResponse {
  releasedAttempts: number;
}
