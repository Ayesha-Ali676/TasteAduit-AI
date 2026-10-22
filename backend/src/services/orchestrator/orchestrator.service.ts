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
import { NormalizedEvidenceResult } from '../evidence/evidence.types.js';
import { logger } from '../../utils/logger.js';

export class TasteAuditOrchestrator {
  private readonly resolutionSvc: EntityResolutionService;
  private readonly evidenceSvc: EvidenceRetrievalService;
  private readonly auditEngine: CulturalGroundingAuditEngine;

  constructor(
    resolutionSvc: EntityResolutionService = resolutionService,
    evidenceSvc: EvidenceRetrievalService = evidenceService,
    auditEng: CulturalGroundingAuditEngine = auditEngine
  ) {
    this.resolutionSvc = resolutionSvc;
    this.evidenceSvc = evidenceSvc;
    this.auditEngine = auditEng;
  }

  /**
   * Executes the bounded PARSE -> RESOLVE -> RETRIEVE -> AUDIT pipeline stages.
   * Does NOT execute REPAIR or RE-AUDIT (reserved for subsequent phases).
   */
  public async executePipeline(input: ParseStageInput): Promise<OrchestratorAuditResult> {
    logger.info('Executing Stage 1: PARSE');
    const parsed = RecommendationParser.parse(input);

    logger.info(`Extracted ${parsed.items.length} recommendation item(s). Executing Stage 2: RESOLVE & Stage 3: RETRIEVE`);
    const envelopes: ItemResolutionEnvelope[] = [];

    let resolvedCount = 0;
    let ambiguousCount = 0;
    let unresolvedCount = 0;

    let supportedEvidenceCount = 0;
    let insufficientEvidenceCount = 0;
    let unresolvedEvidenceCount = 0;

    for (const item of parsed.items) {
      const resolution = await this.resolutionSvc.resolve(item.name, {
        location: input.location,
        audience: input.audienceContext,
        constraints: input.constraints
      });

      let evidence: NormalizedEvidenceResult;

      if (resolution.status === 'resolved' && resolution.resolvedEntity) {
        resolvedCount++;
        logger.info(`Resolved "${item.name}" -> ${resolution.resolvedEntity.id}. Executing Stage 3: RETRIEVE`);
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
        audit: itemAudit
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

    const auditReport = this.auditEngine.aggregateReport(
      envelopes.map((e) => e.audit!).filter(Boolean),
      input
    );

    return {
      status: 'partial_pipeline',
      message: 'TasteAudit Stage 1 (PARSE), Stage 2 (RESOLVE), Stage 3 (RETRIEVE), and Stage 4 (AUDIT) executed successfully.',
      stagesExecuted: ['PARSE', 'RESOLVE', 'RETRIEVE', 'AUDIT'],
      input,
      parsedItems: parsed.items,
      resolutionSummary,
      evidenceSummary,
      items: envelopes,
      auditReport,
      scaffoldDetails: {
        note: 'Stages 1 (PARSE), 2 (RESOLVE), 3 (RETRIEVE), and 4 (AUDIT) are actively implemented. Stages 5-6 (REPAIR, RE-AUDIT) will execute in subsequent phases.',
        deterministicModelReady: true,
        weights: SCORING_WEIGHTS
      }
    };
  }

  /**
   * Legacy scaffold fallback
   */
  public async executeScaffold(input: ParseStageInput): Promise<OrchestratorAuditResult> {
    return this.executePipeline(input);
  }
}

export const orchestrator = new TasteAuditOrchestrator();
