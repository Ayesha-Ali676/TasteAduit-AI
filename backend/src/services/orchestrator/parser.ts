import { ExtractedItem, ParseStageInput, ParseStageOutput, DiscoveryIntent } from './stages.types.js';
import { DOMAIN_PATTERNS } from '../resolution/context.matcher.js';

/**
 * Detects whether a string is a natural-language discovery request rather than an explicit entity name.
 * Examples:
 * - "I want something interesting to watch tonight"
 * - "My friend loves old movies. What would you recommend?"
 * - "Find me somewhere nice for dinner with friends"
 * - "I want relaxing music while studying"
 */
export function isDiscoveryRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  // 1. Explicit entity markers / brackets / prefixes indicate non-discovery
  if (/^\[?(?:movie|film|album|artist|book|restaurant|cafe|venue|place)\]?:/i.test(t)) {
    return false;
  }

  // 2. First-person or collective desire statements
  if (/^(?:i|we)\s+(?:want|would\s+like|'d\s+like|need|am\s+looking\s+for|'m\s+looking\s+for|are\s+looking\s+for|'re\s+looking\s+for)\b/i.test(t)) {
    return true;
  }

  // 3. Third-person desire statements
  if (/^my\s+(?:friend|partner|colleague|family|dad|mom|brother|sister|wife|husband|parents)\s+(?:loves|likes|enjoys|is\s+into|wants|needs)\b/i.test(t)) {
    return true;
  }

  // 4. Imperative discovery requests for unspecific items
  if (/^(?:find|show|give|help)\s+(?:me|us)?\s*(?:somewhere|something|a\s+place|a\s+spot|some)\b/i.test(t)) {
    return true;
  }

  // 5. Unspecific desire phrases
  if (/^(?:somewhere|something)\s+(?:nice|good|great|cozy|cool|relaxing|interesting|fun|new|classic)?\s*(?:for|to|while|with)\b/i.test(t)) {
    return true;
  }

  // 6. Generic search opening
  if (/^(?:looking\s+for|searching\s+for)\b/i.test(t)) {
    return true;
  }

  // 7. Conversational recommendation questions
  if (
    /^(?:what\s+(?:would|do|should)\s+(?:you|we|i)\s+(?:recommend|suggest|watch|listen|read|visit|eat))\b/i.test(t) ||
    /\bwhat\s+(?:would|do|should)\s+(?:you|we|i)\s+(?:recommend|suggest)\b/i.test(t) ||
    /^(?:can\s+you\s+(?:recommend|suggest))\b/i.test(t) ||
    /^(?:any\s+recommendations\s+(?:for|on)?)\b/i.test(t)
  ) {
    return true;
  }

  // 8. Questions asking for recommendations ending with question mark
  if (t.endsWith('?') && /\b(?:recommend|recommendation|suggestions?|ideas?)\b/i.test(t) && !/\b(?:should|book|play|screen)\b/i.test(t)) {
    return true;
  }

  return false;
}

/**
 * Extracts generic discovery intent, domain, preferences, and formatted display name
 * from a natural-language discovery request.
 */
