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
- Multi-step crop scan wizard (image upload → soil data → climate data → AI analysis)
- AI crop identification, growth stage detection, disease detection
- Yield prediction and harvest date estimation
- Smart farming recommendations
- Conversational AI chatbot for farming Q&A
- Dashboard with charts (crop breakdown, health distribution)
- Scan history with filtering

**Pages**: `/` (home), `/dashboard`, `/scan/new`, `/scan/:id`, `/history`, `/chat`

### API Server (`artifacts/api-server`)

Express 5 API server with routes for:
- `GET/POST /api/crops` — crop scan CRUD
- `POST /api/crops/:id/analyze` — AI analysis trigger
- `GET/POST /api/soil` — soil data
- `GET/POST /api/climate` — climate data
- `GET /api/recommendations` — farming recommendations
- `POST /api/chat` — AI chatbot
- `GET /api/dashboard/summary` — dashboard stats
- `GET /api/dashboard/recent` — recent scans
- `GET /api/dashboard/crop-stats` — per-crop analytics

## Database Schema

- `crop_scans` — main scan records with AI analysis results
- `soil_data` — pH, moisture, NPK, organic matter per scan
- `climate_data` — temperature, humidity, rainfall, wind, sunlight per scan
- `recommendations` — AI-generated farming recommendations per scan

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
