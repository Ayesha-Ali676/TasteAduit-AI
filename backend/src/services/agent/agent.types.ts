import { ItemAuditResult, OverallAuditReport } from '../audit/audit.types.js';
import { ItemResolutionEnvelope } from '../orchestrator/stages.types.js';
import { OverallRepairReport } from '../repair/repair.types.js';

export type AgentDecisionType = 'ACCEPT' | 'REPAIR' | 'MORE_EVIDENCE' | 'STOP';

export type AgentState =
  | 'INITIAL_AUDIT'
  | 'EVALUATING'
  | 'EXECUTING_REPAIR'
  | 'EXECUTING_EVIDENCE'
  | 'RE_AUDITING'
  | 'COMPLETED';

export interface AgentVerifiedCandidateInfo {
  id: string;
  name: string;
  type?: string;
  affinityValue?: number;
}

export interface AgentTraceEvent {
  step: number;
  iteration: number;
  state: AgentState;
  decision: AgentDecisionType;
  targetItemId?: string;
  targetItemName?: string;
  reasoning: string;
  actionPerformed?: {
    action: string;
    candidateSelected?: AgentVerifiedCandidateInfo;
    targetScoreBefore?: number;
    targetScoreAfter?: number;
    targetScoreDelta?: number;
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

export interface AgentLoopOptions {
  maxIterations?: number;
  timeoutMs?: number;
  enableAgent?: boolean;
}

export interface AgentLoopResult {
  auditReport: OverallAuditReport;
  envelopes: ItemResolutionEnvelope[];
  trace: AgentExecutionTrace;
  repairReport?: OverallRepairReport;
}
