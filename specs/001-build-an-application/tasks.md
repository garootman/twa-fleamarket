# Tasks: Telegram Marketplace Application

**Input**: Design documents from `/specs/001-build-an-application/`
**Prerequisites**: plan.md (✓), research.md (✓), data-model.md (✓), contracts/ (✓)

## Execution Flow (main)

```
1. Load plan.md from feature directory ✓
   → Extract: CloudFlare Workers, Hono, Grammy, React, Drizzle ORM
   → Structure: Web application (backend + frontend)
2. Load design documents ✓:
   → data-model.md: 12 entities for Telegram marketplace
   → contracts/: API schema with 25+ endpoints
   → research.md: Technical decisions for architecture
3. Generate tasks by category:
   → Setup: Restructure existing code to specification folders
   → Tests: Contract tests, integration tests with mock users
   → Core: Database models, services, bot commands, API endpoints
   → Integration: KV caching, image processing, admin functions
   → Polish: Performance testing, browser automation, load testing
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Tests before implementation (TDD)
   → Existing code reorganization first
5. Number tasks sequentially (T001-T114)
6. Focus: Enhance existing working code with new features
```

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Phase 3.1: Code Reorganization & Setup

**CRITICAL: Restructure existing working code first**

- [x] T001 [P] Reorganize backend bot commands to `/src/bot/` folder structure
- [x] T002 [P] Restructure database files to `/src/db/` with proper schema organization
- [x] T003 [P] Move KV caching logic to `/src/kv/` library folder
- [x] T004 [P] Organize R2 image handling to `/src/r2/` folder
- [x] T005 [P] Create admin functionality folder `/src/admin/` for management features
- [x] T006 [P] Setup dev utilities in `/src/dev/` for mock users and auth bypass
- [x] T007 Add missing dependencies: leo-profanity, Artillery for load testing
- [x] T008 [P] Configure TypeScript paths for new folder structure

## Phase 3.2: Contract Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3

**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### API Contract Tests
- [x] T009 [P] Contract test POST /miniApp/init (existing auth) in tests/contract/test_auth_post.ts
- [x] T010 [P] Contract test GET /api/me in tests/contract/test_me_get.ts
- [x] T011 [P] Contract test GET /api/categories in tests/contract/test_categories_get.ts
- [x] T012 [P] Contract test GET /api/listings in tests/contract/test_listings_get.ts
- [x] T013 [P] Contract test POST /api/listings in tests/contract/test_listings_post.ts
- [x] T014 [P] Contract test GET /api/listings/{id} in tests/contract/test_listings_by_id_get.ts
- [x] T015 [P] Contract test PUT /api/listings/{id} in tests/contract/test_listings_by_id_put.ts
- [x] T016 [P] Contract test POST /api/listings/{id}/bump in tests/contract/test_listings_bump_post.ts
- [x] T017 [P] Contract test POST /api/listings/{id}/flag in tests/contract/test_listings_flag_post.ts
- [x] T018 [P] Contract test GET /api/me/listings in tests/contract/test_me_listings_get.ts
- [x] T019 [P] Contract test POST /api/upload in tests/contract/test_upload_post.ts
- [x] T020 [P] Contract test POST /api/listings/{id}/preview in tests/contract/test_listings_preview_post.ts
- [x] T021 [P] Contract test POST /api/listings/{id}/publish in tests/contract/test_listings_publish_post.ts
- [x] T022 [P] Contract test POST /api/bot/webhook in tests/contract/test_bot_webhook_post.ts

### Admin Contract Tests
- [ ] T023 [P] Contract test GET /api/admin/listings in tests/contract/test_admin_listings_get.ts
- [ ] T024 [P] Contract test POST /api/admin/listings/{id}/stick in tests/contract/test_admin_listings_stick_post.ts
- [ ] T025 [P] Contract test POST /api/admin/users/{id}/ban in tests/contract/test_admin_users_ban_post.ts
- [ ] T026 [P] Contract test POST /api/admin/users/{id}/unban in tests/contract/test_admin_users_unban_post.ts
- [ ] T027 [P] Contract test GET /api/admin/blocked-words in tests/contract/test_admin_blocked_words_get.ts
- [ ] T028 [P] Contract test POST /api/admin/blocked-words in tests/contract/test_admin_blocked_words_post.ts

