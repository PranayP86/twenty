# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Twenty is an open-source CRM built with modern technologies in a monorepo structure. The codebase is organized as an Nx workspace with multiple packages.

## Anansi Fresh-Login and Resume Hotfix (2026-08-28, LIVE; FRESH-USER PROOF PENDING)

Standing project authorization requires committing and pushing completed Anansi
work without asking for separate approval. It does not authorize merge,
deployment, OAuth consent, browser use, email sends, application submission, or
account-data mutation.

Clean branch `fix/onboarding-resume-auth-hotfix` is based on deployed fork
commit `dfe5171131`. SSO redemption synchronously disables cookie auth and clears
the old token pair plus user/workspace/member metadata. It finishes one shared
single-flight server sign-out before exchange, so a delayed old response cannot
delete the new friend's cookie; failed sign-out never exchanges. Pending
sign-out recovery also clears any retained client identity before its server
retry. An initial SSO exchange suppresses automatic redirects from both public
workspace data and the shared previous-workspace cookie, so a friend cannot land
in `pran`. Cookie and metadata generation fences reject old in-flight work,
including React StrictMode effect replay. The wizard binds Profile, resume
upload/status, role-save, and Finish work to stable JWT
`userId:workspaceId`; same-session bearer rotation remains valid and later REST
calls use the newest token, while an identity change clears state and invalidates
older requests. Every wizard screen now exposes `Back` and `Sign out`. Internal
Back stays inside the seven-screen wizard; first-screen Back uses Twenty's
server-backed previous-onboarding mutation. Sign out uses the complete existing
auth cleanup and returns to `https://anansi.work`. Durable
`processing|ready|failed` resume status supports reload, ambiguous upload
response, HTTP 409, and hung-read recovery. Capacity HTTP 503 stays a retryable
upload error instead of false processing recovery. Profile-version baselines
prevent an old ready Profile from completing a newer replacement; a timed-out
retry that joins an existing upload accepts its exact terminal version. Frontend
legacy readiness matches Core for nonblank markdown and rejects blank PDF
references. Terminal status on the last allowed poll wins, and timeout keeps the
selected file available through `Retry upload`. Focused proof passes 6 suites and
61 tests. Complete `twenty-front` passes 1,055 suites, 6,489 tests, and 139
snapshots. Frontend typecheck, type-aware Oxlint with zero warnings, Oxfmt, diff,
and scoped Gitleaks pass. Temporary dependency link was removed. Companion Core
branch `fix/onboarding-resume-hotfix-core` passes 837 tests with 3 expected skips
under forced RLS plus clean migrations, Alembic parity, classifier, Ruff, diff,
and secret gates. Source `78d74744` passed GitHub test run `33192665207` and
image run `33192665210`. Flux release manifest commit `9196880` deploys live
server and worker digest
`sha256:6b5371226f2ce7f76443e8ac251a0f27945f0aead5a935133fd11a688b46e8d7`.
All deployments are Ready; `/welcome` is 200 and Google auth redirects with 302.
Post-rollout Last Contact `stop` plus `PERSIST` left TTL `-1`, and the 17:20Z
cron boundary was clean. No OAuth flow, browser launch, email send, or
application submission occurred. A user-authorized fresh-start reset preserved
only owner account/workspace `pran` and the approved `praniapx@gmail.com`
allowlist entry. Deployed fresh-user login and authenticated resume proof remain
required.

