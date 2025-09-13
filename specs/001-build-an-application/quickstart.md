# Quickstart Guide: Telegram Marketplace Application

## Overview

This guide walks through testing the core user journey of the Telegram marketplace application. Follow these steps to validate that the implementation meets the feature specification requirements.

## Prerequisites

- Existing working codebase (functional deployment)
- Mock users configured for local testing (`VITE_DEV_BYPASS_AUTH=true`)
- Artillery load testing tool
- Browser automation MCP for E2E testing
- Data migration capability from deployed to local

## Core User Journey Test

### 0. Development Environment Setup

**Test**: Validate existing working code and local development setup

**Steps**:
1. Run `make dev-local` to start local environment with auth bypass
2. Access web app at `http://localhost:5173/#/me`
3. Verify mock users are loaded via `/dev/mock-users` endpoint
4. Test authentication bypass with `/dev/auth` endpoint
5. Validate data migration from deployed to local works

**Expected Result**:
- Local environment starts without Telegram dependencies
- Mock users (buyer, seller, admin) are available
- Auth bypass allows testing without Telegram integration
- Deployed data can be migrated to local for testing

**Validates Requirements**: FR-032, FR-033

### 1. Bot Command Functionality

**Test**: Essential Telegram bot commands work correctly

**Steps**:
1. Send `/start` command to bot (or use mock in local)
2. Send `/help` command to view available options
3. Send `/question` command to test admin contact
4. Verify bot webhook endpoint receives and processes updates
5. Test deep linking from bot to web app

**Expected Result**:
- `/start` provides welcome message and navigation options
- `/help` shows comprehensive command list and usage
- `/question` allows users to contact admin
- Bot webhook processes all message types correctly
- Deep links redirect properly between bot and web app

**Validates Requirements**: FR-024, FR-004

### 2. KV Caching and Performance

**Test**: CQRS-style caching system performance

**Steps**:
1. Browse categories and monitor KV cache hits/misses
2. Create new listing and verify cache invalidation
3. Test search performance with cached results
4. Verify cache TTL settings (listings: 5min, categories: 1hr)
5. Load test with Artillery to validate performance goals

**Expected Result**:
- Category listings served from KV cache with sub-200ms response
- Cache invalidated correctly on listing create/update/delete
- Search results cached with proper hash-based keys
- Full-text fuzzy search performs well with large datasets
- Artillery tests show system handles concurrent load

**Validates Requirements**: FR-002, FR-016

### 3. Listing Preview and Publishing Flow

**Test**: New listing creation with preview functionality

**Steps**:
1. Create draft listing with all required fields
2. Use preview functionality to review listing before publish
3. Verify username accessibility validation
4. Check profanity filtering (leo-profanity + admin blocklist)
5. Publish listing and verify status transitions

**Expected Result**:
- Draft listings can be previewed with warnings
- Username must exist and be accessible for contact
- Profanity filter prevents inappropriate content
- Status transitions: Draft → Active → Published correctly
- Contact username populated from user profile

**Validates Requirements**: FR-003, FR-015, FR-023

### 3. Create New Listing

**Test**: Sell an item through the marketplace

**Steps**:
1. Click "Create Listing" button in web app
2. Fill out listing form:
   - Select 2-level category (parent → child)
   - Enter title (max 100 chars)
   - Enter description (max 1000 chars)
   - Set price in USD with decimal precision
   - Upload 2-5 images (test image processing)
3. Submit listing
4. Verify listing appears in category browse
5. Check listing detail page shows all information

**Expected Result**:
- Form validates all required fields
- Images are processed (resized, thumbnails generated)
- Listing gets UUID and expires_at timestamp (+7 days)
- Listing appears in appropriate category immediately
- Deep link to listing works when shared

**Validates Requirements**: FR-003, FR-008, FR-009, FR-014

### 4. Contact Seller Communication

**Test**: Buyer-seller interaction flow

**Steps**:
1. From another user account, browse to a listing
2. Click "Contact Seller" button
3. Verify redirect to Telegram conversation with seller
4. Send message to seller through Telegram
5. Test deep linking by sharing listing URL
6. Verify recipient directed to correct listing page

**Expected Result**:
- Contact button generates proper Telegram deep link
- Telegram opens conversation with correct seller
- Messages flow through Telegram infrastructure
- Shared links direct to specific listing pages
- Communication happens entirely within Telegram

**Validates Requirements**: FR-005, FR-014

### 5. Listing Management

**Test**: Owner manages their listings

**Steps**:
1. As listing owner, navigate to "My Listings" section
2. Edit an existing listing (change price, description)
3. Mark a listing as sold
4. Delete a listing
5. Test bump functionality on listing near expiration
6. Verify listing limit enforcement (try creating 21st listing)

