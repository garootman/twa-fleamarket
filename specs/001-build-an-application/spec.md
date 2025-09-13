# Feature Specification: Telegram Marketplace Application

**Feature Branch**: `001-build-an-application`
**Created**: 2025-09-13
**Status**: Draft
**Input**: User description: "Build an application in telegram bot + web app, hosted in cloudflare worker + Pages, that would help users sell & buy things, make listings, contact each other within telegram. app + bot use deep linking. there are categories of listings"

## Execution Flow (main)

```
1. Parse user description from Input
   � If empty: ERROR "No feature description provided"
2. Extract key concepts from description
   � Identify: actors, actions, data, constraints
3. For each unclear aspect:
   � Mark with [NEEDS CLARIFICATION: specific question]
4. Fill User Scenarios & Testing section
   � If no clear user flow: ERROR "Cannot determine user scenarios"
5. Generate Functional Requirements
   � Each requirement must be testable
   � Mark ambiguous requirements
6. Identify Key Entities (if data involved)
7. Run Review Checklist
   � If any [NEEDS CLARIFICATION]: WARN "Spec has uncertainties"
   � If implementation details found: ERROR "Remove tech details"
8. Return: SUCCESS (spec ready for planning)
```

---

## � Quick Guidelines

-  Focus on WHAT users need and WHY
- L Avoid HOW to implement (no tech stack, APIs, code structure)
- =e Written for business stakeholders, not developers

### Section Requirements

- **Mandatory sections**: Must be completed for every feature
- **Optional sections**: Include only when relevant to the feature
- When a section doesn't apply, remove it entirely (don't leave as "N/A")

### For AI Generation

When creating this spec from a user prompt:

1. **Mark all ambiguities**: Use [NEEDS CLARIFICATION: specific question] for any assumption you'd need to make
2. **Don't guess**: If the prompt doesn't specify something (e.g., "login system" without auth method), mark it
3. **Think like a tester**: Every vague requirement should fail the "testable and unambiguous" checklist item
4. **Common underspecified areas**:
   - User types and permissions
   - Data retention/deletion policies
   - Performance targets and scale
   - Error handling behaviors
   - Integration requirements
   - Security/compliance needs

---

## User Scenarios & Testing _(mandatory)_

### Primary User Story

A Telegram user discovers the local marketplace through the bot or web app, browses categorized listings (with 2-level categories) of items for sale with processed images, creates up to 20 listings with 1-9 photos per item, and communicates with other users directly through Telegram to complete transactions. Users can search, filter by price, sort by expiration, flag inappropriate content, and purchase premium features like sticky listings. The single administrator manages categories, moderation, and can batch upload initial content that follows normal listing rules and can be batch-bumped for maintenance. Users can appeal bans or contact support through bot commands. Listings expire after 7 days with bump options for active management.

### Acceptance Scenarios

1. **Given** a new user visits the marketplace, **When** they browse listings in a specific category, **Then** they can see all available items with basic details and contact the seller
2. **Given** a user wants to sell an item, **When** they create a new listing with category, description, and price, **Then** other users can discover and contact them about the item
3. **Given** a user finds an interesting item, **When** they click to contact the seller, **Then** they are redirected to a Telegram conversation with the seller
4. **Given** a user finds an interesting item on the web app, **When** they share the item link with someone, **Then** the recipient is directed straight to that specific listing page
5. **Given** a user wants to manage their listings, **When** they access their profile, **Then** they can edit, delete, or mark items as sold
6. **Given** a user sees inappropriate content, **When** they flag a listing, **Then** administrators are notified for review
7. **Given** an administrator reviews flagged content, **When** they determine a violation, **Then** they can take moderation actions including warnings or bans
8. **Given** an administrator wants to populate the marketplace initially, **When** they batch upload content with specified contact information, **Then** listings follow normal rules and expiration schedules with designated contact details
9. **Given** an administrator has multiple expired listings, **When** they use batch-bump functionality, **Then** all selected listings are renewed simultaneously
10. **Given** a user's listing is about to expire, **When** they receive notification, **Then** they can bump the listing to extend visibility
11. **Given** a banned user wants to appeal, **When** they use the bot appeal command, **Then** their request is sent to the administrator
12. **Given** a user wants premium features, **When** they purchase sticky listing or auto-bump, **Then** their listing gains enhanced visibility

### Edge Cases