**Skipped provisioning recovery (2026-08-28, LIVE; AUTHENTICATED PROOF
PENDING):** Live proof created active friend workspace
`powerful-purple-falcon`, but no Core user. Core received valid CORS and Twenty
metadata calls, then returned 401 from Profile and resume because `/v1/provision`
never arrived. Source `741a697c9a` repairs initial Profile 401 through idempotent
`POST /v1/provision` while polling Profile without waiting for slower
view/dashboard bootstrap. It permits onboarding from a saved PDF and extracted
text when fact extraction ends in `failed`. Every background provisioning failure
is visible with a dedicated retry; Profile polling reaches the provision
request's 90-second deadline, and manual retry reloads Profile concurrently with
repair. Stable identity and request-generation fences reject older repair
results; an in-flight marker prevents that concurrent Profile load from starting
a duplicate repair. The complete wizard file passes 44 tests. Frontend typecheck,
type-aware Oxlint with zero warnings, Oxfmt, diff, targeted Gitleaks, and three
review passes are clean. GitHub test run `33206832364` and image run
`33206832247` passed. Flux release manifest commit `2a6c5fa` deploys server and
worker digest
`sha256:6a520c1635419d3f43a70ab4ea6ddb9664e8f9e6aab93c4364f53c035b864bc0`;
both deployments are Ready. `/welcome` is 200, Google auth redirects 302, and
unauthenticated Profile/resume remain 401. Last Contact `stop` plus `PERSIST`
restored TTL `-1`; the 20:30Z cron boundary had zero server/worker errors and
zero Last Contact matches, and TTL remained `-1`. Authenticated browser
continuation and completed onboarding proof remain pending.

## Anansi Fork Status (2026-08-23)

