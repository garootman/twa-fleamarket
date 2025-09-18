# Database Migrations

This directory contains SQL migration files for the Telegram Marketplace application.

## Migration Files

### Applied Migrations
- `0000_yellow_roulette.sql` - Initial users and tokens tables
- `0001_mixed_red_wolf.sql` - Removed tokens table (moved to KV)
- `0002_cultured_tiger_shark.sql` - Added r2ImageKey to users table
- `0003_marketplace_schema.sql` - **Comprehensive marketplace schema with all entities**

### Rollback Migrations
- `rollback-0003.sql` - Rollback script for marketplace schema

## Migration System

### Schema Overview (0003_marketplace_schema.sql)

The comprehensive marketplace schema includes:

#### Core Tables
- **users** - Enhanced user profiles with marketplace features
- **categories** - Hierarchical category system (2-level)
- **listings** - Marketplace items with full feature set
- **userSessions** - Authentication session management

#### Moderation System
- **flags** - Content reporting and flagging
- **moderationActions** - Admin actions and decisions
- **appeals** - User appeals for moderation decisions
- **blockedWords** - Content filtering system

#### Premium Features
- **premiumFeatures** - Paid promotions and featured listings

#### Development Tools
- **mockUsers** - Development authentication bypass
- **cacheEntries** - KV cache fallback storage

### Key Features

#### Enhanced Users Table
- Marketplace-specific fields (rating, verification, listing counts)
- Admin and moderation capabilities
- Preference settings
- Performance indexes

#### Listings Table
- Complete marketplace item management
- Status workflow (draft → active → sold/expired)
- Premium features (featured, urgent, bumping)
- Location support with coordinates
- Engagement metrics (views, favorites, messages)
- Moderation status tracking

#### Category System
- Hierarchical structure with parent/child relationships
- SEO-friendly slugs
- Activity tracking and listing counts
- Sort ordering and visibility controls

#### Session Management
- Secure token-based authentication
- Device and location tracking
- Session revocation and management
- Expiration handling

#### Moderation Framework
- Multi-level content flagging
- Admin action tracking with audit trail
- User appeal system
- Automated content filtering

### Running Migrations

#### Local Development
```bash
# Apply all pending migrations
node scripts/migrate.js up

# Check migration status
node scripts/migrate.js status

# Rollback last migration
node scripts/migrate.js down

# Rollback multiple migrations
node scripts/migrate.js down 2
```

#### Production
```bash
# Use Wrangler for production migrations
wrangler d1 migrations apply marketplace-db

# Check production database
wrangler d1 execute marketplace-db --command "SELECT name FROM sqlite_master WHERE type='table';"
```

### Data Initialization

The migration includes default data:

#### Default Categories
- Electronics (with subcategories: Smartphones, Computers, Gaming, Audio & Video)
- Home & Garden
- Clothing & Accessories
- Sports & Recreation
- Books & Media
- Vehicles
- Real Estate
- Services
- Jobs
- Other

#### Content Filtering
- Default blocked words for spam and fraud detection
- Configurable severity levels and actions

#### Mock Users
- Admin user (telegramId: 111111111)
- Seller user (telegramId: 222222222)
- Buyer user (telegramId: 333333333)
- Banned user (telegramId: 444444444)
- Premium user (telegramId: 555555555)

### Schema Validation

The migration creates proper indexes for:
- Fast user lookups by Telegram ID
- Efficient listing searches by category, status, location
- Quick session validation
- Moderation queue management
- Premium feature tracking

### Performance Considerations

- All foreign keys properly defined
- Strategic indexing for common queries
- Text fields for JSON data (SQLite limitation)
- Timestamp fields for audit trails
- Cascading deletes for data integrity

### Rollback Strategy

Each major migration includes a rollback script:
- Preserves data integrity during rollbacks
- Handles SQLite column removal limitations
- Maintains referential integrity
- Provides clean state restoration

### Security Features

- No sensitive data in migration files
- Proper foreign key constraints
- Audit trail for all moderation actions
- Session security with token hashing
- Content filtering for safety