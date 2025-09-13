# Research: Telegram Marketplace Application

**Phase 0 Research Findings**

## Telegram WebApp Integration

**Decision**: Use Grammy framework with `@grammyjs/web-app` plugin for seamless bot-to-webapp communication

**Rationale**:

- Grammy provides excellent TypeScript support and middleware system
- Web App plugin handles Telegram's `initData` validation automatically
- Supports deep linking between bot and webapp interfaces
- Active community and good documentation

**Alternatives considered**:

- Telegraf: Less TypeScript-friendly, outdated documentation
- node-telegram-bot-api: Lower-level, requires manual WebApp integration
- Direct Telegram Bot API: Too low-level for this use case

## Image Processing & Storage

**Decision**: Client-side image processing with CloudFlare R2 storage

**Rationale**:

- CloudFlare Workers have limited processing time and memory
- Client-side processing (Canvas API) reduces server load
- R2 provides cost-effective image storage with CDN
- Can implement image optimization (resize, compress) on upload

**Alternatives considered**:

- Server-side processing: Limited by Workers runtime constraints
- CloudFlare Images: More expensive for marketplace use case
- External services: Adds complexity and cost

## Database Schema Design

**Decision**: Use Drizzle ORM with CloudFlare D1 (SQLite)

**Rationale**:

- D1 provides serverless SQLite with automatic scaling
- Drizzle offers excellent TypeScript integration and migrations
- SQLite supports full-text search for listing search functionality
- Good performance for read-heavy marketplace workload

**Alternatives considered**:

- Direct SQL queries: Less type-safe, harder to maintain
- Prisma: Heavier runtime footprint for Workers
- External database: Adds latency and complexity

## Authentication & Session Management

**Decision**: Telegram initData validation with JWT-like tokens in CloudFlare KV

**Rationale**:

- Leverages Telegram's built-in authentication
- KV provides fast, distributed session storage
- No need for separate user registration flow
- Secure token validation using bot token

**Alternatives considered**:

- Database sessions: Slower, unnecessary DB load
- In-memory sessions: Not suitable for distributed Workers
- Third-party auth: Adds complexity for Telegram-native app

## Real-time Communication

**Decision**: Direct Telegram messaging via deep links, no separate chat system

**Rationale**:

- Leverages Telegram's excellent messaging infrastructure
- Users already familiar with Telegram interface
- Reduces application complexity significantly
- Built-in features like file sharing, voice messages

**Alternatives considered**:

- WebSocket chat: Complex to implement, users prefer Telegram
- In-app messaging: Duplicates Telegram functionality
- Email notifications: Less immediate, poor user experience

## Payment Processing

**Decision**: Telegram Stars for premium features

**Rationale**:

- Native Telegram payment system
- Lower transaction fees than external processors
- Seamless user experience within Telegram
- Automatic payment verification via webhooks

**Alternatives considered**:

- Stripe: Requires additional KYC, higher fees
- PayPal: Poor international support
- Crypto payments: Too volatile for marketplace

## Moderation System

**Decision**: Hybrid approach - automated flagging + admin review

**Rationale**:

- Text filtering for obvious violations (profanity, spam)
- User reporting system for community moderation
- Single admin role for simplicity
- Audit trail for all moderation actions

**Alternatives considered**:

- Fully automated: Risk of false positives
- Manual only: Not scalable for growth
- Multiple admin roles: Adds complexity for initial version

## Performance Optimization

**Decision**: CloudFlare KV caching with D1 as source of truth

**Rationale**:

- KV provides sub-millisecond global read access
- Cache frequently accessed data (listings, categories)
- D1 for consistent writes and complex queries
- Edge caching reduces latency worldwide

**Alternatives considered**:

- Database-only: Higher latency for global users
- In-memory caching: Not suitable for serverless
- Redis: Adds infrastructure complexity and cost

## Search Implementation

**Decision**: SQLite full-text search (FTS5) for listings

**Rationale**:

- Built into D1/SQLite, no additional infrastructure
- Good performance for marketplace-scale data
- Supports phrase matching and ranking
- Can index title and description fields

**Alternatives considered**:

- External search service: Adds cost and complexity
- Simple LIKE queries: Poor performance and relevance
- Client-side filtering: Limited by data transfer

## Development & Testing Strategy

**Decision**: Local development with Wrangler, comprehensive test suite

**Rationale**:

- Wrangler provides local D1/KV/R2 emulation
- Vitest for fast unit and integration testing
- Real CloudFlare services for staging tests
- Makefile commands for simplified workflows

**Alternatives considered**:

- Docker development: Heavier, CloudFlare-specific tools better
- Mock services: Less accurate than Wrangler emulation
- Manual testing only: Not sustainable for complex application

## Deployment Pipeline

**Decision**: GitHub Actions with CloudFlare Pages integration

**Rationale**:

- Automatic deployment on push to main
- Preview deployments for pull requests
- Built-in integration with CloudFlare services
- Free tier sufficient for project scope

**Alternatives considered**:

- Manual deployments: Not sustainable for active development
- Other CI/CD platforms: CloudFlare integration less mature
- Self-hosted runners: Unnecessary complexity

## Research Status

✅ All technical decisions made
✅ No NEEDS CLARIFICATION items remaining
✅ Architecture approach validated
✅ Implementation path clear

**Next Phase**: Ready for Phase 1 (Design & Contracts)