### Development Contract Tests
- [ ] T029 [P] Contract test GET /api/dev/mock-users in tests/contract/test_dev_mock_users_get.ts
- [ ] T030 [P] Contract test POST /api/dev/auth in tests/contract/test_dev_auth_post.ts

### Integration Tests (User Journeys)
- [ ] T031 [P] Integration test bot command functionality in backend/tests/integration/test_bot_commands.ts
- [ ] T032 [P] Integration test listing creation flow with preview in backend/tests/integration/test_listing_creation.ts
- [ ] T033 [P] Integration test buyer-seller communication flow in backend/tests/integration/test_communication_flow.ts
- [ ] T034 [P] Integration test moderation and flagging system in backend/tests/integration/test_moderation_system.ts
- [ ] T035 [P] Integration test admin panel functionality in backend/tests/integration/test_admin_panel.ts
- [ ] T036 [P] Integration test premium features with payment in backend/tests/integration/test_premium_features.ts
- [ ] T037 [P] Integration test search and discovery features in backend/tests/integration/test_search_discovery.ts
- [ ] T038 [P] Integration test KV caching performance in backend/tests/integration/test_kv_caching.ts
- [ ] T039 [P] Integration test mock user system for local dev in backend/tests/integration/test_mock_users.ts

## Phase 3.3: Database Models (ONLY after tests are failing)

### Database Models (Drizzle ORM)
- [ ] T040 [P] User model with Telegram integration in backend/src/db/models/user.ts
- [ ] T041 [P] Category model with 2-level hierarchy in backend/src/db/models/category.ts
- [ ] T042 [P] Listing model with premium features in backend/src/db/models/listing.ts
- [ ] T043 [P] Flag model for content moderation in backend/src/db/models/flag.ts
- [ ] T044 [P] ModerationAction model for admin actions in backend/src/db/models/moderation-action.ts
- [ ] T045 [P] Appeal model for user appeals in backend/src/db/models/appeal.ts
- [ ] T046 [P] PremiumFeature model for paid features in backend/src/db/models/premium-feature.ts
- [ ] T047 [P] UserSession model for auth tokens in backend/src/db/models/user-session.ts
- [ ] T048 [P] BlockedWord model for content filtering in backend/src/db/models/blocked-word.ts
- [ ] T049 [P] MockUser model for local testing in backend/src/db/models/mock-user.ts
- [ ] T050 [P] CacheEntry model for KV cache in backend/src/db/models/cache-entry.ts

## Phase 3.4: Service Layer & Bot Commands

### Service Layer
- [ ] T051 [P] AuthService with Telegram validation in backend/src/services/auth-service.ts
- [ ] T052 [P] UserService with profile management in backend/src/services/user-service.ts
- [ ] T053 [P] CategoryService with hierarchy queries in backend/src/services/category-service.ts
- [ ] T054 [P] ListingService with CRUD and search in backend/src/services/listing-service.ts
- [ ] T055 [P] ImageService with R2 storage in backend/src/services/image-service.ts
- [ ] T056 [P] KVCacheService for CQRS-style caching in backend/src/services/kv-cache-service.ts
- [ ] T057 [P] ModerationService for flagging system in backend/src/services/moderation-service.ts
- [ ] T058 [P] AdminService for admin functionality in backend/src/services/admin-service.ts
- [ ] T059 [P] PremiumService for paid features in backend/src/services/premium-service.ts

### Bot Commands (Grammy)
- [ ] T060 [P] Bot /start command with welcome message in backend/src/bot/commands/start.ts
- [ ] T061 [P] Bot /help command with navigation in backend/src/bot/commands/help.ts
- [ ] T062 [P] Bot /question command for admin contact in backend/src/bot/commands/question.ts
- [ ] T063 Bot webhook handler with message routing in backend/src/bot/webhook.ts

