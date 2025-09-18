#!/bin/bash

# Production Environment Setup Script
# Sets up CloudFlare Workers environment variables and secrets for production deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
WORKER_NAME="marketplace-worker"
D1_DATABASE_NAME="marketplace-db"
KV_NAMESPACE_PREFIX="marketplace"
R2_BUCKET_NAME="marketplace-images"

echo -e "${BLUE}🚀 Production Environment Setup for Telegram Marketplace${NC}"
echo -e "${BLUE}=====================================================${NC}"

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}❌ Wrangler CLI is not installed${NC}"
    echo "Install it with: npm install -g wrangler"
    exit 1
fi

# Check if user is logged in
if ! wrangler whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to CloudFlare${NC}"
    echo "Please run: wrangler login"
    exit 1
fi

echo -e "${GREEN}✅ Wrangler CLI is ready${NC}"

# Function to prompt for input with default
prompt_with_default() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"

    if [ -n "$default" ]; then
        read -p "$prompt [$default]: " value
        value="${value:-$default}"
    else
        read -p "$prompt: " value
    fi

    eval "$var_name='$value'"
}

# Function to generate secure random string
generate_secret() {
    openssl rand -hex 32
}

echo -e "\n${YELLOW}📝 Collecting configuration...${NC}"

# Collect required configuration
prompt_with_default "Telegram Bot Token" "" "TELEGRAM_BOT_TOKEN"
prompt_with_default "Admin Telegram ID" "" "ADMIN_TELEGRAM_ID"
prompt_with_default "Frontend Domain (without https://)" "your-app.pages.dev" "FRONTEND_DOMAIN"

# Generate secrets
echo -e "\n${YELLOW}🔐 Generating secure secrets...${NC}"
INIT_SECRET=$(generate_secret)
JWT_SECRET=$(generate_secret)
SESSION_ENCRYPTION_KEY=$(generate_secret)
TELEGRAM_WEBHOOK_SECRET=$(generate_secret)

echo -e "${GREEN}✅ Secrets generated${NC}"

# Create CloudFlare resources
echo -e "\n${YELLOW}☁️  Creating CloudFlare resources...${NC}"

# Create D1 Database
echo "Creating D1 database..."
if wrangler d1 create "$D1_DATABASE_NAME" --output json > d1_output.json 2>/dev/null; then
    D1_DATABASE_ID=$(jq -r '.database_id' d1_output.json)
    echo -e "${GREEN}✅ D1 database created: $D1_DATABASE_ID${NC}"
    rm d1_output.json
else
    echo -e "${YELLOW}⚠️  D1 database might already exist${NC}"
    # Try to get existing database ID
    wrangler d1 list --output json > d1_list.json 2>/dev/null || true
    D1_DATABASE_ID=$(jq -r ".[] | select(.name == \"$D1_DATABASE_NAME\") | .database_id" d1_list.json 2>/dev/null || echo "")
    rm -f d1_list.json
fi

# Create KV Namespaces
echo "Creating KV namespaces..."
KV_CACHE_ID=""
KV_SESSION_ID=""

# Cache namespace
if wrangler kv:namespace create "${KV_NAMESPACE_PREFIX}-cache" --output json > kv_cache.json 2>/dev/null; then
    KV_CACHE_ID=$(jq -r '.id' kv_cache.json)
    echo -e "${GREEN}✅ KV cache namespace created: $KV_CACHE_ID${NC}"
    rm kv_cache.json
else
    echo -e "${YELLOW}⚠️  KV cache namespace might already exist${NC}"
fi

# Session namespace
if wrangler kv:namespace create "${KV_NAMESPACE_PREFIX}-sessions" --output json > kv_sessions.json 2>/dev/null; then
    KV_SESSION_ID=$(jq -r '.id' kv_sessions.json)
    echo -e "${GREEN}✅ KV sessions namespace created: $KV_SESSION_ID${NC}"
    rm kv_sessions.json
else
    echo -e "${YELLOW}⚠️  KV sessions namespace might already exist${NC}"
fi

# Create R2 Bucket
echo "Creating R2 bucket..."
if wrangler r2 bucket create "$R2_BUCKET_NAME" 2>/dev/null; then
    echo -e "${GREEN}✅ R2 bucket created: $R2_BUCKET_NAME${NC}"
