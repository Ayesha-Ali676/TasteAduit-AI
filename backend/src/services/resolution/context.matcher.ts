/**
 * Generic Context and Entity Type Matcher for TasteAudit Entity Resolution.
 * Enables deterministic disambiguation between candidate types (e.g. movie vs album, artist vs venue)
 * using request context (categoryHint, audienceContext, constraints) without hardcoding demo phrase dictionaries.
 */

import { NormalizedCandidate, EntityResolutionContext } from '../qloo/qloo.types.js';
import { ItemResolutionEnvelope } from '../orchestrator/stages.types.js';

export interface ContextMatchResult {
  isCompatible: boolean;
  scoreBonus: number; // 0.0, 0.20 (tag match), or 0.30 (type match)
  matchReason?: string;
}

// Regex patterns representing general cultural domains
export const DOMAIN_PATTERNS = {
  movie: /\b(cinema|movie|movies|film|films|motion picture|theatrical|screenplay|hollywood|cinematic)\b/i,
  music: /\b(music|musical|band|musician|singer|concert|album|song|track|discography|audiophile|soundtrack|jazz|bop|blues|rock|hip hop)\b/i,
  musicArtist: /\b(band|artist|artists|musician|musicians|singer|vocalist|trio|quartet|quintet)\b/i,
  musicAlbum: /\b(album|record|lp|ep|discography|soundtrack)\b/i,
  place: /\b(coffee|cafe|cafes|cafés|restaurant|food|foodie|dining|cuisine|bar|bakery|roasters|roastery|bistro|eatery|venue|spot|drink|drinkers|brunch|pour-over|pour-overs|listening|spaces)\b/i,
  book: /\b(book|books|novel|novels|literature|author|reader|reading|fiction|non-fiction)\b/i
};

/**
 * Checks compatibility between candidate's type/tags and user's context.
 */
