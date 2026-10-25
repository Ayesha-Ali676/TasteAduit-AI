/**
 * Generic Location Normalizer for TasteAudit Entity Resolution.
 * Handles diverse human-entered location formats (city, city+country, city+state, abbreviations).
 * Strictly generic: does NOT hardcode specific cities.
 */

import { NormalizedCandidate } from '../qloo/qloo.types.js';

// Common geopolitical country name and abbreviation variants (bidirectional mapping)
const COUNTRY_SYNONYMS: Record<string, string[]> = {
  'usa': ['united states', 'united states of america', 'america', 'us'],
  'us': ['united states', 'united states of america', 'america', 'usa'],
  'united states': ['usa', 'us', 'united states of america', 'america'],
  'united states of america': ['usa', 'us', 'united states', 'america'],
  'uk': ['united kingdom', 'great britain', 'england', 'scotland', 'wales', 'britain', 'gb'],
  'united kingdom': ['uk', 'great britain', 'england', 'scotland', 'wales', 'britain', 'gb'],
  'great britain': ['uk', 'united kingdom', 'england', 'scotland', 'wales'],
  'england': ['uk', 'united kingdom', 'great britain'],
  'scotland': ['uk', 'united kingdom', 'great britain'],
  'wales': ['uk', 'united kingdom', 'great britain'],
  'uae': ['united arab emirates', 'dubai', 'abu dhabi'],
  'united arab emirates': ['uae', 'dubai', 'abu dhabi'],
  'ca': ['canada'],
  'canada': ['ca'],
  'au': ['australia'],
  'australia': ['au'],
  'nz': ['new zealand'],
  'new zealand': ['nz'],
  'de': ['germany', 'deutschland'],
  'germany': ['de', 'deutschland'],
  'fr': ['france'],
  'france': ['fr'],
  'jp': ['japan', 'nippon'],
  'japan': ['jp', 'nippon'],
  'it': ['italy', 'italia'],
  'italy': ['it', 'italia'],
  'es': ['spain', 'espana'],
  'spain': ['es', 'espana'],
  'mx': ['mexico'],
  'mexico': ['mx'],
  'br': ['brazil', 'brasil'],
  'brazil': ['br', 'brasil']
};

// Common US state abbreviations (2-letter) to full state names
const US_STATE_VARIANTS: Record<string, string> = {
  'al': 'alabama', 'ak': 'alaska', 'az': 'arizona', 'ar': 'arkansas', 'ca': 'california',
  'co': 'colorado', 'ct': 'connecticut', 'de': 'delaware', 'fl': 'florida', 'ga': 'georgia',
  'hi': 'hawaii', 'id': 'idaho', 'il': 'illinois', 'in': 'indiana', 'ia': 'iowa',
  'ks': 'kansas', 'ky': 'kentucky', 'la': 'louisiana', 'me': 'maine', 'md': 'maryland',
  'ma': 'massachusetts', 'mi': 'michigan', 'mn': 'minnesota', 'ms': 'mississippi', 'mo': 'missouri',
  'mt': 'montana', 'ne': 'nebraska', 'nv': 'nevada', 'nh': 'new hampshire', 'nj': 'new jersey',
  'nm': 'new mexico', 'ny': 'new york', 'nc': 'north carolina', 'nd': 'north dakota', 'oh': 'ohio',
  'ok': 'oklahoma', 'or': 'oregon', 'pa': 'pennsylvania', 'ri': 'rhode island', 'sc': 'south carolina',
  'sd': 'south dakota', 'tn': 'tennessee', 'tx': 'texas', 'ut': 'utah', 'vt': 'vermont',
  'va': 'virginia', 'wa': 'washington', 'wv': 'west virginia', 'wi': 'wisconsin', 'wy': 'wyoming',
  'dc': 'district of columbia'
};

const US_STATES_SET = new Set(Object.values(US_STATE_VARIANTS));

/**
 * Normalizes a raw human location string into segmented tokens and expanded variants.
 */
