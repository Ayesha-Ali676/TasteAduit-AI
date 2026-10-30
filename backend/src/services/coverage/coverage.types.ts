/**
 * Cultural Coverage & Blind Spot Intelligence Types
 * Grounded strictly in Qloo taste-graph signals and verified recommendation envelopes.
 */

export type CulturalDirectionStatus = 'COVERED' | 'BLIND_SPOT' | 'INSUFFICIENT_EVIDENCE';

export interface CulturalDirection {
  id: string;
  label: string;
  category?: string; // e.g. 'genre', 'theme', 'cultural_attribute', 'style'
  status: CulturalDirectionStatus;
  confidence: number; // 0.0 to 1.0 based on empirical Qloo evidence strength
  explanation: string;
  evidenceRefs: string[]; // Identifiers or names of Qloo signals/provenance supporting this direction
  representedBy?: string[]; // Candidate names representing this direction (for COVERED status)
  relevanceScore?: number; // Relative affinity/frequency in Qloo taste cluster
}

export interface QlooGroundedAlternative {
  entityId: string;
  name: string;
  type?: string;
  imageUrl?: string;
  affinity?: number; // Exact empirical affinity from Qloo (e.g. 0.94); never fabricated
  uncoveredDirection: string; // The specific blind spot this alternative bridges
  rationale: string;
  provenanceRef: string;
}

export type CulturalCoverageStatus = 'SUFFICIENT_EVIDENCE' | 'INSUFFICIENT_EVIDENCE' | 'UNAVAILABLE';

export interface CulturalCoverageResult {
  status: CulturalCoverageStatus;
  coverageRatio?: number; // e.g. 0.60 (3 / 5)
  coveragePercentage?: number; // e.g. 60
  totalSupportedDirections: number;
  coveredDirectionsCount: number;
  blindSpotsCount: number;
  coveredDirections: CulturalDirection[];
  blindSpots: CulturalDirection[];
  alternative?: QlooGroundedAlternative;
  summaryNote: string;
  generatedAt: string;
}

