# TasteAudit AI

### Don't Just Recommend. Verify the Taste.

**TasteAudit AI is a Qloo-powered cultural verification layer for AI-generated recommendations.**

AI can generate recommendations in seconds — but a convincing recommendation is not necessarily a culturally relevant one.

TasteAudit AI takes an AI-generated recommendation response and evaluates whether those recommendations actually fit the user's **audience, location, preferences, constraints, and cultural context**.

Instead of asking only:

> *“What should I recommend?”*

TasteAudit asks:

> **“Why does this recommendation actually make sense for this person?”**

---

## Overview

TasteAudit AI combines **Qloo's cultural intelligence graph**, deterministic auditing, evidence provenance, and a bounded autonomous agent into one verification pipeline.

A user provides:

- An AI-generated recommendation response
- Target audience
- Location
- Preferences or constraints

TasteAudit then:

1. Parses the AI response into individual recommendations.
2. Resolves recommendations against Qloo entities.
3. Retrieves Qloo cultural evidence and relationships.
4. Audits each recommendation against the user's context.
5. Calculates a deterministic Cultural Grounding Score.
6. Uses a bounded agent to decide whether to accept, repair, request more evidence, or stop.
7. Re-audits repaired results.
8. Analyzes the recommendation set for cultural coverage and blind spots.
9. Presents evidence and provenance behind the final result.

---

# Why TasteAudit AI?

Large language models are excellent at generating recommendations, but recommendation generation and recommendation **verification** are different problems.

An LLM can produce a plausible explanation for almost anything.

That does not mean the explanation is supported by real cultural relationships.

TasteAudit introduces an evidence-backed verification layer between AI-generated recommendations and the user.

### Traditional AI recommendation

```text
User
  ↓
AI
  ↓
Recommendations
```

### TasteAudit

```text
User Context
     ↓
AI Recommendations
     ↓
   TasteAudit
     ↓
 Qloo Cultural Intelligence
     ↓
 Deterministic Audit
     ↓
 Agent Decision
     ↓
 Re-Audit
     ↓
 Cultural Coverage
     ↓
 Evidence-Backed Result
```

---

# Core Features

## 1. AI Recommendation Parsing

TasteAudit accepts natural AI responses rather than requiring a rigid format.

It can extract recommendations from:

- Numbered lists
- Bullet lists
- Headings
- Inline recommendations
- Natural-language responses

The original recommendation context is preserved for auditing.

---

## 2. Qloo Entity Resolution

Each recommendation is resolved against Qloo's cultural intelligence graph.

Resolution is semantic and domain-aware rather than relying only on string matching.

This helps prevent situations where:

- The wrong entity is selected.
- An ambiguous name is treated as verified.
- A music entity is incorrectly treated as a movie.
- An unrelated Qloo entity is accepted simply because its name looks similar.

Unresolved or ambiguous candidates remain explicitly unverified.

---

## 3. Qloo Cultural Evidence

After successful resolution, TasteAudit retrieves relevant Qloo evidence.

Depending on the entity and domain, this can include:

- Cultural relationships
- Affinity signals
- Entity metadata
- Cultural tags
- Contextual connections
- Qloo insight references

Evidence provenance is retained so that grounded results can be inspected.

---

# 4. Deterministic Cultural Audit

TasteAudit evaluates recommendations using four explicit dimensions:

| Dimension | Weight |
|---|---:|
| Cultural Alignment | 40% |
| Contextual Relevance | 25% |
| Constraint Compliance | 20% |
| Evidence Completeness | 15% |

The final score is calculated by the deterministic audit engine.

### Important design principle

**AI does not control the final score.**

LLMs may assist with interpretation and agent decisions, but they cannot:

- Invent Qloo evidence
- Invent entities
- Invent affinity values
- Override the deterministic score
- Manufacture provenance

This separation keeps the audit reproducible and inspectable.

---

# 5. Evidence Firewall

TasteAudit explicitly distinguishes evidence quality:

### SUPPORTED

The claim is directly backed by available Qloo evidence.

### INFERRED

The claim can reasonably be interpreted from available information, but is not directly established.

### UNVERIFIED

There is not enough evidence to support the claim.

This allows TasteAudit to remain honest when evidence is incomplete.

> **Insufficient evidence is treated as a valid outcome — not as an invitation to hallucinate.**

---

# 6. Autonomous Agent

TasteAudit includes a bounded autonomous decision loop.

After an initial audit, the agent can choose between:

```text
ACCEPT
REPAIR
MORE_EVIDENCE
STOP
```

### ACCEPT

The current result is strong enough.

### REPAIR

A weak recommendation may be replaced or improved using verified evidence.

### MORE_EVIDENCE

Additional Qloo evidence may help resolve uncertainty.

### STOP

Further action is not justified or cannot be performed safely.

Every repair is followed by another deterministic audit.

The agent also includes:

- Bounded iterations
- Repeated-action protection
- Candidate compatibility checks
- Safe provider-failure behavior
- Explicit stop reasons

This prevents an autonomous loop from endlessly modifying recommendations without measurable improvement.

---

