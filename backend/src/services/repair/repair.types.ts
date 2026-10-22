import { ItemResolutionEnvelope } from '../orchestrator/stages.types.js';
import { ItemAuditResult } from '../audit/audit.types.js';

export type RepairStatus = 'repaired' | 'no_repair' | 'insufficient_evidence' | 'repair_failed';

export interface RepairedCandidateSelection {
  name: string;
  entityId: string;
  type: string;
}

export interface RepairItemResult {
  originalItem: string;
  status: RepairStatus;
  repairStrategy: string;
  selectedCandidate?: RepairedCandidateSelection;
  reasoning: string;
  beforeAudit: ItemAuditResult;
  afterAudit?: ItemAuditResult;
  scoreDelta?: number;
  verifiedImprovement?: boolean;
  providerUsed?: string;
  evidenceRefs: string[];
  constraintHandling: string[];
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
