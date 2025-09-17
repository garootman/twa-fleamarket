# Telegram Marketplace - CloudFlare Workers Platform

A comprehensive Telegram marketplace application built on [CloudFlare Workers Platform](https://workers.cloudflare.com/) with full-featured bot and mini app integration.

🛍️ **Complete marketplace solution with listings, search, and user management**

## Features

### Core Marketplace Features
- 🛍️ **Listing Management** - Create, edit, search, and manage marketplace listings
- 🔍 **Advanced Search** - Full-text search with filters and categories
- 👥 **User Profiles** - Complete user management with ratings and verification
- 🎯 **Categories** - Hierarchical category system for organization
- 🖼️ **Image Upload** - CloudFlare R2 integration for media storage
- 🔝 **Listing Bumping** - Paid listing promotion system
- 🚩 **Moderation** - Content flagging and admin tools
- ⭐ **Premium Features** - Telegram Stars payment integration
- 📱 **Mobile-First** - Optimized for Telegram Mini App experience

### Platform Features
- 🔧 **CloudFlare Workers** - Serverless backend runtime
- 📊 **CloudFlare D1** - SQLite database with SQL queries
- 🗄️ **CloudFlare KV** - Key-value storage for caching
- 📦 **CloudFlare R2** - Object storage for images
- ⚛️ **React + Vite** - Modern frontend with hot reload
- 📝 **TypeScript** - Type safety throughout
- 🤖 **Grammy** - Modern Telegram bot framework
- 🔒 **Drizzle ORM** - Type-safe database operations
- ✅ **Comprehensive Testing** - Unit, integration, performance, and load tests
- 🚀 **Performance Optimized** - Sub-200ms API response times
- 🛠️ **Developer Tools** - Mock users, auth bypass, and debug modes

## Quick Start

### Development

```bash
# Start complete development environment
make dev-start

# Local testing without Telegram (auth bypass)
make dev-local

# Stop everything
make dev-stop

# Show all available commands
make help
```

### Prerequisites

- **Node.js** and npm
- **[Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)** - `npm install -g wrangler`
- **Tunnel service** - [Cloudflared](https://github.com/cloudflare/cloudflared) or [ngrok](https://ngrok.com/) for local development

### Environment Setup

Create `.dev.vars` from `.dev.vars.example`:

```bash
INIT_SECRET=your_secret_here                    # Generate with: openssl rand -hex 24
TELEGRAM_BOT_TOKEN=your_bot_token               # From @BotFather
TELEGRAM_WEBHOOK_SECRET=your_webhook_secret     # Generate with: openssl rand -hex 32
```

## Development Commands

### Essential Commands

| Command          | Description                                  |
| ---------------- | -------------------------------------------- |
| `make dev-start` | Start complete development environment       |
| `make dev-local` | Local testing with auth bypass (no Telegram) |
| `make dev-stop`  | Stop all services                            |
| `make status`    | Show status of running services              |
| `make logs`      | Show recent logs from all services           |

### Build & Test

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `make build`        | Build TypeScript backend             |
| `make typecheck`    | Type check both backend and frontend |
| `make test`         | Run all tests                        |
| `make test-backend` | Backend tests only                   |
| `make test-webapp`  | Frontend tests only                  |
| `make test-unit`    | Unit tests only                      |
| `make test-perf`    | Performance tests only               |
| `make test-load`    | Load testing with Artillery          |
| `make lint`         | Lint code                            |
| `make format`       | Format code                          |

### Database

| Command                 | Description              |
| ----------------------- | ------------------------ |
| `make db-reset`         | Reset local database     |
| `make db-migrate-local` | Apply migrations locally |
| `make db-studio`        | Open Drizzle Studio      |
| `make db-generate`      | Generate new migrations  |

### Services

| Command             | Description                  |
| ------------------- | ---------------------------- |
| `make worker-start` | Start CloudFlare Worker only |
| `make webapp-start` | Start React app only         |
| `make tunnel-start` | Start public tunnel only     |
| `make health`       | Test health endpoint         |

## Architecture

### Backend (`src/`)

- **`index.ts`** - Main Hono app with middleware and routes
- **`bot/`** - Telegram bot logic with Grammy framework
- **`db/`** - Database schema and migrations (Drizzle ORM)
- **`kv/`** - CloudFlare KV storage wrapper
- **`r2/`** - CloudFlare R2 image storage

### Frontend (`webapp/src/`)

- **`main.tsx`** - React entry point
- **`App.tsx`** - Main app with Telegram WebApp integration
- **`components/`** - Reusable React components
- **`api.ts`** - Backend API client

### Testing Architecture (`tests/` & `backend/tests/`)

- **`backend/tests/unit/`** - Unit tests for services and validation logic
- **`backend/tests/performance/`** - API performance tests (sub-200ms requirement)
- **`tests/load-testing/`** - Artillery load testing configurations
- **`tests/e2e/`** - End-to-end browser automation tests
- **`backend/tests/contract/`** - API contract tests
- **`backend/tests/integration/`** - Integration tests for user journeys

## Testing Strategy

### Comprehensive Test Suite

The application includes multiple layers of testing to ensure reliability and performance:

#### Unit Tests
- **Validation Logic**: Input validation, data sanitization, and business rules
- **Auth Service**: Telegram authentication, session management, and user authorization
- **Listing Service**: CRUD operations, search functionality, and content moderation
- **Location**: `backend/tests/unit/`

#### Performance Tests
- **API Response Times**: All endpoints tested to meet <200ms requirement
- **Concurrent Load**: Stress testing with multiple simultaneous requests
- **Performance Monitoring**: Real-time metrics and bottleneck identification
- **Location**: `backend/tests/performance/`

#### Load Testing
- **Artillery Configuration**: Comprehensive load testing scenarios
- **Traffic Patterns**: Realistic user behavior simulation
- **Stress Testing**: Peak load and spike testing
- **Endurance Testing**: Long-running stability tests
- **Location**: `tests/load-testing/`

#### Contract Tests
- **API Compliance**: Ensuring all endpoints match OpenAPI specifications
- **Error Handling**: Comprehensive error scenario testing
- **Authentication**: Security and authorization validation
- **Location**: `backend/tests/contract/`

### Running Tests

```bash
# Run all tests
make test

# Unit tests only
npm run test:unit

# Performance tests only
npm run test:perf

# Load testing
cd tests/load-testing
./run-tests.sh --test-type all

# Contract tests
npm run test:contract
```

### Test Reports

- **Coverage Reports**: Generated automatically with test runs
- **Performance Reports**: Response time analytics and bottleneck identification
- **Load Test Reports**: HTML reports with detailed metrics
- **Continuous Integration**: Automated testing in GitHub Actions

## Marketplace Features

### API Endpoints

#### Authentication
- `POST /api/auth` - Telegram WebApp authentication
- `GET /api/auth/validate` - Session validation
- `POST /api/auth/logout` - User logout

#### Listings
- `GET /api/listings` - Search and browse listings
- `POST /api/listings` - Create new listing
- `GET /api/listings/{id}` - Get listing details
- `PUT /api/listings/{id}` - Update listing
- `DELETE /api/listings/{id}` - Archive listing
- `POST /api/listings/{id}/bump` - Promote listing
- `POST /api/listings/{id}/flag` - Report inappropriate content

#### User Profile
- `GET /api/me` - Get user profile
- `GET /api/me/listings` - Get user's listings
- `PUT /api/me` - Update profile

#### Categories & Search
- `GET /api/categories` - Get category hierarchy
- `GET /api/search` - Advanced search with filters

#### File Upload
- `POST /api/upload` - Upload images to CloudFlare R2

#### Admin (Authorized Users)
- `GET /api/admin/listings` - Moderation queue
- `POST /api/admin/users/{id}/ban` - User management
- `GET /api/admin/blocked-words` - Content filtering

#### Development
- `GET /api/dev/mock-users` - Mock user system
- `POST /api/dev/auth` - Development authentication bypass

### Database Schema

#### Core Entities
- **Users**: Telegram user profiles with ratings and verification
- **Categories**: Hierarchical category system (2-level deep)
- **Listings**: Marketplace items with images, pricing, and metadata
- **Flags**: Content moderation and reporting system
- **Sessions**: User authentication and session management
- **Premium Features**: Paid promotion and featured listings

#### Key Features
- **Search Optimization**: Full-text search with category filters
- **Content Moderation**: Automated and manual content filtering
- **Image Storage**: CloudFlare R2 integration for scalable media
- **Caching Strategy**: KV-based caching for performance
- **Analytics**: View tracking and engagement metrics

### Bot Commands

- `/start` - Welcome message and mini app link
- `/help` - Command reference and support
- `/question` - Contact admin support

### Development Tools

#### Mock User System
- Bypasses Telegram authentication for local development
- Pre-configured test users with various permission levels
- Accessible via `/api/dev/mock-users`

#### Debug Mode
- Detailed logging and error reporting
- Performance metrics collection
- Auth bypass for testing

#### Local Development
```bash
# Access local development mode
http://localhost:5173/#/me

# Test with mock authentication
make dev-local
```

## Deployment

### GitHub Actions Setup

1. **Fork this repository**
2. **Add GitHub Secrets:**
   - `CF_API_TOKEN` - CloudFlare API token
   - `CF_ACCOUNT_ID` - CloudFlare account ID
   - `TELEGRAM_BOT_TOKEN` - Bot token from @BotFather

3. **Run Deploy workflow** in GitHub Actions

### Getting CloudFlare Credentials

**Account ID:**

1. Go to [CloudFlare Workers Dashboard](https://dash.cloudflare.com/?to=/:account/workers)
2. Copy Account ID from right sidebar
3. If no workers exist, create a "Hello World" worker first

**API Token:**

1. Go to [CloudFlare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Create token with permissions:
   - `Account:Account Settings:Read`
   - `Account:CloudFlare Pages:Edit`
   - `Account:D1:Edit`
   - `Account:User Details:Read`
   - `Account:Workers Scripts:Edit`
   - `User:Memberships:Read`
   - `Zone:Workers Routes:Edit`

### Telegram Bot Setup

1. **Create Bot:** Message [@BotFather](https://t.me/BotFather) with `/newbot`
2. **Create Mini App:** Use `/newapp` command (image required, use [placeholder](https://placehold.co/640x360))
3. **Set Mini App URL:** Use the URL provided after deployment

## Local Development Modes

### Full Development (`make dev-start`)

- Complete environment with Telegram integration
- Requires bot token and webhook setup
- Includes tunnel for external access

### Local Only (`make dev-local`)

- **Recommended for development**
- Auth bypass enabled - no Telegram needed
- Perfect for UI/API development
- Access at: `http://localhost:5173/#/me`

### Manual Testing

```bash
# Test health endpoint
make health

# Test local development setup
make test-local
```

## Security Features

- ✅ Webhook signature validation
- ✅ Mini App data signature verification
- ✅ Token-based API authentication
- ✅ CORS locked to specific domains
- ✅ Environment-based configuration

## Tech Stack Details

- **Backend Framework:** [Hono](https://hono.dev/) - Fast web framework
- **Bot Framework:** [Grammy](https://grammy.dev/) - Modern Telegram bot framework
- **Database:** [Drizzle ORM](https://orm.drizzle.team/) + CloudFlare D1 (SQLite)
- **Frontend:** React 18 + Vite + TailwindCSS
- **Telegram Integration:** [@vkruglikov/react-telegram-web-app](https://github.com/vkruglikov/react-telegram-web-app)
- **Testing:** Vitest + Testing Library
- **Type Safety:** TypeScript throughout

## Project Structure

```
├── src/                    # Backend (CloudFlare Worker)
│   ├── index.ts           # Main Hono application
│   ├── bot/               # Telegram bot logic
│   ├── db/                # Database schema & migrations
│   ├── kv/                # KV storage wrapper
│   └── r2/                # R2 image storage
├── webapp/                # Frontend (React + Vite)
│   ├── src/
│   │   ├── main.tsx       # React entry point
│   │   ├── App.tsx        # Main app component
│   │   ├── components/    # UI components
│   │   └── api.ts         # Backend client
├── Makefile              # Development commands
├── wrangler.toml         # CloudFlare Worker config
└── drizzle.config.ts     # Database configuration
```

## Known Issues

- **npm audit warnings:** Development dependencies may show moderate vulnerabilities. These affect only local development, not production builds.