**Expected Result**:
- User can view all their listings with status indicators
- Edit form pre-populates with current values
- Sold listings show status but remain visible
- Deleted listings disappear from browse immediately
- Bump extends expiration by 7 days
- 21st listing creation fails with appropriate error

**Validates Requirements**: FR-006, FR-017, FR-018, FR-028

### 6. Moderation System

**Test**: Content flagging and admin review

**Steps**:
1. As regular user, flag inappropriate listing
2. Select flag reason (spam, inappropriate, fake, other)
3. Add description if reason is "other"
4. As admin user, access moderation panel
5. Review flagged content and take action
6. Verify moderation action is logged

**Expected Result**:
- Flag submission creates pending review item
- User cannot flag same listing twice
- Admin sees flagged content queue
- Admin can warn user, remove content, or dismiss flag
- All actions are logged with timestamps and reasons

**Validates Requirements**: FR-010, FR-011, FR-012, FR-021

### 7. Search & Discovery

**Test**: Content findability

**Steps**:
1. Search for items using keywords from titles
2. Search using description text
3. Test search with partial matches
4. Combine search with category filters
5. Test sorting options (newest, price, expiring)
6. Verify sticky listings appear at top

**Expected Result**:
- Full-text search returns relevant listings
- Search works across both title and description
- Partial and fuzzy matching works
- Category + search combination filters correctly
- Sort options change result order appropriately
- Premium sticky listings show prominently

**Validates Requirements**: FR-016, FR-019, FR-025

### 8. Premium Features with Enhanced UI

**Test**: Paid feature functionality with visual enhancements

**Steps**:
1. Purchase color highlighting feature (7 days)
2. Purchase sticky listing feature (7 days)
3. Purchase auto-bump feature (21 days or until cancelled)
4. View "My Listings" premium features section
5. Test admin manual stick functionality
6. Verify premium feature cancellation

**Expected Result**:
- Color highlighted listings display with visual distinction
- Sticky listings appear at top of category results
- Auto-bump renews listings automatically for 21 days
- Users can view and manage their premium features
- Admin can manually stick listings with custom duration
- Premium features can be cancelled and show correct status

**Validates Requirements**: FR-025, FR-026, FR-028

### 9. Enhanced Admin Panel

**Test**: Comprehensive administrative controls

**Steps**:
1. Access admin section via ADMIN_ID environment variable check
2. Review ALL listings (flagged and unflagged) in admin panel
3. Manually un-publish any listing with admin notes
4. Ban/unban users and verify notification to users
5. Manage admin-controlled blocklist (leo-profanity + custom words)
6. Test admin manual stick functionality on any listing

**Expected Result**:
- Admin panel visible only to user matching ADMIN_ID
- All listings visible regardless of flag status
- Admin can hide/restore any listing with notes
- Ban/unban sends notifications to affected users
- Blocklist prevents content creation and logs violations
- Admin can manually stick listings with custom duration

**Validates Requirements**: FR-011, FR-012, FR-020, FR-023, FR-026, FR-031

### 10. Ban & Appeal Process

**Test**: User discipline and appeals

**Steps**:
1. As admin, ban a user for policy violations
2. As banned user, attempt to create listing (should fail)
3. Use bot `/appeal` command to submit appeal
4. As admin, review and approve appeal
5. Verify user access is restored

**Expected Result**:
- Banned users cannot create new listings
- Appeal submission creates admin review item
- Bot accepts appeal message correctly
- Admin can approve/deny appeals with response
- Successful appeals restore user access

**Validates Requirements**: FR-022, FR-024

### 11. Browser Automation Testing

**Test**: E2E testing with mock users via browser automation MCP

**Steps**:
1. Setup browser automation with mock buyer and seller users
2. Run complete buyer journey: browse → contact seller → communication flow
3. Run seller journey: create listing → preview → publish → manage
4. Test admin workflow: review listings → moderate content → ban user
5. Verify image gallery with swipe navigation works correctly

**Expected Result**:
- Mock users can complete full marketplace workflows
- Browser automation validates all user interactions
- Image galleries display full-screen with swipe functionality
- All user journeys complete without errors
- Tests run reliably with make build integration

**Validates Requirements**: FR-008, FR-032

### 12. Data Archival System

**Test**: Archive management instead of deletion

**Steps**:
1. Mark listings as sold and verify they move to archive
2. Expire listings and verify they archive after 7 days
3. Un-publish listings and verify they move to archived section
4. Test archive browsing and management functionality
5. Verify archived items don't appear in active searches

**Expected Result**:
- Sold/expired/unpublished items move to archive, not deleted
- Archived items accessible via separate "My Archived Listings" section
- Archives excluded from public browse and search
- Archive system preserves data for future management
- Users can restore archived items if needed

**Validates Requirements**: FR-006, FR-029

## Load Testing and Performance Validation

### Artillery Load Testing

