# Data Model: Telegram Marketplace Application

## Core Entities

### User
Represents a Telegram user with marketplace-specific data.

**Fields**:
- `telegram_id` (bigint, primary key) - Telegram user ID
- `username` (varchar, required) - Telegram username (must exist and be accessible)
- `first_name` (varchar) - Telegram first name
- `last_name` (varchar, nullable) - Telegram last name
- `profile_photo_url` (varchar, nullable) - Telegram profile photo
- `created_at` (datetime) - Account creation timestamp
- `last_active` (datetime) - Last activity timestamp
- `is_banned` (boolean, default false) - User ban status
- `ban_reason` (varchar, nullable) - Reason for ban
- `banned_at` (datetime, nullable) - Ban timestamp
- `warning_count` (integer, default 0) - Number of warnings received
- `is_admin` (boolean, computed from ADMIN_ID env) - Administrator status (computed field)
- `username_verified_at` (datetime, nullable) - Last verification of username accessibility

**Relationships**:
- One-to-many with Listing (user can have multiple listings)
- One-to-many with Flag (user can flag multiple listings)
- One-to-many with ModerationAction (user can receive multiple actions)
- One-to-many with Appeal (user can submit multiple appeals)
- One-to-many with PremiumFeature (user can purchase multiple features)

**Validation Rules**:
- `telegram_id` must be unique and positive
- `username` is required and must be accessible via Telegram messaging
- `first_name` is required
- `warning_count` cannot be negative
- Admin status determined by matching telegram_id with ADMIN_ID environment variable

**State Transitions**:
- Active → Warned (admin action)
- Warned → Banned (excessive warnings)
- Banned → Active (successful appeal or admin unban)

### Category
Represents 2-level hierarchy for organizing listings.

**Fields**:
- `id` (integer, primary key, auto-increment) - Category ID
- `name` (varchar, unique) - Category name
- `parent_id` (integer, nullable, foreign key) - Parent category ID
- `description` (text, nullable) - Category description
- `created_at` (datetime) - Creation timestamp
- `is_active` (boolean, default true) - Category visibility

**Relationships**:
- Self-referential (parent-child hierarchy)
- One-to-many with Listing (category can have multiple listings)

**Validation Rules**:
- `name` must be unique within same parent level
- Maximum 2 levels deep (parent → child, no grandchildren)
- Cannot delete category with active listings
- Parent categories cannot be assigned to listings directly

### Listing
Represents an item for sale in the marketplace.

**Fields**:
- `id` (uuid, primary key) - Unique listing identifier
- `user_id` (bigint, foreign key) - Owner's Telegram ID
- `category_id` (integer, foreign key) - Category assignment
- `title` (varchar, max 100) - Listing title
- `description` (text, max 1000) - Item description
- `price_usd` (decimal, 2 places) - Price in USD
- `images` (json array) - Array of image URLs in R2
- `created_at` (datetime) - Creation timestamp
- `expires_at` (datetime) - Expiration timestamp (created_at + 7 days)
- `bumped_at` (datetime, nullable) - Last bump timestamp
- `status` (enum: draft, active, expired, sold, archived, hidden) - Listing status
- `is_sticky` (boolean, default false) - Premium sticky status
- `is_highlighted` (boolean, default false) - Premium color highlighting
- `auto_bump_enabled` (boolean, default false) - Auto-bump feature status
- `view_count` (integer, default 0) - Number of views
- `contact_username` (varchar) - Contact @username (from user.username)
- `admin_notes` (text, nullable) - Admin-only notes
- `published_at` (datetime, nullable) - When moved from draft to active
- `archived_at` (datetime, nullable) - When archived by user or admin

**Relationships**:
- Many-to-one with User (listing belongs to user)
- Many-to-one with Category (listing belongs to category)
- One-to-many with Flag (listing can be flagged multiple times)
- One-to-many with ModerationAction (listing can have multiple actions)

**Validation Rules**:
- `title` is required, max 100 characters, profanity filtered
- `description` is required, max 1000 characters, profanity filtered
- `price_usd` must be positive, max 2 decimal places
- `images` array 1-9 items, each valid R2 URL
- User cannot exceed 20 active/draft listings (admin unlimited)
- `category_id` must reference leaf category (not parent)
- `contact_username` must be valid and accessible Telegram username