else
    echo -e "${YELLOW}⚠️  R2 bucket might already exist${NC}"
fi

# Set environment variables
echo -e "\n${YELLOW}🔧 Setting environment variables...${NC}"

# Core secrets
wrangler secret put TELEGRAM_BOT_TOKEN --name "$WORKER_NAME" <<< "$TELEGRAM_BOT_TOKEN"
wrangler secret put INIT_SECRET --name "$WORKER_NAME" <<< "$INIT_SECRET"
wrangler secret put JWT_SECRET --name "$WORKER_NAME" <<< "$JWT_SECRET"
wrangler secret put SESSION_ENCRYPTION_KEY --name "$WORKER_NAME" <<< "$SESSION_ENCRYPTION_KEY"
wrangler secret put TELEGRAM_WEBHOOK_SECRET --name "$WORKER_NAME" <<< "$TELEGRAM_WEBHOOK_SECRET"

# Configuration variables (non-secret)
wrangler env vars put NODE_ENV production --name "$WORKER_NAME"
wrangler env vars put FRONTEND_URL "https://$FRONTEND_DOMAIN" --name "$WORKER_NAME"
wrangler env vars put ADMIN_TELEGRAM_ID "$ADMIN_TELEGRAM_ID" --name "$WORKER_NAME"
wrangler env vars put TELEGRAM_USE_TEST_API false --name "$WORKER_NAME"

# Database and storage IDs
if [ -n "$D1_DATABASE_ID" ]; then
    wrangler env vars put D1_DATABASE_ID "$D1_DATABASE_ID" --name "$WORKER_NAME"
fi

if [ -n "$KV_CACHE_ID" ]; then
    wrangler env vars put KV_CACHE_NAMESPACE_ID "$KV_CACHE_ID" --name "$WORKER_NAME"
fi

if [ -n "$KV_SESSION_ID" ]; then
    wrangler env vars put KV_SESSION_NAMESPACE_ID "$KV_SESSION_ID" --name "$WORKER_NAME"
fi

wrangler env vars put R2_BUCKET_NAME "$R2_BUCKET_NAME" --name "$WORKER_NAME"

# Feature flags and configuration
wrangler env vars put PREMIUM_FEATURES_ENABLED true --name "$WORKER_NAME"
wrangler env vars put CONTENT_MODERATION_ENABLED true --name "$WORKER_NAME"
wrangler env vars put CACHE_ENABLED true --name "$WORKER_NAME"
wrangler env vars put RATE_LIMIT_ENABLED true --name "$WORKER_NAME"
wrangler env vars put PERFORMANCE_MONITORING_ENABLED true --name "$WORKER_NAME"
wrangler env vars put SECURITY_HEADERS_ENABLED true --name "$WORKER_NAME"

# Development features (disabled in production)
wrangler env vars put DEV_MODE_ENABLED false --name "$WORKER_NAME"
wrangler env vars put MOCK_USERS_ENABLED false --name "$WORKER_NAME"
wrangler env vars put AUTH_BYPASS_ENABLED false --name "$WORKER_NAME"
wrangler env vars put DEBUG_MODE false --name "$WORKER_NAME"

echo -e "${GREEN}✅ Environment variables set${NC}"

# Update wrangler.toml
echo -e "\n${YELLOW}📝 Updating wrangler.toml...${NC}"

# Create backup of wrangler.toml
cp wrangler.toml wrangler.toml.backup

# Update wrangler.toml with resource bindings
cat > wrangler.toml.tmp << EOF
name = "$WORKER_NAME"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[env.production]
vars = { }

[[env.production.d1_databases]]
binding = "DB"
database_name = "$D1_DATABASE_NAME"
database_id = "$D1_DATABASE_ID"

[[env.production.kv_namespaces]]
binding = "CACHE_KV"
id = "$KV_CACHE_ID"

[[env.production.kv_namespaces]]
binding = "SESSION_KV"
id = "$KV_SESSION_ID"