export function evaluateTypeCompatibility(
  candidate: NormalizedCandidate,
  context?: EntityResolutionContext
): ContextMatchResult {
  const typeLower = (candidate.type || '').toLowerCase();
  const tagsLower = (candidate.tags || []).map((t) => t.toLowerCase());

  // 1. Explicit Category Hint takes top priority if present
  const hint = context?.categoryHint?.toLowerCase().trim();
  if (hint) {
    const matchesHint =
      typeLower.includes(hint) ||
      (hint === 'music' && (typeLower.includes('artist') || typeLower.includes('genre:music') || typeLower.includes('album'))) ||
      (hint === 'artist' && typeLower.includes('artist')) ||
      (hint === 'movie' && (typeLower.includes('movie') || typeLower.includes('film'))) ||
      (hint === 'place' && (typeLower.includes('place') || typeLower.includes('restaurant') || typeLower.includes('venue') || typeLower.includes('cafe'))) ||
      (hint === 'book' && typeLower.includes('book'));

    if (matchesHint) {
      return { isCompatible: true, scoreBonus: 0.30, matchReason: `Explicit categoryHint "${hint}" matches candidate type` };
    }
    if (tagsLower.some((t) => t.includes(hint))) {
      return { isCompatible: true, scoreBonus: 0.20, matchReason: `Explicit categoryHint "${hint}" matches candidate tag` };
    }
    // Candidate type does not match explicit categoryHint
    return { isCompatible: false, scoreBonus: 0.0, matchReason: `Candidate type conflicts with explicit categoryHint "${hint}"` };
  }

  // 2. Generic Context Synthesis from Audience & Constraints
  const contextTokens = [
    context?.audience || '',
    ...(context?.constraints || [])
  ].filter(Boolean);

  if (contextTokens.length === 0) {
    // No context provided -> neutral baseline for well-formed types
    const isWellFormed = candidate.type.startsWith('urn:entity:') || candidate.type.startsWith('urn:tag:');
    return {
      isCompatible: false,
      scoreBonus: isWellFormed ? 0.15 : 0.0,
      matchReason: isWellFormed ? 'Neutral baseline for well-formed URN' : undefined
    };
  }

  const combinedContextText = contextTokens.join(' ').toLowerCase();

  // A. Check Movie Domain
  const contextMentionsMovie = DOMAIN_PATTERNS.movie.test(combinedContextText);
  if (contextMentionsMovie) {
    if (typeLower.includes('movie') || typeLower.includes('film') || typeLower.includes('tv_show')) {
      return { isCompatible: true, scoreBonus: 0.30, matchReason: 'Movie/Film domain match with context' };
    }
    if (tagsLower.some((t) => DOMAIN_PATTERNS.movie.test(t))) {
      return { isCompatible: true, scoreBonus: 0.20, matchReason: 'Movie tag match with context' };
    }
    // If context explicitly requests movie, album/place types are conflicting
    if (typeLower.includes('album') || typeLower.includes('place') || typeLower.includes('restaurant')) {
      return { isCompatible: false, scoreBonus: 0.0, matchReason: 'Candidate type conflicts with movie context' };
    }
  }

  // B. Check Music Domain
  const contextMentionsMusic = DOMAIN_PATTERNS.music.test(combinedContextText);
  if (contextMentionsMusic) {
    const isArtist = typeLower.includes('artist');
    const isAlbum = typeLower.includes('album') || typeLower.includes('track');
    const isPerson = typeLower.includes('person');
    const isMusicType = isArtist || isAlbum || typeLower.includes('genre:music') || isPerson;

    if (isMusicType) {
      // Sub-domain distinction: artist vs album
      const wantsAlbum = DOMAIN_PATTERNS.musicAlbum.test(combinedContextText);
      const wantsArtist = DOMAIN_PATTERNS.musicArtist.test(combinedContextText);

      if (wantsAlbum && isAlbum) {
        return { isCompatible: true, scoreBonus: 0.30, matchReason: 'Music album domain match' };
      }
      if (wantsArtist && isArtist) {
        return { isCompatible: true, scoreBonus: 0.30, matchReason: 'Music artist domain match' };
      }
      if (wantsArtist && isPerson) {
        // Person entity is secondary to artist entity when artists are requested
        return { isCompatible: false, scoreBonus: 0.18, matchReason: 'Biographical person match (secondary to artist)' };
      }
      if (isArtist || isAlbum) {
        return { isCompatible: true, scoreBonus: 0.30, matchReason: 'Music domain match with context' };
      }
      // General person match in music context
      return { isCompatible: false, scoreBonus: 0.18, matchReason: 'Person entity in music context' };
    }

    if (tagsLower.some((t) => DOMAIN_PATTERNS.music.test(t))) {
      return { isCompatible: true, scoreBonus: 0.20, matchReason: 'Music tag match with context' };
    }

    if (typeLower.includes('movie') || typeLower.includes('place')) {
      return { isCompatible: false, scoreBonus: 0.0, matchReason: 'Candidate type conflicts with music context' };
    }
  }

  // C. Check Place / Dining / Coffee Domain
  const contextMentionsPlace = DOMAIN_PATTERNS.place.test(combinedContextText);
  if (contextMentionsPlace) {
    if (typeLower.includes('place') || typeLower.includes('restaurant') || typeLower.includes('venue') || typeLower.includes('bar')) {
      return { isCompatible: true, scoreBonus: 0.30, matchReason: 'Place/Hospitality domain match with context' };
    }
    if (tagsLower.some((t) => DOMAIN_PATTERNS.place.test(t))) {
      return { isCompatible: true, scoreBonus: 0.20, matchReason: 'Place tag match with context' };
    }
    if (typeLower.includes('movie') || typeLower.includes('album')) {
      return { isCompatible: false, scoreBonus: 0.0, matchReason: 'Candidate type conflicts with place context' };
    }
  }

  // D. Check Book / Literature Domain
  const contextMentionsBook = DOMAIN_PATTERNS.book.test(combinedContextText);
  if (contextMentionsBook) {
    if (typeLower.includes('book')) {
      return { isCompatible: true, scoreBonus: 0.30, matchReason: 'Book/Literature domain match with context' };
    }
    if (tagsLower.some((t) => DOMAIN_PATTERNS.book.test(t))) {
      return { isCompatible: true, scoreBonus: 0.20, matchReason: 'Book tag match with context' };
    }
    if (typeLower.includes('movie') || typeLower.includes('album')) {
      return { isCompatible: false, scoreBonus: 0.0, matchReason: 'Candidate type conflicts with book context' };
    }
  }

  // E. Candidate tags overlap with context words (e.g. "cult classic", "art rock", "indie")
  const contextWords = combinedContextText.split(/\s+/).filter((w) => w.length > 3);
  const tagOverlap = tagsLower.some((tag) => contextWords.some((w) => tag.includes(w)));
  if (tagOverlap) {
    return { isCompatible: true, scoreBonus: 0.20, matchReason: 'Candidate tags overlap with context terms' };
  }

  // Baseline credit for well-formed URNs when no specific domain matched
  const isWellFormed = candidate.type.startsWith('urn:entity:') || candidate.type.startsWith('urn:tag:');
  return {
    isCompatible: false,
    scoreBonus: isWellFormed ? 0.15 : 0.0,
    matchReason: isWellFormed ? 'Neutral baseline for well-formed URN' : undefined
  };
}