**State Transitions**:
- Draft → Active (publish action with preview)
- Active → Expired (after 7 days without bump)
- Expired → Active (bump action)
- Active → Sold (user marks as sold)
- Active/Expired/Sold → Archived (user action)
- Any status → Hidden (admin moderation)
- Hidden → Active (admin restore)

### Flag
Represents user reports of inappropriate content.

**Fields**:
- `id` (integer, primary key, auto-increment) - Flag ID
- `listing_id` (uuid, foreign key) - Flagged listing
- `reporter_id` (bigint, foreign key) - User who flagged
- `reason` (enum) - Flag reason (spam, inappropriate, fake, other)
- `description` (text, nullable) - Additional details
- `created_at` (datetime) - Flag submission time
- `reviewed_at` (datetime, nullable) - Admin review time
- `status` (enum) - Review status (pending, upheld, dismissed)
- `reviewed_by` (bigint, nullable, foreign key) - Admin who reviewed

**Relationships**:
- Many-to-one with Listing (flag belongs to listing)
- Many-to-one with User (flag submitted by user)
- Many-to-one with User (flag reviewed by admin)

**Validation Rules**:
- User cannot flag same listing twice
- User cannot flag their own listings
- `reason` must be valid enum value
- `description` required if reason is "other"

**State Transitions**:
- Pending → Upheld (admin confirms violation)
- Pending → Dismissed (admin dismisses flag)

### ModerationAction
Represents administrative actions taken on users or content.

**Fields**:
- `id` (integer, primary key, auto-increment) - Action ID
- `target_user_id` (bigint, foreign key) - User receiving action
- `target_listing_id` (uuid, nullable, foreign key) - Listing affected
- `admin_id` (bigint, foreign key) - Admin performing action
- `action_type` (enum) - Type of action (warning, ban, content_removal, unban)
- `reason` (text) - Reason for action
- `created_at` (datetime) - Action timestamp
- `expires_at` (datetime, nullable) - Action expiration (for temporary bans)

**Relationships**:
- Many-to-one with User (action targets user)
- Many-to-one with Listing (action may target listing)
- Many-to-one with User (action performed by admin)

**Validation Rules**:
- `reason` is required for all actions
- `expires_at` required for temporary bans
- Cannot ban admin users
- Action type must be valid enum

### Appeal
Represents user appeals of moderation actions.

**Fields**:
- `id` (integer, primary key, auto-increment) - Appeal ID
- `user_id` (bigint, foreign key) - User submitting appeal
- `moderation_action_id` (integer, foreign key) - Action being appealed
- `message` (text) - Appeal message from user
- `created_at` (datetime) - Appeal submission time
- `reviewed_at` (datetime, nullable) - Admin review time
- `status` (enum) - Appeal status (pending, approved, denied)
- `admin_response` (text, nullable) - Admin response message
- `reviewed_by` (bigint, nullable, foreign key) - Admin who reviewed

**Relationships**:
- Many-to-one with User (appeal submitted by user)
- Many-to-one with ModerationAction (appeal targets action)
- Many-to-one with User (appeal reviewed by admin)

**Validation Rules**:
- User can only appeal each action once
- `message` is required, max 500 characters
- Cannot appeal actions older than 30 days

**State Transitions**:
- Pending → Approved (appeal granted, action reversed)
- Pending → Denied (appeal rejected)

### PremiumFeature
Represents paid premium features purchased by users.

**Fields**:
- `id` (integer, primary key, auto-increment) - Feature ID
- `user_id` (bigint, foreign key) - User who purchased
- `listing_id` (uuid, nullable, foreign key) - Associated listing
- `feature_type` (enum: sticky_listing, color_highlight, auto_bump) - Type of feature
- `stars_paid` (integer) - Telegram Stars amount paid
- `purchased_at` (datetime) - Purchase timestamp
- `expires_at` (datetime) - Feature expiration
- `is_active` (boolean, default true) - Feature status
- `auto_renewed_count` (integer, default 0) - Number of automatic renewals (for auto_bump)
- `cancelled_at` (datetime, nullable) - When user cancelled auto-renewing feature

**Relationships**:
- Many-to-one with User (feature purchased by user)
- Many-to-one with Listing (feature may apply to specific listing)

**Validation Rules**:
- `stars_paid` must be positive
- `feature_type` must be valid enum (sticky_listing, color_highlight, auto_bump)
- `expires_at` must be after `purchased_at`
- Only one active sticky/highlight feature per listing
- Auto_bump expires after 21 days or when cancelled
- Sticky and highlight features expire after 7 days