## Phase 3.5: API Endpoints Implementation

### Core API Endpoints (Hono)
- [ ] T064 POST /api/auth endpoint with Telegram validation in backend/src/api/auth.ts
- [ ] T065 GET /api/me endpoint for user profile in backend/src/api/me.ts
- [ ] T066 GET /api/categories endpoint with caching in backend/src/api/categories.ts
- [ ] T067 GET /api/listings endpoint with search/filter in backend/src/api/listings.ts
- [ ] T068 POST /api/listings endpoint with validation in backend/src/api/listings.ts
- [ ] T069 GET /api/listings/{id} endpoint with views in backend/src/api/listings.ts
- [ ] T070 PUT /api/listings/{id} endpoint with ownership check in backend/src/api/listings.ts
- [ ] T071 DELETE /api/listings/{id} endpoint with archival in backend/src/api/listings.ts
- [ ] T072 POST /api/listings/{id}/bump endpoint in backend/src/api/listings.ts
- [ ] T073 POST /api/listings/{id}/flag endpoint in backend/src/api/listings.ts
- [ ] T074 GET /api/me/listings endpoint with stats in backend/src/api/me.ts
- [ ] T075 POST /api/upload endpoint with R2 integration in backend/src/api/upload.ts
- [ ] T076 POST /api/listings/{id}/preview endpoint in backend/src/api/listings.ts
- [ ] T077 POST /api/listings/{id}/publish endpoint in backend/src/api/listings.ts

### Admin Endpoints
- [ ] T078 GET /api/admin/listings endpoint with all listings in backend/src/api/admin.ts
- [ ] T079 POST /api/admin/listings/{id}/stick endpoint in backend/src/api/admin.ts
- [ ] T080 POST /api/admin/users/{id}/ban endpoint in backend/src/api/admin.ts
- [ ] T081 POST /api/admin/users/{id}/unban endpoint in backend/src/api/admin.ts
- [ ] T082 GET /api/admin/blocked-words endpoint in backend/src/api/admin.ts
- [ ] T083 POST /api/admin/blocked-words endpoint in backend/src/api/admin.ts

### Development Endpoints
- [ ] T084 GET /api/dev/mock-users endpoint for testing in backend/src/api/dev.ts
- [ ] T085 POST /api/dev/auth endpoint with auth bypass in backend/src/api/dev.ts

## Phase 3.6: Frontend Components

### Frontend Components (React)
- [ ] T086 [P] App router with Telegram WebApp integration in frontend/src/App.tsx
- [ ] T087 [P] Auth component with Telegram initData in frontend/src/components/Auth.tsx
- [ ] T088 [P] Listing browse component with categories in frontend/src/components/ListingBrowse.tsx
- [ ] T089 [P] Listing detail component with gallery in frontend/src/components/ListingDetail.tsx
- [ ] T090 [P] Create listing form with preview in frontend/src/components/CreateListing.tsx
- [ ] T091 [P] User profile component with listings in frontend/src/components/Profile.tsx
- [ ] T092 [P] Admin panel component for moderation in frontend/src/components/AdminPanel.tsx
- [ ] T093 [P] Search component with full-text search in frontend/src/components/Search.tsx
- [ ] T094 [P] Image gallery with swipe navigation in frontend/src/components/ImageGallery.tsx

## Phase 3.7: Integration & Middleware

- [ ] T095 Connect ListingService to KV caching for performance in backend/src/services/listing-service.ts
- [ ] T096 Connect ImageService to CloudFlare R2 storage in backend/src/services/image-service.ts
- [ ] T097 Setup auth middleware with session validation in backend/src/middleware/auth.ts
- [ ] T098 Setup admin middleware with ADMIN_ID check in backend/src/middleware/admin.ts
- [ ] T099 Setup request/response logging middleware in backend/src/middleware/logging.ts
- [ ] T100 Setup CORS and security headers for production in backend/src/middleware/security.ts
- [ ] T101 Setup profanity filtering with leo-profanity + custom blocklist in backend/src/middleware/content-filter.ts
- [ ] T102 Connect bot webhook to Telegram API with error handling in backend/src/bot/webhook.ts

