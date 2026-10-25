/**
 * Qloo Evidence Classification
 * Strict rule: Never claim 'Supported' unless empirical evidence exists.
 */
export type EvidenceClassification = 'Supported' | 'Inferred' | 'Unverified';

export type ResolutionStatus = 'resolved' | 'ambiguous' | 'unresolved';

/**
 * Audit Evidence Provenance
 * Every Qloo-derived result must carry complete traceability.
 */
export interface QlooEvidenceProvenance {
  entityId?: string;
  tagId?: string;
  qlooType: string;
  source: 'qloo-hackathon-api';
  operation: string;
  classification: EvidenceClassification;
  retrievedAt: string;
  correlationId: string;
  resolutionStatus: ResolutionStatus;
  details?: Record<string, unknown>;
}

export interface QlooClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Raw entity shape from Qloo Hackathon GET /search and GET /entities
 */
export interface QlooRawEntity {
  name: string;
  entity_id: string;
  types: string[];
  popularity?: number;
  disambiguation?: string;
  tags?: Array<{
    id?: string;
    name: string;
    tag_id?: string;
    type: string;
    value?: string;
  }>;
  properties?: Record<string, unknown>;
}

/**
 * Raw tag shape from Qloo Hackathon GET /v2/tags
 */
export interface QlooRawTag {
  id: string;
  name: string;
  type: string;
  popularity?: number;
  properties?: Record<string, unknown>;
  parents?: Array<{
    type: string;
  }>;
  tags?: Array<{
    id?: string;
    name: string;
    tag_id?: string;
    type: string;
    value?: string;
  }>;
}

/**
 * Raw insight item shape from Qloo Hackathon GET /v2/insights
 */
export interface QlooRawInsightItem {
  entity_id: string;
  name: string;
  types: string[];
  popularity?: number;
  disambiguation?: string;
  query?: {
    affinity?: number;
    measurements?: Record<string, unknown>;
  };
  tags?: Array<{
    id?: string;
    tag_id?: string;
    name: string;
    type: string;
    value?: string;
  }>;
  properties?: Record<string, unknown>;
}

/**
 * Normalized Candidate Entity for TasteAudit
 */
export interface NormalizedCandidate {
  id: string;
  name: string;
  type: string;
  category: 'entity' | 'tag';
  popularity?: number;
  disambiguation?: string;
  imageUrl?: string;
  tags?: string[];
  source: 'qloo';
  retrievedAt: string;
  rawMetadata?: {
    urns?: string[];
    qlooSubtype?: string;
    releaseDate?: string;
  };
}

export interface EntityResolutionContext {
  categoryHint?: string;
  location?: string;
  audience?: string;
  constraints?: string[];
  isDiscovery?: boolean;
  discoveryIntent?: {
    domain?: string;
    category?: string;
    descriptivePreferences?: string[];
    cleanQuery?: string;
    rawRequest?: string;
  };
}

export interface EntityResolutionResult {
  query: string;
  status: ResolutionStatus;
  resolvedEntity?: NormalizedCandidate;
  candidates: NormalizedCandidate[];
  derivedConfidence?: number; // Application-derived match score (0 - 1)
  reason?: string;
  provenance: QlooEvidenceProvenance;
}

export interface QlooClient {
  isConfigured(): boolean;
  searchEntities(query: string, options?: { type?: string; take?: number; signal?: AbortSignal }): Promise<QlooRawEntity[]>;
  searchTags(query: string, options?: { type?: string; take?: number; signal?: AbortSignal }): Promise<QlooRawTag[]>;
  searchCandidates(query: string, options?: { type?: string; take?: number }): Promise<NormalizedCandidate[]>;
  getInsights(params: {
    signalEntityId?: string;
    signalTagId?: string;
    targetType?: string;
    location?: string;
    take?: number;
  }): Promise<QlooRawInsightItem[]>;
  getEntityDetails(entityId: string): Promise<QlooRawEntity | null>;
}
