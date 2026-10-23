export interface AuditFormData {
  recommendations: string;
  audienceContext: string;
  location: string;
  constraints: string;
  enableAgent?: boolean;
}

export interface NormalizedCandidate {
  id: string;
  name: string;
  type: string;
  category: 'entity' | 'tag';
  popularity?: number;
  disambiguation?: string;
  tags?: string[];
  source: 'qloo';
  retrievedAt: string;
}

export interface EntityResolutionResult {
  query: string;
  status: 'resolved' | 'ambiguous' | 'unresolved';
  resolvedEntity?: NormalizedCandidate;
  candidates: NormalizedCandidate[];
  derivedConfidence?: number;
  reason?: string;
  provenance: {
    entityId?: string;
    tagId?: string;
    qlooType: string;
    source: string;
    operation: string;
    classification: 'Supported' | 'Inferred' | 'Unverified';
    retrievedAt: string;
    correlationId: string;
    resolutionStatus: 'resolved' | 'ambiguous' | 'unresolved';
  };
}

export interface NormalizedEvidenceSignal {
  signalType: string;
  relatedEntityId?: string;
  relatedEntityName?: string;
  relatedEntityType?: string;
  value?: number;
  rank?: number;
  relationship?: string;
  context?: {
    audience?: string;
    location?: string;
  };
  tags?: string[];
}

export interface NormalizedEvidenceResult {
  status: 'supported' | 'insufficient_evidence' | 'unverified' | 'ambiguous' | 'unresolved';
  entityId?: string;
  entityName?: string;
  entityType?: string;
  signals: NormalizedEvidenceSignal[];
  summary: {
    signalsCount: number;
    averageAffinity?: number;
    topAffinitySignal?: string;
    hasLocationSignal: boolean;
  };
  provenance: {
    source: 'qloo';
    endpoint: string;
    operation: string;
    correlationId: string;
    retrievedAt: string;
    queryMetadata: Record<string, unknown>;
    classification: 'Supported' | 'Inferred' | 'Unverified';
  };
}

export interface AuditDimensionResult {
  name: 'culturalAlignment' | 'contextualRelevance' | 'constraintCompliance' | 'evidenceCompleteness';
  score: number;
  weight: number;
  weightedScore: number;
  classification: 'Supported' | 'Inferred' | 'Unverified';
  reasons: string[];
  evidenceRefs: string[];
}

export interface AuditDecision {
  status: 'supported' | 'inferred' | 'unverified' | 'insufficient_evidence';
  label: string;
  explanation: string;
}

export interface ItemAuditResult {
  itemId: string;
  itemName: string;
  overallScore: number;
  dimensions: {
    culturalAlignment: AuditDimensionResult;
    contextualRelevance: AuditDimensionResult;
    constraintCompliance: AuditDimensionResult;
    evidenceCompleteness: AuditDimensionResult;
  };
  decision: AuditDecision;
  evidenceRefs: string[];
  provenance: {
    source: 'tasteaudit';
    operation: string;
    correlationId: string;
    auditedAt: string;
    classification: 'Supported' | 'Inferred' | 'Unverified';
  };
}

export interface OverallAuditReport {
  overallScore: number;
  confidence: number;
  decision: AuditDecision;
  dimensionsSummary: {
    culturalAlignment: number;
    contextualRelevance: number;
    constraintCompliance: number;
    evidenceCompleteness: number;
  };
  totalItemsAudited: number;
  itemsSummary: {
    supportedCount: number;
    inferredCount: number;
    unverifiedCount: number;
    insufficientCount: number;
  };
  provenance: {
    source: 'tasteaudit';
    operation: string;
    correlationId: string;
    auditedAt: string;
  };
}

export interface RepairItemResult {
  originalItem: string;
  status: 'repaired' | 'no_repair' | 'repair_failed' | 'insufficient_evidence';
  repairStrategy?: string;
  selectedCandidate?: {
    name: string;
    entityId: string;
    type?: string;
  };
  reasoning: string;
  beforeAudit: ItemAuditResult;
  afterAudit?: ItemAuditResult;
  scoreDelta?: number;
  verifiedImprovement?: boolean;
  providerUsed?: string;
  evidenceRefs: string[];
  constraintHandling?: string[];
  repairedEnvelope?: ItemResolutionEnvelope;
}

export interface OverallRepairReport {
  totalItemsAudited: number;
  itemsRepairedCount: number;
  itemsSkippedCount: number;
  itemsFailedCount: number;
  averageScoreBefore: number;
  averageScoreAfter: number;
  netImprovement: number;
  repairedItems: RepairItemResult[];
}

export interface AgentTraceEvent {
  step: number;
  iteration: number;
  state: string;
  decision: 'ACCEPT' | 'REPAIR' | 'MORE_EVIDENCE' | 'STOP';
  targetItemId?: string;
  targetItemName?: string;
  reasoning: string;
  actionPerformed?: {
    action: string;
    candidateSelected?: {
      id: string;
      name: string;
      type?: string;
    };
  };
  scoreBefore?: number;
  scoreAfter?: number;
  scoreDelta?: number;
  evidenceRefs: string[];
  stopReason?: string;
  timestamp: string;
  durationMs: number;
}

export interface AgentExecutionTrace {
  totalIterations: number;
  terminalState: 'ACCEPTED' | 'STOPPED' | 'FAILED';
  finalStopReason: string;
  totalDurationMs: number;
  initialOverallScore: number;
  finalOverallScore: number;
  netScoreImprovement: number;
  events: AgentTraceEvent[];
}

export interface ItemResolutionEnvelope {
  item: {
    id: string;
    name: string;
  };
  resolution: EntityResolutionResult;
  evidence?: NormalizedEvidenceResult;
  audit?: ItemAuditResult;
  repair?: RepairItemResult;
}

export interface ResolutionSummary {
  totalItems: number;
  resolvedCount: number;
  ambiguousCount: number;
  unresolvedCount: number;
}

export interface EvidenceSummary {
  totalItems: number;
  supportedCount: number;
  insufficientCount: number;
  unresolvedCount: number;
}

export interface AuditResponse {
  status: 'scaffold' | 'partial_pipeline' | 'complete';
  message: string;
  stagesExecuted: string[];
  input: {
    rawRecommendation: string;
    audienceContext?: string;
    location?: string;
    constraints?: string[];
  };
  resolutionSummary?: ResolutionSummary;
  evidenceSummary?: EvidenceSummary;
  items?: ItemResolutionEnvelope[];
  auditReport?: OverallAuditReport;
  repairReport?: OverallRepairReport;
  agentTrace?: AgentExecutionTrace;
  scaffoldDetails?: {
    note: string;
    deterministicModelReady: boolean;
    weights: {
      culturalAlignment: number;
      contextualRelevance: number;
      constraintCompliance: number;
      evidenceCompleteness: number;
    };
  };
}