# 7. Cultural Coverage & Blind Spots

TasteAudit does more than score individual recommendations.

It analyzes the recommendation set as a whole.

### Cultural Coverage

The system identifies meaningful cultural directions represented across the recommendation set.

For example:

```text
Cultural Coverage: 63%

Covered:
• New York City
• Atmospheric
• Drama
• Character Driven
• Gritty
```

### Cultural Blind Spots

Qloo evidence can also reveal meaningful cultural directions that are not adequately represented.

```text
Potential Blind Spots:
• Dialogue Driven
• Capitalism
• Documentary Like
```

These directions are filtered through a semantic quality layer so incidental metadata such as physical objects, plot mechanics, or entity names are not presented as meaningful cultural insights.

### Qloo-Grounded Alternatives

When sufficient evidence exists, TasteAudit can surface an alternative recommendation addressing a meaningful blind spot.

The user can inspect the supporting Qloo evidence through the evidence drawer.

---

# 8. Before & After Verification

TasteAudit keeps the original AI recommendation separate from the culturally grounded result.

If a repair occurs, the system shows whether the change actually improved the audit.

For example:

```text
Before: 22
After: 94
Improvement: +72
```

If a repair produces no improvement, the system reports that honestly rather than presenting the unchanged result as a successful repair.

---

# 9. Evidence Inspection

Grounded recommendations expose their supporting evidence.

Users can inspect:

- Resolved Qloo entity
- Entity type
- Qloo entity ID
- Cultural signal
- Affinity evidence
- Evidence classification
- Qloo provenance
- Supporting insight references

This makes the result inspectable rather than a black-box recommendation.

---

# Architecture

```text
┌─────────────────────────────────────────────┐
│                 Frontend                    │
│          React + Vite + TypeScript          │
└──────────────────────┬──────────────────────┘
                       │
                       │ HTTP / REST
                       ▼
┌─────────────────────────────────────────────┐
│                  Backend                    │
│          Node.js + Express + TypeScript     │
├─────────────────────────────────────────────┤
│                                             │
│  Recommendation Parser                      │
│           ↓                                 │
│  Entity Resolution                          │
│           ↓                                 │
│  Qloo Retrieval                             │
│           ↓                                 │
│  Evidence Normalization                     │
│           ↓                                 │
│  Deterministic Audit Engine                 │
│           ↓                                 │
│  Autonomous Agent                           │
│           ↓                                 │
│  Repair / More Evidence                     │
│           ↓                                 │
│  Re-Audit                                   │
│           ↓                                 │
│  Cultural Coverage                          │
│                                             │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Qloo Cultural   │
              │ Intelligence    │
              │ Graph / API     │
              └─────────────────┘
```

---

# End-to-End Flow

```text
1. User enters context
       ↓
2. User pastes AI recommendation answer
       ↓
3. TasteAudit parses recommendations
       ↓
4. Recommendations are resolved through Qloo
       ↓
5. Qloo evidence is retrieved
       ↓
6. Evidence is normalized and validated
       ↓
7. Deterministic audit calculates score
       ↓
8. Agent evaluates the result
       ↓
9. Repair / more evidence / accept / stop
       ↓
10. Result is re-audited when necessary
       ↓
11. Cultural Coverage analyzes the set
       ↓
12. User receives final evidence-backed audit
```

---

# Technology Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

### Backend

- Node.js
- Express
- TypeScript
- Zod

### Cultural Intelligence

- Qloo API
- Qloo Insights
- Qloo Entities
- Qloo cultural affinity signals

### AI Providers

TasteAudit uses an AI provider abstraction for agent reasoning and can support configured providers such as:

- Groq
- OpenRouter

AI providers are not the source of truth for cultural evidence or final scoring.

### Testing

- Vitest
- TypeScript compiler
- Vite production builds

---

# Project Structure

```text
TasteAduit-AI/
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   │   ├── qloo/
│   │   │   ├── audit/
│   │   │   ├── repair/
│   │   │   ├── agent/
│   │   │   └── coverage/
│   │   ├── schemas/
│   │   └── server.ts
│   │
│   └── tests/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── ...
│   └── ...
│
├── docs/
├── examples/
├── .env.example
├── package.json
├── architecture.md
└── README.md
```

---

# Getting Started

## Prerequisites

Make sure you have:

- Node.js 20+
- npm
- A Qloo API key
- AI provider credentials for agent functionality

---

## 1. Clone the repository

```bash
git clone https://github.com/Ayesha-Ali676/TasteAduit-AI.git
cd TasteAduit-AI
```

---

## 2. Install dependencies

From the project root:

```bash
npm install
```

The project uses npm workspaces for the frontend and backend.

---

## 3. Configure environment variables

Create the required environment files from the provided examples.

### Backend

Configure:

```env
QLOO_API_KEY=your_qloo_api_key
QLOO_BASE_URL=https://hackathon.api.qloo.com

GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=your_groq_model

OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=your_openrouter_model
```

Provider configuration may vary depending on the enabled AI provider.

### Frontend

Configure the backend API URL:

