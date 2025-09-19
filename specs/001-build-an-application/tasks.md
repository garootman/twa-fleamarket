# Tasks: Telegram Marketplace Application

**Input**: Design documents from `/specs/001-build-an-application/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/

## Status: 70% Complete

**Working**: Authentication, database models, core API endpoints, frontend components
**Missing**: R2 storage, KV caching, advanced admin features, production moderation

## Phase 1: Code Organization & Setup

- [x] T001 Reorganize bot commands to `/src/bot/` folder structure
- [ ] T002 Restructure database files to `/src/db/` with proper schema organization
- [ ] T003 Move KV caching logic to `/src/kv/` library folder
- [ ] T004 Organize R2 image handling to `/src/r2/` folder
- [ ] T005 Create admin functionality folder `/src/admin/` for management features
- [ ] T006 Setup dev utilities in `/src/dev/` for mock users and auth bypass
- [x] T007 Add missing dependencies: leo-profanity, Artillery for load testing
- [ ] T008 Configure TypeScript paths for new folder structure

## Phase 2: Contract Tests

- [x] T009 Contract test POST /miniApp/init
- [ ] T010 Contract test GET /api/me
- [ ] T011 Contract test GET /api/categories
- [ ] T012 Contract test GET /api/listings
- [ ] T013 Contract test POST /api/listings
- [ ] T014 Contract test GET /api/listings/{id}
- [ ] T015 Contract test PUT /api/listings/{id}
- [ ] T016 Contract test POST /api/listings/{id}/bump
- [ ] T017 Contract test POST /api/listings/{id}/flag
- [ ] T018 Contract test GET /api/me/listings
- [ ] T019 Contract test POST /api/upload
- [ ] T020 Contract test POST /api/listings/{id}/preview
- [ ] T021 Contract test POST /api/listings/{id}/publish
- [ ] T022 Contract test POST /api/bot/webhook

## Phase 3: Database Models

- [x] T040 User model with Telegram integration in apps/worker/src/db/models/user.ts
- [x] T041 Category model with 2-level hierarchy in apps/worker/src/db/models/category.ts
- [x] T042 Listing model with premium features in apps/worker/src/db/models/listing.ts
- [ ] T043 Flag model for content moderation
- [ ] T044 ModerationAction model for admin actions
- [ ] T045 Appeal model for user appeals
- [ ] T046 PremiumFeature model for paid features
- [ ] T047 UserSession model for auth tokens
- [ ] T048 BlockedWord model for content filtering
- [ ] T049 MockUser model for local testing
- [ ] T050 CacheEntry model for KV cache

## Phase 4: Service Layer & Bot Commands

- [x] T051 AuthService with Telegram validation in apps/worker/src/services/auth-service-simple.ts
- [x] T052 UserService with profile management in apps/worker/src/services/user-service.ts
- [x] T053 CategoryService with hierarchy queries in apps/worker/src/services/category-service.ts
- [x] T054 ListingService with CRUD and search in apps/worker/src/services/listing-service-simple.ts
- [ ] T055 ImageService with R2 storage
- [ ] T056 KVCacheService for CQRS-style caching
- [ ] T057 ModerationService for flagging system
- [ ] T058 AdminService for admin functionality
- [ ] T059 PremiumService for paid features
- [x] T060 Bot /start command with welcome message
- [x] T061 Bot /help command with navigation
- [x] T062 Bot /question command for admin contact
- [x] T063 Bot webhook handler with message routing

## Phase 5: API Endpoints

- [x] T064 POST /miniApp/init endpoint with Telegram validation
- [x] T065 GET /miniApp/me endpoint for user profile
- [~] T066 GET /api/categories endpoint (hardcoded data)
- [x] T067 GET /api/listings endpoint with search/filter
- [x] T068 POST /api/listings endpoint with validation
- [x] T069 GET /api/listings/{id} endpoint with views
- [x] T070 PUT /api/listings/{id} endpoint with ownership check
- [x] T071 DELETE /api/listings/{id} endpoint with archival
- [x] T072 POST /api/listings/{id}/bump endpoint
- [x] T073 POST /api/listings/{id}/flag endpoint
- [x] T074 GET /api/me/listings endpoint with stats
- [~] T075 POST /api/upload endpoint (mock implementation)
- [x] T076 POST /api/listings/{id}/preview endpoint
- [x] T077 POST /api/listings/{id}/publish endpoint

## Phase 6: Admin Endpoints

- [~] T078 GET /api/admin/listings endpoint (mock data)
- [~] T079 POST /api/admin/listings/{id}/stick endpoint (mock)
- [~] T080 POST /api/admin/users/{id}/ban endpoint (mock)
- [~] T081 POST /api/admin/users/{id}/unban endpoint (mock)
- [~] T082 GET /api/admin/blocked-words endpoint (mock)
- [~] T083 POST /api/admin/blocked-words endpoint (mock)

## Phase 7: Development Endpoints

- [~] T084 GET /api/dev/mock-users endpoint (mock)
- [~] T085 POST /api/dev/auth endpoint (mock)

## Phase 8: Frontend Components

- [x] T086 App router with Telegram WebApp integration
- [x] T087 Auth component with Telegram initData
- [x] T088 Listing browse component with categories
- [x] T089 Listing detail component with gallery
- [x] T090 Create listing form with preview
- [x] T091 User profile component with listings
- [x] T092 Admin panel component for moderation
- [x] T093 Search component with full-text search
- [x] T094 Image gallery with swipe navigation

## Phase 9: Integration & Middleware

- [ ] T095 Connect ListingService to KV caching for performance
- [ ] T096 Connect ImageService to CloudFlare R2 storage
- [ ] T097 Setup auth middleware with session validation
- [ ] T098 Setup admin middleware with ADMIN_ID check
- [ ] T099 Setup request/response logging middleware
- [x] T100 Setup CORS and security headers for production
- [x] T101 Setup profanity filtering with leo-profanity + custom blocklist
- [x] T102 Connect bot webhook to Telegram API with error handling

## Phase 10: Testing & Performance

- [x] T103 Unit tests for validation logic
- [x] T104 Unit tests for auth service
- [x] T105 Unit tests for listing service
- [x] T106 Performance tests for API endpoints
- [x] T107 Load testing with Artillery configuration
- [ ] T108 Browser automation E2E tests with mock users
- [ ] T109 Frontend unit tests for components
- [ ] T110 Frontend integration tests

## Phase 11: Documentation & Final Setup

- [x] T111 Update project README with setup instructions
- [x] T112 Create database migration scripts for schema changes
- [ ] T113 Setup production environment variables and secrets
- [ ] T114 Run quickstart.md validation scenarios with mock users

## Legend

- [x] = Done
- [~] = Partial/Mock implementation
- [ ] = Not done

## Next Priorities

1. Implement real admin endpoints (T078-T083)
2. Add R2 storage integration (T096)
3. Add KV caching (T095, T056)
4. Complete contract test coverage
5. Setup production environment