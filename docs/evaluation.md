# Evaluation & Auditing Methodology — TasteAudit AI

> Status: Deterministic Scoring Model & Contracts Initialized

## 1. Overview

TasteAudit AI replaces subjective LLM self-evaluation with an empirical, deterministic cultural quality-assurance process. Scores are calculated through explicit weights rather than arbitrary model hallucinations.

## 2. Deterministic Scoring Model

The composite Cultural Grounding Score ($S$) ranges from **0 to 100** and is calculated as a weighted sum of four discrete sub-scores:

$$S = 0.40 \cdot C_{\text{alignment}} + 0.25 \cdot R_{\text{context}} + 0.20 \cdot K_{\text{constraints}} + 0.15 \cdot E_{\text{evidence}}$$

### Weight Breakdown

| Criteria | Weight | Evaluation Basis |
| :--- | :---: | :--- |
| **Cultural Alignment** | **40%** | Statistical taste correlation between recommended entities/tags in Qloo's cultural affinity graph. |
| **Contextual Relevance** | **25%** | Proximity of recommendations to the targeted audience demographic, lifestyle vibe, or geographic setting. |
| **Constraint Compliance** | **20%** | Strict satisfaction of user-specified boundaries (e.g., non-commercial, acoustic, dietary). |
| **Evidence Completeness** | **15%** | Ratio of items verified by empirical Qloo entities versus unverified or unresolved terms. |

## 3. Evidence Classification Standards

Every claim or recommendation item is tagged with an evidence label:
- **`Supported`**: Empirically verified with direct Qloo entity correlation data. *Rule: Never applied unless verified empirical data exists.*
- **`Inferred`**: Secondary association derived through related tags or shared category affinities.
- **`Unverified`**: No corroborating evidence located in the taste graph (potential cultural hallucination).

## 4. Evidence Traceability & Provenance

Every evaluated entity carries a `QlooEvidenceProvenance` record:
- **`entityId` / `tagId`**: The specific Qloo identifier.
- **`qlooType`**: Category classification (e.g., `brand`, `tag`, `media`, `place`).
- **`source`**: Identifies data origin (`qloo-hackathon-api`).
- **`operation`**: API operation invoked (e.g., `find_tags`, `resolve_entity`).
- **`classification`**: `Supported` | `Inferred` | `Unverified`.
- **`retrievedAt`**: ISO 8601 UTC timestamp.
