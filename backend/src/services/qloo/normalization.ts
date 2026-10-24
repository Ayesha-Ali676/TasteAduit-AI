import { NormalizedCandidate, QlooRawEntity, QlooRawTag } from './qloo.types.js';

export class CandidateNormalizer {
  /**
   * Normalizes a raw Qloo entity from GET /search
   */
  public static normalizeEntity(raw: QlooRawEntity, timestamp = new Date().toISOString()): NormalizedCandidate {
    const primaryType = raw.types && raw.types.length > 0 ? raw.types[0] : 'urn:entity:unknown';
    const tagNames = raw.tags ? raw.tags.map((t) => t.name).filter(Boolean) : [];
    const rawImage = raw.properties?.image as { url?: string } | undefined;
    const imageUrl = typeof rawImage?.url === 'string' && rawImage.url.trim().length > 0
      ? rawImage.url.trim()
      : undefined;

    return {
      id: raw.entity_id,
      name: raw.name,
      type: primaryType,
      category: 'entity',
      popularity: typeof raw.popularity === 'number' ? raw.popularity : undefined,
      disambiguation: raw.disambiguation || undefined,
      imageUrl,
      tags: tagNames.length > 0 ? tagNames : undefined,
      source: 'qloo',
      retrievedAt: timestamp,
      rawMetadata: {
        urns: raw.types,
        releaseDate: typeof raw.properties?.release_date === 'string' ? raw.properties.release_date : undefined
      }
    };
  }

  /**
   * Normalizes a raw Qloo tag from GET /tags
   */
  public static normalizeTag(raw: QlooRawTag, timestamp = new Date().toISOString()): NormalizedCandidate {
    const parentTypes = raw.parents ? raw.parents.map((p) => p.type).filter(Boolean) : [];
    const rawImage = raw.properties?.image as { url?: string } | undefined;
    const imageUrl = typeof rawImage?.url === 'string' && rawImage.url.trim().length > 0
      ? rawImage.url.trim()
      : undefined;

    return {
      id: raw.id,
      name: raw.name,
      type: raw.type,
      category: 'tag',
      popularity: typeof raw.popularity === 'number' ? raw.popularity : undefined,
      disambiguation: typeof raw.properties?.description === 'string' ? raw.properties.description : undefined,
      imageUrl,
      tags: parentTypes.length > 0 ? parentTypes : undefined,
      source: 'qloo',
      retrievedAt: timestamp,
      rawMetadata: {
        urns: parentTypes
      }
    };
  }

  /**
   * Deduplicates candidates by ID while preserving order.
   */
  public static deduplicate(candidates: NormalizedCandidate[]): NormalizedCandidate[] {
    const seen = new Set<string>();
    const result: NormalizedCandidate[] = [];

    for (const c of candidates) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push(c);
      }
    }

    return result;
  }
}
