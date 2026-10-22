# TasteAudit AI

> Cultural QA for AI Recommendations

---

## Overview

**TasteAudit AI** is a cultural quality-assurance (QA) system designed to evaluate, audit, and benchmark AI recommendations across cultural and lifestyle domains (music, film, dining, literature, fashion, and places).

### The Problem

Modern large language models and generative AI recommendation engines frequently produce recommendations that appear syntactically fluent but lack authentic cultural grounding. Such recommendations often suffer from:
- **Cultural Hallucinations & Incoherence:** Suggesting pairings or thematic connections that do not align with authentic taste patterns or demographic affinities.
- **Generic Stereotyping:** Defaulting to global clichés or superficial associations when prompted for nuanced cultural tastes.
- **Lack of Quantitative Grounding:** Inability to independently verify whether an LLM's cultural association reflects real-world taste correlation data.

### The Solution

TasteAudit AI introduces an automated QA layer that audits AI-generated recommendations against structured cultural intelligence. By benchmarking proposed recommendations against real-world cultural affinity graphs, TasteAudit quantifies taste coherence, detects cultural anomalies, and provides actionable audit scores.

### Why Qloo?

Qloo serves as the foundational cultural intelligence layer for TasteAudit AI:
- **Cross-Domain Taste Graph:** Qloo connects cultural affinities across distinct categories (e.g., dining, media, fashion, music) without relying on personally identifiable information (PII).
- **Empirical Grounding:** Instead of relying on subjective LLM self-evaluation, TasteAudit queries Qloo's taste correlation data to objectively score affinity and relevance.
- **Cultural Verification:** Qloo entities, tags, and audience affinities provide the ground truth required to validate whether a recommendation is authentic or hallucinated.

---

## High-Level Workflow (Planned)

```text
[ LLM Recommendation Input / Prompt ]
                │
                ▼
      [ TasteAudit Engine ]
                │
       ┌────────┴────────┐
       ▼                 ▼
[ Entity Extraction ]  [ Domain Categorization ]
       │                 │
       └────────┬────────┘
                ▼
   [ Qloo API Verification ] ◄── (Secure Server-Side API Calls)
   - Entity Resolution
   - Affinity & Correlation Scoring
   - Cultural Tag Analysis
                │
                ▼
     [ TasteAudit QA Report ]
   - Coherence Score
   - Cultural Relevance Metrics
   - Identified Hallucinations / Mismatches
```

---

## Planned Architecture

TasteAudit AI is planned as a modular workspace:
- **Backend API (Node.js / Express):** Encapsulates business logic, orchestrates Qloo API requests, and executes cultural evaluation routines.
- **Frontend Dashboard:** An interactive evaluation interface to submit recommendation prompts, inspect live audit scores, and visualize cross-domain affinity graphs.
- **Documentation & Benchmarks:** Structured test suites and sample cases representing diverse cultural scenarios.

### Security Principles

- **Server-Side Credential Isolation:** All Qloo API credentials, secrets, and private keys strictly reside server-side.
- **No Client Exposure:** The frontend client will never interface directly with the Qloo API, nor will private keys be embedded in client-side bundles or repository files.
- **Zero Secrets in Version Control:** Environment variables are managed exclusively via non-tracked `.env` configurations.

---

## Current Project Status

> **Status:** Early Development — Day 1 Foundation  
> **Milestone:** Initial Repository Setup & Foundation  

- [x] Environment verification & Qloo API access confirmed
- [x] Repository foundation & security policies initialized
- [ ] Backend service scaffolding (Upcoming)
- [ ] Qloo integration client & entity resolution (Upcoming)
- [ ] Evaluation scoring algorithms (Upcoming)
- [ ] Frontend QA dashboard (Upcoming)

---

## Local Setup

Detailed local installation and development instructions will be documented here once the backend and frontend modules are scaffolded.

---

## License

This project is licensed under the [MIT License](LICENSE).
