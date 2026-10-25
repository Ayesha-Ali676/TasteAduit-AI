import crypto from 'crypto';
import { qlooClient, ServerQlooClient } from '../qloo/qloo.client.js';
import { CandidateNormalizer } from '../qloo/normalization.js';
import {
  NormalizedCandidate,
  EntityResolutionContext,
  EntityResolutionResult,
  ResolutionStatus
} from '../qloo/qloo.types.js';
import { logger } from '../../utils/logger.js';

import { isLocationMatch } from './location.normalizer.js';
import { evaluateTypeCompatibility } from './context.matcher.js';

function normalizeDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function stripPluralSuffix(str: string): string {
  return str.replace(/\b([a-z]{3,})s\b/g, '$1');
}

interface ScoredCandidate {
  candidate: NormalizedCandidate;
  derivedScore: number; // Application-derived match score (0 - 1)
  nameMatch: boolean;
  typeMatch: boolean;
  locationMatch: boolean;
}

export class EntityResolutionService {
  private readonly client: ServerQlooClient;

  constructor(client: ServerQlooClient = qlooClient) {
    this.client = client;
  }

  /**
   * Deterministically scores a candidate against the query and optional context.
   * NOTE: This score is strictly an application-derived ranking score, NOT a native Qloo semantic score.
   */
  private scoreCandidate(
    candidate: NormalizedCandidate,
    normalizedQuery: string,
    context?: EntityResolutionContext
  ): ScoredCandidate {
    const cNameRaw = candidate.name.toLowerCase().trim();
    const qRaw = normalizedQuery.trim();

    const cClean = normalizeDiacritics(candidate.name);
    const qClean = normalizeDiacritics(normalizedQuery);

    const cStemmed = stripPluralSuffix(cClean);
    const qStemmed = stripPluralSuffix(qClean);

    let derivedScore = 0;
    let nameMatch = false;
    let typeMatch = false;
    let locationMatch = false;

    // 1. Name Match Component (Weight: 0.50)
    if (cNameRaw === qRaw || cClean === qClean) {
      derivedScore += 0.50;
      nameMatch = true;
    } else if (cStemmed === qStemmed || cClean.replace(/[^\w\s]/g, '') === qClean.replace(/[^\w\s]/g, '')) {
      derivedScore += 0.48;
      nameMatch = true;
    } else if (cStemmed.replace(/[^\w\s]/g, '') === qStemmed.replace(/[^\w\s]/g, '')) {
      derivedScore += 0.45;
      nameMatch = true;
    } else {
      // Check prefix and base name (e.g., "Ozone Coffee - Shoreditch" vs "Ozone Coffee Roasters")
      const baseCandidate = cStemmed.split(/\s*[-–—(:]\s*/)[0].trim();
      const baseQuery = qStemmed.split(/\s*[-–—(:]\s*/)[0].trim();

      if (baseCandidate === baseQuery && baseQuery.length > 2) {
        derivedScore += 0.40;
        nameMatch = true;
      } else if (
        cStemmed.startsWith(qStemmed) ||
        qStemmed.startsWith(cStemmed) ||
        (baseCandidate.length > 2 && (baseCandidate.startsWith(baseQuery) || baseQuery.startsWith(baseCandidate)))
      ) {
        derivedScore += 0.35;
      } else if (cStemmed.includes(qStemmed) || qStemmed.includes(cStemmed)) {
        derivedScore += 0.25;
      }
    }

    // 2. Category / Type Compatibility (Weight: 0.30)
    const typeEval = evaluateTypeCompatibility(candidate, context);
    derivedScore += typeEval.scoreBonus;
    typeMatch = typeEval.isCompatible;

    // 3. Location / Context Compatibility (Weight: 0.15)
    if (context?.location && isLocationMatch(candidate, context.location)) {
      derivedScore += 0.15;
      locationMatch = true;
    }

    // 4. Qloo Popularity Signal (Continuous weight: up to 0.05 bonus)
    if (typeof candidate.popularity === 'number' && candidate.popularity > 0) {
      derivedScore += Math.min(0.05, candidate.popularity * 0.05);
    }

    return {
      candidate,
      derivedScore: Math.min(1.0, Math.round(derivedScore * 10000) / 10000),
      nameMatch,
      typeMatch,
      locationMatch
    };
  }

  /**
   * Resolves a concept query to a Qloo entity or tag using deterministic rules.
   * If ambiguous, abstains from picking candidate #1 and returns an explicit ambiguous state.
   */
  public async resolve(
    query: string,
    context?: EntityResolutionContext
  ): Promise<EntityResolutionResult> {
    const correlationId = `res_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const trimmedQuery = (query || '').trim();
    const normalizedQuery = trimmedQuery.toLowerCase();
    const retrievedAt = new Date().toISOString();

    // Guard: empty query
    if (!trimmedQuery) {
      return {
        query: trimmedQuery,
        status: 'unresolved',
        candidates: [],
        derivedConfidence: 0,
        reason: 'Empty query provided for resolution.',
        provenance: {
          qlooType: 'unknown',
          source: 'qloo-hackathon-api',
          operation: 'resolve_entity',
          classification: 'Unverified',
          retrievedAt,
          correlationId,
          resolutionStatus: 'unresolved'
        }
      };
    }

    // Branch to Discovery Resolution for natural-language discovery requests
    if (context?.isDiscovery) {
      return this.resolveDiscovery(trimmedQuery, context);
    }

    // Retrieve candidates from server-side Qloo client
    logger.info(`Resolving concept "${trimmedQuery}" with Qloo Hackathon API...`);
    let rawCandidates = await this.client.searchCandidates(trimmedQuery, { take: 10 });

    // If query contains diacritics, accents, or plurals, also query normalized form to maximize Qloo candidate recall
    const normalizedSearch = stripPluralSuffix(normalizeDiacritics(trimmedQuery));
    if (normalizedSearch !== trimmedQuery.toLowerCase() && normalizedSearch.length >= 3) {
      const extraCandidates = await this.client.searchCandidates(normalizedSearch, { take: 10 }).catch(() => []);
      rawCandidates = CandidateNormalizer.deduplicate([...rawCandidates, ...extraCandidates]);
    }

    if (rawCandidates.length === 0) {
      return {
        query: trimmedQuery,
        status: 'unresolved',
        candidates: [],
        derivedConfidence: 0,
        reason: `No matching entities or tags found in Qloo for "${trimmedQuery}".`,
        provenance: {
          qlooType: 'unknown',
          source: 'qloo-hackathon-api',
          operation: 'resolve_entity',
          classification: 'Unverified',
          retrievedAt,
          correlationId,
          resolutionStatus: 'unresolved'
        }
      };
    }

    // Score all candidates deterministically
    const scored = rawCandidates
      .map((c) => this.scoreCandidate(c, normalizedQuery, context))
      .sort((a, b) => b.derivedScore - a.derivedScore);

    const top = scored[0];
    const second = scored[1];

    // Evaluate Ambiguity
    // Candidates are ambiguous only if they represent distinct cultural domains (e.g. movie vs album vs book)
    const isDistinctType = second && top.candidate.type !== second.candidate.type;
    const isCloseMargin = second && (top.derivedScore - second.derivedScore) < 0.10;
    const bothHaveExactName = second && top.nameMatch && second.nameMatch;
    // Context differentiates candidates when top matches user category or location and second does not
    const contextResolved = Boolean(
      second && (
        (top.typeMatch && !second.typeMatch) ||
        (top.locationMatch && !second.locationMatch)
      )
    );

    if (bothHaveExactName && isCloseMargin && isDistinctType && !contextResolved) {
      // Multiple candidates share the same name across distinct types without differentiating context
      const candidateTypes = Array.from(new Set(scored.slice(0, 4).map((s) => s.candidate.type))).join(', ');
      return {
        query: trimmedQuery,
        status: 'ambiguous',
        candidates: scored.map((s) => s.candidate),
        derivedConfidence: top.derivedScore,
        reason: `Multiple plausible Qloo matches found for "${trimmedQuery}" across distinct types (${candidateTypes}). Please clarify intended category.`,
        provenance: {
          qlooType: 'multiple',
          source: 'qloo-hackathon-api',
          operation: 'resolve_entity',
          classification: 'Inferred',
          retrievedAt,
          correlationId,
          resolutionStatus: 'ambiguous',
          details: {
            topCandidatesCount: scored.length,
            topTypes: candidateTypes
          }
        }
      };
    }

    const isSameType = Boolean(second && top.candidate.type === second.candidate.type);

    // Top candidate has clear lead and meets threshold
    if (top.derivedScore >= 0.50 && (!second || (top.derivedScore - second.derivedScore) >= 0.10 || contextResolved || isSameType)) {
      return {
        query: trimmedQuery,
        status: 'resolved',
        resolvedEntity: top.candidate,
        candidates: scored.map((s) => s.candidate),
        derivedConfidence: top.derivedScore,
        reason: `Deterministically resolved to ${top.candidate.name} (${top.candidate.type}) with high confidence.`,
        provenance: {
          entityId: top.candidate.category === 'entity' ? top.candidate.id : undefined,
          tagId: top.candidate.category === 'tag' ? top.candidate.id : undefined,
          qlooType: top.candidate.type,
          source: 'qloo-hackathon-api',
          operation: 'resolve_entity',
          classification: 'Supported',
          retrievedAt,
          correlationId,
          resolutionStatus: 'resolved',
          details: {
            derivedMatchScore: top.derivedScore,
            category: top.candidate.category,
            qlooPopularity: top.candidate.popularity
          }
        }
      };
    }

    // Weak match below confidence threshold -> Abstain
    return {
      query: trimmedQuery,
      status: 'unresolved',
      candidates: scored.map((s) => s.candidate),
      derivedConfidence: top.derivedScore,
      reason: `Candidates found for "${trimmedQuery}" did not meet the confidence threshold (score: ${top.derivedScore}) for reliable resolution.`,
      provenance: {
        qlooType: top.candidate.type,
        source: 'qloo-hackathon-api',
        operation: 'resolve_entity',
        classification: 'Unverified',
        retrievedAt,
        correlationId,
        resolutionStatus: 'unresolved'
      }
    };
  }

  /**
   * Performs Qloo-backed candidate discovery for natural-language discovery requests.
   * Discovers real verified candidates from Qloo using domain, preferences, and constraints,
   * without hallucinating entities or bypassing Qloo verification.
   */
  public async resolveDiscovery(
    query: string,
    context?: EntityResolutionContext
  ): Promise<EntityResolutionResult> {
    const correlationId = `disc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const trimmedQuery = (query || '').trim();
    const retrievedAt = new Date().toISOString();

    // 1. Determine target entity type from category or discovery intent
    const category = (
      context?.categoryHint ||
      context?.discoveryIntent?.category ||
      context?.discoveryIntent?.domain ||
      ''
    ).toLowerCase();

    let targetType: string | undefined;
    if (category.includes('movie') || category.includes('film')) {
      targetType = 'urn:entity:movie';
    } else if (category.includes('place') || category.includes('restaurant') || category.includes('cafe')) {
      targetType = 'urn:entity:place';
    } else if (category.includes('artist') || category.includes('music')) {
      targetType = 'urn:entity:artist';
    } else if (category.includes('book')) {
      targetType = 'urn:entity:book';
    }

    // 2. Formulate ordered search phrases from discovery context, constraints, and audience
    const searchPhrases: string[] = [];

    // Descriptive preferences from parser
    if (context?.discoveryIntent?.descriptivePreferences && context.discoveryIntent.descriptivePreferences.length > 0) {
      searchPhrases.push(...context.discoveryIntent.descriptivePreferences);
    }

    // Cleaned query
    if (context?.discoveryIntent?.cleanQuery && !searchPhrases.includes(context.discoveryIntent.cleanQuery)) {
      searchPhrases.push(context.discoveryIntent.cleanQuery);
    }

    // Positive constraints
    if (context?.constraints && context.constraints.length > 0) {
      const positiveConstraints = context.constraints.filter(
        (c) => !c.toLowerCase().startsWith('no ') && !c.toLowerCase().startsWith('without ')
      );
      positiveConstraints.forEach((c) => {
        const cleanConstraint = c.replace(/^(?:prefer|something|must\s+be|with)\s+/i, '').trim();
        if (cleanConstraint && !searchPhrases.includes(cleanConstraint)) {
          searchPhrases.push(cleanConstraint);
        }
      });
    }

    // Audience context
    if (context?.audience && context.audience.trim().length > 0) {
      const cleanAudience = context.audience.replace(/^(?:someone\s+who\s+enjoys|people\s+looking\s+for|for)\s+/i, '').trim();
      if (cleanAudience && !searchPhrases.includes(cleanAudience)) {
        searchPhrases.push(cleanAudience);
      }
    }

    // Fallback: query itself if nothing else
    if (searchPhrases.length === 0 && trimmedQuery.length > 0) {
      searchPhrases.push(trimmedQuery);
    }

    logger.info(`[Discovery] Sourcing verified Qloo candidates using search phrases: ${JSON.stringify(searchPhrases)}`);

    let rawCandidates: NormalizedCandidate[] = [];

    for (const phrase of searchPhrases) {
      try {
        const found = await this.client.searchCandidates(phrase, { type: targetType, take: 10 });
        if (found.length > 0) {
          rawCandidates.push(...found);
        }
      } catch (err) {
        logger.warn(`[Discovery] Candidate search for phrase "${phrase}" failed: ${err}`);
      }
      if (rawCandidates.length >= 8) break;
    }

    rawCandidates = CandidateNormalizer.deduplicate(rawCandidates);

    // If still no candidates found and targetType is known, try a broad category search
    if (rawCandidates.length === 0 && category) {
      try {
        const fallback = await this.client.searchCandidates(category, { type: targetType, take: 6 });
        rawCandidates = CandidateNormalizer.deduplicate(fallback);
      } catch {
        // Safe error suppression
      }
    }

    // Guard: if Qloo returned 0 candidates, safely abstain without hallucinating
    if (rawCandidates.length === 0) {
      logger.info(`[Discovery] No Qloo candidates found for discovery request "${trimmedQuery}". Safely abstaining.`);
      return {
        query: trimmedQuery,
        status: 'unresolved',
        candidates: [],
        derivedConfidence: 0,
        reason: `Zero matching entities or tags found in Qloo for discovery query "${trimmedQuery}".`,
        provenance: {
          qlooType: targetType || 'unknown',
          source: 'qloo-hackathon-api',
          operation: 'resolve_discovery_entity',
          classification: 'Unverified',
          retrievedAt,
          correlationId,
          resolutionStatus: 'unresolved'
        }
      };
    }

    // Score candidates deterministically for discovery relevance
    const scoredCandidates = rawCandidates.map((c) => {
      let score = 0;

      // 1. Type compatibility (weight: 0.40)
      const typeEval = evaluateTypeCompatibility(c, context);
      score += typeEval.scoreBonus * (0.40 / 0.30); // scale up to 0.40

      // 2. Location compatibility (weight: 0.25)
      if (context?.location && isLocationMatch(c, context.location)) {
        score += 0.25;
      }

      // 3. Tag and context match (weight: 0.25)
      const cTags = (c.tags || []).map((t) => t.toLowerCase());
      const searchTokens = searchPhrases.join(' ').toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const tagMatchCount = cTags.filter((t) => searchTokens.some((tok) => t.includes(tok))).length;
      if (tagMatchCount >= 2) {
        score += 0.25;
      } else if (tagMatchCount === 1) {
        score += 0.15;
      }

      // 4. Qloo popularity signal (weight: 0.10)
      if (typeof c.popularity === 'number' && c.popularity > 0) {
        score += Math.min(0.10, c.popularity * 0.10);
      }

      // Preference for concrete entities over pure tags in discovery
      if (c.category === 'entity') {
        score += 0.05;
      }

      return {
        candidate: c,
        score: Math.min(1.0, Math.round(score * 10000) / 10000)
      };
    }).sort((a, b) => b.score - a.score);

    const top = scoredCandidates[0];

    // Candidate must have valid type compatibility or minimum score
    if (!top || (targetType && !top.candidate.type.includes(category.slice(0, 4)) && top.score < 0.25)) {
      return {
        query: trimmedQuery,
        status: 'unresolved',
        candidates: scoredCandidates.map((s) => s.candidate),
        derivedConfidence: top?.score || 0,
        reason: `Discovered candidates did not satisfy domain type compatibility for "${category}".`,
        provenance: {
          qlooType: targetType || 'unknown',
          source: 'qloo-hackathon-api',
          operation: 'resolve_discovery_entity',
          classification: 'Unverified',
          retrievedAt,
          correlationId,
          resolutionStatus: 'unresolved'
        }
      };
    }

    logger.info(`[Discovery] Resolved discovery intent "${trimmedQuery}" -> "${top.candidate.name}" (${top.candidate.id}, score: ${top.score})`);

    return {
      query: trimmedQuery,
      status: 'resolved',
      resolvedEntity: top.candidate,
      candidates: scoredCandidates.map((s) => s.candidate),
      derivedConfidence: top.score,
      reason: `Discovered verified Qloo candidate "${top.candidate.name}" (${top.candidate.type}) matching discovery intent.`,
      provenance: {
        entityId: top.candidate.category === 'entity' ? top.candidate.id : undefined,
        tagId: top.candidate.category === 'tag' ? top.candidate.id : undefined,
        qlooType: top.candidate.type,
        source: 'qloo-hackathon-api',
        operation: 'resolve_discovery_entity',
        classification: 'Supported',
        retrievedAt,
        correlationId,
        resolutionStatus: 'resolved',
        details: {
          isDiscovery: true,
          derivedMatchScore: top.score,
          candidatesCount: scoredCandidates.length,
          qlooPopularity: top.candidate.popularity
        }
      }
    };
  }
}

export const resolutionService = new EntityResolutionService();
