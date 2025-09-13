# Telegram WebApp Fleamarket - Development Environment
# =====================================================

# Configuration
WORKER_PORT ?= 8787
WEBAPP_PORT ?= 5173
TUNNEL_SERVICE ?= cloudflared
TUNNEL_NAME ?= twa-fleamarket

# Colors for output
RED := \033[31m
GREEN := \033[32m
YELLOW := \033[33m
BLUE := \033[34m
MAGENTA := \033[35m
CYAN := \033[36m
RESET := \033[0m

# Check if required tools are installed
.PHONY: check-deps
check-deps:
	@echo "$(BLUE)Checking dependencies...$(RESET)"
	@command -v node >/dev/null 2>&1 || { echo "$(RED)Error: Node.js is required but not installed.$(RESET)" >&2; exit 1; }
	@command -v npm >/dev/null 2>&1 || { echo "$(RED)Error: npm is required but not installed.$(RESET)" >&2; exit 1; }
	@command -v wrangler >/dev/null 2>&1 || { echo "$(RED)Error: wrangler is required but not installed. Run: npm install -g wrangler$(RESET)" >&2; exit 1; }
	@echo "$(GREEN)✓ All dependencies are installed$(RESET)"

# Install project dependencies
.PHONY: install
install: check-deps
	@echo "$(BLUE)Installing root dependencies...$(RESET)"
	@npm install
	@echo "$(BLUE)Installing webapp dependencies...$(RESET)"
	@cd webapp && npm install
	@echo "$(GREEN)✓ Dependencies installed$(RESET)"

# Build TypeScript backend
.PHONY: build
build:
	@echo "$(BLUE)Building TypeScript backend...$(RESET)"
	@npm run build
	@echo "$(GREEN)✓ Backend built successfully$(RESET)"

# Type check both backend and frontend
.PHONY: typecheck
typecheck:
	@echo "$(BLUE)Type checking backend...$(RESET)"
	@npm run build
	@echo "$(BLUE)Type checking webapp...$(RESET)"
	@cd webapp && npm run type-check
	@echo "$(GREEN)✓ Type checking completed$(RESET)"

# Run tests for backend
.PHONY: test-backend
test-backend:
	@echo "$(BLUE)Running backend tests...$(RESET)"
	@SKIP_INTEGRATION_TESTS=1 npm run test:run
	@echo "$(GREEN)✓ Backend tests completed$(RESET)"

# Run tests for webapp
.PHONY: test-webapp
test-webapp:
	@echo "$(BLUE)Running webapp tests...$(RESET)"
	@cd webapp && npm run test:run
	@echo "$(GREEN)✓ Webapp tests completed$(RESET)"

# Run all tests
.PHONY: test
test: test-backend test-webapp
	@echo "$(GREEN)✓ All tests completed$(RESET)"

# Start webapp with auth bypass enabled for local testing
.PHONY: webapp-dev-bypass
webapp-dev-bypass:
	@echo "$(BLUE)Starting webapp with auth bypass enabled...$(RESET)"
	@echo "$(YELLOW)⚠️  Auth bypass is enabled - this bypasses Telegram authentication$(RESET)"
	@cd webapp && VITE_DEV_BYPASS_AUTH=true VITE_BACKEND_URL=http://localhost:$(WORKER_PORT) npm run dev

# Start both worker and webapp with auth bypass for local testing
.PHONY: dev-local
dev-local: build
	@echo "$(BLUE)Starting local development with auth bypass...$(RESET)"
	@echo "$(YELLOW)⚠️  Auth bypass is enabled - this bypasses Telegram authentication$(RESET)"
	@echo "$(BLUE)Starting worker...$(RESET)"
	@npm run dev > worker.log 2>&1 & \
	echo $$! > worker.pid && \
	echo "$(GREEN)✓ Worker started (PID: $$(cat worker.pid))$(RESET)"
	@echo "$(BLUE)Waiting for worker to start...$(RESET)"
	@sleep 3
	@echo "$(BLUE)Starting webapp with auth bypass...$(RESET)"
	@cd webapp && VITE_DEV_BYPASS_AUTH=true VITE_BACKEND_URL=http://localhost:$(WORKER_PORT) npm run dev > ../webapp.log 2>&1 & \
	echo $$! > webapp.pid && \
	echo "$(GREEN)✓ Webapp started with auth bypass (PID: $$(cat webapp.pid))$(RESET)"
	@echo ""
	@echo "$(GREEN)🚀 Local development ready!$(RESET)"
	@echo "$(CYAN)Worker (API):     http://localhost:$(WORKER_PORT)$(RESET)"
	@echo "$(CYAN)Webapp (UI):      http://localhost:$(WEBAPP_PORT)$(RESET)"
	@echo "$(CYAN)Me Page:          http://localhost:$(WEBAPP_PORT)/#/me$(RESET)"
	@echo ""
	@echo "$(YELLOW)Auth bypass is ENABLED - you can test without Telegram$(RESET)"
	@echo "$(YELLOW)To stop: make dev-stop$(RESET)"

# Test local development setup
.PHONY: test-local
test-local: build
	@echo "$(BLUE)Testing local development setup...$(RESET)"
	@echo "$(BLUE)Starting worker...$(RESET)"
	@npm run dev > worker.log 2>&1 & \
	echo $$! > worker.pid
	@sleep 3
	@echo "$(BLUE)Testing worker endpoint...$(RESET)"
	@curl -s -f http://localhost:$(WORKER_PORT)/ > /dev/null && \
	echo "$(GREEN)✓ Worker is responding$(RESET)" || \
	{ echo "$(RED)✗ Worker is not responding$(RESET)"; make dev-stop; exit 1; }
	@echo "$(BLUE)Starting webapp with auth bypass...$(RESET)"
	@cd webapp && VITE_DEV_BYPASS_AUTH=true VITE_BACKEND_URL=http://localhost:$(WORKER_PORT) npm run dev > ../webapp.log 2>&1 & \
	echo $$! > webapp.pid
	@sleep 5
	@echo "$(BLUE)Testing webapp endpoint...$(RESET)"
	@curl -s -f http://localhost:$(WEBAPP_PORT)/ > /dev/null && \
	echo "$(GREEN)✓ Webapp is responding$(RESET)" || \
	{ echo "$(RED)✗ Webapp is not responding$(RESET)"; make dev-stop; exit 1; }
	@echo "$(GREEN)✓ Local development setup is working$(RESET)"
	@echo "$(CYAN)You can now visit: http://localhost:$(WEBAPP_PORT)$(RESET)"
	@echo "$(CYAN)Me Page: http://localhost:$(WEBAPP_PORT)/#/me$(RESET)"
	@echo "$(YELLOW)Run 'make dev-stop' when finished$(RESET)"

# Test health endpoint with local worker
.PHONY: health
health: build
	@echo "$(BLUE)Testing health endpoint...$(RESET)"
	@if [ -f worker.pid ] && kill -0 $$(cat worker.pid) 2>/dev/null; then \
		echo "$(GREEN)✓ Worker already running$(RESET)"; \
		WORKER_RUNNING=true; \
	else \
		echo "$(BLUE)Starting worker for health check...$(RESET)"; \
		npm run dev > worker.log 2>&1 & \
		echo $$! > worker.pid; \
		sleep 4; \
		WORKER_RUNNING=false; \
	fi; \
	echo "$(BLUE)Fetching health status...$(RESET)"; \
	HEALTH_RESPONSE=$$(curl -s -w "HTTP_CODE:%{http_code}" http://localhost:$(WORKER_PORT)/health); \
	HTTP_CODE=$$(echo "$$HEALTH_RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2); \
	HEALTH_JSON=$$(echo "$$HEALTH_RESPONSE" | sed 's/HTTP_CODE:[0-9]*$$//'); \
	echo "$(CYAN)=== Health Check Results ===$(RESET)"; \
	echo "$(YELLOW)HTTP Status: $$HTTP_CODE$(RESET)"; \
	echo "$$HEALTH_JSON" | python3 -m json.tool 2>/dev/null || echo "$$HEALTH_JSON"; \
	if [ "$$HTTP_CODE" = "200" ]; then \
		echo "$(GREEN)✓ All services healthy$(RESET)"; \
	elif [ "$$HTTP_CODE" = "503" ]; then \
		echo "$(RED)✗ Some services unhealthy$(RESET)"; \
	else \
		echo "$(RED)✗ Health check failed$(RESET)"; \
	fi; \
	if [ "$$WORKER_RUNNING" = "false" ]; then \
		echo "$(YELLOW)Stopping worker...$(RESET)"; \
		make worker-stop > /dev/null 2>&1; \
	fi

# Lint and format code
.PHONY: lint
lint:
	@echo "$(BLUE)Linting project...$(RESET)"
	@npm run lint
	@echo "$(GREEN)✓ Linting completed$(RESET)"

.PHONY: format
format:
	@echo "$(BLUE)Formatting project...$(RESET)"
	@npm run format
	@echo "$(GREEN)✓ Formatting completed$(RESET)"

# Generate database migrations
.PHONY: db-generate
db-generate:
	@echo "$(BLUE)Generating database migrations...$(RESET)"
	@npm run db:generate
	@echo "$(GREEN)✓ Migrations generated$(RESET)"

# Push schema changes to database (for development)
.PHONY: db-push
db-push:
	@echo "$(BLUE)Pushing schema to database...$(RESET)"
	@npm run db:push
	@echo "$(GREEN)✓ Schema pushed$(RESET)"

# Apply migrations to local database
.PHONY: db-migrate-local
db-migrate-local:
	@echo "$(BLUE)Applying migrations to local database...$(RESET)"
	@wrangler d1 execute DB --file src/db/migrations/0000_yellow_roulette.sql --local
	@wrangler d1 execute DB --file src/db/migrations/0001_mixed_red_wolf.sql --local
	@echo "$(GREEN)✓ Local database migrated$(RESET)"

# Apply migrations to remote database
.PHONY: db-migrate-remote
db-migrate-remote:
	@echo "$(BLUE)Applying migrations to remote database...$(RESET)"
	@wrangler d1 execute DB --file src/db/migrations/0000_yellow_roulette.sql --remote
	@wrangler d1 execute DB --file src/db/migrations/0001_mixed_red_wolf.sql --remote
	@echo "$(GREEN)✓ Remote database migrated$(RESET)"

# Initialize local database (legacy - now uses migrations)
.PHONY: db-init
db-init: db-migrate-local
	@echo "$(GREEN)✓ Database initialized with migrations$(RESET)"

# Drop local database (legacy - use migrations instead)
.PHONY: db-drop
db-drop:
	@echo "$(YELLOW)Legacy SQL files removed. Use 'make db-reset' for full reset.$(RESET)"
	@echo "$(YELLOW)To manually drop tables, use: wrangler d1 execute DB --command 'DROP TABLE IF EXISTS tokens; DROP TABLE IF EXISTS users;' --local$(RESET)"

# Reset local database (manual drop + migrate)
.PHONY: db-reset
db-reset:
	@echo "$(YELLOW)Manually dropping database tables...$(RESET)"
	@wrangler d1 execute DB --command "DROP TABLE IF EXISTS tokens; DROP TABLE IF EXISTS users;" --local || echo "$(YELLOW)Tables may not exist$(RESET)"
	@make db-migrate-local
	@echo "$(GREEN)✓ Database reset completed$(RESET)"

# Open Drizzle Studio for database inspection
.PHONY: db-studio
db-studio:
	@echo "$(BLUE)Opening Drizzle Studio...$(RESET)"
	@npm run db:studio

# Start tunnel (requires cloudflared or similar)
.PHONY: tunnel-start
tunnel-start:
	@if command -v cloudflared >/dev/null 2>&1; then \
		echo "$(BLUE)Starting cloudflared tunnel...$(RESET)"; \
		cloudflared tunnel --url http://localhost:$(WORKER_PORT) > tunnel.log 2>&1 & \
		echo $$! > tunnel.pid; \
		sleep 3; \
		TUNNEL_URL=$$(grep -o 'https://[^[:space:]]*\.trycloudflare\.com' tunnel.log | head -1); \
		if [ -n "$$TUNNEL_URL" ]; then \
			echo "$(GREEN)✓ Tunnel started at: $$TUNNEL_URL$(RESET)"; \
			echo "$$TUNNEL_URL" > .tunnel_url; \
		else \
			echo "$(RED)Failed to get tunnel URL$(RESET)"; \
			cat tunnel.log; \
		fi; \
	elif command -v ngrok >/dev/null 2>&1; then \
		echo "$(BLUE)Starting ngrok tunnel...$(RESET)"; \
		ngrok http $(WORKER_PORT) --log=stdout > tunnel.log 2>&1 & \
		echo $$! > tunnel.pid; \
		sleep 5; \
		TUNNEL_URL=$$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url' | sed 's/http:/https:/'); \
		if [ -n "$$TUNNEL_URL" ] && [ "$$TUNNEL_URL" != "null" ]; then \
			echo "$(GREEN)✓ Tunnel started at: $$TUNNEL_URL$(RESET)"; \
			echo "$$TUNNEL_URL" > .tunnel_url; \
		else \
			echo "$(RED)Failed to get tunnel URL$(RESET)"; \
			cat tunnel.log; \
		fi; \
	else \
		echo "$(RED)Error: No tunnel service found. Install cloudflared or ngrok$(RESET)"; \
		echo "$(YELLOW)Install cloudflared: brew install cloudflared$(RESET)"; \
		echo "$(YELLOW)Or install ngrok: brew install ngrok$(RESET)"; \
		exit 1; \
	fi

# Stop tunnel
.PHONY: tunnel-stop
tunnel-stop:
	@if [ -f tunnel.pid ]; then \
		echo "$(YELLOW)Stopping tunnel...$(RESET)"; \
		kill $$(cat tunnel.pid) 2>/dev/null || echo "$(YELLOW)Tunnel process not found$(RESET)"; \
		rm -f tunnel.pid tunnel.log .tunnel_url; \
		echo "$(GREEN)✓ Tunnel stopped$(RESET)"; \
	else \
		echo "$(YELLOW)No tunnel process found$(RESET)"; \
	fi

# Setup webhook for development bot
.PHONY: webhook-setup
webhook-setup:
	@if [ ! -f .tunnel_url ]; then \
		echo "$(RED)Error: No tunnel URL found. Start tunnel first with 'make tunnel-start'$(RESET)"; \
		exit 1; \
	fi
	@TUNNEL_URL=$$(cat .tunnel_url); \
	if [ -z "$$TUNNEL_URL" ]; then \
		echo "$(RED)Error: Empty tunnel URL$(RESET)"; \
		exit 1; \
	fi; \
	echo "$(BLUE)Setting up webhook for dev bot...$(RESET)"; \
	echo "$(CYAN)Tunnel URL: $$TUNNEL_URL$(RESET)"; \
	if [ -z "$$INIT_SECRET" ]; then \
		echo "$(RED)Error: INIT_SECRET environment variable not set$(RESET)"; \
		echo "$(YELLOW)Set it with: export INIT_SECRET=your_secret_here$(RESET)"; \
		exit 1; \
	fi; \
	echo "$(BLUE)Sending webhook setup request...$(RESET)"; \
	curl -X POST -H "Authorization: Bearer $$INIT_SECRET" \
		-H "Content-Type: application/json" \
		-d "{\"externalUrl\": \"$$TUNNEL_URL\"}" \
		--max-time 10 \
		--retry 3 \
		--retry-delay 2 \
		--fail \
		-v \
		"http://localhost:$(WORKER_PORT)/init" && \
	echo "$(GREEN)✓ Webhook setup completed$(RESET)" || \
	echo "$(RED)✗ Webhook setup failed$(RESET)"

# Start worker in development mode
.PHONY: worker-start
worker-start: build
	@echo "$(BLUE)Starting Cloudflare Worker in development mode...$(RESET)"
	@npm run dev > worker.log 2>&1 & \
	echo $$! > worker.pid && \
	echo "$(GREEN)✓ Worker started (PID: $$(cat worker.pid))$(RESET)" && \
	echo "$(CYAN)Worker logs: tail -f worker.log$(RESET)"

# Stop worker
.PHONY: worker-stop
worker-stop:
	@if [ -f worker.pid ]; then \
		echo "$(YELLOW)Stopping worker...$(RESET)"; \
		kill $$(cat worker.pid) 2>/dev/null || echo "$(YELLOW)Worker process not found$(RESET)"; \
		rm -f worker.pid; \
		echo "$(GREEN)✓ Worker stopped$(RESET)"; \
	else \
		echo "$(YELLOW)No worker process found$(RESET)"; \
	fi
	@echo "$(YELLOW)Killing any orphaned workerd processes...$(RESET)"
	@pkill -f workerd 2>/dev/null || echo "$(YELLOW)No workerd processes found$(RESET)"

# Start webapp in development mode
.PHONY: webapp-start
webapp-start:
	@echo "$(BLUE)Starting webapp development server...$(RESET)"
	@cd webapp && VITE_BACKEND_URL=http://localhost:$(WORKER_PORT) npm run dev > ../webapp.log 2>&1 & \
	echo $$! > webapp.pid && \
	echo "$(GREEN)✓ Webapp started (PID: $$(cat webapp.pid))$(RESET)" && \
	echo "$(CYAN)Webapp URL: http://localhost:$(WEBAPP_PORT)$(RESET)" && \
	echo "$(CYAN)Webapp logs: tail -f webapp.log$(RESET)"

# Stop webapp
.PHONY: webapp-stop
webapp-stop:
	@if [ -f webapp.pid ]; then \
		echo "$(YELLOW)Stopping webapp...$(RESET)"; \
		kill $$(cat webapp.pid) 2>/dev/null || echo "$(YELLOW)Webapp process not found$(RESET)"; \
		rm -f webapp.pid; \
		echo "$(GREEN)✓ Webapp stopped$(RESET)"; \
	else \
		echo "$(YELLOW)No webapp process found$(RESET)"; \
	fi

# Show service status
.PHONY: status
status:
	@echo "$(BLUE)=== Service Status ===$(RESET)"
	@if [ -f worker.pid ] && kill -0 $$(cat worker.pid) 2>/dev/null; then \
		echo "$(GREEN)✓ Worker: Running (PID: $$(cat worker.pid))$(RESET)"; \
	else \
		echo "$(RED)✗ Worker: Stopped$(RESET)"; \
	fi
	@if [ -f webapp.pid ] && kill -0 $$(cat webapp.pid) 2>/dev/null; then \
		echo "$(GREEN)✓ Webapp: Running (PID: $$(cat webapp.pid))$(RESET)"; \
	else \
		echo "$(RED)✗ Webapp: Stopped$(RESET)"; \
	fi
	@if [ -f tunnel.pid ] && kill -0 $$(cat tunnel.pid) 2>/dev/null; then \
		TUNNEL_URL=$$(cat .tunnel_url 2>/dev/null || echo "Unknown"); \
		echo "$(GREEN)✓ Tunnel: Running (PID: $$(cat tunnel.pid)) - $$TUNNEL_URL$(RESET)"; \
	else \
		echo "$(RED)✗ Tunnel: Stopped$(RESET)"; \
	fi

# Show logs from all services
.PHONY: logs
logs:
	@echo "$(BLUE)=== Recent Logs ===$(RESET)"
	@if [ -f worker.log ]; then \
		echo "$(YELLOW)--- Worker Logs (last 10 lines) ---$(RESET)"; \
		tail -10 worker.log; \
	fi
	@if [ -f webapp.log ]; then \
		echo "$(YELLOW)--- Webapp Logs (last 10 lines) ---$(RESET)"; \
		tail -10 webapp.log; \
	fi
	@if [ -f tunnel.log ]; then \
		echo "$(YELLOW)--- Tunnel Logs (last 10 lines) ---$(RESET)"; \
		tail -10 tunnel.log; \
	fi

# Start complete development environment
.PHONY: dev-start
dev-start: check-deps install test db-reset worker-start webapp-start tunnel-start
	@echo "$(GREEN)🚀 Development environment started!$(RESET)"
	@sleep 2
	@make webhook-setup || echo "$(YELLOW)⚠️  Webhook setup failed - you may need to set INIT_SECRET and try 'make webhook-setup' manually$(RESET)"
	@echo ""
	@echo "$(CYAN)=== Development URLs ===$(RESET)"
	@echo "$(CYAN)Worker (API):  http://localhost:$(WORKER_PORT)$(RESET)"
	@echo "$(CYAN)Webapp (UI):   http://localhost:$(WEBAPP_PORT)$(RESET)"
	@if [ -f .tunnel_url ]; then \
		echo "$(CYAN)Public URL:    $$(cat .tunnel_url)$(RESET)"; \
	fi
	@echo ""
	@echo "$(YELLOW)To stop everything: make dev-stop$(RESET)"
	@echo "$(YELLOW)To check status:     make status$(RESET)"
	@echo "$(YELLOW)To view logs:        make logs$(RESET)"

# Stop complete development environment
.PHONY: dev-stop
dev-stop: worker-stop webapp-stop tunnel-stop
	@rm -f worker.log webapp.log tunnel.log
	@echo "$(GREEN)🛑 Development environment stopped$(RESET)"

# Restart development environment
.PHONY: dev-restart
dev-restart: dev-stop dev-start

# Clean up all generated files
.PHONY: clean
clean: dev-stop
	@echo "$(YELLOW)Cleaning up...$(RESET)"
	@echo "$(YELLOW)Killing any remaining workerd processes...$(RESET)"
	@pkill -f workerd 2>/dev/null || echo "$(YELLOW)No workerd processes found$(RESET)"
	@rm -rf dist/
	@rm -rf webapp/dist/
	@rm -rf node_modules/
	@rm -rf webapp/node_modules/
	@rm -f *.pid *.log .tunnel_url
	@echo "$(GREEN)✓ Cleanup completed$(RESET)"

# Help command
.PHONY: help
help:
	@echo "$(BLUE)Telegram WebApp Fleamarket - Development Commands$(RESET)"
	@echo ""
	@echo "$(YELLOW)🚀 Quick Start:$(RESET)"
	@echo "  $(GREEN)make dev-start$(RESET)     - Start complete development environment"
	@echo "  $(GREEN)make dev-stop$(RESET)      - Stop complete development environment"
	@echo "  $(GREEN)make dev-restart$(RESET)   - Restart development environment"
	@echo ""
	@echo "$(YELLOW)📦 Setup & Dependencies:$(RESET)"
	@echo "  $(GREEN)make install$(RESET)       - Install all dependencies"
	@echo "  $(GREEN)make check-deps$(RESET)    - Check if required tools are installed"
	@echo ""
	@echo "$(YELLOW)🔨 Build & Type Checking:$(RESET)"
	@echo "  $(GREEN)make build$(RESET)         - Build TypeScript backend"
	@echo "  $(GREEN)make typecheck$(RESET)     - Type check backend and webapp"
	@echo "  $(GREEN)make lint$(RESET)          - Lint webapp code"
	@echo ""
	@echo "$(YELLOW)🧪 Testing:$(RESET)"
	@echo "  $(GREEN)make test$(RESET)          - Run all tests"
	@echo "  $(GREEN)make test-backend$(RESET)  - Run backend tests only"
	@echo "  $(GREEN)make test-webapp$(RESET)   - Run webapp tests only"
	@echo "  $(GREEN)make test-local$(RESET)    - Test local development setup with auth bypass"
	@echo "  $(GREEN)make health$(RESET)        - Test health endpoint with real services"
	@echo ""
	@echo "$(YELLOW)🗄️  Database:$(RESET)"
	@echo "  $(GREEN)make db-init$(RESET)       - Initialize local database (uses migrations)"
	@echo "  $(GREEN)make db-drop$(RESET)       - Drop local database"
	@echo "  $(GREEN)make db-reset$(RESET)      - Reset database (drop + migrate)"
	@echo "  $(GREEN)make db-generate$(RESET)   - Generate new database migrations"
	@echo "  $(GREEN)make db-push$(RESET)       - Push schema changes to database (dev only)"
	@echo "  $(GREEN)make db-migrate-local$(RESET) - Apply migrations to local database"
	@echo "  $(GREEN)make db-migrate-remote$(RESET) - Apply migrations to remote database"
	@echo "  $(GREEN)make db-studio$(RESET)     - Open Drizzle Studio for database inspection"
	@echo ""
	@echo "$(YELLOW)🌐 Development Modes:$(RESET)"
	@echo "  $(GREEN)make dev-local$(RESET)     - Start local development with auth bypass"
	@echo "  $(GREEN)make webapp-dev-bypass$(RESET) - Start webapp only with auth bypass"
	@echo ""
	@echo "$(YELLOW)🌐 Individual Services:$(RESET)"
	@echo "  $(GREEN)make worker-start$(RESET)  - Start worker only"
	@echo "  $(GREEN)make worker-stop$(RESET)   - Stop worker"
	@echo "  $(GREEN)make webapp-start$(RESET)  - Start webapp only"
	@echo "  $(GREEN)make webapp-stop$(RESET)   - Stop webapp"
	@echo "  $(GREEN)make tunnel-start$(RESET)  - Start tunnel only"
	@echo "  $(GREEN)make tunnel-stop$(RESET)   - Stop tunnel"
	@echo ""
	@echo "$(YELLOW)🔗 Webhook & Bot:$(RESET)"
	@echo "  $(GREEN)make webhook-setup$(RESET) - Setup webhook for dev bot (requires INIT_SECRET env var)"
	@echo ""
	@echo "$(YELLOW)📊 Monitoring:$(RESET)"
	@echo "  $(GREEN)make status$(RESET)        - Show status of all services"
	@echo "  $(GREEN)make logs$(RESET)          - Show recent logs from all services"
	@echo ""
	@echo "$(YELLOW)🧹 Cleanup:$(RESET)"
	@echo "  $(GREEN)make clean$(RESET)         - Clean all generated files and dependencies"
	@echo ""
	@echo "$(YELLOW)Environment Variables:$(RESET)"
	@echo "  $(CYAN)INIT_SECRET$(RESET)        - Required for webhook setup"
	@echo "  $(CYAN)WORKER_PORT$(RESET)        - Worker port (default: 8787)"
	@echo "  $(CYAN)WEBAPP_PORT$(RESET)        - Webapp port (default: 5173)"

# Default target
.DEFAULT_GOAL := help