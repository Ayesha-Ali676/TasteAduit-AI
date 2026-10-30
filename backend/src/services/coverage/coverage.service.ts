import { ParseStageInput, ItemResolutionEnvelope } from '../orchestrator/stages.types.js';
import {
  CulturalCoverageResult,
  CulturalDirection,
  QlooGroundedAlternative,
  CulturalCoverageStatus
} from './coverage.types.js';
import { logger } from '../../utils/logger.js';

export interface SemanticQualityContext {
  knownEntityNames?: Set<string>;
  domain?: string;
  queryContext?: string;
}

// 1. Explicit administrative, operational, formatting, and non-cultural metadata patterns
const OPERATIONAL_NOISE_PATTERNS = [
  /reference to/i,
  /homage to/i,
  /inspired by/i,
  /named after/i,
  /f word/i,
  /slur/i,
  /aspect ratio/i,
  /subtitles/i,
  /runtime/i,
  /widescreen/i,
  /closed captions/i,
  /staff wear/i,
  /wheelchair/i,
  /masks/i,
  /credit card/i,
  /restroom/i,
  /parking/i,
  /seating/i,
  /delivery/i,
  /takeout/i,
  /drive through/i,
  /free wifi/i,
  /wifi/i,
  /north america/i,
  /united states/i,
  /couples/i,
  /tourists/i,
  /date/i,
  /going steady/i,
  /two word title/i,
  /six word title/i,
  /title spoken by character/i,
  /male protagonist/i,
  /female protagonist/i,
  /protagonist/i,
  /antagonist/i,
  /male lead/i,
  /female lead/i,
  /twist the dance/i,
  /dance routine/i
];

// 2. Physical objects, props, hardware, vehicles, apparel, and anatomical parts (Category A)
const PHYSICAL_OBJECT_PATTERNS = [
  // Vehicles and automotive parts
  /\b(car|cars|automobile|truck|trucks|van|vans|bus|buses|train|trains|subway|plane|airplane|helicopter|boat|boats|ship|ships|bicycle|bike|motorcycle|taxi|taxicab|limo|limousine|trunk|windshield|tire|tires|wheel|wheels|engine|seatbelt|license plate|dashboard|rolls royce)\b/i,
  // Discrete physical props, tools, containers, electronics, furniture, weapons
  /\b(telephone|phone|payphone|pay phone|cellphone|cell phone|suitcase|suitcases|briefcase|briefcases|luggage|bag|backpack|box|boxes|bottle|bottles|glass|cup|plate|bowl|knife|knives|blade|sword|gun|guns|pistol|revolver|rifle|shotgun|firearm|bullet|bullets|bomb|bombs|mousetrap|trap|rope|chain|lock|key|keys|watch|clock|mirror|two way mirror|chair|table|desk|bed|couch|sofa|furniture|door|window|curtain|lamp|lightbulb|flashlight|candle|umbrella|newspaper|envelope|letter|wallet|cash|money|coin|coins|dollar bill|diamond|diamonds|jewel|jewelry|ring|necklace|bracelet|cigarette|cigarettes|cigar|cigars|pipe|lighter|matches|toothpick|comb|brush|tv screen|screens|radio|cassette|tape|microphone)\b/i,
  // Clothing, apparel, physical wearables
  /\b(shoe|shoes|sneaker|boots|sock|socks|pants|trousers|jeans|shirt|t-shirt|jacket|coat|suit|tie|necktie|dress|skirt|hat|cap|gloves|scarf|belt|underwear|panties|bra|swimsuit|glasses|eyeglasses|sunglasses|eyepatch|mask|costume|wig)\b/i,
  // Anatomy and physical bodily features
  /\b(mouth|lip|lips|teeth|tooth|tongue|hand|hands|foot|feet|head|face|finger|fingers|toe|toes|arm|arms|leg|legs|chest|ear|ears|eye|eyes|hair|beard|mustache|goatee)\b/i,
  // Discrete rooms and isolated physical settings
  /\b(elevator|escalator|staircase|stairs|hallway|corridor|basement|attic|garage|warehouse|closet|locker|restroom|toilet|bathroom|kitchen|bedroom|office|beach)\b/i
];