1. **API Endpoints**: Test all endpoints with Artillery load testing tool
2. **KV Cache Performance**: Validate CQRS-style cache performance under load
3. **Search Load**: Full-text fuzzy search with concurrent users
4. **Image Processing**: Upload and gallery performance under load
5. **Bot Webhook**: Telegram bot webhook handling concurrent updates

**Artillery Configuration**:
```yaml
config:
  target: 'http://localhost:8787'
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: Browse listings
    weight: 70
  - name: Create listing
    weight: 20
  - name: Search listings
    weight: 10
```

### Performance Goals

1. **API Response Times**: All cached endpoints < 200ms, uncached < 500ms
2. **KV Cache Hits**: >90% cache hit rate for category browsing
3. **Search Performance**: Full-text search < 1s for 10,000+ listings
4. **Concurrent Load**: Handle 50 concurrent users without degradation

## Data Validation

### Database Integrity

1. **Foreign Keys**: All relationships enforce referential integrity
2. **Constraints**: Field validations prevent invalid data
3. **Indexes**: Search and browse queries use appropriate indexes
4. **Migrations**: Schema changes apply cleanly

### Business Logic

1. **Listing Limits**: Users cannot exceed 20 active listings (admin unlimited)
2. **Expiration**: Listings expire exactly 7 days after creation/bump
3. **Authentication**: Telegram initData validation + mock user support for testing
4. **Username Validation**: Users must have accessible @username for contact
5. **Archive System**: Items archived instead of deleted
6. **Premium Features**: Correct duration enforcement (7 days highlight/sticky, 21 days auto-bump)

## Security Validation

### Authentication & Authorization

1. **Token Validation**: Invalid tokens are rejected
2. **CORS Policy**: Only allowed origins can access API
3. **Input Sanitization**: XSS and injection attempts are blocked
4. **Rate Limiting**: Excessive requests are throttled

### Content Filtering & Privacy

1. **Profanity Filtering**: leo-profanity + admin-managed blocklist prevents inappropriate content
2. **Image Metadata**: EXIF data is stripped from uploaded images
3. **User Data**: Only Telegram-provided info stored + username accessibility validation
4. **Audit Trail**: All moderation actions logged with admin notes
5. **Data Archival**: Content archived instead of deleted for compliance

## Integration Testing

### Telegram Bot Integration

1. **Bot Commands**: /start, /help, /question commands work correctly
2. **Webhook Processing**: Bot webhook handles all message types
3. **Deep Links**: Bot-to-webapp navigation with specific listing URLs
4. **Payment Integration**: Telegram Stars for premium features
5. **Mock Integration**: Local testing works with auth bypass

### CloudFlare Services Integration

1. **D1 Database**: Full-text search with FTS5, migrations work correctly
2. **KV Storage**: CQRS-style caching with proper TTL and invalidation
3. **R2 Storage**: Images upload, process, and serve with gallery functionality
4. **Workers Runtime**: All API endpoints including admin functions work in production
5. **Data Migration**: Can migrate data from deployed to local for testing

## Success Criteria

The implementation is considered complete when:

- [ ] Existing working code is properly restructured to specification folders
- [ ] Bot commands (/start, /help, /question) function correctly
- [ ] Mock user system allows comprehensive local testing
- [ ] KV caching provides sub-200ms performance for cached endpoints
- [ ] Full-text fuzzy search works efficiently with large datasets
- [ ] Admin panel (via ADMIN_ID) provides comprehensive management
- [ ] Premium features work with correct durations and visual enhancements
- [ ] Archive system preserves data instead of deletion
- [ ] Browser automation tests validate complete user journeys
- [ ] Artillery load testing shows system handles concurrent users
- [ ] Data migration from deployed to local works reliably
- [ ] Profanity filtering prevents inappropriate content effectively

## Troubleshooting Common Issues

### Development Environment Issues
- Enable `VITE_DEV_BYPASS_AUTH=true` for local testing
- Verify mock users are loaded via `/dev/mock-users`
- Check data migration from deployed to local environment
- Ensure `make dev-local` starts without Telegram dependencies

### Performance Problems
- Monitor KV cache hit/miss ratios
- Check FTS5 full-text search index performance
- Verify Artillery load test configuration
- Review CloudFlare Workers runtime limits

### Bot Integration Issues
- Test bot commands in local environment with mocks
- Verify webhook endpoint handles all message types
- Check deep link generation and navigation
- Validate Telegram Stars payment integration

### Admin Panel Problems
- Confirm ADMIN_ID environment variable is set correctly
- Verify admin section visibility logic
- Test admin-managed blocklist functionality
- Check admin notification system for user bans

### Cache and Performance Issues
- Monitor KV cache invalidation on listing changes
- Check CQRS-style cache key patterns
- Verify cache TTL settings (5min listings, 1hr categories)
- Test search result caching with hash-based keys