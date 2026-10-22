import crypto from 'crypto';
import {
  SCORING_WEIGHTS,
  ParseStageInput,
  ItemResolutionEnvelope
} from '../orchestrator/stages.types.js';
import {
  AuditDimensionResult,
  ItemAuditResult,
  OverallAuditReport,
  AuditDecision
} from './audit.types.js';
import { NormalizedEvidenceSignal } from '../evidence/evidence.types.js';
import { EvidenceClassification } from '../qloo/qloo.types.js';

export interface AuditEvaluationContext {
  audience?: string;
  location?: string;
  constraints?: string[];
}

export class CulturalGroundingAuditEngine {
  /**
   * Evaluates Cultural Alignment (Weight: 40%)
   * Measures whether the recommendation item has empirical Qloo taste graph support.
   */
  public evaluateCulturalAlignment(
    envelope: ItemResolutionEnvelope
  ): AuditDimensionResult {
    const weight = SCORING_WEIGHTS.culturalAlignment;
    const evidence = envelope.evidence;
    const resolution = envelope.resolution;

    // Abstention if unresolved, ambiguous, or no evidence
    if (
      resolution.status !== 'resolved' ||
      !evidence ||
      evidence.status === 'insufficient_evidence' ||
      evidence.signals.length === 0
    ) {
      return {
        name: 'culturalAlignment',
        score: 0,
        weight,
        weightedScore: 0,
        classification: 'Unverified',
        reasons: [
          'No empirical Qloo cultural signals available to establish cultural alignment.'
        ],
        evidenceRefs: []
      };
    }

    const affinitySignals = evidence.signals.filter(
      (s) => s.signalType === 'taste_affinity'
    );
    const tagSignals = evidence.signals.filter(
      (s) => s.signalType === 'cultural_tag'
    );

    const evidenceRefs: string[] = [];
    const reasons: string[] = [];
    let score = 0;

    if (affinitySignals.length > 0) {
      // 1. Evaluate empirical taste affinities
      const numericAffinities = affinitySignals
        .map((s) => s.value)
        .filter((v): v is number => typeof v === 'number');

      if (numericAffinities.length > 0) {
        const avg =
          numericAffinities.reduce((sum, v) => sum + v, 0) /
          numericAffinities.length;
        // Base score: 0.80 - 1.00 affinity maps to 80 - 100
        score = Math.min(100, Math.round(avg * 100));

        const topSignal = affinitySignals[0];
        if (topSignal && topSignal.value !== undefined) {
          evidenceRefs.push(`qloo:affinity:${topSignal.relatedEntityId || topSignal.relatedEntityName}`);
          reasons.push(
            `Strong empirical Qloo affinity of ${(topSignal.value * 100).toFixed(1)}% with related cultural entity '${topSignal.relatedEntityName}'.`
          );
        }

        reasons.push(
          `Found ${affinitySignals.length} empirical taste correlation(s) in Qloo taste graph (avg: ${(avg * 100).toFixed(1)}%).`
        );

        // Add bonus for direct cultural tags
        if (tagSignals.length >= 2) {
          score = Math.min(100, score + 5);
          reasons.push(
            `Reinforced by ${tagSignals.length} verified cultural attribute tags.`
          );
        }
      } else {
        // Affinity signals exist without numeric score
        score = 75;
        reasons.push(
          `Identified ${affinitySignals.length} related cultural entity relationship(s) in Qloo.`
        );
      }

      affinitySignals.slice(0, 3).forEach((s) => {
        if (s.relatedEntityId) {
          evidenceRefs.push(`qloo:entity:${s.relatedEntityId}`);
        }
      });
    } else if (tagSignals.length > 0) {
      // 2. Evaluate direct cultural tags when no cross-domain affinities exist
      const tagCount = tagSignals.length;
      if (tagCount >= 4) {
        score = 85;
      } else if (tagCount === 3) {
        score = 75;
      } else if (tagCount === 2) {
        score = 65;
      } else {
        score = 50;
      }

      tagSignals.slice(0, 4).forEach((t) => {
        if (t.relatedEntityName) {
          evidenceRefs.push(`qloo:tag:${t.relatedEntityName}`);
        }
      });

      reasons.push(
        `Grounding established through ${tagCount} verified Qloo cultural tag(s): ${tagSignals
          .slice(0, 3)
          .map((t) => `'${t.relatedEntityName}'`)
          .join(', ')}.`
      );
    }

    score = Math.max(0, Math.min(100, score));
    const classification: EvidenceClassification = score >= 80 ? 'Supported' : 'Inferred';

    return {
      name: 'culturalAlignment',
      score,
      weight,
      weightedScore: Math.round(score * weight * 10) / 10,
      classification,
      reasons,
      evidenceRefs
    };
  }

