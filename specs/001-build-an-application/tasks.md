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
5. Number tasks sequentially (T001-T044)
6. Focus: Enhance existing working code with new features
```

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Phase 3.1: Code Reorganization & Setup

**CRITICAL: Restructure existing working code first**

- [ ] T001 [P] Reorganize backend bot commands to `/src/bot/` folder structure
- [ ] T002 [P] Restructure database files to `/src/db/` with proper schema organization
- [ ] T003 [P] Move KV caching logic to `/src/kv/` library folder
- [ ] T004 [P] Organize R2 image handling to `/src/r2/` folder
- [ ] T005 [P] Create admin functionality folder `/src/admin/` for management features
- [ ] T006 [P] Setup dev utilities in `/src/dev/` for mock users and auth bypass
- [ ] T007 Add missing dependencies: leo-profanity, Artillery for load testing
- [ ] T008 [P] Configure TypeScript paths for new folder structure

## Phase 3.2: Database & Models (TDD) ⚠️ MUST COMPLETE BEFORE 3.3

**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

- [ ] T009 [P] Database schema test for User entity in `/src/db/__tests__/schema.test.ts`
- [ ] T010 [P] Database schema test for Category entity in `/src/db/__tests__/schema.test.ts`
- [ ] T011 [P] Database schema test for Listing entity in `/src/db/__tests__/schema.test.ts`
- [ ] T012 [P] Database schema test for premium features in `/src/db/__tests__/premium.test.ts`
- [ ] T013 [P] Database migration test in `/src/db/__tests__/migration.test.ts`

## Phase 3.3: Core Database Implementation (ONLY after tests are failing)

- [ ] T014 [P] Implement User model with Telegram auth in `/src/db/schema/users.ts`
- [ ] T015 [P] Implement Category model with 2-level hierarchy in `/src/db/schema/categories.ts`
- [ ] T016 [P] Implement Listing model with all fields in `/src/db/schema/listings.ts`
- [ ] T017 [P] Implement Flag, ModerationAction, Appeal models in `/src/db/schema/moderation.ts`
- [ ] T018 [P] Implement PremiumFeature, BlockedWord models in `/src/db/schema/premium.ts`
- [ ] T019 [P] Implement UserSession, MockUser models in `/src/db/schema/sessions.ts`
- [ ] T020 [P] Create database indexes for performance in `/src/db/indexes.ts`
- [ ] T021 [P] Setup Drizzle migrations for all schemas in `/src/db/migrations/`

## Phase 3.4: API Contract Tests (TDD) ⚠️ MUST COMPLETE BEFORE 3.5

**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

- [ ] T022 [P] Contract test POST /api/auth in `/src/__tests__/contract/auth.test.ts`
- [ ] T023 [P] Contract test GET /api/me in `/src/__tests__/contract/user.test.ts`
- [ ] T024 [P] Contract test GET /api/categories in `/src/__tests__/contract/categories.test.ts`
- [ ] T025 [P] Contract test POST /api/listings in `/src/__tests__/contract/listings-create.test.ts`
- [ ] T026 [P] Contract test GET /api/listings in `/src/__tests__/contract/listings-search.test.ts`
- [ ] T027 [P] Contract test GET /api/listings/{id} in `/src/__tests__/contract/listings-detail.test.ts`
- [ ] T028 [P] Contract test PUT /api/listings/{id} in `/src/__tests__/contract/listings-update.test.ts`
- [ ] T029 [P] Contract test POST /api/listings/{id}/flag in `/src/__tests__/contract/moderation.test.ts`
- [ ] T030 [P] Contract test POST /api/upload in `/src/__tests__/contract/images.test.ts`
- [ ] T031 [P] Contract test Admin endpoints in `/src/__tests__/contract/admin.test.ts`
- [ ] T032 [P] Contract test Bot webhook in `/src/__tests__/contract/bot.test.ts`
- [ ] T033 [P] Contract test Dev endpoints in `/src/__tests__/contract/dev.test.ts`

## Phase 3.5: Core API Implementation (ONLY after contract tests are failing)

- [ ] T034 Implement authentication endpoint with Telegram initData validation in `/src/index.ts`
- [ ] T035 Implement user profile endpoints in `/src/index.ts`
- [ ] T036 Implement categories endpoints with KV caching in `/src/index.ts`
- [ ] T037 Implement listing create/read endpoints in `/src/index.ts`
- [ ] T038 Implement listing update/delete with ownership checks in `/src/index.ts`
- [ ] T039 Implement listing search with full-text search in `/src/index.ts`
- [ ] T040 Implement image upload to R2 with processing in `/src/index.ts`
- [ ] T041 Implement moderation endpoints (flag, admin actions) in `/src/index.ts`
- [ ] T042 [P] Implement bot webhook handler with command routing in `/src/bot/webhook.ts`
- [ ] T043 [P] Implement dev endpoints for mock users and auth bypass in `/src/dev/auth.ts`

## Phase 3.6: Integration & Features

- [ ] T044 [P] Implement KV caching service with CQRS pattern in `/src/kv/cache.ts`
- [ ] T045 [P] Implement R2 image service with processing in `/src/r2/images.ts`
- [ ] T046 [P] Implement admin panel functionality in `/src/admin/panel.ts`
- [ ] T047 [P] Add profanity filtering with leo-profanity in `/src/admin/content-filter.ts`
- [ ] T048 [P] Implement premium features logic in `/src/admin/premium.ts`
- [ ] T049 [P] Add username validation service in `/src/admin/validation.ts`
- [ ] T050 Implement listing preview functionality with warnings
- [ ] T051 Implement archive system instead of hard deletes
- [ ] T052 Add bot command handlers: /start, /help, /question in `/src/bot/commands.ts`

## Phase 3.7: Frontend Enhancement Tests (TDD)

**CRITICAL: Frontend tests MUST fail before implementation**

- [ ] T053 [P] Test listing preview UI in `/webapp/src/components/__tests__/ListingPreview.test.tsx`
- [ ] T054 [P] Test image gallery with swipes in `/webapp/src/components/__tests__/ImageGallery.test.tsx`
- [ ] T055 [P] Test premium features UI in `/webapp/src/components/__tests__/PremiumFeatures.test.tsx`
- [ ] T056 [P] Test admin panel UI in `/webapp/src/components/__tests__/AdminPanel.test.tsx`
- [ ] T057 [P] Test mock user auth bypass in `/webapp/src/dev/__tests__/authBypass.test.tsx`

## Phase 3.8: Frontend Implementation (ONLY after frontend tests fail)

- [ ] T058 [P] Implement listing preview with warnings in `/webapp/src/components/ListingPreview.tsx`
- [ ] T059 [P] Implement image gallery with swipe navigation in `/webapp/src/components/ImageGallery.tsx`
- [ ] T060 [P] Implement premium features UI with visual enhancements in `/webapp/src/components/PremiumFeatures.tsx`
- [ ] T061 [P] Implement comprehensive admin panel in `/webapp/src/components/AdminPanel.tsx`
- [ ] T062 [P] Enhance mock user system for testing in `/webapp/src/dev/mockAuth.tsx`
- [ ] T063 Update API client to support all new endpoints in `/webapp/src/api.ts`

## Phase 3.9: Integration Testing with Browser Automation

**CRITICAL: Complete user journey testing**

- [ ] T064 [P] Integration test: Complete buyer journey with mock users in `/src/__tests__/integration/buyer-journey.test.ts`
- [ ] T065 [P] Integration test: Complete seller journey with listing creation in `/src/__tests__/integration/seller-journey.test.ts`
- [ ] T066 [P] Integration test: Admin moderation workflow in `/src/__tests__/integration/admin-workflow.test.ts`
- [ ] T067 [P] Integration test: Bot command functionality in `/src/__tests__/integration/bot-commands.test.ts`
- [ ] T068 [P] Integration test: Premium features workflow in `/src/__tests__/integration/premium-features.test.ts`

## Phase 3.10: Performance & Load Testing

- [ ] T069 [P] Setup Artillery load testing configuration in `/artillery.yml`
- [ ] T070 [P] Load test: API endpoints performance in `/src/__tests__/load/api-performance.test.ts`
- [ ] T071 [P] Load test: KV cache performance in `/src/__tests__/load/cache-performance.test.ts`
- [ ] T072 [P] Load test: Full-text search performance in `/src/__tests__/load/search-performance.test.ts`
- [ ] T073 [P] Performance test: Image processing and upload in `/src/__tests__/load/image-performance.test.ts`

## Phase 3.11: Polish & Validation

- [ ] T074 [P] Add comprehensive error handling and structured logging
- [ ] T075 [P] Implement data migration from deployed to local environment
- [ ] T076 [P] Add admin notifications for user bans and violations
- [ ] T077 [P] Enhance archive system with management UI
- [ ] T078 Run complete quickstart validation scenarios from `/specs/001-build-an-application/quickstart.md`
- [ ] T079 Performance validation: All cached endpoints < 200ms response time
- [ ] T080 Integration validation: Browser automation tests with real user flows

## Dependencies

**Critical Path:**

- Code reorganization (T001-T008) must complete before database work
- Database tests (T009-T013) before database implementation (T014-T021)
- Contract tests (T022-T033) before API implementation (T034-T043)
- Frontend tests (T053-T057) before frontend implementation (T058-T063)
- Core functionality before integration testing (T064-T068)
- All features before performance testing (T069-T073)

**Blocking Relationships:**

- T014-T021 depend on T009-T013 (database tests must fail first)
- T034-T043 depend on T022-T033 (contract tests must fail first)
- T044-T052 depend on T014-T021 (need database models)
- T058-T063 depend on T053-T057 (frontend tests must fail first)
- T064-T068 depend on T034-T052 (need working API and features)
- T069-T080 depend on all previous phases (complete system needed)

## Parallel Execution Examples

### Phase 3.1 - Code Reorganization (Run together):

```
Task: "Reorganize backend bot commands to /src/bot/ folder structure"
Task: "Restructure database files to /src/db/ with proper schema organization"
Task: "Move KV caching logic to /src/kv/ library folder"
Task: "Organize R2 image handling to /src/r2/ folder"
Task: "Create admin functionality folder /src/admin/ for management features"
Task: "Setup dev utilities in /src/dev/ for mock users and auth bypass"
Task: "Configure TypeScript paths for new folder structure"
```

### Phase 3.2 - Database Tests (Run together):

```
Task: "Database schema test for User entity in /src/db/__tests__/schema.test.ts"
Task: "Database schema test for Category entity in /src/db/__tests__/schema.test.ts"
Task: "Database schema test for Listing entity in /src/db/__tests__/schema.test.ts"
Task: "Database schema test for premium features in /src/db/__tests__/premium.test.ts"
Task: "Database migration test in /src/db/__tests__/migration.test.ts"
```

### Phase 3.4 - Contract Tests (Run together):

```
Task: "Contract test POST /api/auth in /src/__tests__/contract/auth.test.ts"
Task: "Contract test GET /api/me in /src/__tests__/contract/user.test.ts"
Task: "Contract test GET /api/categories in /src/__tests__/contract/categories.test.ts"
Task: "Contract test POST /api/listings in /src/__tests__/contract/listings-create.test.ts"
Task: "Contract test GET /api/listings in /src/__tests__/contract/listings-search.test.ts"
```

### Phase 3.9 - Integration Tests (Run together):

```
Task: "Integration test: Complete buyer journey with mock users in /src/__tests__/integration/buyer-journey.test.ts"
Task: "Integration test: Complete seller journey with listing creation in /src/__tests__/integration/seller-journey.test.ts"
Task: "Integration test: Admin moderation workflow in /src/__tests__/integration/admin-workflow.test.ts"
Task: "Integration test: Bot command functionality in /src/__tests__/integration/bot-commands.test.ts"
Task: "Integration test: Premium features workflow in /src/__tests__/integration/premium-features.test.ts"
```

## Notes

**Implementation Strategy:**

- **Priority 1**: Restructure existing working code to specification folders (T001-T008)
- **Priority 2**: Add comprehensive test coverage with TDD approach (T009-T033, T053-T057)
- **Priority 3**: Implement new features: preview, KV caching, admin panel, premium features (T034-T052, T058-T063)
- **Priority 4**: Integration testing with browser automation and mock users (T064-T068)
- **Priority 5**: Performance validation and load testing (T069-T080)

**Key Focus Areas:**

- Existing code enhancement vs. greenfield development
- Mock user system for comprehensive local testing
- KV caching for sub-200ms performance
- Full-text fuzzy search with large datasets
- Admin panel via ADMIN_ID environment variable
- Premium features with correct durations and visual enhancements
- Archive system instead of hard deletion
- Browser automation for complete user journey validation

**Testing Philosophy:**

- TDD enforced: All tests must fail before implementation
- Mock users enable auth bypass for local testing
- Browser automation validates complete workflows
- Artillery load testing ensures performance goals
- Integration tests cover buyer/seller/admin journeys

## Validation Checklist

_GATE: Checked before marking complete_

- [ ] All 25+ API endpoints have contract tests that initially fail
- [ ] All 12 database entities have schema tests that initially fail
- [ ] All new features (preview, KV cache, admin panel) have failing tests first
- [ ] Mock user system enables complete local testing without Telegram
- [ ] Browser automation tests validate end-to-end user journeys
- [ ] Artillery load testing validates performance requirements
- [ ] Archive system preserves data instead of hard deletion
- [ ] Admin functionality restricted to ADMIN_ID environment variable
- [ ] Premium features have correct durations (7 days sticky/highlight, 21 days auto-bump)
- [ ] KV caching provides sub-200ms performance for category browsing
- [ ] Full-text fuzzy search works efficiently with large datasets
- [ ] Data migration from deployed to local environment functions correctly

**Success Criteria:** Implementation enhances existing working code with new features while maintaining performance and adding comprehensive test coverage through TDD approach with mock users and browser automation.