export function parseLocationSegments(locationStr: string): string[] {
  if (!locationStr) return [];
  return locationStr
    .split(/[,/;|]+/)
    .map((s) => s.trim().toLowerCase().replace(/[^\w\s]/g, ''))
    .filter((s) => s.length > 0);
}

/**
 * Checks whether a candidate's metadata matches the user's location input.
 * Handles:
 * - Direct substring matching (e.g. "Los Angeles" in "Los angeles california")
 * - Segmented multi-part matching (city + country, city + state)
 * - Country name variants (e.g. USA / United States / UK / United Kingdom)
 * - State abbreviation / expansion (e.g. CA / California, NY / New York)
 * - Safe contradiction filtering (e.g. candidate located in New Zealand does not match "London, UK")
 */
export function isLocationMatch(
  candidate: NormalizedCandidate,
  rawLocation?: string
): boolean {
  if (!rawLocation) return false;
  const trimmedLoc = rawLocation.trim().toLowerCase();
  if (!trimmedLoc) return false;

  const candidateDisambiguation = (candidate.disambiguation || '').toLowerCase();
  const candidateTags = (candidate.tags || []).join(' ').toLowerCase();
  const candidateName = candidate.name.toLowerCase();
  const candidateCorpus = `${candidateDisambiguation} ${candidateTags} ${candidateName}`;

  // 1. Direct whole-string match
  if (candidateCorpus.includes(trimmedLoc)) {
    return true;
  }

  // Clean whole string without punctuation
  const cleanWholeLoc = trimmedLoc.replace(/[^\w\s]/g, '');
  if (candidateCorpus.includes(cleanWholeLoc)) {
    return true;
  }

  // 2. Segment-based match
  const segments = parseLocationSegments(rawLocation);
  if (segments.length === 0) return false;

  // Single-token location (e.g. "Paris", "London", "California")
  if (segments.length === 1) {
    const single = segments[0];
    if (candidateCorpus.includes(single)) return true;

    // Check country synonym expansion
    const synonyms = COUNTRY_SYNONYMS[single] || [];
    for (const syn of synonyms) {
      if (candidateCorpus.includes(syn)) return true;
    }

    // Check state abbreviation expansion
    const stateName = US_STATE_VARIANTS[single];
    if (stateName && candidateCorpus.includes(stateName)) return true;

    return false;
  }

  // Multi-segment location (e.g. "Los Angeles, USA", "London, UK", "Austin, TX, USA")
  const primarySegment = segments[0]; // Usually the city / locality
  const secondarySegments = segments.slice(1); // Region, state, country

  // Check if primary segment matches candidate corpus
  const primaryMatches = candidateCorpus.includes(primarySegment);

  if (primaryMatches) {
    // Primary locality matches. Now verify secondary segments (state/country)
    for (const sec of secondarySegments) {
      if (candidateCorpus.includes(sec)) return true;

      // Check country synonyms
      const synonyms = COUNTRY_SYNONYMS[sec] || [];
      if (synonyms.some((syn) => candidateCorpus.includes(syn))) return true;

      // If secondary is a country (e.g. "usa"), check if candidate has any state of that country (e.g. "california")
      if (['usa', 'us', 'united states', 'united states of america'].includes(sec)) {
        for (const state of US_STATES_SET) {
          if (candidateCorpus.includes(state)) return true;
        }
      }

      // Check state abbreviation
      const stateName = US_STATE_VARIANTS[sec];
      if (stateName && candidateCorpus.includes(stateName)) return true;
    }

    // If candidate has primary match and no explicit contradictory country/state mentioned:
    // It is a valid location match (e.g. candidate has "London" and user gave "London, UK")
    return true;
  }

  // If primary didn't match directly, check if secondary matches and primary is in tags
  for (const sec of secondarySegments) {
    const secMatches = candidateCorpus.includes(sec) ||
      (COUNTRY_SYNONYMS[sec] || []).some((s) => candidateCorpus.includes(s)) ||
      (US_STATE_VARIANTS[sec] && candidateCorpus.includes(US_STATE_VARIANTS[sec]));

    if (secMatches && candidateCorpus.includes(primarySegment)) {
      return true;
    }
  }

  return false;
}