  /**
   * Evaluates Contextual Relevance (Weight: 25%)
   * Measures alignment against audience, location, and taste context without false location claims.
   */
  public evaluateContextualRelevance(
    envelope: ItemResolutionEnvelope,
    context?: AuditEvaluationContext
  ): AuditDimensionResult {
    const weight = SCORING_WEIGHTS.contextualRelevance;
    const evidence = envelope.evidence;
    const resolution = envelope.resolution;

    if (resolution.status !== 'resolved' || !evidence || evidence.status === 'insufficient_evidence') {
      return {
        name: 'contextualRelevance',
        score: 0,
        weight,
        weightedScore: 0,
        classification: 'Unverified',
        reasons: ['Cannot assess contextual relevance without resolved entity evidence.'],
        evidenceRefs: []
      };
    }

    const reasons: string[] = [];
    const evidenceRefs: string[] = [];

    // Part A: Location Relevance (max 50 points)
    let locationScore = 50; // default full credit if user didn't specify location
    let locationClassification: EvidenceClassification = 'Supported';

    const userLocation = context?.location?.trim();
    if (userLocation) {
      const locationApplied = Boolean(evidence.provenance.queryMetadata?.locationFilterApplied);

      if (locationApplied) {
        locationScore = 50;
        locationClassification = 'Supported';
        reasons.push(
          `Location '${userLocation}' was verified and applied via Qloo geographic filtering.`
        );
      } else {
        // Location provided by user but evaluated as general cultural affinity (not WKT-filtered)
        // Check if any Qloo cultural tags mention the location
        const locLower = userLocation.toLowerCase();
        const hasTagMention = evidence.signals.some((s) =>
          (s.relatedEntityName || '').toLowerCase().includes(locLower) ||
          (s.tags || []).some((t) => t.toLowerCase().includes(locLower))
        );

        if (hasTagMention) {
          locationScore = 40;
          locationClassification = 'Inferred';
          reasons.push(
            `Location '${userLocation}' aligns with Qloo cultural tags; evaluated without geometric WKT filter.`
          );
        } else {
          locationScore = 30;
          locationClassification = 'Inferred';
          reasons.push(
            `Location '${userLocation}' provided in user context; evaluated for general cultural affinity without geometric WKT filter (no false location filter claimed).`
          );
        }
      }
    } else {
      reasons.push('No location constraint specified; evaluated on global cultural appeal.');
    }

    // Part B: Audience Relevance (max 50 points)
    let audienceScore = 50;
    let audienceClassification: EvidenceClassification = 'Supported';

    const userAudience = context?.audience?.trim();
    if (userAudience) {
      const audienceWords = userAudience
        .toLowerCase()
        .split(/[\s,–—\-_/]+/)
        .filter((w) => w.length >= 3 && !['and', 'for', 'the', 'with', 'who'].includes(w));

      const matchedSignals: NormalizedEvidenceSignal[] = [];

      evidence.signals.forEach((sig) => {
        const targetText = [
          sig.relatedEntityName || '',
          sig.relationship || '',
          ...(sig.tags || [])
        ].join(' ').toLowerCase();

        const matchCount = audienceWords.filter((w) => targetText.includes(w)).length;
        if (matchCount > 0) {
          matchedSignals.push(sig);
        }
      });

      if (matchedSignals.length >= 2) {
        audienceScore = 50;
        audienceClassification = 'Supported';
        reasons.push(
          `Cultural signals directly match requested audience context '${userAudience}'.`
        );
        matchedSignals.slice(0, 2).forEach((s) => {
          if (s.relatedEntityName) evidenceRefs.push(`qloo:audience_match:${s.relatedEntityName}`);
        });
      } else if (matchedSignals.length === 1) {
        audienceScore = 40;
        audienceClassification = 'Inferred';
        reasons.push(
          `Moderate correlation with audience context '${userAudience}'.`
        );
      } else {
        audienceScore = 25;
        audienceClassification = 'Inferred';
        reasons.push(
          `Audience context '${userAudience}' noted; general demographic compatibility inferred.`
        );
      }
    } else {
      reasons.push('No specific audience demographic restricted; universal context applied.');
    }

    const totalScore = Math.max(0, Math.min(100, Math.round(locationScore + audienceScore)));
    const overallClassification: EvidenceClassification =
      locationClassification === 'Supported' && audienceClassification === 'Supported'
        ? 'Supported'
        : 'Inferred';

    return {
      name: 'contextualRelevance',
      score: totalScore,
      weight,
      weightedScore: Math.round(totalScore * weight * 10) / 10,
      classification: overallClassification,
      reasons,
      evidenceRefs
    };
  }

