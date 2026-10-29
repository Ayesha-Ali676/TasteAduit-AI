import { EvidenceClassification, QlooEvidenceProvenance, EntityResolutionResult } from '../qloo/qloo.types.js';
import { NormalizedEvidenceResult } from '../evidence/evidence.types.js';
import { ItemAuditResult, OverallAuditReport } from '../audit/audit.types.js';
import { OverallRepairReport, RepairItemResult } from '../repair/repair.types.js';
import { AgentExecutionTrace } from '../agent/agent.types.js';

/**
 * Deterministic Scoring Weight Constants
 * Must sum exactly to 1.0 (100%)
 */
export const SCORING_WEIGHTS = {
  culturalAlignment: 0.40,
  contextualRelevance: 0.25,
  constraintCompliance: 0.20,
  evidenceCompleteness: 0.15
} as const;

export interface ScoreBreakdown {
  culturalAlignment: number;      // 0 - 100
  contextualRelevance: number;    // 0 - 100
  constraintCompliance: number;   // 0 - 100
  evidenceCompleteness: number;   // 0 - 100
}

export interface GroundingScore {
  overall: number;               // 0 - 100, weighted composite
  confidence: number;            // 0 - 100, based on evidence density
  breakdown: ScoreBreakdown;
}

export interface DiscoveryIntent {
  isDiscovery: boolean;
  domain?: string;
  category?: string;
  descriptivePreferences: string[];
  cleanQuery: string;
  rawRequest: string;
}

export interface ExtractedItem {
  id: string;
  name: string;
  category?: string;
  rationale?: string;
  isDiscovery?: boolean;
  discoveryIntent?: DiscoveryIntent;
  description?: string;
  originalText?: string;
  sourcePosition?: number;
  originalName?: string;
  normalizedName?: string;
  candidateSearchNames?: string[];
  extractedLocation?: string;
}

export interface ParsedRecommendationSet {
  originalText: string;
  candidates: ExtractedItem[];
}







export interface ResolvedEntity {
  originalText: string;
  qlooId?: string;
  qlooType?: string;
  confidence: number;
  provenance: QlooEvidenceProvenance;
}

export interface AuditFinding {
  itemId: string;
  itemName: string;
  status: EvidenceClassification;
  issue?: string;
  evidence: QlooEvidenceProvenance[];
}

export interface RepairAlternative {
  originalItem: string;
  suggestedItem: string;
  reason: string;
  evidenceClassification: EvidenceClassification;
  qlooEntityId?: string;
}

// -------------------------------------------------------------
// Stage 1: PARSE
// Extract recommendation items, audience/context, location and constraints
// -------------------------------------------------------------
export interface ParseStageInput {
  rawRecommendation: string;
  audienceContext?: string;
  location?: string;
  constraints?: string[];
}

export interface ParseStageOutput {
  items: ExtractedItem[];
  audienceContext?: string;
  location?: string;
  constraints: string[];
  isDiscovery?: boolean;
  discoveryIntent?: DiscoveryIntent;
}



// -------------------------------------------------------------
// Stage 2: RESOLVE
// Resolve ambiguous concepts/entities using Qloo
// -------------------------------------------------------------
export interface ResolveStageInput {
  parsed: ParseStageOutput;
}

export interface ResolveStageOutput {
  resolvedEntities: ResolvedEntity[];
  unresolvedTerms: string[];
}

// -------------------------------------------------------------
// Stage 3: RETRIEVE
// Retrieve relevant Qloo evidence
// -------------------------------------------------------------
export interface RetrieveStageInput {
  resolved: ResolveStageOutput;
  location?: string;
}

export interface RetrieveStageOutput {
  evidenceList: QlooEvidenceProvenance[];
  coverageRate: number; // 0 to 1
}

// -------------------------------------------------------------
// Stage 4: AUDIT
// Evaluate cultural/contextual grounding
// -------------------------------------------------------------
export interface AuditStageInput {
  parsed: ParseStageOutput;
  resolved: ResolveStageOutput;
  retrieved: RetrieveStageOutput;
}

export interface AuditStageOutput {
  score: GroundingScore;
  findings: AuditFinding[];
}

// -------------------------------------------------------------
// Stage 5: REPAIR
// Find evidence-backed alternatives when appropriate
// -------------------------------------------------------------
export interface RepairStageInput {
  auditOutput: AuditStageOutput;
  parsed: ParseStageOutput;
}

export interface RepairStageOutput {
  proposedRepairs: RepairAlternative[];
  repairExplanation: string;
}

// -------------------------------------------------------------
// Stage 6: RE-AUDIT
// Evaluate the repaired recommendation using the same audit criteria
// -------------------------------------------------------------
export interface ReAuditStageInput {
  originalAudit: AuditStageOutput;
  repairs: RepairStageOutput;
}

export interface ReAuditStageOutput {
  reAuditedScore: GroundingScore;
  scoreDelta: number;
  verifiedImprovement: boolean;
}

export interface ItemResolutionEnvelope {
  item: ExtractedItem;
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

/**
 * Complete Orchestration Result Contract
 */
export interface OrchestratorAuditResult {
  status: 'scaffold' | 'partial_pipeline' | 'complete';
  message: string;
  stagesExecuted: Array<'PARSE' | 'RESOLVE' | 'RETRIEVE' | 'AUDIT' | 'REPAIR' | 'RE-AUDIT'>;
  input: ParseStageInput;
  parsedItems: ExtractedItem[];
  resolutionSummary?: ResolutionSummary;
  evidenceSummary?: EvidenceSummary;
  items?: ItemResolutionEnvelope[];
  auditReport?: OverallAuditReport;
  repairReport?: OverallRepairReport;
  agentTrace?: AgentExecutionTrace;
  scaffoldDetails?: {
    note: string;
    deterministicModelReady: boolean;
    weights: typeof SCORING_WEIGHTS;
  };
}