// ---------------------------------------------------------------------------
// Candidate Semantic Compatibility Firewall
// ---------------------------------------------------------------------------

export type SemanticDomain = 'movie' | 'music' | 'dining' | 'book' | 'unknown';

export interface SemanticTypeEvaluation {
  domain: SemanticDomain;
  normalizedSemanticType: string;
  isConfident: boolean;
}

export interface CandidateCompatibilityResult {
  isCompatible: boolean;
  targetDomain: SemanticDomain;
  candidateDomain: SemanticDomain;
  normalizedSemanticType: string;
  reason: string;
}

/**
 * Maps a candidate entity's metadata (type, tags, category, disambiguation) to a normalized semantic domain and label.
 * Under no circumstances does this guess or default to an unrelated category.
 */
export function evaluateCandidateSemanticType(candidate: {
  type?: string;
  tags?: string[];
  category?: string;
  disambiguation?: string;
  name?: string;
}): SemanticTypeEvaluation {
  const typeLower = (candidate.type || '').toLowerCase().trim();
  const tagsLower = (candidate.tags || []).map((t) => t.toLowerCase());

  // 1. Direct type evaluations
  if (
    typeLower.includes('movie') ||
    typeLower.includes('film') ||
    typeLower.includes('tv_show') ||
    typeLower.includes('urn:entity:movie')
  ) {
    return { domain: 'movie', normalizedSemanticType: 'movie', isConfident: true };
  }

  if (
    typeLower.includes('artist') ||
    typeLower.includes('musician') ||
    typeLower.includes('band') ||
    typeLower.includes('urn:entity:artist')
  ) {
    return { domain: 'music', normalizedSemanticType: 'music artist', isConfident: true };
  }

  if (
    typeLower.includes('album') ||
    typeLower.includes('record') ||
    typeLower.includes('track') ||
    typeLower.includes('song') ||
    typeLower.includes('urn:entity:album')
  ) {
    return { domain: 'music', normalizedSemanticType: 'music album', isConfident: true };
  }

  if (typeLower.includes('genre:music') || typeLower.includes('urn:tag:genre:music')) {
    return { domain: 'music', normalizedSemanticType: 'music genre', isConfident: true };
  }

  if (
    typeLower.includes('place') ||
    typeLower.includes('restaurant') ||
    typeLower.includes('cafe') ||
    typeLower.includes('bar') ||
    typeLower.includes('venue') ||
    typeLower.includes('bistro') ||
    typeLower.includes('eatery') ||
    typeLower.includes('urn:entity:place')
  ) {
    const isRestaurant = typeLower.includes('restaurant') || tagsLower.some((t) => t.includes('restaurant'));
    return {
      domain: 'dining',
      normalizedSemanticType: isRestaurant ? 'restaurant' : 'place / restaurant',
      isConfident: true
    };
  }

  if (
    typeLower.includes('book') ||
    typeLower.includes('novel') ||
    typeLower.includes('author') ||
    typeLower.includes('urn:entity:book')
  ) {
    return { domain: 'book', normalizedSemanticType: 'book', isConfident: true };
  }

  // 2. Brand entities: A brand is compatible with dining ONLY if tags or context establish it as a dining venue
  if (typeLower.includes('brand') || typeLower.includes('urn:entity:brand')) {
    const hasPlaceTag = tagsLower.some((t) => DOMAIN_PATTERNS.place.test(t));
    if (hasPlaceTag) {
      return { domain: 'dining', normalizedSemanticType: 'dining brand / venue', isConfident: true };
    }
    const hasMovieTag = tagsLower.some((t) => DOMAIN_PATTERNS.movie.test(t));
    if (hasMovieTag) {
      return { domain: 'movie', normalizedSemanticType: 'film brand', isConfident: true };
    }
    const hasMusicTag = tagsLower.some((t) => DOMAIN_PATTERNS.music.test(t));
    if (hasMusicTag) {
      return { domain: 'music', normalizedSemanticType: 'music brand', isConfident: true };
    }
    return { domain: 'unknown', normalizedSemanticType: 'brand', isConfident: false };
  }

  // 3. Fallback: inspect name and disambiguation clues if type is missing or generic
  const nameAndClues = `${candidate.name || ''} ${candidate.disambiguation || ''}`.toLowerCase();
  if (DOMAIN_PATTERNS.movie.test(nameAndClues)) {
    return { domain: 'movie', normalizedSemanticType: 'movie', isConfident: true };
  }
  if (DOMAIN_PATTERNS.place.test(nameAndClues)) {
    const isRestaurant = /\b(restaurant|eatery|bistro|diner)\b/i.test(nameAndClues);
    return {
      domain: 'dining',
      normalizedSemanticType: isRestaurant ? 'restaurant' : 'place / restaurant',
      isConfident: true
    };
  }
  if (DOMAIN_PATTERNS.music.test(nameAndClues)) {
    const wantsAlbum = DOMAIN_PATTERNS.musicAlbum.test(nameAndClues);
    return {
      domain: 'music',
      normalizedSemanticType: wantsAlbum ? 'music album' : 'music artist',
      isConfident: true
    };
  }
  if (DOMAIN_PATTERNS.book.test(nameAndClues)) {
    return { domain: 'book', normalizedSemanticType: 'book', isConfident: true };
  }

  // 4. Fallback: inspect tags if type is missing, unknown, or generic
  if (tagsLower.length > 0) {
    if (tagsLower.some((t) => DOMAIN_PATTERNS.place.test(t))) {
      const isRestaurant = tagsLower.some((t) => t.includes('restaurant') || t.includes('dining') || t.includes('food'));
      return {
        domain: 'dining',
        normalizedSemanticType: isRestaurant ? 'restaurant' : 'place / restaurant',
        isConfident: true
      };
    }
    if (tagsLower.some((t) => DOMAIN_PATTERNS.movie.test(t))) {
      return { domain: 'movie', normalizedSemanticType: 'movie', isConfident: true };
    }
    if (tagsLower.some((t) => DOMAIN_PATTERNS.music.test(t))) {
      const wantsAlbum = tagsLower.some((t) => DOMAIN_PATTERNS.musicAlbum.test(t));
      return {
        domain: 'music',
        normalizedSemanticType: wantsAlbum ? 'music album' : 'music artist',
        isConfident: true
      };
    }
    if (tagsLower.some((t) => DOMAIN_PATTERNS.book.test(t))) {
      return { domain: 'book', normalizedSemanticType: 'book', isConfident: true };
    }
  }

  // Ambiguous or unverifiable
  return {
    domain: 'unknown',
    normalizedSemanticType: 'Candidate semantic type could not be confidently verified.',
    isConfident: false
  };
}

