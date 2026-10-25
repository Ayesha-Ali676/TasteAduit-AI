/**
 * Generic Context and Entity Type Matcher for TasteAudit Entity Resolution.
 * Enables deterministic disambiguation between candidate types (e.g. movie vs album, artist vs venue)
 * using request context (categoryHint, audienceContext, constraints) without hardcoding demo phrase dictionaries.
 */

import { NormalizedCandidate, EntityResolutionContext } from '../qloo/qloo.types.js';

export interface ContextMatchResult {
  isCompatible: boolean;
  scoreBonus: number; // 0.0, 0.20 (tag match), or 0.30 (type match)
  matchReason?: string;
}

// Regex patterns representing general cultural domains
const DOMAIN_PATTERNS = {
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
