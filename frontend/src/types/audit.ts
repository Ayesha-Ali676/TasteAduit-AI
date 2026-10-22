export interface AuditFormData {
  recommendations: string;
  audienceContext: string;
  location: string;
  constraints: string;
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

export interface ItemResolutionEnvelope {
  item: {
    id: string;
    name: string;
  };
  resolution: EntityResolutionResult;
  evidence?: NormalizedEvidenceResult;
  audit?: ItemAuditResult;
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