/**
 * Resolves the target recommendation item's semantic domain from normalized metadata and context.
 */
export function resolveTargetSemanticDomain(
  envelope: ItemResolutionEnvelope,
  context?: { audience?: string; location?: string; constraints?: string[]; categoryHint?: string }
): SemanticDomain {
  const itemCategory = (envelope.item.category || '').toLowerCase().trim();
  const resolvedType = (
    envelope.resolution.resolvedEntity?.type ||
    envelope.resolution.provenance?.qlooType ||
    ''
  ).toLowerCase().trim();
  const resolvedTags = (envelope.resolution.resolvedEntity?.tags || []).map((t) => t.toLowerCase());
  const contextTokens = [
    context?.categoryHint,
    context?.audience,
    ...(context?.constraints || [])
  ].filter(Boolean).join(' ').toLowerCase();

  // 1. Direct Category/Type hints for Movie
  if (
    itemCategory.includes('movie') ||
    itemCategory.includes('film') ||
    itemCategory.includes('cinema') ||
    resolvedType.includes('movie') ||
    resolvedType.includes('film') ||
    resolvedType.includes('tv_show')
  ) {
    return 'movie';
  }

  // 2. Direct Category/Type hints for Music
  if (
    itemCategory.includes('music') ||
    itemCategory.includes('artist') ||
    itemCategory.includes('album') ||
    resolvedType.includes('artist') ||
    resolvedType.includes('album') ||
    resolvedType.includes('genre:music') ||
    resolvedType.includes('track')
  ) {
    return 'music';
  }

  // 3. Direct Category/Type hints for Dining / Place / Restaurant
  if (
    itemCategory.includes('dining') ||
    itemCategory.includes('restaurant') ||
    itemCategory.includes('food') ||
    itemCategory.includes('cafe') ||
    itemCategory.includes('place') ||
    resolvedType.includes('place') ||
    resolvedType.includes('restaurant') ||
    resolvedType.includes('cafe') ||
    resolvedType.includes('bar')
  ) {
    return 'dining';
  }

  // Brand entities: Brand with place/dining tags or place context (e.g. restaurant brands)
  if (resolvedType.includes('brand')) {
    const hasPlaceTag = resolvedTags.some((t) => DOMAIN_PATTERNS.place.test(t));
    const hasPlaceContext = DOMAIN_PATTERNS.place.test(contextTokens);
    if (hasPlaceTag || hasPlaceContext) {
      return 'dining';
    }
    const hasMovieTag = resolvedTags.some((t) => DOMAIN_PATTERNS.movie.test(t));
    if (hasMovieTag) return 'movie';
    const hasMusicTag = resolvedTags.some((t) => DOMAIN_PATTERNS.music.test(t));
    if (hasMusicTag) return 'music';
  }

  // 4. Direct Category/Type hints for Book
  if (
    itemCategory.includes('book') ||
    itemCategory.includes('novel') ||
    itemCategory.includes('literature') ||
    resolvedType.includes('book') ||
    resolvedType.includes('author')
  ) {
    return 'book';
  }

  // 5. Context Patterns
  if (DOMAIN_PATTERNS.place.test(contextTokens)) {
    return 'dining';
  }
  if (DOMAIN_PATTERNS.movie.test(contextTokens)) {
    return 'movie';
  }
  if (DOMAIN_PATTERNS.music.test(contextTokens)) {
    return 'music';
  }
  if (DOMAIN_PATTERNS.book.test(contextTokens)) {
    return 'book';
  }

  // 6. Resolved tags fallback inspection
  if (resolvedTags.some((t) => DOMAIN_PATTERNS.place.test(t))) return 'dining';
  if (resolvedTags.some((t) => DOMAIN_PATTERNS.movie.test(t))) return 'movie';
  if (resolvedTags.some((t) => DOMAIN_PATTERNS.music.test(t))) return 'music';
  if (resolvedTags.some((t) => DOMAIN_PATTERNS.book.test(t))) return 'book';

  return 'unknown';
}

