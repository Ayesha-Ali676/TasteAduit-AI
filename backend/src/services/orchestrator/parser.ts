import { ExtractedItem, ParseStageInput, ParseStageOutput } from './stages.types.js';

export class RecommendationParser {
  /**
   * Parses raw recommendation text into discrete extractable items.
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

      // Skip lines that are just section headers or meta-prompts
      if (line.toLowerCase().startsWith('recommend') && lines.length > 1) {
        continue;
      }

      if (line.length > 0) {
        items.push({
          id: `item_${i + 1}`,
          name: line
        });
      }
    }

    // If only one line was present and no items created, use the raw text
    if (items.length === 0 && raw.length > 0) {
      // If it starts with "Recommend ...", clean it up or keep as concept
      const cleaned = raw.replace(/^recommend\s+(an?\s+)?/i, '').replace(/\s+for\s+.*$/i, '').trim();
      items.push({
        id: 'item_1',
        name: cleaned.length > 0 ? cleaned : raw
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
