# Implementation Plan: Telegram Marketplace Application

**Branch**: `001-build-an-application` | **Date**: 2025-09-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-build-an-application/spec.md`

## Execution Flow (/plan command scope)

```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
4. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
5. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, or `GEMINI.md` for Gemini CLI).
6. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
7. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
8. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:

- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary

A Telegram marketplace application with existing functional code that requires restructuring and feature additions. Users can sell/buy items via Telegram bot (/start, /help, /question commands) and web app with listing preview, username validation, KV caching, admin controls, and comprehensive testing including mock users and load testing. Architecture supports local development with auth bypass and data migration capabilities.

## Technical Context

**Language/Version**: TypeScript (Node.js runtime on CloudFlare Workers)
**Primary Dependencies**: Hono (routing/middleware), Grammy (Telegram bot), Drizzle ORM, Zod (validation), React + Vite (frontend), TailwindCSS, leo-profanity (content filtering), Artillery (load testing)
**Storage**: CloudFlare D1 (SQLite), CloudFlare KV (CQRS-style caching), CloudFlare R2 (image storage)
**Testing**: Vitest (backend/frontend), Grammy testing utilities, Browser automation MCP, Mock users for auth bypass
**Target Platform**: CloudFlare Workers + Pages, Telegram WebApp
**Project Type**: web (existing functional code requiring restructuring)
**Performance Goals**: Sub-200ms API responses, KV-cached listings, full-text fuzzy search, image gallery with swipes
**Constraints**: CloudFlare Workers runtime limits, Telegram username accessibility validation, 20 listing limit per user
**Scale/Scope**: Local marketplace scale (~1000-10000 users), admin controls via ADMIN_ID env, comprehensive testing suite

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**Simplicity**:

- Projects: 2 (backend worker, frontend webapp)
- Using framework directly? Yes (Hono, Grammy, React used directly)
- Single data model? Yes (Drizzle ORM entities, no DTOs)
- Avoiding patterns? Yes (Direct DB access via Drizzle, no Repository pattern)

**Architecture**:

- EVERY feature as library? ⚠️ CloudFlare Workers constraints, but existing working code needs restructuring to folders
- Libraries listed:
  - bot/ (Telegram bot commands: /start, /help, /question)
  - db/ (Drizzle schema and queries)
  - kv/ (CloudFlare KV wrapper for CQRS caching)
  - r2/ (Image storage wrapper)
  - admin/ (Admin functions based on ADMIN_ID check)
  - dev/ (Mock users and auth bypass for testing)
- CLI per library: Not applicable for this CloudFlare Workers use case
- Library docs: Working code exists, needs organization per specification folders

**Testing (NON-NEGOTIABLE)**:

- RED-GREEN-Refactor cycle enforced? ✓ Yes, existing mock user system validates this
- Git commits show tests before implementation? ✓ Yes, with make build + browser automation
- Order: Contract→Integration→E2E→Unit strictly followed? ✓ Yes, including buyer/seller scenarios
- Real dependencies used? ✓ Yes (actual D1, KV, R2 + mock users for auth bypass)
- Integration tests for: ✓ Bot commands, listing workflows, admin functions, load testing
- FORBIDDEN: Implementation before test, skipping RED phase ✓ Existing code requires test coverage

**Observability**:

- Structured logging included? ✓ Yes, console.log with structured format
- Frontend logs → backend? ✓ Yes, via API endpoints
- Error context sufficient? ✓ Yes, error tracking planned

**Versioning**:

- Version number assigned? ✓ Yes, 1.0.0 (MAJOR.MINOR.BUILD)
- BUILD increments on every change? ✓ Yes, automated via CI
- Breaking changes handled? ✓ Yes, migration scripts for DB schema

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)

```
# Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure]
```

**Structure Decision**: Option 2 (Web application) - frontend + backend detected in Technical Context

## Phase 0: Outline & Research

1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:

   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts

_Prerequisites: research.md complete_

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate contract tests** from contracts:
   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `/scripts/bash/update-agent-context.sh claude` for your AI assistant
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/\*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach

_This section describes what the /tasks command will do - DO NOT execute during /plan_

**Task Generation Strategy**:

- Load `/templates/tasks-template.md` as base
- PRIORITY: Restructure existing working code to specification folders
- Generate tests for existing functionality (bot commands, listings, auth)
- Add new features: preview, username validation, KV caching, admin panel
- Browser automation tests for buyer/seller scenarios with mock users
- Load testing with Artillery
- Data migration from deployed to local for testing

**Ordering Strategy**:

- Phase 1: Code restructuring and organization
- Phase 2: Test coverage for existing features (with mock users)
- Phase 3: New feature implementation with TDD
- Phase 4: Integration testing and load testing
- Mark [P] for parallel execution (independent modules)

**Estimated Output**: 35-40 numbered, ordered tasks focusing on existing code enhancement

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation

_These phases are beyond the scope of the /plan command_

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking

_Fill ONLY if Constitution Check has violations that must be justified_

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |

## Progress Tracking

_This checklist is updated during execution flow_

**Phase Status**:

- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:

- [x] Initial Constitution Check: PASS (with CloudFlare Workers architecture notes)
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [ ] Complexity deviations documented (none identified)

---

_Based on Constitution v2.1.1 - See `/memory/constitution.md`_