  /**
   * Evaluates Constraint Compliance (Weight: 20%)
   * Evaluates explicit user negative or positive constraints against verified evidence.
   */
  public evaluateConstraintCompliance(
    envelope: ItemResolutionEnvelope,
    context?: AuditEvaluationContext
  ): AuditDimensionResult {
    const weight = SCORING_WEIGHTS.constraintCompliance;
    const constraints = context?.constraints || [];

    // If user provided no constraints, neutral 100% compliance without false claims
    if (!constraints || constraints.length === 0) {
      return {
        name: 'constraintCompliance',
        score: 100,
        weight,
        weightedScore: Math.round(100 * weight * 10) / 10,
        classification: 'Supported',
        reasons: ['No explicit constraints were provided, so constraint compliance is neutral.'],
        evidenceRefs: []
      };
    }

    const evidence = envelope.evidence;
    const resolution = envelope.resolution;

    if (resolution.status !== 'resolved' || !evidence || evidence.status === 'insufficient_evidence') {
      return {
        name: 'constraintCompliance',
        score: 0,
        weight,
        weightedScore: 0,
        classification: 'Unverified',
        reasons: ['[UNVERIFIED] Constraints cannot be validated against unresolved or unverified entity.'],
        evidenceRefs: []
      };
    }

    // Direct entity attributes (for negative exclusion checks)
    const directEntityText = [
      resolution.resolvedEntity?.name || '',
      resolution.resolvedEntity?.type || '',
      ...(resolution.resolvedEntity?.tags || []),
      ...evidence.signals
        .filter((s) => s.signalType === 'cultural_tag')
        .map((s) => s.relatedEntityName || '')
    ].join(' ').toLowerCase();

    // Comprehensive evidence text (for positive cultural attribute matches)
    const allEvidenceText = [
      directEntityText,
      ...evidence.signals.map((s) => s.relatedEntityName || ''),
      ...evidence.signals.flatMap((s) => s.tags || [])
    ].join(' ').toLowerCase();

    let passedCount = 0;
    let unverifiedCount = 0;
    let failedCount = 0;
    const reasons: string[] = [];
    const evidenceRefs: string[] = [];

    for (const constraint of constraints) {
      const cLower = constraint.toLowerCase().trim();

      // Check for exclusion / negative constraint (e.g. "no loud percussion", "no violence", "without x")
      const isNegative =
        cLower.startsWith('no ') ||
        cLower.startsWith('without ') ||
        cLower.startsWith('never ') ||
        cLower.includes('excluded') ||
        cLower.includes('avoid');

      if (isNegative) {
        const forbiddenTerm = cLower
          .replace(/^(no|without|never|avoid)\s+/i, '')
          .replace(/\s+preferred$/i, '')
          .trim();

        // Check if forbidden term is present in direct entity tags or direct cultural tags (not external affinity partners)
        const isViolated =
          forbiddenTerm.length >= 3 &&
          (directEntityText.includes(forbiddenTerm) ||
            evidence.signals
              .filter((s) => s.signalType === 'cultural_tag')
              .some((s) =>
                (s.tags || []).some((t) => t.toLowerCase().includes(forbiddenTerm)) ||
                s.relatedEntityName?.toLowerCase().includes(forbiddenTerm)
              ));

        if (isViolated) {
          failedCount++;
          reasons.push(
            `[FAIL] Negative constraint '${constraint}' violated: conflicting attribute '${forbiddenTerm}' found in Qloo evidence.`
          );
        } else {
          passedCount++;
          reasons.push(
            `[PASS] Negative constraint '${constraint}' satisfied: no conflicting attributes found in Qloo evidence.`
          );
        }
      } else {
        // Positive requirement (e.g. "acoustic preferred", "crime thriller", "under $30")
        const cleanConstraint = cLower
          .replace(/\s+(preferred|only|style|genre)$/i, '')
          .trim();

        // 1. External unverifiable attributes (budget, price, diet, amenities not in Qloo)
        const isExternalAttribute =
          cleanConstraint.includes('$') ||
          cleanConstraint.includes('dollar') ||
          cleanConstraint.includes('budget') ||
          cleanConstraint.includes('price') ||
          cleanConstraint.includes('cost') ||
          cleanConstraint.includes('cheap') ||
          cleanConstraint.includes('expensive') ||
          cleanConstraint.includes('diet') ||
          cleanConstraint.includes('vegan') ||
          cleanConstraint.includes('vegetarian') ||
          cleanConstraint.includes('gluten') ||
          cleanConstraint.includes('halal') ||
          cleanConstraint.includes('kosher') ||
          cleanConstraint.includes('delivery') ||
          cleanConstraint.includes('parking') ||
          cleanConstraint.includes('open late') ||
          cleanConstraint.includes('wheelchair');

        if (isExternalAttribute) {
          unverifiedCount++;
          reasons.push(
            `[UNVERIFIED] Constraint '${constraint}' is an external dimension (pricing/dietary/amenity) not indexed in Qloo cultural taste graph.`
          );
        } else {
          // 2. Cultural / genre / style constraint
          const words = cleanConstraint
            .split(/[\s/,\-_]+/)
            .filter((w) => w.length >= 3 && !['and', 'the', 'with', 'for'].includes(w));
          const phraseMatch = allEvidenceText.includes(cleanConstraint);
          const allWordsMatch = words.length > 0 && words.every((w) => allEvidenceText.includes(w));
          const isAlternative = cleanConstraint.includes('/') || cleanConstraint.includes(' or ') || cleanConstraint.includes(',');
          const anyWordMatch = isAlternative && words.some((w) => allEvidenceText.includes(w));

          if (phraseMatch || allWordsMatch || anyWordMatch) {
            passedCount++;
            evidenceRefs.push(`qloo:constraint_match:${constraint}`);
            reasons.push(
              `[PASS] Positive constraint '${constraint}' verified in Qloo cultural attributes.`
            );
          } else {
            unverifiedCount++;
            reasons.push(
              `[UNVERIFIED] Positive constraint '${constraint}' not corroborated by available Qloo cultural tags.`
            );
          }
        }
      }
    }

    const total = constraints.length;
    // Mathematical Scoring: Passed = 1.0 (100%), Unverified = 0.5 (50%), Failed = 0.0 (0%)
    const rawScore = ((passedCount * 1.0 + unverifiedCount * 0.5 + failedCount * 0.0) / total) * 100;
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));

    // Strict Evidence Firewall: Any unverified or failed constraint keeps classification 'Unverified'
    let classification: EvidenceClassification = 'Supported';
    if (failedCount > 0 || unverifiedCount > 0) {
      classification = 'Unverified';
    }

    return {
      name: 'constraintCompliance',
      score,
      weight,
      weightedScore: Math.round(score * weight * 10) / 10,
      classification,
      reasons,
      evidenceRefs
    };
  }

  /**
   * Evaluates Evidence Completeness (Weight: 15%)
   * Measures the depth, density, and provenance integrity of retrieved signals.
   */
  public evaluateEvidenceCompleteness(
    envelope: ItemResolutionEnvelope
  ): AuditDimensionResult {
    const weight = SCORING_WEIGHTS.evidenceCompleteness;
    const resolution = envelope.resolution;
    const evidence = envelope.evidence;

    let score = 0;
    const reasons: string[] = [];
    const evidenceRefs: string[] = [];

    // Component 1: Entity Resolution (max 35)
    if (resolution.status === 'resolved' && resolution.resolvedEntity) {
      score += 35;
      reasons.push(`Entity '${resolution.resolvedEntity.name}' successfully resolved with high confidence.`);
      evidenceRefs.push(`qloo:entity_id:${resolution.resolvedEntity.id}`);
    } else if (resolution.status === 'ambiguous') {
      score += 10;
      reasons.push('Entity resolution resulted in ambiguity; incomplete resolution.');
    } else {
      reasons.push('Entity unresolved; resolution completeness 0%.');
    }

    // Component 2: Evidence Status (max 25)
    if (evidence && evidence.status === 'supported') {
      score += 25;
      reasons.push('Empirical Qloo evidence successfully retrieved and normalized.');
    } else if (evidence && evidence.status === 'insufficient_evidence') {
      reasons.push('Qloo evidence retrieval returned empty signals (insufficient evidence).');
    } else {
      reasons.push('No Qloo evidence retrieved.');
    }

    // Component 3: Signal Density (max 30)
    const signalCount = evidence?.signals?.length || 0;
    if (signalCount >= 6) {
      score += 30;
      reasons.push(`Rich evidence density: ${signalCount} cultural and affinity signals available.`);
    } else if (signalCount >= 3) {
      score += 22;
      reasons.push(`Adequate evidence density: ${signalCount} signals retrieved.`);
    } else if (signalCount >= 1) {
      score += 15;
      reasons.push(`Minimal evidence density: ${signalCount} signal(s) retrieved.`);
    } else {
      reasons.push('Zero cultural signals available.');
    }

    // Component 4: Provenance Integrity (max 10)
    if (
      evidence?.provenance?.source === 'qloo' &&
      evidence.provenance.correlationId &&
      evidence.provenance.retrievedAt
    ) {
      score += 10;
      reasons.push('Complete provenance metadata preserved (source, endpoint, correlation tracer).');
    }

    score = Math.max(0, Math.min(100, score));

    // Hard ceiling if entity is ambiguous or unresolved
    if (resolution.status !== 'resolved') {
      score = Math.min(15, score);
    }

    const classification: EvidenceClassification = score >= 75 ? 'Supported' : 'Unverified';

    return {
      name: 'evidenceCompleteness',
      score,
      weight,
      weightedScore: Math.round(score * weight * 10) / 10,
      classification,
      reasons,
      evidenceRefs
    };
  }

  /**
   * Deterministically audits a single recommendation item envelope.
   */
  public auditItem(
    envelope: ItemResolutionEnvelope,
    context?: AuditEvaluationContext
  ): ItemAuditResult {
    const culturalAlignment = this.evaluateCulturalAlignment(envelope);
    const contextualRelevance = this.evaluateContextualRelevance(envelope, context);
    const constraintCompliance = this.evaluateConstraintCompliance(envelope, context);
    const evidenceCompleteness = this.evaluateEvidenceCompleteness(envelope);

    // Bounded weighted composite score
    const rawOverall =
      culturalAlignment.weightedScore +
      contextualRelevance.weightedScore +
      constraintCompliance.weightedScore +
      evidenceCompleteness.weightedScore;

    const overallScore = Math.max(0, Math.min(100, Math.round(rawOverall)));

    // Deterministic decision bands
    let decision: AuditDecision;
    const isAbstained =
      envelope.resolution.status !== 'resolved' ||
      !envelope.evidence ||
      envelope.evidence.status === 'insufficient_evidence' ||
      evidenceCompleteness.score < 25;

    if (isAbstained) {
      decision = {
        status: 'insufficient_evidence',
        label: 'Insufficient Qloo Evidence',
        explanation:
          'Abstained from conclusive cultural audit due to incomplete entity resolution or lack of empirical Qloo signals. No unsupported conclusions made.'
      };
    } else if (overallScore >= 80) {
      decision = {
        status: 'supported',
        label: 'Culturally Grounded (Supported)',
        explanation: `Strong empirical grounding (${overallScore}/100) with verified Qloo taste affinities and cultural alignment.`
      };
    } else if (overallScore >= 60) {
      decision = {
        status: 'inferred',
        label: 'Partially Grounded (Needs Review)',
        explanation: `Moderate cultural grounding (${overallScore}/100); some context or constraints remain unverified.`
      };
    } else {
      decision = {
        status: 'unverified',
        label: 'Weak Grounding (Unverified)',
        explanation: `Low cultural alignment (${overallScore}/100) or insufficient signals against requested context.`
      };
    }

    const allEvidenceRefs = Array.from(
      new Set([
        ...culturalAlignment.evidenceRefs,
        ...contextualRelevance.evidenceRefs,
        ...constraintCompliance.evidenceRefs,
        ...evidenceCompleteness.evidenceRefs
      ])
    );

    const overallClassification: EvidenceClassification =
      decision.status === 'supported'
        ? 'Supported'
        : decision.status === 'inferred'
        ? 'Inferred'
        : 'Unverified';

    return {
      itemId: envelope.item.id,
      itemName: envelope.item.name,
      overallScore,
      dimensions: {
        culturalAlignment,
        contextualRelevance,
        constraintCompliance,
        evidenceCompleteness
      },
      decision,
      evidenceRefs: allEvidenceRefs,
      provenance: {
        source: 'tasteaudit',
        operation: 'cultural_grounding_audit',
        correlationId: `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        auditedAt: new Date().toISOString(),
        classification: overallClassification
      }
    };
  }

  /**
   * Aggregates individual item audit results into an Overall Audit Report.
   */
  public aggregateReport(
    itemAudits: ItemAuditResult[],
    parseInput: ParseStageInput
  ): OverallAuditReport {
    if (itemAudits.length === 0) {
      return {
        overallScore: 0,
        confidence: 0,
        decision: {
          status: 'insufficient_evidence',
          label: 'No Items Audited',
          explanation: 'No recommendation items were parsed or available for audit.'
        },
        dimensionsSummary: {
          culturalAlignment: 0,
          contextualRelevance: 0,
          constraintCompliance: 0,
          evidenceCompleteness: 0
        },
        totalItemsAudited: 0,
        itemsSummary: {
          supportedCount: 0,
          inferredCount: 0,
          unverifiedCount: 0,
          insufficientCount: 0
        },
        provenance: {
          source: 'tasteaudit',
          operation: 'aggregate_cultural_audit',
          correlationId: `agg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          auditedAt: new Date().toISOString()
        }
      };
    }

    const n = itemAudits.length;
    const sumOverall = itemAudits.reduce((acc, it) => acc + it.overallScore, 0);
    const overallScore = Math.round(sumOverall / n);

    const avgAlignment = Math.round(
      itemAudits.reduce((acc, it) => acc + it.dimensions.culturalAlignment.score, 0) / n
    );
    const avgRelevance = Math.round(
      itemAudits.reduce((acc, it) => acc + it.dimensions.contextualRelevance.score, 0) / n
    );
    const avgConstraints = Math.round(
      itemAudits.reduce((acc, it) => acc + it.dimensions.constraintCompliance.score, 0) / n
    );
    const avgCompleteness = Math.round(
      itemAudits.reduce((acc, it) => acc + it.dimensions.evidenceCompleteness.score, 0) / n
    );

    let supportedCount = 0;
    let inferredCount = 0;
    let unverifiedCount = 0;
    let insufficientCount = 0;

    itemAudits.forEach((it) => {
      if (it.decision.status === 'supported') supportedCount++;
      else if (it.decision.status === 'inferred') inferredCount++;
      else if (it.decision.status === 'unverified') unverifiedCount++;
      else insufficientCount++;
    });

    let overallDecision: AuditDecision;
    if (insufficientCount === n) {
      overallDecision = {
        status: 'insufficient_evidence',
        label: 'Insufficient Qloo Evidence',
        explanation: 'All recommendation items lacked sufficient Qloo evidence or could not be reliably resolved.'
      };
    } else if (overallScore >= 80 && supportedCount >= Math.ceil(n / 2)) {
      overallDecision = {
        status: 'supported',
        label: 'Culturally Grounded (Supported)',
        explanation: `Recommendation set demonstrates strong cultural grounding (${overallScore}/100) with verified Qloo taste graph evidence.`
      };
    } else if (overallScore >= 60) {
      overallDecision = {
        status: 'inferred',
        label: 'Partially Grounded (Needs Review)',
        explanation: `Recommendation set shows moderate cultural grounding (${overallScore}/100); ${inferredCount + insufficientCount} item(s) require review.`
      };
    } else {
      overallDecision = {
        status: 'unverified',
        label: 'Weak Grounding (Unverified)',
        explanation: `Recommendation set exhibits low cultural alignment (${overallScore}/100) against requested context.`
      };
    }

    return {
      overallScore,
      confidence: avgCompleteness,
      decision: overallDecision,
      dimensionsSummary: {
        culturalAlignment: avgAlignment,
        contextualRelevance: avgRelevance,
        constraintCompliance: avgConstraints,
        evidenceCompleteness: avgCompleteness
      },
      totalItemsAudited: n,
      itemsSummary: {
        supportedCount,
        inferredCount,
        unverifiedCount,
        insufficientCount
      },
      provenance: {
        source: 'tasteaudit',
        operation: 'aggregate_cultural_audit',
        correlationId: `agg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        auditedAt: new Date().toISOString()
      }
    };
  }
}

export const auditEngine = new CulturalGroundingAuditEngine();
