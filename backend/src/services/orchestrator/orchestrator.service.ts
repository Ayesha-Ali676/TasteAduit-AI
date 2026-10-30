import crypto from 'crypto';
import {
  ParseStageInput,
  OrchestratorAuditResult,
  SCORING_WEIGHTS,
  ItemResolutionEnvelope,
  ResolutionSummary,
  EvidenceSummary
} from './stages.types.js';
import { RecommendationParser } from './parser.js';
import { resolutionService, EntityResolutionService } from '../resolution/resolution.service.js';
import { evidenceService, EvidenceRetrievalService } from '../evidence/evidence.service.js';
import { auditEngine, CulturalGroundingAuditEngine } from '../audit/audit.service.js';
import { repairService, RepairService } from '../repair/repair.service.js';
import { NormalizedEvidenceResult } from '../evidence/evidence.types.js';
import { OverallRepairReport, RepairItemResult } from '../repair/repair.types.js';
import { agentLoop as defaultAgentLoop, TasteAuditAgentLoop } from '../agent/agent.loop.js';
import { AgentExecutionTrace } from '../agent/agent.types.js';
import { logger } from '../../utils/logger.js';

export interface OrchestratorPipelineOptions {
  enableRepair?: boolean;
  enableAgent?: boolean;
  maxIterations?: number;
}

export class TasteAuditOrchestrator {
  private readonly resolutionSvc: EntityResolutionService;
  private readonly evidenceSvc: EvidenceRetrievalService;
  private readonly auditEngine: CulturalGroundingAuditEngine;
  private readonly repairSvc: RepairService;
  private readonly agentLoop: TasteAuditAgentLoop;

  constructor(
    resolutionSvc: EntityResolutionService = resolutionService,
    evidenceSvc: EvidenceRetrievalService = evidenceService,
    auditEng: CulturalGroundingAuditEngine = auditEngine,
    repairSvc: RepairService = repairService,
    agentLoop: TasteAuditAgentLoop = defaultAgentLoop
  ) {
    this.resolutionSvc = resolutionSvc;
    this.evidenceSvc = evidenceSvc;
    this.auditEngine = auditEng;
    this.repairSvc = repairSvc;
    this.agentLoop = agentLoop;
  }