export function extractDiscoveryIntent(
  rawLine: string,
  inputContext?: { audienceContext?: string; location?: string; constraints?: string[] },
  explicitCategory?: string
): {
  domain?: string;
  category?: string;
  descriptivePreferences: string[];
  cleanQuery: string;
  displayName: string;
  inferredAudience?: string;
  inferredConstraint?: string;
} {
  const lineLower = rawLine.toLowerCase();

  // 1. Infer Domain/Category
  let domain: string | undefined = explicitCategory;
  if (!domain) {
    if (DOMAIN_PATTERNS.movie.test(lineLower) || /\b(watch|watching|stream|streaming)\b/i.test(lineLower)) {
      domain = 'movie';
    } else if (DOMAIN_PATTERNS.place.test(lineLower) || /\b(dinner|lunch|breakfast|brunch|eat|dining|somewhere\s+nice)\b/i.test(lineLower)) {
      domain = 'place';
    } else if (DOMAIN_PATTERNS.music.test(lineLower) || /\b(listen|listening|tunes|soundtrack)\b/i.test(lineLower)) {
      domain = 'music';
    } else if (DOMAIN_PATTERNS.book.test(lineLower) || /\b(read|reading)\b/i.test(lineLower)) {
      domain = 'book';
    } else if (inputContext?.audienceContext) {
      if (DOMAIN_PATTERNS.movie.test(inputContext.audienceContext)) domain = 'movie';
      else if (DOMAIN_PATTERNS.place.test(inputContext.audienceContext)) domain = 'place';
      else if (DOMAIN_PATTERNS.music.test(inputContext.audienceContext)) domain = 'music';
      else if (DOMAIN_PATTERNS.book.test(inputContext.audienceContext)) domain = 'book';
    }
  }

  // 2. Clean conversational frames from request to obtain core descriptive intent
  let cleaned = rawLine;

  // Strip desire prefixes
  cleaned = cleaned.replace(
    /^(?:i|we)\s+(?:want|would\s+like|'d\s+like|need|am\s+looking\s+for|'m\s+looking\s+for|are\s+looking\s+for|'re\s+looking\s+for)\s+(?:a|an|some)?\s*/i,
    ''
  );
  cleaned = cleaned.replace(
    /^my\s+(?:friend|partner|colleague|family|dad|mom|brother|sister|wife|husband|parents)\s+(?:loves|likes|enjoys|is\s+into|wants|needs)\s+(?:a|an|some)?\s*/i,
    ''
  );
  cleaned = cleaned.replace(/^(?:find|show|give|help)\s+(?:me|us)?\s*(?:somewhere|something|a\s+place|a\s+spot|some)?\s*/i, '');
  cleaned = cleaned.replace(/^(?:looking\s+for|searching\s+for)\s+(?:a|an|some)?\s*/i, '');
  cleaned = cleaned.replace(/^(?:somewhere|something)\s+(?:nice|good|great|cozy|cool)?\s*(?:for|to|with)?\s*/i, '');

  // Extract contextual hints (social/activity) before stripping
  let inferredAudience: string | undefined;
  let inferredConstraint: string | undefined;

  if (/\bwith\s+friends\b/i.test(cleaned)) {
    inferredAudience = 'Friends';
  } else if (/\bwith\s+family\b/i.test(cleaned)) {
    inferredAudience = 'Family';
  }

  if (/\b(?:while\s+studying|for\s+studying)\b/i.test(cleaned)) {
    inferredConstraint = 'Relaxing study background';
  }

  // Strip conversational trailers/suffixes
  cleaned = cleaned.replace(/[.,;]?\s*(?:what\s+(?:would|do|should)\s+(?:you|we|i)\s+(?:recommend|suggest)|can\s+you\s+(?:recommend|suggest)|any\s+recommendations).*$/i, '');
  cleaned = cleaned.replace(/\s*(?:tonight|this\s+evening|today|right\s+now|this\s+weekend)\b/i, '');
  cleaned = cleaned.replace(/\s*(?:with\s+friends|with\s+family|with\s+my\s+partner)\b/i, '');
  cleaned = cleaned.replace(/\s*(?:while\s+studying|while\s+working|while\s+driving|for\s+studying|for\s+work)\b/i, '');
  cleaned = cleaned.replace(/[?!.,]+$/, '').trim();

  // If cleaning resulted in empty string, fallback to original without punctuation
  if (!cleaned) {
    cleaned = rawLine.replace(/[?!.,]+$/, '').trim();
  }

  // 3. Format Display Name
  // Capitalize words for clean display name (e.g. "old movies" -> "Old Movies", "dinner" -> "Dinner Restaurant")
  let displayName = cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  if (domain === 'place' && !/\b(restaurant|cafe|bar|venue|bistro|eatery)\b/i.test(displayName)) {
    if (/\bdinner\b/i.test(displayName)) {
      displayName = 'Dinner Restaurant';
    } else if (/\blunch|breakfast|brunch\b/i.test(displayName)) {
      displayName = `${displayName} Cafe`;
    }
  }

  // Ensure displayName does not equal full original raw sentence
  if (displayName.toLowerCase() === rawLine.trim().toLowerCase()) {
    if (domain === 'movie') displayName = 'Culturally Interesting Film';
    else if (domain === 'place') displayName = 'Local Dining Venue';
    else if (domain === 'music') displayName = 'Selected Music';
    else displayName = 'Discovery Selection';
  }

  // 4. Collect descriptive preferences
  const descriptivePreferences: string[] = [];
  if (cleaned && cleaned.length > 2) {
    descriptivePreferences.push(cleaned.toLowerCase());
  }

  // Add domain-specific keywords if appropriate
  if (domain === 'movie' && !cleaned.toLowerCase().includes('movie') && !cleaned.toLowerCase().includes('film')) {
    descriptivePreferences.push(`${cleaned.toLowerCase()} film`);
  } else if (domain === 'place' && !cleaned.toLowerCase().includes('restaurant') && !cleaned.toLowerCase().includes('cafe')) {
    descriptivePreferences.push(`${cleaned.toLowerCase()} restaurant`);
  }

  return {
    domain,
    category: domain,
    descriptivePreferences,
    cleanQuery: cleaned,
    displayName,
    inferredAudience,
    inferredConstraint
  };
}

export class RecommendationParser {
  /**
   * Parses raw recommendation text into discrete extractable items.
   * Generically handles:
   * - Natural-language discovery requests ("I want...", "My friend loves...", "Find me somewhere...")
   * - Explicit entity recommendations ("Dishoom", "Radiohead", "Pulp Fiction")
   * - Multi-item lists, disjunctions ("A or B"), and anchor taste clusters.
   */
  public static parse(input: ParseStageInput): ParseStageOutput {
    const raw = (input.rawRecommendation || '').trim();
    if (!raw) {
      return {
        items: [],
        audienceContext: input.audienceContext,
        location: input.location,
        constraints: input.constraints || []
      };
    }

    // Split by newlines first
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const items: ExtractedItem[] = [];
    let updatedAudience = input.audienceContext;
    const updatedConstraints = [...(input.constraints || [])];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Strip leading list numbers/bullets (e.g., "1. ", "- ", "* ")
      line = line.replace(/^(\d+[\.\)]\s*|[-*•]\s*)/, '').trim();

      // Skip lines that are just section headers or meta-prompts in multi-line lists
      if (line.toLowerCase().startsWith('recommend') && lines.length > 1) {
        continue;
      }

      let category: string | undefined;
      const categoryMatch = line.match(/^\[?(movie|film|album|artist|book|restaurant|cafe|venue|place)\]?:\s*(.+)$/i);
      if (categoryMatch) {
        category = categoryMatch[1].toLowerCase();
        line = categoryMatch[2].trim();
      }

      // Check for Natural-Language Discovery Request first
      if (isDiscoveryRequest(line)) {
        const intent = extractDiscoveryIntent(line, input, category);
        if (intent.inferredAudience && !updatedAudience) {
          updatedAudience = intent.inferredAudience;
        }
        if (intent.inferredConstraint && !updatedConstraints.includes(intent.inferredConstraint)) {
          updatedConstraints.push(intent.inferredConstraint);
        }

        items.push({
          id: `item_${items.length + 1}`,
          name: intent.displayName,
          category: intent.category || category,
          isDiscovery: true,
          discoveryIntent: {
            isDiscovery: true,
            domain: intent.domain,
            category: intent.category,
            descriptivePreferences: intent.descriptivePreferences,
            cleanQuery: intent.cleanQuery,
            rawRequest: line
          }
        });
        continue;
      }

      // 1. Strip conversational decision/question prefixes
      // e.g. "Should this venue book Artist X?", "Should I ditch Vinyl Cafés", "Should we visit Ozone Coffee?"
      line = line.replace(
        /^should\s+(?:this\s+venue|we|i|a\s+venue|one)?\s*(?:book|ditch|play|screen|feature|visit|try|choose|host|add|recommend|keep|drop)\s+/i,
        ''
      ).trim();

      // Strip trailing question marks and punctuation
      line = line.replace(/[\?!]+$/, '').trim();

      // 2. Strip imperative action prefixes
      // e.g. "Book Underground Inc...", "Visit Ozone Coffee Roasters"
      line = line.replace(
        /^(?:book|screen|feature|play|visit|evaluate|audit|explore|check out)\s+/i,
        ''
      ).trim();

      // 3. Strip recommendation prompt prefixes
      // e.g. "Recommend Dishoom...", "Recommend 3 neighborhood coffee shops..."
      line = line.replace(
        /^(?:recommend|suggest|find|give me|list)\s+(?:\d+\s+)?(?:iconic|top|best|popular|neighborhood|local|essential|emerging)?\s*/i,
        ''
      ).trim();

      // 4. Check for anchor entity patterns:
      // e.g. "... connected to the Miles Davis taste cluster", "... in the style of John Coltrane"
      const anchorMatch = line.match(
        /(?:connected to|similar to|in the style of|based on|anchored by|like|inspired by)\s+(?:the\s+)?(.*?)(?:\s+(?:taste\s+cluster|cluster|sound|universe|era|heritage|vibe|style|canon))?$/i
      );
      if (anchorMatch && anchorMatch[1]?.trim()) {
        const anchorEntity = anchorMatch[1].trim();
        let inferredCat = category;
        if (!inferredCat) {
          if (/\b(artist|artists|musician|band|group)\b/i.test(line)) inferredCat = 'artist';
          else if (/\b(movie|film|cinema)\b/i.test(line)) inferredCat = 'movie';
          else if (/\b(album|record)\b/i.test(line)) inferredCat = 'album';
        }
        items.push({
          id: `item_${items.length + 1}`,
          name: anchorEntity,
          category: inferredCat
        });
        continue;
      }

      // 5. Strip purpose / context trailers:
      // e.g. "Underground Inc or Pulp Fiction for an indie cultural cinema...", "Dishoom for young professionals"
      const trailerMatch = line.match(/\s+(?:for|at)\s+(?:an?|the)?\s*(.*)$/i);
      if (trailerMatch) {
        const trailerText = trailerMatch[1].toLowerCase();
        if (!category) {
          if (/\b(cinema|movie|film)\b/i.test(trailerText)) category = 'movie';
          else if (/\b(music|concert|album)\b/i.test(trailerText)) category = 'music';
          else if (/\b(artist|band|musician)\b/i.test(trailerText)) category = 'artist';
          else if (/\b(coffee|cafe|dining|restaurant|food|venue)\b/i.test(trailerText)) category = 'place';
        }
        line = line.replace(/\s+(?:for|at)\s+(?:an?|the)?\s*.*$/i, '').trim();
      }

      // 6. Check for disjunctions/conjunctions:
      // e.g. "Underground Inc or Pulp Fiction", "Pulp Fiction vs Reservoir Dogs"
      if (/\s+(?:or|vs\.?|versus)\s+/i.test(line)) {
        const parts = line.split(/\s+(?:or|vs\.?|versus)\s+/i).map((p) => p.trim()).filter((p) => p.length > 0);
        for (const part of parts) {
          items.push({
            id: `item_${items.length + 1}`,
            name: part,
            category
          });
        }
        continue;
      }

      // 7. Check for synthesized place/venue queries:
      // e.g. "coffee shops in Shoreditch, London with artisanal vinyl listening spaces."
      const placeWithFeatureMatch = line.match(
        /^(coffee\s+shops?|cafes?|restaurants?|bars?|venues?)\s+(?:in\s+[^,]+(?:,\s*[^,]+)*\s+)?with\s+(?:.*?\s+)?(vinyl|jazz|acoustic|audiophile|listening)/i
      );
      if (placeWithFeatureMatch) {
        const feature = placeWithFeatureMatch[2].toLowerCase();
        items.push({
          id: `item_${items.length + 1}`,
          name: `${feature.charAt(0).toUpperCase() + feature.slice(1)} Cafe`,
          category: 'place'
        });
        continue;
      }

      if (line.length > 0) {
        items.push({
          id: `item_${items.length + 1}`,
          name: line,
          category
        });
      }
    }

    // Fallback if no items were extracted
    if (items.length === 0 && raw.length > 0) {
      if (isDiscoveryRequest(raw)) {
        const intent = extractDiscoveryIntent(raw, input);
        items.push({
          id: 'item_1',
          name: intent.displayName,
          category: intent.category,
          isDiscovery: true,
          discoveryIntent: {
            isDiscovery: true,
            domain: intent.domain,
            category: intent.category,
            descriptivePreferences: intent.descriptivePreferences,
            cleanQuery: intent.cleanQuery,
            rawRequest: raw
          }
        });
      } else {
        items.push({
          id: 'item_1',
          name: raw
        });
      }
    }

    const hasDiscovery = items.some((it) => it.isDiscovery);
    const primaryDiscovery = items.find((it) => it.isDiscovery)?.discoveryIntent;

    return {
      items,
      audienceContext: updatedAudience,
      location: input.location,
      constraints: updatedConstraints,
      isDiscovery: hasDiscovery,
      discoveryIntent: primaryDiscovery
    };
  }
}
