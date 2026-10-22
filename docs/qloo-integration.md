# Qloo Integration Guide

> Status: Pending Implementation — Early Development

## 1. Overview

Documentation covering the integration between TasteAudit AI and the Qloo Cultural AI API.

## 2. API Configuration

- **Base URL:** Defined via server configuration (`QLOO_BASE_URL`).
- **Authentication:** Authenticated via Qloo API key (`QLOO_API_KEY`), stored exclusively server-side.

## 3. Planned Endpoints & Usage

*Specific Qloo API endpoints (e.g., entity search, tag resolution, correlation/affinity queries) and request schemas will be detailed as integration modules are developed.*

## 4. Security & Credential Isolation

All requests to Qloo are executed exclusively from backend services to ensure API credentials are never exposed to client applications.
