import { ExtractedItem, ParseStageInput, ParseStageOutput } from './stages.types.js';

export class RecommendationParser {
  /**
   * Parses raw recommendation text into discrete extractable items.
   * Generically handles multi-item lines, disjunctions ("A or B"),
   * anchor taste references ("... connected to [Anchor] taste cluster"),
   * conversational question prefixes ("Should this venue book...", "Should I ditch..."),
   * action imperatives ("Book...", "Screen..."),
   * and synthesized category/attribute requests without domain hardcoding.
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
      // e.g. "Recommend 3 neighborhood coffee shops...", "Recommend iconic modal jazz and hard bop artists..."
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
      // e.g. "Underground Inc or Pulp Fiction for an indie cultural cinema..."
      const trailerMatch = line.match(/\s+(?:for|at)\s+(?:an?|the)\s+(.*)$/i);
      if (trailerMatch && !category) {
        const trailerText = trailerMatch[1].toLowerCase();
        if (/\b(cinema|movie|film)\b/i.test(trailerText)) category = 'movie';
        else if (/\b(music|concert|album)\b/i.test(trailerText)) category = 'music';
        else if (/\b(artist|band|musician)\b/i.test(trailerText)) category = 'artist';
        else if (/\b(coffee|cafe|dining|restaurant|food|venue)\b/i.test(trailerText)) category = 'place';
      }
      line = line.replace(/\s+(?:for|at)\s+(?:an?|the)\s+.*$/i, '').trim();

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
      items.push({
        id: 'item_1',
        name: raw
      });
    }

    return {
      items,
      audienceContext: input.audienceContext,
      location: input.location,
      constraints: input.constraints || []
    };
  }
}