Work only from Morona repo `/home/pran/Developer/anansi-twenty`. Current local
branch `fix/anansi-onboarding-live-feedback` split from `4e29087c74`. Walkthrough
fixes are committed at `85e88cd344` and pushed in
[PR #1](https://github.com/PranayP86/twenty/pull/1), but not built or deployed:

- `AnansiProvisioningScreen.tsx` activates the newly created Twenty workspace
  with its bearer token before calling Anansi Core `/v1/provision`. Activation
  and provisioning failures block entry. Manual retry repeats activation then
  provisioning without recreating the workspace. Twenty server activation is
  idempotent for `CREATED` and `ACTIVE` workspaces. Activation awaits Standard
  application creation and `flatApplicationMaps` invalidation/recompute before
  returning, so Core can resolve the application immediately.
- `AnansiTourOverlay.tsx` resolves the direct Anansi dashboard record route from
  rendered navigation link `[id^="nav-item-anansi"]`. Dashboard stops never use
  `/`; first-stop and Back navigation both use the direct record URL. Missing
  navigation links follow the existing four-second step-skip policy.

Changed frontend files are the two product files above, their adjacent tests,
`anansiTourSteps.ts`, and three corrected regression suites whose assertions had
not tracked earlier Anansi route, redirect, and onboarding changes. Morona
verification passes: exact Anansi gate 7/7 suites and 44/44 tests; full
`twenty-front` 1052/1052 suites, 6434/6434 tests, and 139/139 snapshots;
`twenty-front:typecheck`; Prettier and Oxfmt across all eight changed frontend
files; and `git diff --check`. Targeted Oxlint still reports 15 pre-existing
errors in the original walkthrough files (`no-state-useref`, state-variable
naming, hardcoded overlay color, and one strict-boolean test condition); the
three corrected regression suites add none. Do not mix that unrelated lint
cleanup into these fixes.

Do not reset or delete walkthrough account `praniapx@gmail.com`. It is currently
live/active with onboarding complete, tour seen at revision 4, and no Core
bootstrap stamp. Live deployment still uses fork head `4e29087c74`; Flux owns any
future rollout. Do not merge the PR, build, deploy, or mutate the account without
explicit approval.

Morona NixOS needs the untracked `sass-embedded` Dart wrapper already installed
in `node_modules` because the vendor ELF loader is not NixOS-compatible. A
focused Yarn install also omitted several cached `@types/lodash.*`, `pluralize`,
and `@oxlint/plugins` packages; validation uses the locally restored cache
copies without manifest or lockfile changes.

## Key Commands

### Development
```bash
# Start development environment (frontend + backend + worker)
yarn start

# Individual package development
npx nx start twenty-front     # Start frontend dev server
npx nx start twenty-server    # Start backend server
npx nx run twenty-server:worker  # Start background worker
```

### Testing
```bash
# Preferred: run a single test file (fast)
npx jest path/to/test.test.ts --config=packages/PROJECT/jest.config.mjs

# Run all tests for a package
npx nx test twenty-front      # Frontend unit tests
npx nx test twenty-server     # Backend unit tests
npx nx run twenty-server:test:integration:with-db-reset  # Integration tests with DB reset
# To run an individual test or a pattern of tests, use the following command:
cd packages/{workspace} && npx jest "pattern or filename"

# Storybook
npx nx storybook:build twenty-front
npx nx storybook:test twenty-front

# When testing the UI end to end, click on "Continue with Email" and use the prefilled credentials.
```

### Code Quality
```bash
# Linting (diff with main - fastest, always prefer this)
npx nx lint:diff-with-main twenty-front
npx nx lint:diff-with-main twenty-server
npx nx lint:diff-with-main twenty-front --configuration=fix  # Auto-fix

# Linting (full project - slower, use only when needed)
npx nx lint twenty-front
npx nx lint twenty-server

# Type checking
npx nx typecheck twenty-front
npx nx typecheck twenty-server

# Format code
npx nx fmt twenty-front
npx nx fmt twenty-server
```

### Build
```bash
# Build packages (twenty-shared must be built first)
npx nx build twenty-shared
npx nx build twenty-front
npx nx build twenty-server
```

### Database Operations
```bash
# Database management
npx nx database:reset twenty-server         # Reset database
npx nx run twenty-server:database:init:prod # Initialize database
npx nx run twenty-server:database:migrate:prod # Run instance commands (fast only)

# Generate an instance command (fast or slow)
npx nx run twenty-server:database:migrate:generate --name <name> --type <fast|slow>
```

### Database Inspection (Postgres MCP)

A read-only Postgres MCP server is configured in `.mcp.json`. Use it to:
- Inspect workspace data, metadata, and object definitions while developing
- Verify migration results (columns, types, constraints) after running migrations
- Explore the multi-tenant schema structure (core, metadata, workspace-specific schemas)
- Debug issues by querying raw data to confirm whether a bug is frontend, backend, or data-level
- Inspect metadata tables to debug GraphQL schema generation issues

This server is read-only — for write operations (reset, migrations, sync), use the CLI commands above.

### GraphQL
```bash
# Generate GraphQL types (run after schema changes)
npx nx run twenty-front:graphql:generate
npx nx run twenty-front:graphql:generate --configuration=metadata
```

## Architecture Overview

### Tech Stack
- **Frontend**: React 18, TypeScript, Jotai (state management), Linaria (styling), Vite
- **Backend**: NestJS, TypeORM, PostgreSQL, Redis, GraphQL (with GraphQL Yoga)
- **Monorepo**: Nx workspace managed with Yarn 4

### Package Structure
```
packages/
├── twenty-front/          # React frontend application
├── twenty-server/         # NestJS backend API
├── twenty-ui/             # Shared UI components library
├── twenty-shared/         # Common types and utilities
├── twenty-emails/         # Email templates with React Email
├── twenty-website/    # Next.js marketing website
├── twenty-docs/           # Documentation website
├── twenty-zapier/         # Zapier integration
└── twenty-e2e-testing/    # Playwright E2E tests
```

### Key Development Principles
- **Functional components only** (no class components)
- **Named exports only** (no default exports)
- **Types over interfaces** (except when extending third-party interfaces)
- **String literals over enums** (except for GraphQL enums)
- **No 'any' type allowed** — strict TypeScript enforced
- **Event handlers preferred over useEffect** for state updates
- **Props down, events up** — unidirectional data flow
- **Composition over inheritance**
- **No abbreviations** in variable names (`user` not `u`, `fieldMetadata` not `fm`)

### Naming Conventions
- **Variables/functions**: camelCase
- **Constants**: SCREAMING_SNAKE_CASE
- **Types/Classes**: PascalCase (suffix component props with `Props`, e.g. `ButtonProps`)
- **Files/directories**: kebab-case with descriptive suffixes (`.component.tsx`, `.service.ts`, `.entity.ts`, `.dto.ts`, `.module.ts`)
- **TypeScript generics**: descriptive names (`TData` not `T`)

### File Structure
- Components under 300 lines, services under 500 lines
- Components in their own directories with tests and stories
- Use `index.ts` barrel exports for clean imports
- Import order: external libraries first, then internal (`@/`), then relative

### Comments
- Use short-form comments (`//`), not JSDoc blocks
- Explain WHY (business logic), not WHAT
- Do not comment obvious code
- Multi-line comments use multiple `//` lines, not `/** */`

### State Management
- **Jotai** for global state: atoms for primitive state, selectors for derived state, atom families for dynamic collections
- Component-specific state with React hooks (`useState`, `useReducer` for complex logic)
- GraphQL cache managed by Apollo Client
- Use functional state updates: `setState(prev => prev + 1)`

### Backend Architecture
- **NestJS modules** for feature organization
- **TypeORM** for database ORM with PostgreSQL
- **GraphQL** API with code-first approach
- **Redis** for caching and session management
- **BullMQ** for background job processing

### Database & Upgrade Commands
- **PostgreSQL** as primary database
- **Redis** for caching and sessions
- **ClickHouse** for analytics (when enabled)
- When changing entity files, generate an **instance command** (`database:migrate:generate --name <name> --type <fast|slow>`)
- **Fast** instance commands handle schema changes; **slow** ones add a `runDataMigration` step for data backfills
- **Workspace commands** iterate over all active/suspended workspaces for per-workspace upgrades
- Commands use `@RegisteredInstanceCommand` and `@RegisteredWorkspaceCommand` decorators for automatic discovery
- Include both `up` and `down` logic in instance commands
- Never delete or rewrite committed instance command `up`/`down` logic
- See `packages/twenty-server/docs/UPGRADE_COMMANDS.md` for full documentation

### Utility Helpers
Use existing helpers from `twenty-shared` instead of manual type guards:
- `isDefined()`, `isNonEmptyString()`, `isNonEmptyArray()`

## Development Workflow

IMPORTANT: Use Context7 for code generation, setup or configuration steps, or library/API documentation. Automatically use the Context7 MCP tools to resolve library IDs and get library docs without waiting for explicit requests.

### Before Making Changes
1. Always run linting (`lint:diff-with-main`) and type checking after code changes
2. Test changes with relevant test suites (prefer single-file test runs)
3. Ensure instance commands are generated for entity changes (`database:migrate:generate`)
4. Check that GraphQL schema changes are backward compatible
5. Run `graphql:generate` after any GraphQL schema changes

### Code Style Notes
- Use **Linaria** for styling with zero-runtime CSS-in-JS (styled-components pattern)
- Follow **Nx** workspace conventions for imports
- Use **Lingui** for internationalization
- Apply security first, then formatting (sanitize before format)

### Testing Strategy
- **Test behavior, not implementation** — focus on user perspective
- **Test pyramid**: 70% unit, 20% integration, 10% E2E
- Query by user-visible elements (text, roles, labels) over test IDs
- Use `@testing-library/user-event` for realistic interactions
- Descriptive test names: "should [behavior] when [condition]"
- Clear mocks between tests with `jest.clearAllMocks()`

## Dev Environment Setup

All dev environments (Claude Code web, Cursor, local) use one script:

```bash
bash packages/twenty-utils/setup-dev-env.sh
```

This handles everything: starts Postgres + Redis (auto-detects local services vs Docker), creates databases, copies `.env` files, and initializes the database schema (runs migrations) on a fresh database. Idempotent — safe to run multiple times.

- `--docker` — force Docker mode (uses `packages/twenty-docker/docker-compose.dev.yml`)
- `--down` — stop services
- `--reset` — wipe data and restart fresh
- **Skip the setup script** for tasks that only read code — architecture questions, code review, documentation, etc.

**Note:** CI workflows (GitHub Actions) manage services via Actions service containers and run setup steps individually — they don't use this script.

## Important Files
- `nx.json` - Nx workspace configuration with task definitions
- `tsconfig.base.json` - Base TypeScript configuration
- `package.json` - Root package with workspace definitions
- `.cursor/rules/` - Detailed development guidelines and best practices
