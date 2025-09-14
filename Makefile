# Simple Development Makefile
# Just the essentials for local testing

# Colors
GREEN := \033[32m
BLUE := \033[34m
YELLOW := \033[33m
RESET := \033[0m

.PHONY: install build test dev webapp clean help

# Install dependencies
install:
	@echo "$(BLUE)Installing dependencies...$(RESET)"
	@npm install
	@cd webapp && npm install
	@echo "$(GREEN)✓ Dependencies installed$(RESET)"

# Build the project
build:
	@echo "$(BLUE)Building project...$(RESET)"
	@npm run build
	@echo "$(GREEN)✓ Build completed$(RESET)"

# Run tests
test:
	@echo "$(BLUE)Running webapp tests...$(RESET)"
	@cd webapp && npm run test:run
	@echo "$(GREEN)✓ Tests passed$(RESET)"

# Start local development (webapp only since worker has issues)
dev:
	@echo "$(BLUE)Starting webapp for manual testing...$(RESET)"
	@echo "$(YELLOW)Note: Using production backend due to local worker issues$(RESET)"
	@cd webapp && VITE_BACKEND_URL=https://telegram-calendar.dksg87.workers.dev npm run dev

# Start webapp with mock auth for testing
webapp:
	@echo "$(BLUE)Starting webapp with mock authentication...$(RESET)"
	@cd webapp && VITE_DEV_BYPASS_AUTH=true npm run dev

# Clean build files
clean:
	@echo "$(BLUE)Cleaning build files...$(RESET)"
	@rm -rf dist/
	@rm -rf webapp/dist/
	@echo "$(GREEN)✓ Cleaned$(RESET)"

# Show help
help:
	@echo "$(BLUE)Simple Development Commands:$(RESET)"
	@echo ""
	@echo "  $(GREEN)make install$(RESET)  - Install all dependencies"
	@echo "  $(GREEN)make build$(RESET)    - Build the project"
	@echo "  $(GREEN)make test$(RESET)     - Run all tests"
	@echo "  $(GREEN)make dev$(RESET)      - Start webapp (uses production backend)"
	@echo "  $(GREEN)make webapp$(RESET)   - Start webapp with mock auth"
	@echo "  $(GREEN)make clean$(RESET)    - Clean build files"
	@echo ""
	@echo "$(YELLOW)For manual testing:$(RESET)"
	@echo "1. Run: make webapp"
	@echo "2. Open: http://localhost:5173"
	@echo "3. Test the interface with mock auth enabled"

.DEFAULT_GOAL := help