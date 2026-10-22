# Qloo Integration Guide — TasteAudit AI

> Status: Stage 1 (PARSE) & Stage 2 (RESOLVE) Fully Implemented & Live Verified

## 1. Official Hackathon API Endpoints

TasteAudit AI interfaces with the official Qloo Hackathon API:
- **Base URL:** `https://hackathon.api.qloo.com`
- **Active Endpoints:**
  - `GET /search`: Searches for cultural entities (artists, albums, places, movies, books, brands) with query, take, and optional type filtering.
  - `GET /v2/tags`: Searches for cultural tags with `filter.query`, `feature.semantic_search=true`, and take bounding.

## 2. Server-Side Credential Requirement & Safety

All Qloo API interactions are executed strictly server-side through `backend/src/services/qloo/qloo.client.ts`:
- **Environment Variables:**
  - `QLOO_BASE_URL`: Defaults to `https://hackathon.api.qloo.com`
  - `QLOO_API_KEY`: Server-side secret key provided via environment configuration (with automatic local fallback to `~/.qloo/config` for local hackathon development).
- **Fail-Fast Boundary:** If unconfigured, `ServerQlooClient` throws `QlooConfigurationError` before any request is dispatched.
- **Transient Retries & Timeouts:** Requests use bounded timeouts (8000ms via `AbortSignal`) and bounded retries (max 1 retry for transient 502/503/504 errors). Authentication failures (401/403) are never retried.

## 3. Why the Key is Never Exposed to the Frontend

1. **Static Bundle Security:** Client-side JavaScript bundles are public. `QLOO_API_KEY` is strictly excluded from client builds.
2. **Quota & Rate-Limiting Protection:** Server-side isolation prevents client abuse and respects hackathon quota constraints.
3. **Traceability:** Server attaches unique `correlationId` and `provenance` metadata to every resolved entity for downstream auditing.

## 4. Entity Search & Resolution Architecture

```text
Input Item / Concept
         │
         ▼
[ ServerQlooClient ] ──► GET /search & GET /v2/tags (hackathon.api.qloo.com)
         │
         ▼
[ CandidateNormalizer ] ──► NormalizedCandidate Contract
         │
         ▼
[ EntityResolutionService ]
  - Exact Name Match (0.50)
  - Category / Type Match (0.30)
  - Location / Context Match (0.15)
  - Popularity Signal (0.05)
         │
    ┌────┴─────────────────────────────┐
    ▼                                  ▼
[ Clear Lead / Differentiated ]    [ Close Margin / Exact Duplicate Types ]
    │                                  │
    ▼                                  ▼
Status: 'resolved'                 Status: 'ambiguous'
Provenance: Supported              Provenance: Inferred
(Never guesses blindly)            (Abstains & requests clarification)
```

## 5. Live Verification

- Tested against live Qloo Hackathon API using real concept queries (`"jazz"`, `"Miles Davis"`, `"Pulp Fiction"`).
- Confirmed ambiguity handling when multiple entity types match (e.g. `Pulp Fiction` movie vs soundtrack album; `Jazz` album vs genre).
- Confirmed successful resolution when user category context is provided (e.g. `categoryHint: 'movie'` resolves directly to `urn:entity:movie` with `Supported` classification).
