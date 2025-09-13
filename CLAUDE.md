# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Telegram Bot with Mini App built for CloudFlare Workers Platform. It's a fleamarket/marketplace application that allows users to interact via both Telegram chat and a React web interface.

**Tech Stack:**
- **Backend:** CloudFlare Worker (Hono framework)
- **Database:** CloudFlare D1 (SQLite) with Drizzle ORM
- **Storage:** CloudFlare KV + R2 for images
- **Frontend:** React + Vite + TailwindCSS
- **Bot Framework:** Grammy (Telegram bot framework)
- **Language:** TypeScript throughout


## Development Commands

**Essential commands for development:**
```bash
# Quick start - starts everything
make dev-start

# Local testing with auth bypass (no Telegram needed)
make dev-local

# Stop all services
make dev-stop

# Run tests
make test                 # All tests
make test-backend        # Backend only
make test-webapp         # Frontend only

# Build and type checking
make build               # Build TypeScript backend
make typecheck          # Type check both backend and frontend
make lint               # Lint code
make format             # Format code

# Database operations
make db-reset           # Reset local database
make db-migrate-local   # Apply migrations locally
make db-studio          # Open Drizzle Studio

# Health check
make health             # Test all services
```

**Individual service control:**
```bash
make worker-start       # Start CloudFlare Worker only
make webapp-start       # Start React app only
make tunnel-start       # Start public tunnel only
```

## Code Architecture

### Backend Structure (`src/`)
- **`index.ts`** - Main Hono app with middleware, CORS, and route definitions
- **`bot/`** - Telegram bot logic (Grammy wrapper, message processing, crypto utils)
- **`db/`** - Database layer with Drizzle ORM schema and migrations
- **`kv/`** - CloudFlare KV storage wrapper
- **`r2/`** - CloudFlare R2 image storage wrapper

### Frontend Structure (`webapp/src/`)
- **`main.tsx`** - React entry point
- **`App.tsx`** - Main app component with Telegram WebApp integration
- **`components/`** - Reusable React components
- **`router/`** - Routing logic
- **`api.ts`** - Backend API client functions

### Key Architectural Patterns

**Authentication Flow:**
1. Frontend gets Telegram `initData` from WebApp API
2. Backend validates initData hash against bot token
3. Returns JWT-like token for subsequent API calls
4. Tokens stored in CloudFlare KV with TTL

**CORS Handling:**
- Supports multiple origins (localhost, pages.dev domains)
- Configured for CloudFlare Pages deployment
- Auth bypass mode for local development

**Database Migrations:**
- Uses Drizzle Kit for schema management
- Migration files in `src/db/migrations/`
- Local and remote migration commands available

## Environment Variables

**Required for development:**
- `INIT_SECRET` - For webhook setup (generate with `openssl rand -hex 24`)
- `TELEGRAM_BOT_TOKEN` - Bot token from @BotFather
- `TELEGRAM_WEBHOOK_SECRET` - Webhook validation token

**Development features:**
- `VITE_DEV_BYPASS_AUTH=true` - Bypass Telegram auth for local testing
- `VITE_BACKEND_URL` - Backend URL for frontend API calls

## Common Development Patterns

**Adding new API endpoints:**
1. Add route to `src/index.ts`
2. Use `AppContext` for database/storage access
3. Include CORS headers in responses
4. Add corresponding client function in `webapp/src/api.ts`

**Database changes:**
1. Modify schema in `src/db/schema.ts`
2. Generate migration: `make db-generate`
3. Apply locally: `make db-migrate-local`

**Testing:**
- Backend tests use Vitest with `SKIP_INTEGRATION_TESTS=1`
- Frontend tests use Vitest + Testing Library
- Use `make test-local` for full local environment testing

## Local Development Modes

**Full Development (`make dev-start`):**
- Starts worker, webapp, tunnel, sets up webhook
- Requires Telegram bot token and webhook setup

**Local Only (`make dev-local`):**
- Auth bypass enabled - no Telegram integration needed
- Perfect for UI/API development
- Access at `http://localhost:5173/#/me`

**Health Monitoring:**
- `/health` endpoint reports status of all services
- `make health` command for quick health check
- `make status` shows running service PIDs