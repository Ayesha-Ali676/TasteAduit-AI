/**
 * Generic Candidate Normalizer and Controlled Search Variant Generator.
 * Handles diverse real-world recommendation formats extracted from AI answers
 * (e.g., branch separators, ampersands, spelling variations, generic hospitality suffixes)
 * without hardcoding entity-specific branches.
 */

export interface CandidateNameNormalization {
  originalName: string;
  normalizedName: string;
  candidateSearchNames: string[];
  extractedLocation?: string;
  inferredCategory?: string;
}

// Regex for common dining/hospitality keywords to generically infer dining category
const DINING_KEYWORDS_REGEX = /\b(restaurant|restaurants|cafe|cafes|café|cafés|hotel|dhaba|bistro|eatery|eateries|barbeque|barbecue|bbq|bakery|foods?|sweets?|kitchen|grill|canteen|diner|chai|tea\s+stall|biryani|tikka|karahi|pizzas?|burgers?)\b/i;

// Regex for trailing generic hospitality descriptors
const GENERIC_HOSPITALITY_SUFFIX_REGEX = /\s+(?:hotel\s*(?:&|and)\s*barbeque|hotel\s*(?:&|and)\s*barbecue|hotel\s*(?:&|and)\s*restaurant|restaurant|hotel|bistro|cafe|café|diner|eatery|dhaba|foods?|sweets?|bakery|grill|bbq|kitchen)\b.*$/i;

/**
 * Deterministically normalizes a candidate name and produces a small, bounded set
 * of meaningful search variants for Qloo resolution.
 */
export function normalizeCandidateSearch(
  rawName: string,
  categoryHint?: string,
  contextLocation?: string
): CandidateNameNormalization {
  const originalName = (rawName || '').trim();
  if (!originalName) {
    return {
      originalName: '',
      normalizedName: '',
      candidateSearchNames: []
    };
  }

  // 1. Standardize unicode punctuation & whitespace
  let cleaned = originalName
    .replace(/[\u2013\u2014\u2212]/g, '-') // Unicode dashes (en dash, em dash, minus) -> ASCII hyphen
    .replace(/["'“”‘’]/g, '')             // Strip surrounding/interior decorative quotes
    .replace(/\s+/g, ' ')                 // Collapse repeated whitespace
    .trim();

  // Strip trailing punctuation like commas, periods, colons
  cleaned = cleaned.replace(/[\s,;.:]+$/, '').trim();

  // 2. Infer dining category if not provided
  let inferredCategory = categoryHint;
  if (!inferredCategory && DINING_KEYWORDS_REGEX.test(cleaned)) {
    inferredCategory = 'dining';
  }

  // 3. Separate Branch / Location Qualifier from Base Name
  let baseName = cleaned;
  let extractedLocation: string | undefined;

  // Pattern A: Hyphen / Dash separator: "Base Name - Location/Branch"
  const dashMatch = cleaned.match(/^(.+?)\s+-\s+(.+)$/);
  if (dashMatch) {
    const left = dashMatch[1].trim();
    const right = dashMatch[2].trim();
    // Verify right part is a location/branch qualifier (not a long explanation sentence)
    if (right.length > 0 && right.length <= 40 && right.split(/\s+/).length <= 4) {
      baseName = left;
      extractedLocation = right;
    }
  }

  // Pattern B: Parenthetical qualifier: "Base Name (Location/Branch)"
  if (!extractedLocation) {
    const parenMatch = cleaned.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (parenMatch) {
      baseName = parenMatch[1].trim();
      extractedLocation = parenMatch[2].trim();
    }
  }

  // Pattern C: Comma separated city/location: "Base Name, Locality"
  if (!extractedLocation) {
    const commaMatch = cleaned.match(/^(.+?),\s*([A-Z][\w\s]+)$/);
    if (commaMatch && commaMatch[2].split(/\s+/).length <= 3) {
      baseName = commaMatch[1].trim();
      extractedLocation = commaMatch[2].trim();
    }
  }

  // 4. Derive Core Brand (stripping generic hospitality descriptors)
  let coreBrand = baseName.replace(GENERIC_HOSPITALITY_SUFFIX_REGEX, '').trim();
  if (coreBrand.length < 3 || coreBrand.toLowerCase() === baseName.toLowerCase()) {
    coreBrand = '';
  }

  // 5. Generate controlled search variants (ordered from specific to base)
  const variants: string[] = [];

  // Variant 1: Cleaned, standardized name
  variants.push(cleaned);

  // If original had unicode dash or differences without quotes, keep as secondary variant
  const unquotedOriginal = originalName.replace(/["'“”‘’]/g, '').trim();
  if (unquotedOriginal !== cleaned && unquotedOriginal.length > 2) {
    variants.push(unquotedOriginal);
  }

  // Variant 2: Conjunction & spelling variants
  // Ampersand '&' <-> 'and'
  if (cleaned.includes('&')) {
    variants.push(cleaned.replace(/\s*&\s*/g, ' and '));
  } else if (/\band\b/i.test(cleaned)) {
    variants.push(cleaned.replace(/\band\b/gi, '&'));
  }

  // Barbeque <-> Barbecue
  if (/barbeque/i.test(cleaned)) {
    variants.push(cleaned.replace(/barbeque/gi, 'Barbecue'));
  } else if (/barbecue/i.test(cleaned)) {
    variants.push(cleaned.replace(/barbecue/gi, 'Barbeque'));
  }

  // Variant 3: Base name (without location qualifier)
  if (baseName && baseName !== cleaned) {
    variants.push(baseName);

    // Also baseName with & <-> and or Barbeque <-> Barbecue if applicable
    if (baseName.includes('&')) {
      variants.push(baseName.replace(/\s*&\s*/g, ' and '));
    }
    if (/barbeque/i.test(baseName)) {
      variants.push(baseName.replace(/barbeque/gi, 'Barbecue'));
    }
  }

  // Variant 4: Core brand
  if (coreBrand && coreBrand !== baseName && coreBrand !== cleaned) {
    variants.push(coreBrand);
  }

  // Deduplicate case-insensitively while preserving order, bounded to at most 4 variants
  const seen = new Set<string>();
  const boundedVariants: string[] = [];

  for (const v of variants) {
    const trimmed = v.trim();
    if (!trimmed || trimmed.length < 2) continue;
    const lower = trimmed.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      boundedVariants.push(trimmed);
      if (boundedVariants.length >= 4) {
        break; // Hard bound: at most 4 variants
      }
    }
  }

  return {
    originalName,
    normalizedName: baseName || cleaned,
    candidateSearchNames: boundedVariants,
    extractedLocation,
    inferredCategory
  };
}