**Feature Duration Rules**:
- `sticky_listing`: 7 days from purchase
- `color_highlight`: 7 days from purchase
- `auto_bump`: 21 days from purchase or until cancelled

### UserSession
Represents authentication sessions for web app access.

**Fields**:
- `token` (varchar, primary key) - JWT-like session token
- `user_id` (bigint, foreign key) - Associated user
- `created_at` (datetime) - Session creation time
- `expires_at` (datetime) - Session expiration
- `last_used` (datetime) - Last activity timestamp

**Relationships**:
- Many-to-one with User (session belongs to user)

**Validation Rules**:
- `token` must be unique and secure
- `expires_at` must be after `created_at`
- Sessions expire after 7 days of inactivity

### BlockedWord
Represents admin-managed profanity and content blocklist.

**Fields**:
- `id` (integer, primary key, auto-increment) - Word ID
- `word` (varchar, unique) - Blocked word or phrase
- `severity` (enum: warning, block) - Action to take when detected
- `added_by` (bigint, foreign key) - Admin who added the word
- `created_at` (datetime) - When word was added
- `is_active` (boolean, default true) - Whether rule is active

**Relationships**:
- Many-to-one with User (word added by admin)

**Validation Rules**:
- `word` must be unique and lowercase
- Only admin users can add/modify blocked words
- `severity` determines action: warning logs, block prevents submission

### MockUser
Represents mock users for local development and testing.

**Fields**:
- `id` (integer, primary key, auto-increment) - Mock user ID
- `telegram_id` (bigint, unique) - Fake Telegram ID for testing
- `username` (varchar, unique) - Mock username
- `first_name` (varchar) - Mock first name
- `role` (enum: buyer, seller, admin) - Test user role
- `is_active` (boolean, default true) - Whether mock user is enabled

**Relationships**:
- Used only in local development environment
- Links to regular User table via telegram_id in test scenarios

**Validation Rules**:
- Only available when `VITE_DEV_BYPASS_AUTH=true`
- Mock telegram_ids must not conflict with real user IDs
- Used for automated testing scenarios

### CacheEntry
Represents KV cache entries for CQRS-style listing caching.

**Fields**:
- `key` (varchar, primary key) - Cache key (e.g., "category:123:listings")
- `value` (json) - Cached data (listing arrays, metadata)
- `created_at` (datetime) - Cache creation time
- `expires_at` (datetime) - Cache expiration time
- `invalidated_at` (datetime, nullable) - When cache was manually invalidated

**Relationships**:
- No direct relationships (managed by KV service)

**Validation Rules**:
- Keys follow pattern: "category:{id}:listings" or "search:{hash}:results"
- Cache TTL varies by content type (listings: 5min, categories: 1hr)
- Invalidated on listing create/update/delete operations

## Database Indexes

**Performance Indexes**:
- `listings(category_id, is_active, expires_at)` - Category browsing
- `listings(user_id, is_active)` - User's listings
- `listings(created_at DESC)` - Recent listings
- `listings(bumped_at DESC)` - Bumped listings priority
- `flags(status, created_at)` - Pending flags queue
- `moderation_actions(target_user_id, created_at)` - User history
- `user_sessions(expires_at)` - Session cleanup

**Text Search Indexes**:
- Full-text search on `listings(title, description)` using SQLite FTS5

## Data Relationships Summary

```
User (1) → (N) Listing
User (1) → (N) Flag (as reporter)
User (1) → (N) ModerationAction (as target)
User (1) → (N) Appeal
User (1) → (N) PremiumFeature
User (1) → (N) UserSession

Category (1) → (N) Listing
Category (1) → (N) Category (parent-child)

Listing (1) → (N) Flag
Listing (1) → (N) ModerationAction (optional)
Listing (1) → (N) PremiumFeature (optional)

ModerationAction (1) → (N) Appeal
```

## Migration Strategy

**Phase 1**: Core entities (User, Category, Listing)
**Phase 2**: Moderation system (Flag, ModerationAction, Appeal)
**Phase 3**: Premium features (PremiumFeature)
**Phase 4**: Performance optimizations (indexes, FTS)

**Migration Scripts**: Generated via Drizzle migrations, stored in `/src/db/migrations/`