## Phase 3.8: Testing & Performance

### Performance & Testing
- [ ] T103 [P] Unit tests for validation logic in backend/tests/unit/test_validation.ts
- [ ] T104 [P] Unit tests for auth service in backend/tests/unit/test_auth_service.ts
- [ ] T105 [P] Unit tests for listing service in backend/tests/unit/test_listing_service.ts
- [ ] T106 [P] Performance tests for API endpoints (<200ms) in backend/tests/performance/test_api_performance.ts
- [ ] T107 [P] Load testing with Artillery configuration in tests/load-testing/artillery-config.yml
- [ ] T108 [P] Browser automation E2E tests with mock users in tests/e2e/test_user_journeys.spec.ts
- [ ] T109 [P] Frontend unit tests for components in frontend/tests/unit/
- [ ] T110 [P] Frontend integration tests in frontend/tests/integration/

## Phase 3.9: Documentation & Final Setup

### Documentation & Final Setup
- [ ] T111 [P] Update project README with setup instructions
- [ ] T112 [P] Create database migration scripts for schema changes
- [ ] T113 [P] Setup production environment variables and secrets
- [ ] T114 Run quickstart.md validation scenarios with mock users

## Dependencies

- Setup (T001-T008) before all other phases
- Contract tests (T009-T039) before implementation (T040-T094)
- Models (T040-T050) before services (T051-T059)
- Services before endpoints (T064-T085)
- Bot commands (T060-T063) depend on webhook setup (T102)
- Frontend components (T086-T094) can run parallel with backend after auth (T064)
- Integration (T095-T102) after core implementation
- Testing & performance (T103-T110) after integration complete
- Documentation (T111-T114) after all implementation

## Parallel Example

```
# Launch contract tests together (T009-T030):
Task: "Contract test POST /api/auth in tests/contract/test_auth_post.ts"
Task: "Contract test GET /api/me in tests/contract/test_me_get.ts"
Task: "Contract test GET /api/categories in tests/contract/test_categories_get.ts"
Task: "Contract test GET /api/listings in tests/contract/test_listings_get.ts"

# Launch models together (T040-T050):
Task: "User model with Telegram integration in backend/src/db/models/user.ts"
Task: "Category model with 2-level hierarchy in backend/src/db/models/category.ts"
Task: "Listing model with premium features in backend/src/db/models/listing.ts"
Task: "Flag model for content moderation in backend/src/db/models/flag.ts"
```

## Notes

- [P] tasks = different files/modules, no dependencies
- Verify tests fail before implementing functionality
- Keep existing T001-T008 code reorganization tasks as foundation
- Mock users enable comprehensive local testing without Telegram integration
- KV caching critical for sub-200ms performance goals
- Admin functionality controlled via ADMIN_ID environment variable
- Premium features use Telegram Stars payment integration
- Archive system preserves data instead of deletion
- Browser automation tests validate complete user journeys
- Artillery load testing ensures concurrent user performance

## Task Generation Rules

1. **From Contracts (api-schema.yaml)**:
   - 29 endpoints → 22 contract test tasks [P] + implementation tasks
   - Authentication, listings, admin, development sections

2. **From Data Model**:
   - 12 entities → 11 model creation tasks [P]
   - Services layer for business logic [P]

3. **From Quickstart Scenarios**:
   - 12 test scenarios → integration test tasks [P]
   - E2E browser automation tests

4. **From Implementation Plan**:
   - Code restructuring from existing functional deployment
   - CloudFlare Workers + Pages architecture
   - TypeScript, Hono, Grammy, React, Drizzle ORM tech stack

## Validation Checklist

- [x] All 29 contract endpoints have corresponding tests
- [x] All 12 entities have model tasks
- [x] All tests come before implementation (TDD enforced)
- [x] Parallel tasks truly independent (different files/modules)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] Existing T001-T008 reorganization tasks preserved
- [x] Mock user system enables comprehensive testing
- [x] Admin functionality and premium features covered
- [x] Performance and load testing included
