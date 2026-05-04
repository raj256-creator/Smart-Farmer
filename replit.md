# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Artifacts

### AI Smart Farming (`artifacts/smart-farming`)

React + Vite web app for AI-powered crop monitoring.

**Supported crops**: Mango, Dragon Fruit, Chikoo (Sapota), Pomegranate, Mulberry

**Features**:
- Home Page: 5 farm cards with name, location, crops, status, acreage; Add/Edit/Delete/Open Farm
- Farm Dashboard (`/farms/:id`): AI-generated health score, crop health map, weather/soil insights, alerts, performance trend chart, AI insights panel
- AI Analytics (`/farms/:id/analytics`): Yield prediction by crop, risk alerts with action items, crop profitability comparison table, 12-month trend graphs, AI recommendations
- Yield Optimizer (`/farms/:id/yield`): Calculator with acreage + crop + density inputs; outputs plant count, yield, revenue, optimal distribution pie chart, crop breakdown table, planting suggestions
- Multi-step crop scan wizard with auto crop detection from image (GPT-4o vision)
- Persistent conversation-based AI chatbot with full history sidebar
- Global dashboard with charts (crop breakdown, health distribution)
- Scan history with Clear All feature

**AI Chatbot (Chat page)**:
- Sidebar shows all past conversations (stored in DB), collapsible
- Each conversation maintains full message history; AI uses prior context
- Structured responses: Understanding the Problem, Key Insights, Solution, Prevention Tips, Extra Advice
- Suggestion chips after each AI reply for quick follow-up questions
- System prompt: detailed 7-capability agriculture assistant

**Yield Optimizer logic**:
- Crop density data per crop (low/medium/high): plants/acre, yield kg/plant, price INR/kg, spacing
- Crops: Mango (100 plants/acre medium), Dragon Fruit (600), Chikoo (100), Pomegranate (200), Mulberry (1500)
- Calculates: total plants, total yield kg, estimated revenue INR
- Optimal distribution ranked by revenue per acre

**Pages**: `/` (farms home), `/farms/:id`, `/farms/:id/analytics`, `/farms/:id/yield`, `/dashboard`, `/scan/new`, `/scan/:id`, `/history`, `/chat`

### API Server (`artifacts/api-server`)

Express 5 API server with routes for:
- `GET /api/weather?location=...&moisture=...&humidity=...` — Live weather + 5-day forecast + agri insights (OpenWeatherMap, 30-min cache)
- `GET/POST /api/crops` — crop scan CRUD
- `POST /api/crops/:id/analyze` — GPT-4o AI analysis
- `POST /api/crops/detect-image` — GPT-4o crop detection from image
- `GET/POST /api/soil` — soil data
- `GET/POST /api/climate` — climate data
- `GET /api/recommendations` — farming recommendations
- `POST /api/chat` — legacy single-shot AI chatbot
- `GET/POST /api/conversations` — list/create conversations
- `DELETE /api/conversations/:id` — delete conversation
- `GET/POST /api/conversations/:id/messages` — get/send messages in a conversation
- `GET/POST /api/farms` — list/create farms
- `GET/PUT/DELETE /api/farms/:id` — get/update/delete a farm
- `GET /api/farms/:id/dashboard` — AI-generated farm dashboard (GPT-4o JSON mode)
- `GET /api/farms/:id/analytics` — AI analytics (yield, risks, comparison, trend)
- `POST /api/farms/:id/yield-optimization` — deterministic yield calculator with AI context
- `GET /api/dashboard/summary` — dashboard stats
- `GET /api/dashboard/recent` — recent scans
- `GET /api/dashboard/crop-stats` — per-crop analytics

## Database Schema

- `crop_scans` — main scan records with AI analysis results
- `soil_data` — pH, moisture, NPK, organic matter per scan
- `climate_data` — temperature, humidity, rainfall, wind, sunlight per scan
- `recommendations` — AI-generated farming recommendations per scan
- `conversations` — chat conversation sessions (title, createdAt)
- `messages` — individual messages per conversation (role: user/assistant, content, createdAt)
- `farms` — farm records (name, location, description, status, acreage, crops JSON array, createdAt, updatedAt)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
