import { EvidenceClassification } from '../qloo/qloo.types.js';

export type AuditDimensionName =
  | 'culturalAlignment'
  | 'contextualRelevance'
  | 'constraintCompliance'
  | 'evidenceCompleteness';

export type AuditDecisionStatus =
  | 'supported'
  | 'inferred'
  | 'unverified'
  | 'insufficient_evidence';

export interface AuditDimensionResult {
  name: AuditDimensionName;
  score: number; // Normalized strictly 0 - 100
  weight: number; // 0.40, 0.25, 0.20, or 0.15
  weightedScore: number; // score * weight
  classification: EvidenceClassification; // 'Supported' | 'Inferred' | 'Unverified'
  reasons: string[];
  evidenceRefs: string[];
}

export interface AuditDecision {
  status: AuditDecisionStatus;
  label: string;
  explanation: string;
}

export interface ItemAuditResult {
  itemId: string;
  itemName: string;
  overallScore: number; // Normalized strictly 0 - 100
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
    operation: 'cultural_grounding_audit';
    correlationId: string;
    auditedAt: string;
    classification: EvidenceClassification;
  };
}

export interface OverallAuditReport {
  overallScore: number; // Composite 0 - 100
  confidence: number; // Evidence density 0 - 100
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
    operation: 'aggregate_cultural_audit';
    correlationId: string;
    auditedAt: string;
  };
}