/**
 * Checks whether a candidate is semantically compatible with the target recommendation.
 * Strict firewall validation before Agent repair candidate selection.
 */
export function evaluateCandidateCompatibility(
  targetEnvelope: ItemResolutionEnvelope,
  candidate: {
    type?: string;
    tags?: string[];
    category?: string;
    disambiguation?: string;
    name?: string;
  },
  context?: { audience?: string; location?: string; constraints?: string[]; categoryHint?: string }
): CandidateCompatibilityResult {
  const targetDomain = resolveTargetSemanticDomain(targetEnvelope, context);
  const candidateEval = evaluateCandidateSemanticType(candidate);

  // If candidate semantic type could not be confidently verified
  if (!candidateEval.isConfident || candidateEval.domain === 'unknown') {
    return {
      isCompatible: false,
      targetDomain,
      candidateDomain: candidateEval.domain,
      normalizedSemanticType: candidateEval.normalizedSemanticType,
      reason: 'incompatible_semantic_type: Candidate semantic type could not be confidently verified.'
    };
  }

  // If target domain is unknown, candidate cannot be verified as compatible
  if (targetDomain === 'unknown') {
    return {
      isCompatible: false,
      targetDomain,
      candidateDomain: candidateEval.domain,
      normalizedSemanticType: candidateEval.normalizedSemanticType,
      reason: 'incompatible_semantic_type: Target recommendation domain could not be verified.'
    };
  }

  // Check exact domain match
  if (targetDomain === candidateEval.domain) {
    return {
      isCompatible: true,
      targetDomain,
      candidateDomain: candidateEval.domain,
      normalizedSemanticType: candidateEval.normalizedSemanticType,
      reason: `Compatible: Candidate matches target domain "${targetDomain}".`
    };
  }

  // Cross-domain mismatch: strictly reject
  return {
    isCompatible: false,
    targetDomain,
    candidateDomain: candidateEval.domain,
    normalizedSemanticType: candidateEval.normalizedSemanticType,
    reason: `incompatible_semantic_type: Target is "${targetDomain}" but candidate "${candidate.name || 'Unknown'}" is "${candidateEval.domain}" (${candidateEval.normalizedSemanticType}).`
  };
}

/**
 * Returns the primary Qloo entity URN type for a given semantic domain.
 */
export function getTargetQlooEntityType(domain: SemanticDomain): string | undefined {
  switch (domain) {
    case 'movie':
      return 'urn:entity:movie';
    case 'music':
      return 'urn:entity:artist';
    case 'dining':
      return 'urn:entity:place';
    case 'book':
      return 'urn:entity:book';
    default:
      return undefined;
  }
}