```env
VITE_API_BASE_URL=http://localhost:3001
```

**Never commit real API keys or secrets to Git.**

---

# Running Locally

Start the development environment using:

```bash
npm run dev
```

If running the services independently:

### Backend

```bash
cd backend
npm run dev
```

### Frontend

```bash
cd frontend
npm run dev
```

The frontend communicates with the backend through the configured `VITE_API_BASE_URL`.

---

# Example Workflow

Suppose an AI generates:

```text
1. Reservoir Dogs
2. Snatch
3. Fargo
```

The user can paste the **complete AI response** into TasteAudit and provide context such as:

```text
Audience:
Someone who loves crime films and dark comedy

Location:
New York City

Constraints:
Avoid obvious mainstream choices
Prefer culturally distinctive films
```

TasteAudit then resolves the recommendations through Qloo, retrieves cultural evidence, audits them, and evaluates the recommendation set.

The final interface can show:

```text
Cultural Grounding Score
93 / 100

Cultural Coverage
63%

Covered Directions
• New York City
• Drama
• Atmospheric
• Character Driven
• Gritty

Cultural Blind Spots
• Dialogue Driven
• Other evidence-backed directions

Agent
MORE_EVIDENCE → ACCEPTED

Qloo Evidence
Available for grounded recommendations
```

The exact result depends on the live Qloo evidence and the user's submitted context.

---

# Reliability & Safety Principles

TasteAudit is designed around several strict principles.

### Deterministic score authority

The final audit score comes from deterministic logic.

### Evidence provenance

Grounded claims retain references to their underlying Qloo evidence.

### No fabricated Qloo data

The system does not invent:

- Qloo entities
- Entity IDs
- Affinity values
- Cultural relationships
- Evidence references

### Semantic candidate protection

Candidates are checked for semantic compatibility before being accepted into the repair or audit pipeline.

### Bounded autonomous behavior

The agent operates under iteration and action limits.

### Safe failure

Provider failures, ambiguous entities, insufficient evidence, and unresolved recommendations do not silently become fabricated successes.

### Backend-only secrets

Qloo and AI provider credentials remain on the backend and are never exposed to the frontend.

---

# Testing

Run the backend test suite with:

```bash
npm test
```

Or run targeted suites such as:

```bash
cd backend
npx vitest run tests/cultural_coverage.test.ts
```

The project includes coverage for:

- Recommendation parsing
- Qloo resolution
- Evidence normalization
- Deterministic scoring
- Constraint handling
- Candidate compatibility
- Agent decisions
- Repair behavior
- Cultural Coverage
- Blind-spot filtering
- Multi-recommendation auditing
- Result integrity
- Regression scenarios

Production builds can be verified with:

```bash
npm run build
```

---

# Design Philosophy

TasteAudit AI follows three core principles:

### 1. Evidence over confidence

A confident explanation is not evidence.

### 2. Verification over generation

The system is not trying to become another recommendation generator.

It verifies what an AI has already recommended.

### 3. Transparency over black-box intelligence

Users should be able to understand:

- What was recommended
- What was verified
- Why it received its score
- What evidence supports it
- What the agent did
- What cultural directions were covered
- What may be missing

---

# Why Qloo?

TasteAudit would not be the same product without Qloo.

A generic language model can generate plausible cultural explanations, but Qloo provides a structured cultural intelligence layer that allows TasteAudit to ground recommendations in relationships between real-world entities and cultural signals.

Qloo is therefore not simply an external API used for enrichment.

It is the **evidence foundation of the verification pipeline**.

---

# Future Roadmap

### Near Term

- Expand supported recommendation domains.
- Improve cultural blind-spot discovery.
- Expand evidence explanations.
- Improve developer-facing API ergonomics.
- Continue strengthening semantic quality across domains.

### Longer Term

We envision TasteAudit as a reusable **cultural verification API for AI products**.

Potential integrations include:

- AI assistants
- Recommendation engines
- Travel applications
- Entertainment platforms
- Dining applications
- Commerce and discovery products
- Personalized AI agents

The goal is to make cultural verification a reusable capability rather than a feature limited to one application.

---

# The Vision

AI can already generate endless recommendations.

The next challenge is making those recommendations **meaningful, explainable, and culturally grounded**.

TasteAudit AI explores what happens when cultural intelligence and evidence are placed between AI generation and the final user.

```text
AI generates
     ↓
Qloo grounds
     ↓
TasteAudit verifies
     ↓
Agent improves when justified
     ↓
User understands why
```

> **Don't Just Recommend. Verify the Taste.**

---

# Built With

- Qloo
- TypeScript
- React
- Vite
- Node.js
- Express.js
- Tailwind CSS
- Artificial Intelligence
- Generative AI
- AI Agents
- Recommendation Systems
- Cultural Intelligence
- Natural Language Processing
- Entity Resolution
- REST APIs
- Vitest

---

# Project

**TasteAudit AI**

Built for the **Qloo Hackathon**.

The project demonstrates how Qloo's cultural intelligence can be used not just to generate recommendations, but to build a **verification and cultural quality layer around AI-generated recommendations**.
