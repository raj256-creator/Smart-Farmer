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
- Multi-step crop scan wizard with auto crop detection from image (GPT-4o vision)
- Step 1: Upload photo → AI detects crop → user confirms or corrects; manual dropdown fallback
- Back navigation and step indicator clickable for visited steps
- AI crop identification, growth stage detection, disease detection, yield/harvest prediction
- Smart farming recommendations per scan
- Persistent conversation-based AI chatbot with full history sidebar
- Dashboard with charts (crop breakdown, health distribution)
- Scan history with Clear All feature

**AI Chatbot (Chat page)**:
- Sidebar shows all past conversations (stored in DB), collapsible
- Each conversation maintains full message history; AI uses prior context
- Structured responses: Understanding the Problem, Key Insights, Solution, Prevention Tips, Extra Advice
- Suggestion chips after each AI reply for quick follow-up questions
- Conversations auto-created when user sends first message; title = first message text
- System prompt: detailed agriculture assistant with 7 capabilities (crop guidance, disease/pest support, smart recommendations, context awareness, structured responses, knowledge base, continuous improvement)

**Pages**: `/` (home), `/dashboard`, `/scan/new`, `/scan/:id`, `/history`, `/chat`

### API Server (`artifacts/api-server`)

Express 5 API server with routes for:
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

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