- What happens when a user tries to contact themselves about their own listing?
- How does system handle duplicate listings from the same user?
- What occurs when a listing is accessed via deep link but the item has been deleted?
- How are inactive or expired listings managed?
- What happens when flagged content is determined to be appropriate?
- How are repeat offenders handled in the moderation system?
- What occurs when a banned user tries to access the platform?
- What happens when a user reaches their 20-listing limit?
- How are premium feature payments processed and verified?
- What occurs when a user tries to bump a listing that's not eligible?
- How does the system handle expired sticky listings?
- How does batch-bump work for multiple admin listings simultaneously?
- Are there limits on how many listings can be batch-bumped at once?
- How is contact information validated when admin uploads listings for other users?
- What happens when contact info for admin-uploaded listings becomes invalid?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST allow users to authenticate through Telegram with initData validation and JWT session management
- **FR-002**: System MUST enable users to browse listings organized by categories with KV caching (CQRS style)
- **FR-003**: System MUST allow users to create new item listings with preview functionality before publishing
- **FR-004**: System MUST provide deep linking between Telegram bot and web app interfaces
- **FR-005**: System MUST facilitate direct communication through Telegram usernames with accessibility validation
- **FR-006**: System MUST allow users to manage their own listings (edit, un-publish to archive, mark as sold)
- **FR-007**: System MUST categorize listings into a 2-level hierarchy managed by administrators
- **FR-008**: System MUST display listing details with full-screen image gallery and swipe navigation
- **FR-009**: System MUST handle 1-9 user-uploaded images per listing, processing them to shrink size, generate thumbnails, and remove metadata on the user's device
- **FR-010**: System MUST allow users to flag listings as inappropriate
- **FR-011**: System MUST provide administrators with ability to review ALL listings (flagged and unflagged)
- **FR-012**: System MUST enable administrators to ban/unban users and notify users of listing takedowns
- **FR-013**: System MUST track user behavior patterns for administrative oversight
- **FR-014**: System MUST support deep linking that directs users to specific listing pages when shared
- **FR-015**: System MUST require Telegram @username and validate user accessibility for contact purposes
- **FR-016**: System MUST implement full-text "soft" fuzzy search by title/description keywords and category browsing
- **FR-017**: System MUST expire listings after 7 days with expiration timers and bump options on user listings page
- **FR-018**: System MUST limit users to maximum 20 active listings
- **FR-019**: System MUST filter results by price range and sort by listing expiration date
- **FR-020**: System MUST provide single administrator role via environment variable ADMIN_ID
- **FR-021**: System MUST log moderation actions for audit purposes
- **FR-022**: System MUST handle appeals process through bot commands for banned users
- **FR-023**: System MUST implement profanity filtering (leo-profanity) and admin-managed blocklist
- **FR-024**: System MUST provide bot commands: /start, /help, /question for user support
- **FR-025**: System MUST offer paid premium features: color highlighting (7 days), sticky listings (7 days), auto-bump (21 days) via Telegram Stars
- **FR-026**: System MUST allow administrators to manually stick listings and create/manage categories
- **FR-027**: System MUST notify users 1 day before listing expiration with bump availability
- **FR-028**: System MUST provide "My Listings" page with expiration timers, bump buttons, and premium feature status
- **FR-029**: System MUST archive expired/sold items instead of deletion for future management
- **FR-030**: System MUST allow administrators to batch-bump multiple listings simultaneously
- **FR-031**: System MUST provide admin section in web app based on user_id matching ADMIN_ID
- **FR-032**: System MUST support local development with mock users bypassing Telegram auth
- **FR-033**: System MUST provide data migration from deployed to local environments for testing
- **FR-034**: System MUST include load testing capabilities with tools like Artillery

### Key Entities _(include if feature involves data)_

- **User**: Represents a Telegram user with Telegram-provided profile data, listing count, sales history, account age, and reviews
- **Listing**: Represents an item for sale with title, description, USD price, 2-level category, 1-9 processed images, creation date, expiration date, and premium features status
- **Category**: Represents 2-level hierarchy groupings (parent/child) for organizing listings, managed by administrator
- **Message/Contact**: Represents communication events between users regarding specific listings
- **Flag/Report**: Represents user reports of inappropriate content with reason, reporter, and review status
- **Admin User**: Represents single administrative user with full platform management permissions
- **Moderation Action**: Represents administrative actions taken (warnings, bans, content removal) with timestamps and reasoning
- **User Behavior Log**: Represents tracking of user activities for identifying patterns of misbehavior
- **Premium Feature**: Represents paid enhancements like sticky positioning or auto-bump with purchase date and expiration
- **Appeal**: Represents banned user requests for account restoration submitted via bot commands
- **Admin Content**: Represents initial marketplace listings uploaded by administrator that follow identical rules to user listings but include specified contact information for inquiries
- **Batch Operation**: Represents administrative actions performed on multiple listings simultaneously (upload, bump)
- **Contact Assignment**: Represents the association between admin-uploaded listings and designated contact information for user inquiries

---

## Review & Acceptance Checklist

_GATE: Automated checks run during main() execution_

### Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness

- [ ] No [NEEDS CLARIFICATION] markers remain
- [ ] Requirements are testable and unambiguous
- [ ] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status

_Updated by main() during processing_

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [ ] Review checklist passed

---
