# Telegram Bot + Mini App on CloudFlare Workers

A batteries-included template for building [Telegram Bots](https://core.telegram.org/bots) and [Telegram Mini Apps](https://core.telegram.org/bots/webapps) on [CloudFlare Workers Platform](https://workers.cloudflare.com/).

🚅 **Fork to running Telegram bot with Mini App in 5 minutes**

## Features

- 🔧 **CloudFlare Workers** - Serverless backend runtime
- 📊 **CloudFlare D1** - SQLite database with SQL queries
- 🗄️ **CloudFlare KV** - Key-value storage for sessions
- 📦 **CloudFlare R2** - Object storage for images
- ⚛️ **React + Vite** - Modern frontend with hot reload
- 📝 **TypeScript** - Type safety throughout
- 🤖 **Grammy** - Modern Telegram bot framework
- 🔒 **Drizzle ORM** - Type-safe database operations
- ✅ **GitHub Actions** - Automated deployment
- 🛠️ **Comprehensive Makefile** - One-command development

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
| Command | Description |
|---------|-------------|
| `make dev-start` | Start complete development environment |
| `make dev-local` | Local testing with auth bypass (no Telegram) |
| `make dev-stop` | Stop all services |
| `make status` | Show status of running services |
| `make logs` | Show recent logs from all services |

### Build & Test
| Command | Description |
|---------|-------------|
| `make build` | Build TypeScript backend |
| `make typecheck` | Type check both backend and frontend |
| `make test` | Run all tests |
| `make test-backend` | Backend tests only |
| `make test-webapp` | Frontend tests only |
| `make lint` | Lint code |
| `make format` | Format code |

### Database
| Command | Description |
|---------|-------------|
| `make db-reset` | Reset local database |
| `make db-migrate-local` | Apply migrations locally |
| `make db-studio` | Open Drizzle Studio |
| `make db-generate` | Generate new migrations |

### Services
| Command | Description |
|---------|-------------|
| `make worker-start` | Start CloudFlare Worker only |
| `make webapp-start` | Start React app only |
| `make tunnel-start` | Start public tunnel only |
| `make health` | Test health endpoint |

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