// 3. Literal plot mechanics, physical actions, and cinematography mechanics (Category B)
const LITERAL_PLOT_AND_ACTION_PATTERNS = [
  // Spatial containment or situational prepositional physical action
  /\b(in|into|on|onto|under|inside|behind|through|out of|with|from)\s+(a|an|the|one's|his|her|their)\s+/i,
  // Physical action verbs and participles
  /\b(stuffed|chased|chasing|hiding|carrying|running|walking|shooting|shootout|eating|drinking|smoking|beating|slapping|kissing|killing|falling|jumping|climbing|fleeing|holding|wearing|standing|sitting|sleeping|stealing|escaping|arrest|kidnapping|tied to|shot in|fell out|bride and groom|reunion)\b/i,
  // Camera mechanics, cinematography staging, formatting
  /\b(camera shot|close up|tracking shot|birds eye shot|slow motion|voice over|split screen|zoom in|zoom out|cutaway|freeze frame)\b/i
];

// 4. Purely literal scene attributes and isolated colors (Category C)
const LITERAL_SCENE_ATTRIBUTES = [
  /^(red|blue|green|yellow|pink|purple|orange|brown|grey|gray|white|gold|silver|bronze)$/i,
  /^(tall|short|big|small|huge|tiny|wide|narrow|heavy|light|indoor|outdoor|nighttime|daytime|underwater|dark room)$/i,
  /^(girl|boy|man|woman|guy|lady|child|baby|teenager)$/i
];

// 5. Individual person names, honorifics, and entity names (Category E)
const ENTITY_NAME_PATTERNS = [
  /^(mr|mrs|ms|dr|sir|lady|lord|president)\s+[a-z]+/i,
  /^(quentin|martin|christina|tom|harry|taylor|billie|david|john|michael|robert|william|richard|james|george|paul|peter|steven|stanley|alfred|francis|woody|spike|ridley|christopher|denis|wes|mel|barbra|elizabeth|shelley|helen|sid|adolf|bruce|kevin|keanu)\s+[a-z]+$/i
];

// 6. Occupational and character-role descriptors (alone or compound identity+occupation, e.g. "Italian American Policeman", "Delivery Boy")
const OCCUPATION_AND_ROLE_PATTERNS = [
  /\b(policeman|policewoman|police officer|detective|officer|cop|cops|sheriff|agent|lawyer|attorney|prosecutor|judge|doctor|nurse|dentist|surgeon|bartender|waiter|waitress|barista|chef|cook|baker|clerk|shopkeeper|cashier|butler|maid|servant|janitor|guard|soldier|sailor|priest|pastor|minister|rabbi|monk|nun|teacher|professor|reporter|journalist|critic|producer|director|actor|actress|comedian|host|announcer|mechanic|plumber|electrician|carpenter|farmer|fisherman|boxer|wrestler|athlete|coach|hitman|assassin|dealer|smuggler|thief|burglar|robber|pimp|prostitute|driver|chauffeur|boy|girl)\b$/i
];

// 7. Technical production details, audio scores, and industry metadata (Task 3)
const TECHNICAL_PRODUCTION_PATTERNS = [
  // Technical scores, audio mixing, soundtracks (excluding pure music genres like "Electronic Music")
  /\b(music score|film score|original score|synthesizer score|orchestral score|score detail|score|soundtrack detail|soundtrack album|no music score|sound design|audio mixing)\b/i,
  // Industry meta, film criticism, awards, festival badges
  /\b(criticism|box office|award winner|academy award|oscar|oscar winner|palme d'or|cannes|screenplay|storyboard|casting|budget|grossing|camera technique|editing style|color grading|focal length)\b/i
];

// Positive cultural indicators: Genres, artistic styles, aesthetics, cuisines, traditions
const CULTURAL_DIMENSION_INDICATORS = [
  // Cinema, narrative, and entertainment genres & subgenres
  /\b(comedy|drama|crime|thriller|mystery|suspense|horror|action|adventure|romance|western|sci-fi|science fiction|fantasy|satire|satirical|parody|biopic|documentary|musical|animation|noir|neo-noir|whodunit|heist|gangster|underworld|epic|tragedy|farce|storytelling|narrative|nonlinear|non-linear)\b/i,
  // Musical genres & styles
  /\b(rock|pop|jazz|blues|hip hop|rap|r&b|soul|funk|electronic|techno|house|ambient|folk|punk|post-punk|metal|indie|alternative|classical|synthpop|trip hop|dance|reggae|country|psychedelic|grunge|disco|gospel|ska|bluegrass|acoustic|sessions)\b/i,
  // Culinary genres, beverage culture & dining formats
  /\b(cuisine|specialty coffee|craft beer|cocktail bar|wine bar|gastropub|bistro|brasserie|street food|fine dining|casual dining|farm to table|tasting menu|izakaya|trattoria|pizzeria|bakery|deli|patisserie|vegan|vegetarian|barbecue|bbq|coffee and tea|coffee|tea|dining|fusion|buzz)\b/i,
  // Cultural movements, aesthetic philosophies & historical waves
  /\b(minimalism|minimalist|surrealism|surrealist|avant-garde|expressionism|expressionist|modernism|modernist|postmodern|retro|vintage|lo-fi|gothic|baroque|cyberpunk|steampunk|underground|counterculture|bohemian|art house|new wave|classic cinema|period piece|cult film)\b/i,
  // Tone, style, and thematic dimensions
  /\b(character driven|dialogue driven|social commentary|atmospheric|psychological|existential|philosophical|melancholic|cynical|cynicism|deadpan|gritty|stylized|unpredictable|dystopian|allegorical|subversive|irreverent|dark comedy|black comedy|showbiz drama|celebrity culture|media criticism|thought provoking|morally ambiguous|slow burn)\b/i,
  // Cultural / geographic traditions
  /\b(italian|french|japanese|mexican|chinese|indian|thai|spanish|korean|vietnamese|mediterranean|british|american|latin|nordic|caribbean|cajun|creole|irish american|italian american|new york city|urban culture|working class)\b/i
];

const CULTURAL_SUFFIXES = [
  /ism$/i,
  /ist$/i,
  /esque$/i,
  /core$/i,
  /noir$/i,
  /driven$/i,
  /centric$/i,
  /wave$/i
];

/**
 * Normalizes a raw cultural tag into a clean, display-ready title.
 */
function normalizeTag(tag: string): string {
  return tag
    .trim()
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Deterministically evaluates whether a tag represents a genuine, high-quality
 * cultural/taste direction (genre, style, movement, aesthetic, cuisine, tradition),
 * rejecting literal physical props, plot mechanics, scene attributes, individual names,
 * and operational noise.
 */
export function isQualityCulturalTag(rawTag: string, context?: SemanticQualityContext): boolean {
  if (!rawTag || typeof rawTag !== 'string') return false;
  const trimmed = rawTag.trim();
  if (trimmed.length < 3 || trimmed.length > 35) return false;

  // 1. Explicit administrative / operational noise
  for (const pattern of OPERATIONAL_NOISE_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  // 2. Physical objects / props / hardware / vehicles / apparel / anatomy (Category A)
  for (const pattern of PHYSICAL_OBJECT_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  // 3. Literal plot mechanics / physical actions / camera shots (Category B)
  for (const pattern of LITERAL_PLOT_AND_ACTION_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  // 4. Purely literal scene attributes / isolated colors / gender nouns (Category C)
  for (const pattern of LITERAL_SCENE_ATTRIBUTES) {
    if (pattern.test(trimmed)) return false;
  }

  // 5. Individual person names / citations (Category E)
  for (const pattern of ENTITY_NAME_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  // 6. Occupational and character role compound descriptors (Task 2)
  for (const pattern of OCCUPATION_AND_ROLE_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  // 7. Technical production details and industry meta (Task 3)
  for (const pattern of TECHNICAL_PRODUCTION_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  // Check known entity names in context (candidates and connected entities)
  if (context?.knownEntityNames) {
    const lower = trimmed.toLowerCase();
    for (const ent of context.knownEntityNames) {
      if (ent.length > 3 && lower === ent) {
        const isCoreGenre = /^(crime|drama|comedy|action|horror|thriller|romance|mystery|western|musical|animation)$/i.test(trimmed);
        if (!isCoreGenre) {
          return false;
        }
      }
    }
  }

  // Positive qualification:
  // Must match a recognized cultural dimension indicator, suffix, or descriptive aesthetic attribute
  for (const pattern of CULTURAL_DIMENSION_INDICATORS) {
    if (pattern.test(trimmed)) return true;
  }

  for (const pattern of CULTURAL_SUFFIXES) {
    if (pattern.test(trimmed)) return true;
  }

  // Expressive adjectival cultural descriptors (e.g., Nightmarish, Resilient, Energetic, Catchy, Reflective, Flawed, Naive)
  if (/\b(nightmarish|resilient|energetic|catchy|reflective|flawed|naive|intimate|delusional|cringeworthy|humiliation|claustrophobic|dark|cynical|provocative|introspective|poetic|subtle|ironic|satirical|satiric|authentic|gritty|stylized|unpredictable|determined)\b/i.test(trimmed)) {
    return true;
  }

  return false;
}

export class CulturalCoverageService {
  /**
   * Deterministically analyzes the cultural coverage of a verified recommendation set
   * against the Qloo taste graph, identifying represented directions, verified blind spots,
   * and optional grounded alternatives.
   */
  public async analyzeCoverage(
    input: ParseStageInput,
    envelopes: ItemResolutionEnvelope[]
  ): Promise<CulturalCoverageResult> {
    const timestamp = new Date().toISOString();

    try {
      // 1. Filter to verified candidates
      const verifiedEnvelopes = envelopes.filter(
        (e) =>
          e.resolution?.status === 'resolved' &&
          e.audit &&
          e.audit.decision.status !== 'insufficient_evidence'
      );

      if (verifiedEnvelopes.length === 0) {
        return {
          status: 'INSUFFICIENT_EVIDENCE',
          totalSupportedDirections: 0,
          coveredDirectionsCount: 0,
          blindSpotsCount: 0,
          coveredDirections: [],
          blindSpots: [],
          summaryNote: 'Not enough Qloo-grounded cultural directions were available to calculate reliable coverage.',
          generatedAt: timestamp
        };
      }

      // Assemble known entity names for dynamic entity name filtering
      const knownEntityNames = new Set<string>();
      for (const env of verifiedEnvelopes) {
        if (env.item.name) knownEntityNames.add(env.item.name.toLowerCase().trim());
        if (env.resolution.resolvedEntity?.name) {
          knownEntityNames.add(env.resolution.resolvedEntity.name.toLowerCase().trim());
        }
        if (env.evidence?.signals) {
          for (const sig of env.evidence.signals) {
            if (sig.signalType === 'taste_affinity' && sig.relatedEntityName) {
              knownEntityNames.add(sig.relatedEntityName.toLowerCase().trim());
            }
          }
        }
      }

      const qualityContext: SemanticQualityContext = {
        knownEntityNames
      };

      // 2. Map direct cultural tags on verified candidates
      const candidateTagMap = new Map<string, Set<string>>(); // normalizedTag -> Set of candidate names
      const tagRawProvenance = new Map<string, string[]>(); // normalizedTag -> evidenceRefs

      for (const env of verifiedEnvelopes) {
        const candidateName = env.resolution.resolvedEntity?.name || env.item.name;
        const directTags: string[] = [];

        // Direct tags from resolved entity
        if (env.resolution.resolvedEntity?.tags) {
          directTags.push(...env.resolution.resolvedEntity.tags);
        }

        // Cultural tag signals from Stage 3 evidence
        if (env.evidence?.signals) {
          for (const sig of env.evidence.signals) {
            if (sig.signalType === 'cultural_tag' && sig.relatedEntityName) {
              directTags.push(sig.relatedEntityName);
            }
          }
        }

        for (const rawTag of directTags) {
          if (!isQualityCulturalTag(rawTag, qualityContext)) continue;
          const clean = normalizeTag(rawTag);
          if (!candidateTagMap.has(clean)) {
            candidateTagMap.set(clean, new Set());
            tagRawProvenance.set(clean, []);
          }
          candidateTagMap.get(clean)!.add(candidateName);
          tagRawProvenance.get(clean)!.push(`${candidateName} (Qloo metadata)`);
        }
      }

      // 3. Map taste-cluster cultural directions from connected Qloo affinity graph
      // Extracts directions prominent in the cultural cluster of the request/recommendations
      interface ClusterTagData {
        totalAffinity: number;
        occurrences: number;
        connectedEntities: Set<string>;
      }
      const clusterTagMap = new Map<string, ClusterTagData>();

      for (const env of verifiedEnvelopes) {
        if (!env.evidence?.signals) continue;
        for (const sig of env.evidence.signals) {
          if (sig.signalType === 'taste_affinity' && sig.tags && sig.tags.length > 0) {
            const affinity = typeof sig.value === 'number' ? sig.value : 0.85;
            const connectedName = sig.relatedEntityName || 'Qloo Taste Cluster';

            for (const rawTag of sig.tags) {
              if (!isQualityCulturalTag(rawTag, qualityContext)) continue;
              const clean = normalizeTag(rawTag);
              if (!clusterTagMap.has(clean)) {
                clusterTagMap.set(clean, {
                  totalAffinity: 0,
                  occurrences: 0,
                  connectedEntities: new Set()
                });
              }
              const entry = clusterTagMap.get(clean)!;
              entry.totalAffinity += affinity;
              entry.occurrences += 1;
              entry.connectedEntities.add(connectedName);
            }
          }
        }
      }

      // Also account for explicit constraints/audience provided in request
      const requestText = [
        input.audienceContext || '',
        input.location || '',
        ...(input.constraints || [])
      ].join(' ').toLowerCase();

      // 4. Distinguish COVERED vs BLIND_SPOT vs INSUFFICIENT_EVIDENCE
      const coveredList: CulturalDirection[] = [];
      const blindSpotList: CulturalDirection[] = [];

      // A. Evaluate Covered Directions
      // Directions directly represented by at least one verified candidate
      for (const [tag, candidateNames] of candidateTagMap.entries()) {
        const clusterData = clusterTagMap.get(tag);
        const candidateCount = candidateNames.size;
        const clusterAffinity = clusterData ? clusterData.totalAffinity / clusterData.occurrences : 0.85;

        // Evidence confidence: based on candidate representation and taste cluster resonance
        const confidence = Math.min(1.0, 0.6 + (candidateCount * 0.15) + (clusterData ? 0.15 : 0));
        const namesArray = Array.from(candidateNames);

        coveredList.push({
          id: `cov_${tag.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          label: tag,
          status: 'COVERED',
          confidence: Number(confidence.toFixed(2)),
          representedBy: namesArray,
          explanation: `Represented by ${namesArray.join(', ')} in the verified recommendation set.`,
          evidenceRefs: Array.from(new Set(tagRawProvenance.get(tag) || [])).slice(0, 3),
          relevanceScore: candidateCount * 1.5 + clusterAffinity
        });
      }

      // B. Evaluate Potential Blind Spots
      // Directions prominent in Qloo taste cluster (from high-affinity connected items or constraints)
      // but NOT represented by any submitted recommendation
      for (const [tag, clusterData] of clusterTagMap.entries()) {
        if (candidateTagMap.has(tag)) {
          // Already covered
          continue;
        }

        const avgAffinity = clusterData.totalAffinity / clusterData.occurrences;
        const isMentionedInRequest = requestText.includes(tag.toLowerCase());

        // A direction can be labeled BLIND_SPOT only when:
        // 1. Qloo provides meaningful evidence that the direction is relevant (high affinity or multi-entity support)
        // 2. The direction is NOT adequately represented by the submitted recommendation set
        // 3. Sufficient empirical evidence exists (avgAffinity >= 0.80 or occurrences >= 2 or explicit constraint)
        const isSupportedBlindSpot =
          ((avgAffinity >= 0.80 && clusterData.occurrences >= 1) ||
            clusterData.occurrences >= 2 ||
            isMentionedInRequest) &&
          isQualityCulturalTag(tag, qualityContext);

        if (isSupportedBlindSpot) {
          const confidence = Math.min(1.0, (avgAffinity * 0.8) + (isMentionedInRequest ? 0.2 : 0));
          const connectedArray = Array.from(clusterData.connectedEntities).slice(0, 3);

          blindSpotList.push({
            id: `bld_${tag.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
            label: tag,
            status: 'BLIND_SPOT',
            confidence: Number(confidence.toFixed(2)),
            explanation: `Qloo identifies strong cultural relevance to this taste cluster (connected to ${connectedArray.join(', ')}), but none of the submitted recommendations meaningfully represent this direction.`,
            evidenceRefs: connectedArray.map((name) => `Qloo insight connection: ${name}`),
            relevanceScore: clusterData.totalAffinity + (isMentionedInRequest ? 2.0 : 0)
          });
        }
      }

      // 5. Sort and cap directions
      // Top covered directions (sorted by candidate count and relevance)
      coveredList.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
      const cappedCovered = coveredList.slice(0, 5);

      // Top blind spots (capped to 1-3 most evidence-backed directions per specification)
      blindSpotList.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
      const cappedBlindSpots = blindSpotList.slice(0, 3);

      const totalSupported = cappedCovered.length + cappedBlindSpots.length;

      // 6. Honest Uncertainty Check
      // If there are fewer than 2 supported directions across the taste cluster,
      // abstain from computing an artificial percentage.
      if (totalSupported < 2) {
        return {
          status: 'INSUFFICIENT_EVIDENCE',
          totalSupportedDirections: totalSupported,
          coveredDirectionsCount: cappedCovered.length,
          blindSpotsCount: cappedBlindSpots.length,
          coveredDirections: cappedCovered,
          blindSpots: cappedBlindSpots,
          summaryNote: 'Not enough Qloo-grounded cultural directions were available to calculate reliable coverage.',
          generatedAt: timestamp
        };
      }

      // 7. Deterministic Coverage Calculation
      // coverageRatio = coveredSupportedDirections / totalSupportedRelevantDirections
      const coverageRatio = Number((cappedCovered.length / totalSupported).toFixed(3));
      const coveragePercentage = Math.round(coverageRatio * 100);

      // 8. Qloo-Grounded Alternative Selection
      // If there is at least one blind spot, find the highest-affinity Qloo entity from Stage 3 signals
      // that possesses the uncovered direction and is not already in the recommendations.
      let alternative: QlooGroundedAlternative | undefined;

      if (cappedBlindSpots.length > 0) {
        const topBlindSpot = cappedBlindSpots[0];
        const submittedNames = new Set(verifiedEnvelopes.map((e) => e.item.name.toLowerCase().trim()));
        for (const env of verifiedEnvelopes) {
          if (env.resolution.resolvedEntity?.name) {
            submittedNames.add(env.resolution.resolvedEntity.name.toLowerCase().trim());
          }
        }

        // Detect primary domain from verified candidates to prioritize domain-compatible recommendations
        const primaryType =
          verifiedEnvelopes.find((e) => e.resolution.resolvedEntity?.type)?.resolution.resolvedEntity?.type || '';
        const isMovieDomain = primaryType.includes('movie') || primaryType.includes('film');
        const isPlaceDomain = primaryType.includes('place') || primaryType.includes('restaurant');
        const isArtistDomain = primaryType.includes('artist') || primaryType.includes('music');

        const isDomainMatch = (t?: string): boolean => {
          if (!t) return false;
          if (isMovieDomain) return t.includes('movie') || t.includes('film') || t.includes('creative_work');
          if (isPlaceDomain) return t.includes('place') || t.includes('restaurant') || t.includes('dining');
          if (isArtistDomain) return t.includes('artist') || t.includes('music');
          return true;
        };

        interface CandidateMatch {
          entityId: string;
          name: string;
          type?: string;
          imageUrl?: string;
          affinity: number;
          hasTargetTag: boolean;
          isDomainCompatible: boolean;
        }
        let bestMatch: CandidateMatch | undefined;

        // Iterate through all Stage 3 affinity signals across verified envelopes
        for (const env of verifiedEnvelopes) {
          if (!env.evidence?.signals) continue;
          for (const sig of env.evidence.signals) {
            if (
              sig.signalType === 'taste_affinity' &&
              sig.relatedEntityId &&
              sig.relatedEntityName &&
              !submittedNames.has(sig.relatedEntityName.toLowerCase().trim())
            ) {
              const sigTags = (sig.tags || []).map(normalizeTag);
              const matchesDirection = sigTags.includes(topBlindSpot.label);
              const domainComp = isDomainMatch(sig.relatedEntityType);
              const affinity = typeof sig.value === 'number' ? sig.value : 0.85;

              const candidate: CandidateMatch = {
                entityId: sig.relatedEntityId,
                name: sig.relatedEntityName,
                type: sig.relatedEntityType,
                imageUrl: sig.imageUrl,
                affinity,
                hasTargetTag: matchesDirection,
                isDomainCompatible: domainComp
              };

              if (!bestMatch) {
                bestMatch = candidate;
              } else {
                // Priority hierarchy:
                // 1. Matches blind spot direction AND matches domain (highest score)
                // 2. Matches blind spot direction
                // 3. Matches domain
                // 4. Higher affinity
                const scoreCandidate = (c: CandidateMatch) => {
                  return (c.hasTargetTag ? 10 : 0) + (c.isDomainCompatible ? 5 : 0) + c.affinity;
                };
                if (scoreCandidate(candidate) > scoreCandidate(bestMatch)) {
                  bestMatch = candidate;
                }
              }
            }
          }
        }

        if (bestMatch) {
          alternative = {
            entityId: bestMatch.entityId,
            name: bestMatch.name,
            type: bestMatch.type,
            imageUrl: bestMatch.imageUrl,
            affinity: Number(bestMatch.affinity.toFixed(3)),
            uncoveredDirection: topBlindSpot.label,
            rationale: `${bestMatch.name} exhibits strong Qloo taste affinity (${Math.round(bestMatch.affinity * 100)}%) with the uncovered ${topBlindSpot.label} direction.`,
            provenanceRef: `Qloo Taste Graph Insight (${bestMatch.entityId})`
          };
        }
      }

      const summaryNote = `${cappedCovered.length} of ${totalSupported} cultural directions represented • ${cappedBlindSpots.length} Qloo-grounded blind spot${cappedBlindSpots.length === 1 ? '' : 's'}.`;

      return {
        status: 'SUFFICIENT_EVIDENCE',
        coverageRatio,
        coveragePercentage,
        totalSupportedDirections: totalSupported,
        coveredDirectionsCount: cappedCovered.length,
        blindSpotsCount: cappedBlindSpots.length,
        coveredDirections: cappedCovered,
        blindSpots: cappedBlindSpots,
        alternative,
        summaryNote,
        generatedAt: timestamp
      };
    } catch (err) {
      logger.warn('Error computing cultural coverage:', err);
      return {
        status: 'UNAVAILABLE',
        totalSupportedDirections: 0,
        coveredDirectionsCount: 0,
        blindSpotsCount: 0,
        coveredDirections: [],
        blindSpots: [],
        summaryNote: 'Cultural coverage unavailable — the verified audit result above remains valid.',
        generatedAt: timestamp
      };
    }
  }
}

export const coverageService = new CulturalCoverageService();
