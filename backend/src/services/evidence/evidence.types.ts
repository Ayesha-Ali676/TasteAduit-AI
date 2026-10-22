import { EvidenceClassification } from '../qloo/qloo.types.js';

export type EvidenceSignalType =
  | 'taste_affinity'
  | 'cultural_tag'
  | 'related_entity'
  | 'location_affinity';

export interface NormalizedEvidenceSignal {
  signalType: EvidenceSignalType;
  relatedEntityId?: string;
  relatedEntityName?: string;
  relatedEntityType?: string;
  value?: number; // Exact empirical affinity from Qloo (e.g. 0.945); never fabricated
  rank?: number;
  relationship?: string; // e.g. 'high_taste_affinity', 'shared_cultural_attribute'
  context?: {
    audience?: string;
    location?: string;
  };
  tags?: string[];
}

export type EvidenceStatus =
  | 'supported'
  | 'insufficient_evidence'
  | 'unverified'
  | 'ambiguous'
  | 'unresolved';

export interface NormalizedEvidenceResult {
  status: EvidenceStatus;
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
    classification: EvidenceClassification;
  };
}

export interface RetrieveEvidenceInput {
  entityId: string;
  entityName: string;
  entityType: string;
  category?: 'entity' | 'tag';
  audience?: string;
  location?: string;
  constraints?: string[];
}
