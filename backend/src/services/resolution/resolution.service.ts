import crypto from 'crypto';
import { qlooClient, ServerQlooClient } from '../qloo/qloo.client.js';
import {
  NormalizedCandidate,
  EntityResolutionContext,
  EntityResolutionResult,
  ResolutionStatus
} from '../qloo/qloo.types.js';
import { logger } from '../../utils/logger.js';

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
    const candidateName = candidate.name.toLowerCase().trim();
    let derivedScore = 0;
    let nameMatch = false;
    let typeMatch = false;
    let locationMatch = false;

    // 1. Name Match Component (Weight: 0.50)
    if (candidateName === normalizedQuery) {
      derivedScore += 0.50;
      nameMatch = true;
    } else if (candidateName.replace(/[^\w\s]/g, '') === normalizedQuery.replace(/[^\w\s]/g, '')) {
      derivedScore += 0.45;
      nameMatch = true;
    } else if (candidateName.startsWith(normalizedQuery) || normalizedQuery.startsWith(candidateName)) {
      derivedScore += 0.35;
    } else if (candidateName.includes(normalizedQuery) || normalizedQuery.includes(candidateName)) {
      derivedScore += 0.25;
    }

    // 2. Category / Type Compatibility (Weight: 0.30)
    const hint = context?.categoryHint?.toLowerCase().trim();
    if (hint) {
      const typeLower = candidate.type.toLowerCase();
      if (
        typeLower.includes(hint) ||
        (hint === 'music' && (typeLower.includes('artist') || typeLower.includes('genre:music') || typeLower.includes('album'))) ||
        (hint === 'artist' && typeLower.includes('artist')) ||
        (hint === 'movie' && (typeLower.includes('movie') || typeLower.includes('film')))
      ) {
        derivedScore += 0.30;
        typeMatch = true;
      } else if (candidate.tags?.some((t) => t.toLowerCase().includes(hint))) {
        derivedScore += 0.20;
        typeMatch = true;
      }
    } else {
      // Baseline type credit when type is well-formed
      if (candidate.type.startsWith('urn:entity:') || candidate.type.startsWith('urn:tag:')) {
        derivedScore += 0.15;
      }
    }

    // 3. Location / Context Compatibility (Weight: 0.15)
    const location = context?.location?.toLowerCase().trim();
    if (location) {
      const disambiguation = (candidate.disambiguation || '').toLowerCase();
      const tagsString = (candidate.tags || []).join(' ').toLowerCase();

      if (disambiguation.includes(location) || tagsString.includes(location) || candidateName.includes(location)) {
        derivedScore += 0.15;
        locationMatch = true;
      }
    }

    // 4. Qloo Popularity Signal (Weight: 0.05 bonus)
    if (typeof candidate.popularity === 'number' && candidate.popularity > 0.8) {
      derivedScore += 0.05;
    }

    return {
      candidate,
      derivedScore: Math.min(1.0, Math.round(derivedScore * 100) / 100),
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

    // Retrieve candidates from server-side Qloo client
    logger.info(`Resolving concept "${trimmedQuery}" with Qloo Hackathon API...`);
    const rawCandidates = await this.client.searchCandidates(trimmedQuery, { take: 10 });

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
    const isCloseMargin = second && (top.derivedScore - second.derivedScore) < 0.15;
    const bothHaveExactName = second && top.nameMatch && second.nameMatch;
    // Context differentiates candidates when top matches user category and second does not
    const contextResolved = top.typeMatch && second && !second.typeMatch;

    if (bothHaveExactName && isCloseMargin && !contextResolved) {
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

    // Top candidate has clear lead and meets threshold
    if (top.derivedScore >= 0.50 && (!second || (top.derivedScore - second.derivedScore) >= 0.10 || contextResolved)) {
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
}

export const resolutionService = new EntityResolutionService();
