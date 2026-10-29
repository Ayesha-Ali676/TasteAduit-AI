import { normalizeCandidateSearch } from '../resolution/candidate.normalizer.js';
import { ExtractedItem, ParseStageInput, ParseStageOutput, DiscoveryIntent, ParsedRecommendationSet } from './stages.types.js';
import { DOMAIN_PATTERNS } from '../resolution/context.matcher.js';

/**
 * Detects whether a string is a natural-language discovery request rather than an explicit entity name.
 */
export function isDiscoveryRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  // Explicit entity markers / brackets / prefixes indicate non-discovery
  if (/^\[?(?:movie|film|album|artist|book|restaurant|cafe|venue|place)\]?:/i.test(t)) {
    return false;
  }

  // First-person or collective desire statements
  if (/^(?:i|we)\s+(?:want|would\s+like|'d\s+like|need|am\s+looking\s+for|'m\s+looking\s+for|are\s+looking\s+for|'re\s+looking\s+for)\b/i.test(t)) {
    return true;
  }

  // Third-person desire statements
  if (/^my\s+(?:friend|partner|colleague|family|dad|mom|brother|sister|wife|husband|parents)\s+(?:loves|likes|enjoys|is\s+into|wants|needs)\b/i.test(t)) {
    return true;
  }

  // Imperative discovery requests for unspecific items
  if (/^(?:find|show|give|help)\s+(?:me|us)?\s*(?:somewhere|something|a\s+place|a\s+spot|some)\b/i.test(t)) {
    return true;
  }

  // Unspecific desire phrases
  if (/^(?:somewhere|something)\s+(?:nice|good|great|cozy|cool|relaxing|interesting|fun|new|classic)?\s*(?:for|to|while|with)\b/i.test(t)) {
    return true;
  }

  // Generic search opening
  if (/^(?:looking\s+for|searching\s+for)\b/i.test(t)) {
    return true;
  }

  // Conversational recommendation questions
  if (
    /^(?:what\s+(?:would|do|should)\s+(?:you|we|i)\s+(?:recommend|suggest|watch|listen|read|visit|eat))\b/i.test(t) ||
    /\bwhat\s+(?:would|do|should)\s+(?:you|we|i)\s+(?:recommend|suggest)\b/i.test(t) ||
    /^(?:can\s+you\s+(?:recommend|suggest))\b/i.test(t) ||
    /^(?:any\s+recommendations\s+(?:for|on)?)\b/i.test(t)
  ) {
    return true;
  }

  // Questions asking for recommendations ending with question mark
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

  cleaned = cleaned.replace(/[.,;]?\s*(?:what\s+(?:would|do|should)\s+(?:you|we|i)\s+(?:recommend|suggest)|can\s+you\s+(?:recommend|suggest)|any\s+recommendations).*$/i, '');
  cleaned = cleaned.replace(/\s*(?:tonight|this\s+evening|today|right\s+now|this\s+weekend)\b/i, '');
  cleaned = cleaned.replace(/\s*(?:with\s+friends|with\s+family|with\s+my\s+partner)\b/i, '');
  cleaned = cleaned.replace(/\s*(?:while\s+studying|while\s+working|while\s+driving|for\s+studying|for\s+work)\b/i, '');
  cleaned = cleaned.replace(/[?!.,]+$/, '').trim();

  if (!cleaned) {
    cleaned = rawLine.replace(/[?!.,]+$/, '').trim();
  }

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

  if (displayName.toLowerCase() === rawLine.trim().toLowerCase()) {
    if (domain === 'movie') displayName = 'Culturally Interesting Film';
    else if (domain === 'place') displayName = 'Local Dining Venue';
    else if (domain === 'music') displayName = 'Selected Music';
    else displayName = 'Discovery Selection';
  }

  const descriptivePreferences: string[] = [];
  if (cleaned && cleaned.length > 2) {
    descriptivePreferences.push(cleaned.toLowerCase());
  }

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

/**
 * Extracts location from preamble headers if present.
 */
export function extractPreambleLocation(preamble: string): string | undefined {
  if (!preamble) return undefined;
  const match = preamble.match(/\b(?:in|around|near|across)\s+([A-Z][\w\s,–-]+?)(?::|\.|\s+with|\s+that|$)/);
  if (match && match[1]) {
    const loc = match[1].trim();
    if (loc.length >= 3 && loc.length <= 60 && !/^(?:the|this|a|an|our|your)\b/i.test(loc)) {
      return loc;
    }
  }
  return undefined;
}

/**
 * Distinguishes candidate name from surrounding explanation.
 * Cleans conversational decision prefixes, imperatives, anchor clusters, trailers, and formatting.
 */
export function cleanCandidateNameAndDescription(rawText: string): {
  name: string;
  description?: string;
  category?: string;
} {
  let text = rawText.trim();
  if (!text) return { name: '' };

  // 1. Strip leading list markers: "1. ", "1) ", "[1] ", "- ", "* ", "• ", "– ", "— ", "### "
  text = text.replace(/^(?:(?:\d+[\.\)]|\[\d+\])\s*|[-*•·–—]\s*|\#{1,6}\s*)/, '').trim();

  // 2. Strip explicit category tags: "[restaurant]: ", "Restaurant: "
  let category: string | undefined;
  const categoryMatch = text.match(/^\[?(movie|film|album|artist|book|restaurant|cafe|venue|place)\]?:\s*(.+)$/i);
  if (categoryMatch) {
    category = categoryMatch[1].toLowerCase();
    text = categoryMatch[2].trim();
  }

  // 3. Strip conversational decision / question prefixes
  // e.g. "Should this venue book Artist X?", "Should I ditch Vinyl Cafés", "Should we visit Ozone Coffee Roasters?"
  text = text.replace(
    /^should\s+(?:this\s+venue|we|i|a\s+venue|one)?\s*(?:book|ditch|play|screen|feature|visit|try|choose|host|add|recommend|keep|drop)\s+/i,
    ''
  ).trim();

  // Strip trailing question marks and exclamation points
  text = text.replace(/[\?!]+$/, '').trim();

  // 4. Strip imperative action prefixes
  // e.g. "Book Underground Inc...", "Visit Ozone Coffee Roasters"
  text = text.replace(
    /^(?:book|screen|feature|play|visit|evaluate|audit|explore|check out)\s+/i,
    ''
  ).trim();

  // 5. Strip recommendation prompt prefixes
  // e.g. "Recommend Dishoom...", "Recommend iconic modal jazz..."
  text = text.replace(
    /^(?:recommend|suggest|find|give me|list)\s+(?:\d+\s+)?(?:iconic|top|best|popular|neighborhood|local|essential|emerging)?\s*/i,
    ''
  ).trim();

  // 6. Check for anchor entity patterns:
  // e.g. "... connected to the Miles Davis taste cluster", "... in the style of John Coltrane"
  const anchorMatch = text.match(
    /(?:connected to|similar to|in the style of|based on|anchored by|like|inspired by)\s+(?:the\s+)?(.*?)(?:\s+(?:taste\s+cluster|cluster|sound|universe|era|heritage|vibe|style|canon))?$/i
  );
  if (anchorMatch && anchorMatch[1]?.trim()) {
    const anchorEntity = anchorMatch[1].trim();
    let inferredCat = category;
    if (!inferredCat) {
      if (/\b(artist|artists|musician|band|group)\b/i.test(text)) inferredCat = 'artist';
      else if (/\b(movie|film|cinema)\b/i.test(text)) inferredCat = 'movie';
      else if (/\b(album|record)\b/i.test(text)) inferredCat = 'album';
    }
    return { name: anchorEntity, category: inferredCat };
  }

  // 7. Check for synthesized place/venue queries:
  // e.g. "coffee shops in Shoreditch, London with artisanal vinyl listening spaces."
  const placeWithFeatureMatch = text.match(
    /^(?:coffee\s+shops?|cafes?|restaurants?|bars?|venues?)\s+(?:in\s+[^,]+(?:,\s*[^,]+)*\s+)?with\s+(?:.*?\s+)?(vinyl|jazz|acoustic|audiophile|listening)/i
  );
  if (placeWithFeatureMatch) {
    const feature = placeWithFeatureMatch[1].toLowerCase();
    return {
      name: `${feature.charAt(0).toUpperCase() + feature.slice(1)} Cafe`,
      category: 'place'
    };
  }

  // 8. Strip meta-ranking prefixes: "Best Overall: ", "Top Pick - ", "Runner Up: "
  text = text.replace(/^(?:best\s+overall|best\s+for\s+[^:–—]+|top\s+pick|runner\s+up|our\s+pick|must\s+try|honorable\s+mention|overall\s+winner)\s*[-:–—]\s*/i, '').trim();

  let name = text;
  let description: string | undefined;

  // 9. Markdown Bold pattern: "**Entity Name** - Description"
  const boldMatch = text.match(/^\*\*([^*]+)\*\*(.*)$/);
  if (boldMatch) {
    name = boldMatch[1].trim();
    const rest = boldMatch[2].replace(/^[\s:–—\-·|]+\s*/, '').trim();
    if (rest.length > 0) {
      description = rest;
    }
  } else {
    // 10. Explicit Colon Separator: "Candidate Name: Explanation text..."
    const colonIdx = text.indexOf(':');
    if (colonIdx > 0 && colonIdx < 60) {
      const candidatePart = text.slice(0, colonIdx).trim();
      const words = candidatePart.split(/\s+/);
      const isSentence = /\b(here|there|we|i|you|they|sure|please|note|tip)\b/i.test(candidatePart);
      if (words.length >= 1 && words.length <= 7 && !isSentence) {
        name = candidatePart;
        const rest = text.slice(colonIdx + 1).trim();
        if (rest.length > 0) {
          description = rest;
        }
      }
    }

    // 11. Dash Separator: "Candidate Name – Known for..." vs "Waqar Restaurant – Madina Chowk"
    if (!description) {
      const dashRegex = /\s+[-–—]\s+/g;
      let match: RegExpExecArray | null;

      while ((match = dashRegex.exec(text)) !== null) {
        const afterDash = text.slice(match.index + match[0].length).trim();
        const isExplanation =
          /^(?:known|famous|popular|great|good|best|top|specializing|serves|serving|offers|located|features|ideal|perfect|a\s+|an\s+|the\s+|traditional|authentic|delicious|fresh|hearty|spicy|cozy|family)\b/i.test(afterDash) ||
          afterDash.split(/\s+/).length >= 6 ||
          /^[a-z]/.test(afterDash);

        if (isExplanation) {
          description = afterDash;
          name = text.slice(0, match.index).trim();
          break;
        }
      }
    }

    // 12. Period / Sentence Separator: "Candidate Name. Great for families..."
    if (!description) {
      const sentenceMatch = text.match(/^([A-Z][\w\s&'’–-]{1,35}?)\.\s+([A-Z].+)$/);
      if (sentenceMatch) {
        const potentialName = sentenceMatch[1].trim();
        const words = potentialName.split(/\s+/);
        if (words.length >= 1 && words.length <= 5) {
          name = potentialName;
          description = sentenceMatch[2].trim();
        }
      }
    }
  }

  // Clean surrounding quotes and trailing punctuation from name
  name = name.replace(/^["'“”]+|["'“”]+$/g, '').trim();
  name = name.replace(/[.,;:]+$/, '').trim();

  // 13. Strip purpose / context trailers: "Dishoom for young professionals"
  const trailerMatch = name.match(/\s+(?:for|at)\s+(?:an?|the)?\s*(.*)$/i);
  if (trailerMatch && !description) {
    const baseCandidateName = name.slice(0, trailerMatch.index).trim();
    const isGenericSuperlative = /^(?:best|top|good|great|ideal|perfect|must|popular|famous)$/i.test(baseCandidateName);
    if (!isGenericSuperlative && baseCandidateName.length >= 3) {
      const trailerText = trailerMatch[1].toLowerCase();
      if (!category) {
        if (/\b(cinema|movie|film)\b/i.test(trailerText)) category = 'movie';
        else if (/\b(music|concert|album)\b/i.test(trailerText)) category = 'music';
        else if (/\b(artist|band|musician)\b/i.test(trailerText)) category = 'artist';
        else if (/\b(coffee|cafe|dining|restaurant|food|venue)\b/i.test(trailerText)) category = 'place';
      }
      name = baseCandidateName;
    }
  }

  return { name, description, category };
}

export class RecommendationParser {
  /**
   * Generically extracts candidate items from multi-recommendation formats:
   * Numbered lists, bulleted lists, headings with explanations, ellipses-separated prose,
   * blank-line separated blocks, and disjunctions.
   */
  public static extractCandidates(raw: string): {
    items: ExtractedItem[];
    inferredLocation?: string;
  } {
    const rawTrimmed = raw.trim();
    if (!rawTrimmed) return { items: [] };

    let inferredLocation: string | undefined;

    // 1. Check for inline numbering in a single paragraph: "1. A... 2. B... 3. C..."
    let textToProcess = rawTrimmed;
    if (!textToProcess.includes('\n') && /\b1[\.\)]\s+.+\b2[\.\)]\s+/.test(textToProcess)) {
      textToProcess = textToProcess.replace(/(\s+|^)(?=\d+[\.\)]\s+)/g, '\n');
    }

    // 2. Check for ellipses-separated items in single paragraph:
    // e.g. "Sure! Here are the 3 best restaurants in Ghulam Muhammad Abad, Faisalabad: Farzand Foods Centre ... Waqar Restaurant – Madina Chowk ... Best Overall ..."
    if (!textToProcess.includes('\n') && /(?:\.{3,}|…)/.test(textToProcess)) {
      const colonIdx = textToProcess.indexOf(':');
      let preamble = '';
      let listPart = textToProcess;
      if (colonIdx > 0 && colonIdx < 120) {
        preamble = textToProcess.slice(0, colonIdx).trim();
        listPart = textToProcess.slice(colonIdx + 1).trim();
        inferredLocation = extractPreambleLocation(preamble);
      }
      const rawSegments = listPart.split(/\s*(?:\.{3,}|…)\s*/).filter(s => s.trim().length > 0);
      if (rawSegments.length >= 2) {
        const items: ExtractedItem[] = [];
        for (let i = 0; i < rawSegments.length; i++) {
          const seg = rawSegments[i].trim();
          if (/^(?:hope\s+this|let\s+me\s+know|enjoy|these\s+are)\b/i.test(seg)) continue;
          const cleaned = cleanCandidateNameAndDescription(seg);
          if (cleaned.name && cleaned.name.length > 0) {
            const norm = normalizeCandidateSearch(cleaned.name, cleaned.category, inferredLocation);
            items.push({
              id: `item_${items.length + 1}`,
              name: cleaned.name,
              category: cleaned.category || norm.inferredCategory,
              description: cleaned.description,
              sourcePosition: items.length + 1,
              originalText: seg,
              originalName: norm.originalName,
              normalizedName: norm.normalizedName,
              candidateSearchNames: norm.candidateSearchNames,
              extractedLocation: norm.extractedLocation
            });
          }
        }
        if (items.length > 0) {
          return { items, inferredLocation };
        }
      }
    }

    // 3. Line-based processing:
    const lines = textToProcess
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const isListMarker = (line: string): boolean => {
      if (/^(?:\d+[\.\)]|\[\d+\])\s+\S/.test(line)) return true;
      if (/^[-*•·–—]\s+\S/.test(line)) return true;
      if (/^#{1,6}\s+\S/.test(line)) return true;
      if (/^\*\*[^*]+\*\*(?:\s*[-:–—].*)?$/.test(line)) return true;
      return false;
    };

    const hasListMarkers = lines.some(l => isListMarker(l));

    if (hasListMarkers) {
      interface RawBlock {
        headerLine: string;
        bodyLines: string[];
      }
      const blocks: RawBlock[] = [];
      let currentBlock: RawBlock | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (isListMarker(line)) {
          currentBlock = { headerLine: line, bodyLines: [] };
          blocks.push(currentBlock);
        } else if (currentBlock) {
          if (/^(?:hope\s+this|let\s+me\s+know|enjoy|feel\s+free|overall,?\s+these)\b/i.test(line)) {
            currentBlock = null;
          } else {
            currentBlock.bodyLines.push(line);
          }
        } else {
          if (!inferredLocation) {
            inferredLocation = extractPreambleLocation(line);
          }
        }
      }

      if (blocks.length > 0) {
        const items: ExtractedItem[] = [];
        for (const block of blocks) {
          const cleaned = cleanCandidateNameAndDescription(block.headerLine);
          let desc = cleaned.description;
          if (block.bodyLines.length > 0) {
            const bodyText = block.bodyLines.join(' ');
            desc = desc ? `${desc} ${bodyText}` : bodyText;
          }

          if (cleaned.name) {
            const norm = normalizeCandidateSearch(cleaned.name, cleaned.category, inferredLocation);
            items.push({
              id: `item_${items.length + 1}`,
              name: cleaned.name,
              category: cleaned.category || norm.inferredCategory,
              description: desc,
              sourcePosition: items.length + 1,
              originalText: [block.headerLine, ...block.bodyLines].join('\n'),
              originalName: norm.originalName,
              normalizedName: norm.normalizedName,
              candidateSearchNames: norm.candidateSearchNames,
              extractedLocation: norm.extractedLocation
            });
          }
        }

        if (items.length > 0) {
          return { items, inferredLocation };
        }
      }
    }

    // 4. Blank-Line Separated Paragraph Blocks:
    const paragraphs = rawTrimmed.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
    if (paragraphs.length >= 2) {
      const items: ExtractedItem[] = [];
      for (const p of paragraphs) {
        const pLines = p.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (pLines.length === 0) continue;
        const firstLine = pLines[0];

        if (items.length === 0 && (firstLine.endsWith(':') || /^(?:here\s+are|sure|certainly)\b/i.test(firstLine))) {
          inferredLocation = extractPreambleLocation(firstLine);
          continue;
        }

        const words = firstLine.split(/\s+/);
        if (words.length >= 1 && words.length <= 7 && !firstLine.endsWith(',')) {
          const cleaned = cleanCandidateNameAndDescription(firstLine);
          let desc = cleaned.description;
          if (pLines.length > 1) {
            const restText = pLines.slice(1).join(' ');
            desc = desc ? `${desc} ${restText}` : restText;
          }
          if (cleaned.name) {
            const norm = normalizeCandidateSearch(cleaned.name, cleaned.category, inferredLocation);
            items.push({
              id: `item_${items.length + 1}`,
              name: cleaned.name,
              category: cleaned.category || norm.inferredCategory,
              description: desc,
              sourcePosition: items.length + 1,
              originalText: p,
              originalName: norm.originalName,
              normalizedName: norm.normalizedName,
              candidateSearchNames: norm.candidateSearchNames,
              extractedLocation: norm.extractedLocation
            });
          }
        }
      }

      if (items.length >= 2) {
        return { items, inferredLocation };
      }
    }

    // 5. Disjunctions / Conjunctions (e.g. 'Underground Inc or Pulp Fiction')
    let disjunctionText = rawTrimmed;
    let disjunctionCategory: string | undefined;

    disjunctionText = disjunctionText.replace(/^(?:book|screen|feature|play|visit|evaluate|audit|explore|check out)\s+/i, '').trim();

    const disjunctionTrailerMatch = disjunctionText.match(/\s+(?:for|at)\s+(?:an?|the)?\s*(.*)$/i);
    if (disjunctionTrailerMatch) {
      const trailerText = disjunctionTrailerMatch[1].toLowerCase();
      if (/\b(cinema|movie|film)\b/i.test(trailerText)) disjunctionCategory = 'movie';
      else if (/\b(music|concert|album)\b/i.test(trailerText)) disjunctionCategory = 'music';
      else if (/\b(artist|band|musician)\b/i.test(trailerText)) disjunctionCategory = 'artist';
      else if (/\b(coffee|cafe|dining|restaurant|food|venue)\b/i.test(trailerText)) disjunctionCategory = 'place';
      disjunctionText = disjunctionText.replace(/\s+(?:for|at)\s+(?:an?|the)?\s*.*$/i, '').trim();
    }

    if (/\s+(?:or|vs\.?|versus)\s+/i.test(disjunctionText) && !disjunctionText.includes('\n')) {
      const parts = disjunctionText.split(/\s+(?:or|vs\.?|versus)\s+/i).map(p => p.trim()).filter(p => p.length > 0);
      if (parts.length >= 2) {
        const items: ExtractedItem[] = parts.map((part, idx) => ({
          id: `item_${idx + 1}`,
          name: part,
          category: disjunctionCategory,
          sourcePosition: idx + 1,
          originalText: part
        }));
        return { items };
      }
    }

    // 6. Single item fallback
    const singleClean = cleanCandidateNameAndDescription(rawTrimmed);
    return {
      items: [
        {
          id: 'item_1',
          name: singleClean.name || rawTrimmed,
          category: singleClean.category,
          description: singleClean.description,
          sourcePosition: 1,
          originalText: rawTrimmed
        }
      ]
    };
  }

  /**
   * Main parsing entrypoint.
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

    let updatedAudience = input.audienceContext;
    let updatedLocation = input.location;
    const updatedConstraints = [...(input.constraints || [])];

    // Single-line discovery request check
    if (isDiscoveryRequest(raw) && !raw.includes('\n') && !/\b\d+[\.\)]\s+/.test(raw)) {
      const intent = extractDiscoveryIntent(raw, input);
      if (intent.inferredAudience && !updatedAudience) updatedAudience = intent.inferredAudience;
      if (intent.inferredConstraint && !updatedConstraints.includes(intent.inferredConstraint)) {
        updatedConstraints.push(intent.inferredConstraint);
      }
      const fullDiscoveryIntent: DiscoveryIntent = {
        isDiscovery: true,
        domain: intent.domain,
        category: intent.category,
        descriptivePreferences: intent.descriptivePreferences,
        cleanQuery: intent.cleanQuery,
        rawRequest: raw
      };
      return {
        items: [
          {
            id: 'item_1',
            name: intent.displayName,
            category: intent.category,
            isDiscovery: true,
            discoveryIntent: fullDiscoveryIntent,
            sourcePosition: 1,
            originalText: raw
          }
        ],
        audienceContext: updatedAudience,
        location: updatedLocation,
        constraints: updatedConstraints,
        isDiscovery: true,
        discoveryIntent: fullDiscoveryIntent
      };
    }

    // Multi-candidate extraction
    const extracted = RecommendationParser.extractCandidates(raw);

    if (extracted.inferredLocation && !updatedLocation) {
      updatedLocation = extracted.inferredLocation;
    }

    if (extracted.items.length > 0) {
      return {
        items: extracted.items,
        audienceContext: updatedAudience,
        location: updatedLocation,
        constraints: updatedConstraints,
        isDiscovery: extracted.items.some((it) => it.isDiscovery),
        discoveryIntent: extracted.items.find((it) => it.isDiscovery)?.discoveryIntent
      };
    }

    return {
      items: [
        {
          id: 'item_1',
          name: raw,
          sourcePosition: 1,
          originalText: raw
        }
      ],
      audienceContext: updatedAudience,
      location: updatedLocation,
      constraints: updatedConstraints
    };
  }
}
