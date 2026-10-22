# System Architecture — TasteAudit AI

> Status: Phase 2 Foundation Scaffold Completed

## 1. System Overview

TasteAudit AI is a cultural quality-assurance (QA) service designed to audit, evaluate, and repair AI-generated recommendations. The system ensures recommendations are grounded in authentic taste patterns using the Qloo cultural intelligence graph.

```text
[ Client Dashboard (React + Vite) ]
                │
                ▼ (Proxy: /api/*)
    [ Express API Backend ]
                │
  ┌─────────────┴─────────────┐
  ▼                           ▼
[ GET /api/health ]      [ POST /api/audit ]
                              │
                              ▼
                 [ TasteAudit Orchestrator ]
                              │
  ┌───────────────────────────┼───────────────────────────┐
  ▼                           ▼                           ▼
1. PARSE                  2. RESOLVE                  3. RETRIEVE
(Extract recommendations,  (Resolve entities via       (Fetch cultural
 audience, constraints)     Qloo API abstraction)       evidence graphs)
  │                           │                           │
  └───────────────────────────┼───────────────────────────┘
                              ▼
                          4. AUDIT
                 (Deterministic Scoring Model)
                              │
                              ▼
                          5. REPAIR
                 (Evidence-backed replacements)
                              │
                              ▼
                         6. RE-AUDIT
                 (Benchmark verification)
```

## 2. Implemented Components (Phase 2)

- **Frontend Shell (`frontend/`):** React 18 + TypeScript + Vite + Tailwind CSS.
  - Interactive input for recommendations, audience context, location, and constraints.
  - Results placeholders for Cultural Grounding Score, Before/After repair diffs, Evidence provenance, and Confidence.
  - Direct proxying to backend (`http://localhost:3001`) with zero client-side credential exposure.
- **Backend Service (`backend/`):** Node.js 22 + TypeScript + Express + Zod.
  - `GET /api/health`: Health status endpoint.
  - `POST /api/audit`: Request validation and orchestration scaffold.
  - Bounded request sizes (`1mb` JSON limit).
  - Centralized error handling and secret-scrubbing logger.
- **Deterministic Orchestration Pipeline (`backend/src/services/`):**
  - Concrete TypeScript contracts for the 6 stages: `PARSE`, `RESOLVE`, `RETRIEVE`, `AUDIT`, `REPAIR`, `RE-AUDIT`.
  - Deterministic scoring model implementation with explicit weights (40% cultural alignment, 25% contextual relevance, 20% constraint compliance, 15% evidence completeness).
  - Server-side Qloo client abstraction with strict credential boundary checks.

## 3. Data Isolation & Security

1. **Zero Client Secrets:** The frontend codebase, build artifacts, and client network requests never handle or receive Qloo API keys.
2. **Server-Side Encapsulation:** All Qloo interactions are isolated within `backend/src/services/qloo/`.
3. **Safe Error Handling:** Unhandled exceptions are scrubbed of keys, tokens, and internals before sending responses.