[[env.production.r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "$R2_BUCKET_NAME"

[env.production.triggers]
crons = ["0 2 * * *"]  # Daily cleanup at 2 AM

EOF

# Merge with existing wrangler.toml if it has additional configuration
if [ -f wrangler.toml ]; then
    echo "# Updated for production deployment" > wrangler.toml.new
    cat wrangler.toml.tmp >> wrangler.toml.new
    mv wrangler.toml.new wrangler.toml
else
    mv wrangler.toml.tmp wrangler.toml
fi

rm -f wrangler.toml.tmp

echo -e "${GREEN}✅ wrangler.toml updated${NC}"

# Apply database migrations
echo -e "\n${YELLOW}🗄️  Applying database migrations...${NC}"

if [ -n "$D1_DATABASE_ID" ]; then
    # Apply migrations
    if wrangler d1 migrations apply "$D1_DATABASE_NAME" --env production; then
        echo -e "${GREEN}✅ Database migrations applied${NC}"
    else
        echo -e "${YELLOW}⚠️  Migration may have failed, check manually${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Cannot apply migrations: D1_DATABASE_ID not found${NC}"
fi

# Create GitHub Secrets template
echo -e "\n${YELLOW}📋 Creating GitHub Secrets template...${NC}"

cat > github-secrets.md << EOF
# GitHub Secrets Configuration

Add these secrets to your GitHub repository:
Settings → Secrets and variables → Actions → New repository secret

## Required Secrets

\`\`\`
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID=<your-account-id>
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
INIT_SECRET=$INIT_SECRET
JWT_SECRET=$JWT_SECRET
SESSION_ENCRYPTION_KEY=$SESSION_ENCRYPTION_KEY
TELEGRAM_WEBHOOK_SECRET=$TELEGRAM_WEBHOOK_SECRET
\`\`\`

## Configuration Variables

\`\`\`
WORKER_NAME=$WORKER_NAME
D1_DATABASE_NAME=$D1_DATABASE_NAME
R2_BUCKET_NAME=$R2_BUCKET_NAME
FRONTEND_URL=https://$FRONTEND_DOMAIN
ADMIN_TELEGRAM_ID=$ADMIN_TELEGRAM_ID
\`\`\`

## Resource IDs

\`\`\`
D1_DATABASE_ID=$D1_DATABASE_ID
KV_CACHE_NAMESPACE_ID=$KV_CACHE_ID
KV_SESSION_NAMESPACE_ID=$KV_SESSION_ID
\`\`\`
EOF

echo -e "${GREEN}✅ GitHub secrets template created: github-secrets.md${NC}"

# Security recommendations
echo -e "\n${YELLOW}🔒 Security Recommendations${NC}"
echo "1. Store all secrets securely and never commit them to git"
echo "2. Rotate secrets regularly (every 90 days recommended)"
echo "3. Enable CloudFlare security features (WAF, DDoS protection)"
echo "4. Set up monitoring and alerting for unusual activity"
echo "5. Regular security audits and dependency updates"

# Final summary
echo -e "\n${GREEN}🎉 Production environment setup completed!${NC}"
echo ""
echo -e "${BLUE}📋 Summary:${NC}"
echo "• CloudFlare Worker: $WORKER_NAME"
echo "• D1 Database: $D1_DATABASE_NAME ($D1_DATABASE_ID)"
echo "• KV Cache: $KV_CACHE_ID"
echo "• KV Sessions: $KV_SESSION_ID"
echo "• R2 Bucket: $R2_BUCKET_NAME"
echo "• Frontend URL: https://$FRONTEND_DOMAIN"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Review and configure GitHub Secrets (see github-secrets.md)"
echo "2. Deploy your application: wrangler deploy --env production"
echo "3. Set up your Telegram webhook"
echo "4. Test the production environment"
echo ""
echo -e "${BLUE}Useful commands:${NC}"
echo "• Deploy: wrangler deploy --env production"
echo "• View logs: wrangler tail --env production"
echo "• Check database: wrangler d1 execute $D1_DATABASE_NAME --env production --command 'SELECT COUNT(*) FROM users;'"
echo "• Manage KV: wrangler kv:key list --namespace-id $KV_CACHE_ID"

# Cleanup
rm -f d1_output.json kv_cache.json kv_sessions.json d1_list.json