  /**
   * Executes the bounded PARSE -> RESOLVE -> RETRIEVE -> AUDIT pipeline stages.
   * Optionally executes Stage 5 REPAIR & RE-AUDIT or Stage 6 AGENT LOOP.
   */
  public async executePipeline(
    input: ParseStageInput,
    options?: OrchestratorPipelineOptions
  ): Promise<OrchestratorAuditResult> {
    logger.info('Executing Stage 1: PARSE');
    const parsed = RecommendationParser.parse(input);

    logger.info(`Extracted ${parsed.items.length} recommendation item(s). Executing Stage 2: RESOLVE & Stage 3: RETRIEVE`);
    let envelopes: ItemResolutionEnvelope[] = [];

    let resolvedCount = 0;
    let ambiguousCount = 0;
    let unresolvedCount = 0;

    let supportedEvidenceCount = 0;
    let insufficientEvidenceCount = 0;
    let unresolvedEvidenceCount = 0;

    const effectiveLocation = input.location || parsed.location;
    const effectiveAudience = input.audienceContext || parsed.audienceContext;
    const effectiveConstraints = input.constraints && input.constraints.length > 0 ? input.constraints : parsed.constraints;

    for (const item of parsed.items) {
      const resolution = await this.resolutionSvc.resolve(item.name, {
        categoryHint: item.category,
        location: effectiveLocation,
        audience: effectiveAudience,
        constraints: effectiveConstraints,
        isDiscovery: item.isDiscovery,
        discoveryIntent: item.discoveryIntent
      });

      let evidence: NormalizedEvidenceResult;

      if (resolution.status === 'resolved' && resolution.resolvedEntity) {
        resolvedCount++;
        if (item.isDiscovery) {
          logger.info(`Discovered "${resolution.resolvedEntity.name}" (${resolution.resolvedEntity.id}) for discovery request "${item.name}". Executing Stage 3: RETRIEVE`);
          item.rationale = `Discovered for: "${item.name}"`;
          item.name = resolution.resolvedEntity.name;
        } else {
          logger.info(`Resolved "${item.name}" -> ${resolution.resolvedEntity.id}. Executing Stage 3: RETRIEVE`);
        }
        evidence = await this.evidenceSvc.retrieveEvidence({
          entityId: resolution.resolvedEntity.id,
          entityName: resolution.resolvedEntity.name,
          entityType: resolution.resolvedEntity.type,
          category: resolution.resolvedEntity.category,
          audience: input.audienceContext,
          location: input.location,
          constraints: input.constraints
        });

        if (evidence.status === 'supported') {
          supportedEvidenceCount++;
        } else {
          insufficientEvidenceCount++;
        }
      } else if (resolution.status === 'ambiguous') {
        ambiguousCount++;
        unresolvedEvidenceCount++;
        logger.info(`Entity "${item.name}" is ambiguous. Safely abstaining from Stage 3 RETRIEVE.`);
        evidence = {
          status: 'ambiguous',
          signals: [],
          summary: {
            signalsCount: 0,
            hasLocationSignal: false
          },
          provenance: {
            source: 'qloo',
            endpoint: 'none',
            operation: 'abstain_ambiguous_entity',
            correlationId: `abstain_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
            retrievedAt: new Date().toISOString(),
            queryMetadata: {
              reason: 'Entity resolution resulted in multiple ambiguous candidates; Qloo retrieval safely abstained.',
              query: item.name
            },
            classification: 'Unverified'
          }
        };
      } else {
        unresolvedCount++;
        unresolvedEvidenceCount++;
        logger.info(`Entity "${item.name}" is unresolved. Safely abstaining from Stage 3 RETRIEVE.`);
        evidence = {
          status: 'unresolved',
          signals: [],
          summary: {
            signalsCount: 0,
            hasLocationSignal: false
          },
          provenance: {
            source: 'qloo',
            endpoint: 'none',
            operation: 'abstain_unresolved_entity',
            correlationId: `abstain_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
            retrievedAt: new Date().toISOString(),
            queryMetadata: {
              reason: 'Entity resolution found no matching candidates; Qloo retrieval safely abstained.',
              query: item.name
            },
            classification: 'Unverified'
          }
        };
      }

      // Stage 4: AUDIT - Deterministically evaluate cultural grounding
      const itemAudit = this.auditEngine.auditItem(
        { item, resolution, evidence },
        {
          audience: input.audienceContext,
          location: input.location,
          constraints: input.constraints
        }
      );

      envelopes.push({
        item,
        resolution,
        evidence,
        audit: itemAudit,
        initialAudit: itemAudit
      });
    }

    const resolutionSummary: ResolutionSummary = {
      totalItems: parsed.items.length,
      resolvedCount,
      ambiguousCount,
      unresolvedCount
    };

    const evidenceSummary: EvidenceSummary = {
      totalItems: parsed.items.length,
      supportedCount: supportedEvidenceCount,
      insufficientCount: insufficientEvidenceCount,
      unresolvedCount: unresolvedEvidenceCount
    };

    let auditReport = this.auditEngine.aggregateReport(
      envelopes.map((e) => e.audit!).filter(Boolean),
      input
    );

    let repairReport: OverallRepairReport | undefined;
    let agentTrace: AgentExecutionTrace | undefined;
    const stagesExecuted: Array<'PARSE' | 'RESOLVE' | 'RETRIEVE' | 'AUDIT' | 'REPAIR' | 'RE-AUDIT'> = [
      'PARSE',
      'RESOLVE',
      'RETRIEVE',
      'AUDIT'
    ];

    if (options?.enableAgent) {
      logger.info('Executing Stage 6: AGENT LOOP');
      stagesExecuted.push('REPAIR', 'RE-AUDIT');
      const agentResult = await this.agentLoop.runLoop(input, envelopes, auditReport, {
        maxIterations: options.maxIterations,
        enableAgent: true
      });
      envelopes = agentResult.envelopes;
      auditReport = agentResult.auditReport;
      repairReport = agentResult.repairReport;
      agentTrace = agentResult.trace;
    } else if (options?.enableRepair) {
      logger.info('Executing Stage 5: REPAIR & RE-AUDIT');
      stagesExecuted.push('REPAIR');
      const repairResults: RepairItemResult[] = [];

      for (const envelope of envelopes) {
        const repairRes = await this.repairSvc.repairItem(envelope, {
          audience: input.audienceContext,
          location: input.location,
          constraints: input.constraints
        });
        envelope.repair = repairRes;
        repairResults.push(repairRes);
      }

      repairReport = this.repairSvc.aggregateRepairReport(repairResults);
    }

    const message = options?.enableAgent
      ? 'TasteAudit Stage 6 (AGENT LOOP) executed successfully.'
      : options?.enableRepair
      ? 'TasteAudit Stages 1 (PARSE), 2 (RESOLVE), 3 (RETRIEVE), 4 (AUDIT), and 5 (REPAIR) executed successfully.'
      : 'TasteAudit Stage 1 (PARSE), Stage 2 (RESOLVE), Stage 3 (RETRIEVE), and Stage 4 (AUDIT) executed successfully.';

    return {
      status: 'partial_pipeline',
      message,
      stagesExecuted,
      input,
      parsedItems: parsed.items,
      resolutionSummary,
      evidenceSummary,
      items: envelopes,
      auditReport,
      repairReport,
      agentTrace,
      scaffoldDetails: {
        note: options?.enableAgent
          ? 'Stage 6 (AGENT LOOP) is actively implemented with bounded iteration and structured trace.'
          : options?.enableRepair
          ? 'Stages 1 (PARSE), 2 (RESOLVE), 3 (RETRIEVE), 4 (AUDIT), and 5 (REPAIR) are actively implemented.'
          : 'Stages 1 (PARSE), 2 (RESOLVE), 3 (RETRIEVE), and 4 (AUDIT) are actively implemented. Stage 5 (REPAIR) executes when enabled.',
        deterministicModelReady: true,
        weights: SCORING_WEIGHTS
      }
    };
  }

  /**
   * Executes the full pipeline with Stage 6 AGENT LOOP.
   */
  public async executeAgentPipeline(
    input: ParseStageInput,
    options?: { maxIterations?: number }
  ): Promise<OrchestratorAuditResult> {
    return this.executePipeline(input, { enableAgent: true, ...options });
  }

  /**
   * Executes the full pipeline including Stage 5 AI REPAIR & DETERMINISTIC RE-AUDIT.
   */
  public async executeRepairPipeline(input: ParseStageInput): Promise<OrchestratorAuditResult> {
    return this.executePipeline(input, { enableRepair: true });
  }

  /**
   * Legacy scaffold fallback
   */
  public async executeScaffold(input: ParseStageInput): Promise<OrchestratorAuditResult> {
    return this.executePipeline(input);
  }
}

export const orchestrator = new TasteAuditOrchestrator();
