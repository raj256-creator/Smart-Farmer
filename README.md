# AI Smart Farming

An AI-powered smart farming platform that helps farmers monitor crop health, predict yields, analyze risks, and get expert advice — all in one place.

---

## Features

### Farm Management
- View all your farms with name, location, crops, status, and acreage
- Add, edit, delete, and open individual farms
- Supports crops: **Mango, Dragon Fruit, Chikoo (Sapota), Pomegranate, Mulberry**

### Farm Dashboard
- AI-generated farm health score
- Crop health map with weather and soil insights
- Alerts and performance trend charts
- AI insights panel with actionable recommendations

### AI Analytics
- Yield prediction by crop
- Risk alerts with action items
- Crop profitability comparison table
- 12-month trend graphs
- AI-powered strategic recommendations

### Yield Optimizer
- Input acreage, crop type, and planting density
- Get instant calculations: plant count, total yield (kg), estimated revenue (INR)
- Optimal crop distribution pie chart and breakdown table
- Planting suggestions for maximizing profit

### Crop Scan Wizard
- Multi-step scan flow with image upload
- Auto crop detection using GPT-4o Vision
- Full scan history with Clear All

### AI Chatbot (3 Expert Modes)
- **General Mode** — Understanding the problem, key insights, solution, prevention tips
- **Agro-Technical Mode** — Technical diagnosis, scientific analysis, ICAR treatment protocols, dosages
- **Analyst Mode** — Market overview, MSP/APMC prices, ROI, yield & revenue projections, risk assessment
- Full conversation history stored in the database
- Collapsible sidebar showing all past conversations

### Language & Accessibility
- **12 Indian languages**: Hindi, Marathi, Telugu, Tamil, Kannada, Malayalam, Bengali, Gujarati, Punjabi, Odia, Urdu, English + Auto-detect
- AI responds in native script of the selected language
- **Voice input** via Web Speech API (SpeechRecognition)
- **Voice output** via SpeechSynthesis
- **Image upload** — attach a field photo and the AI analyzes it for crop identification, symptoms, diseases, and pests (GPT-4o multimodal)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript |
| Backend | Express 5 + TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| AI | OpenAI GPT-4o (vision + JSON mode) |
| Weather | OpenWeatherMap API |
| Validation | Zod |
| API Codegen | Orval (from OpenAPI spec) |
| Package Manager | pnpm workspaces (monorepo) |

---

## Project Structure

```
├── artifacts/
│   ├── smart-farming/     # React + Vite frontend
│   └── api-server/        # Express 5 API backend
├── lib/                   # Shared libraries (DB schema, API spec)
├── scripts/               # Utility scripts
├── pnpm-workspace.yaml    # Workspace config
└── tsconfig.base.json     # Shared TypeScript config
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/weather` | Live weather + 5-day forecast + agri insights |
| GET/POST | `/api/farms` | List / create farms |
| GET/PUT/DELETE | `/api/farms/:id` | Get / update / delete a farm |
| GET | `/api/farms/:id/dashboard` | AI-generated farm dashboard |
| GET | `/api/farms/:id/analytics` | AI analytics (yield, risks, trends) |
| POST | `/api/farms/:id/yield-optimization` | Yield calculator with AI context |
| GET/POST | `/api/crops` | Crop scan CRUD |
| POST | `/api/crops/:id/analyze` | GPT-4o AI analysis |
| POST | `/api/crops/detect-image` | GPT-4o crop detection from image |
| GET/POST | `/api/conversations` | List / create chat conversations |
| DELETE | `/api/conversations/:id` | Delete a conversation |
| GET/POST | `/api/conversations/:id/messages` | Get / send messages |
| GET | `/api/dashboard/summary` | Dashboard stats |
| GET | `/api/dashboard/crop-stats` | Per-crop analytics |

---

## Database Schema

- `farms` — Farm records with name, location, status, acreage, and crops
- `crop_scans` — Scan records with AI analysis results
- `soil_data` — pH, moisture, NPK, organic matter per scan
- `climate_data` — Temperature, humidity, rainfall, wind, sunlight per scan
- `recommendations` — AI-generated farming recommendations per scan
- `conversations` — Chat conversation sessions
- `messages` — Individual messages per conversation (user / assistant)

---

## Getting Started

### Prerequisites
- Node.js 24+
- pnpm
- PostgreSQL database

### Install dependencies
```bash
pnpm install
```

### Set environment variables
Create a `.env` file or set secrets in your environment:
```
DATABASE_URL=your_postgresql_connection_string
OPENAI_API_KEY=your_openai_api_key
OPENWEATHERMAP_API_KEY=your_openweathermap_api_key
```

### Push database schema
```bash
pnpm --filter @workspace/db run push
```

### Run the app
```bash
# Start the API server
pnpm --filter @workspace/api-server run dev

# Start the frontend
pnpm --filter @workspace/smart-farming run dev
```

### Useful commands
```bash
pnpm run typecheck                          # Full TypeScript check
pnpm run build                              # Typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen  # Regenerate API hooks from OpenAPI spec
```

---

## Pages

| Route | Description |
|---|---|
| `/` | Farms home — list of all farms |
| `/farms/:id` | Farm dashboard |
| `/farms/:id/analytics` | AI analytics |
| `/farms/:id/yield` | Yield optimizer |
| `/dashboard` | Global dashboard with charts |
| `/scan/new` | New crop scan wizard |
| `/scan/:id` | Scan result detail |
| `/history` | Full scan history |
| `/chat` | AI chatbot |

---

## License

MIT
