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

**Single Google OAuth hardening (2026-08-28, LIVE; AUTHENTICATED PROOF PENDING):** A full
auth trace confirmed that normal central SSO and workspace token exchange require
one Google OAuth. One automatic fallback still called Google again when the
newly created workspace's original login token expired before its first exchange.
Source `bf275bdd73` removes that fallback. Provisioning retains the central
workspace-agnostic token pair, requests a fresh login token for the exact created
workspace, exchanges and provisions it, then redirects `/verify` with that fresh
reusable token. The regression asserts zero `signInWithGoogle` calls and the
complete fresh-token path. Full `twenty-front` passes 1,055 suites, 6,497 tests,
and 139 snapshots; typecheck, Oxfmt, diff, and scoped Gitleaks pass. Full Oxlint
still reports pre-existing Anansi custom-rule debt, including three unchanged
`useRef` sites in this file; no unrelated lint cleanup is included. GitHub test
run `33213543586` and image run `33213543496` passed. Image digest
`sha256:3deef3d1ba45581fe7785438b9c99decaead36345e602fd69c4b6d7c86c65b23`
is pinned by Anansi release commit `287e6e6`; Flux applied `5f95b2e`, both Twenty
deployments are Ready, public/auth smoke checks pass, and the Last Contact switch
is persistent at TTL `-1`. The 22:00Z cron cycle processed its trigger without
server/worker ERROR or Last Contact failure. Live recent-session rows showed one Google session followed by one expected workspace bridge, but
authenticated browser proof after this release remains required.

## Anansi Fork Status (2026-08-23)
## Anansi Fork Status (2026-08-27)

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

**Friend provisioning recovery (2026-08-26, LOCAL ONLY):** Uncommitted worktree
`fix/friend-provision-recovery`, based on `44899c8317`, adds deterministic UUIDv5
workspace creation from a server-validated user identity. Per-user and global
PostgreSQL advisory locks make replay idempotent and serialize workspace-cap and
first-admin decisions. Replay repairs billing while the workspace-created event
remains one-shot. Browser recovery stores only a token-free user-scoped intent
and exact workspace identity; failed storage stops before mutation. Reload,
lost-response, concurrent-tab, activation, renewal, and explicit retry paths
reuse that workspace. Metadata operations have 60-second deadlines; Core
provisioning keeps its 90-second explicit retry. Stock existing-user workspace
creation does not set Anansi recovery state, and central-domain failures show a
visible error. Full `twenty-front` passes 1055 suites/6474 tests/139 snapshots;
full `twenty-server` under `TZ=UTC` passes 837 suites/6168 tests/116 snapshots
with 4 suites and 15 tests skipped. Focused frontend passes 10 suites/90 tests;
focused server passes 4 suites/33 tests. Both typechecks and changed-source
formatting pass. Server Oxlint is clean; frontend Oxlint reports only three known
pre-existing `no-state-useref` findings in `AnansiProvisioningScreen.tsx`.
Generated metadata files intentionally retain their generator format; do not run
Prettier over them because it creates a 59,000-line incidental diff. The current
generated change is exactly one identity-field line in each file. No
commit, push, PR, merge, image build, deployment, OAuth flow, browser launch, or
live-data mutation occurred. Do not release before supported self-service Gmail
and a deployed fresh-user end-to-end proof. Anansi handoff:
`docs/handoffs/2026-08-26-friend-readiness.md` in the Anansi repo.

**Self-service Gmail card (2026-08-27, LOCAL ONLY):** This same uncommitted
worktree now captures only exact Anansi completion fragments, removes them from
the URL even when `sessionStorage` is blocked, and mounts one reusable Gmail card
on wizard screen 7 and same-tab Profile. First connection uses Core's signed-in
email hint. Add and reconnect force Google account choice. Profile supports
several mailboxes, labels one healthy mailbox **Main application email**, changes
primary, and requires confirmed logical disconnect. Wizard policy and availability
drafts save before OAuth; a token-free marker returns to screen 7. Completion
handles HTTP 202/503, ambiguous status refresh, bearer replacement, same-token
request reordering, and stale cross-user feedback without storing Twenty tokens or
Google authorization URLs. HTTP 202/503 completion retries use four bounded
exponential retries, then preserve the nonce for visible manual recovery. Focused
proof passes 44 tests across fragment, card, Profile, and wizard suites.
`twenty-front` typecheck, focused type-aware Oxlint with zero warnings, Oxfmt,
diff, and scoped Gitleaks checks pass. Final independent review raised one React
StrictMode risk; direct StrictMode reproduction passed without a production
change because the bearer-reset effect clears transient completion state during
the second development effect pass. Mandatory Gmail
finish gating remains intentionally off until Core readiness and browser runtime
land. No OAuth publication, consent, real mailbox mutation, commit, push, PR,
merge, deployment, or browser launch occurred. Memory:
`anansi-twenty-gmail-card`.

**Extension and application UI (2026-08-27, LOCAL ONLY):** Profile, onboarding,
and Job application controls now filter devices by exact extension and workspace
origin, strictly validate Core responses and extension versions, isolate all
asynchronous work by bearer identity, and never pass a Twenty bearer to extension
messaging. Core owns terminal application state. Non-runnable `prepared` attempts
stay disabled, while terminal attempts no longer require local Chrome. Assist-only
and explicit remote-fallback behavior remain fail-closed. Focused proof passes 5
suites and 85/85 tests, including 43/43 application and 17/17 wizard tests;
`twenty-front` typecheck, type-aware Oxlint, Oxfmt, diff, and scoped Gitleaks pass.
Independent review found no issue. Signed-in Twenty still has no safe bearer API
for answer provenance, review packets, or unresolved questions, so exact unavailable
placeholders remain until Core task 46 lands. Production extension ID also remains
unknown until separately authorized Web Store item creation. No browser, commit,
push, publication, deployment, OAuth flow, or live-data mutation occurred. Memory:
`anansi-local-browser-readiness`.

**Remote review origin (2026-08-27, LOCAL ONLY):** One-use review URL validation
now uses shared `ANANSI_BROWSER_PUBLIC_ORIGIN=https://browser.anansi.work`, matching
Core settings, inactive browser deployment config, Service annotation, and deployment
tests. The old inline `review.anansi.work` hostname is rejected. The exact application
button suite passes 63/63 tests, `twenty-front` typecheck passes, type-aware
Oxlint reports zero warnings, and Oxfmt accepts all three changed files. No tunnel, DNS, browser, deployment, commit, or live-data change
occurred. Public routing still reaches Twenty until separately authorized Task 42.

**Manual application handoff (2026-08-28, LOCAL ONLY):** Review and full-control
handoffs bind the authenticated Core user, Twenty record, application attempt, remote
session, control grant, packet digest, exact state, and all three state versions. One
preopened isolated popup avoids popup blockers; it closes on logout, record change,
unmount, terminal resolution, and Stop. Strict per-attempt `sessionStorage` state preserves
the original authorization key before the request. It adds the exact receipt only after
Core proves the same key through a valid response or idempotent replay. A competing `409`
removes pending authority and leaves only generic manual confirmation. This recovers
committed-response loss and same-tab reload or record navigation without storing the
control URL, fragment token, bearer, or document content. Refreshed Core state replaces
stale handoff tuples. Active remote sessions, including `control_ready`, can be stopped
with their exact version; Core expires manual authority and keeps any possible submission
outcome nonretryable. Lost Stop responses reconcile from Core; a pre-commit failure
closes unrestricted control but re-enables exact-version Stop and both durable outcome
controls. Lost resolution responses reconcile before another action. Exact proof passes
99/99 application-button tests. `twenty-front` typecheck, type-aware Oxlint with zero
warnings and errors, Oxfmt, diff, and scoped Gitleaks checks pass. Final focused re-review
found no issue. No browser, commit, push, publication, deployment, OAuth flow, email send,
application submit, or live-data change occurred.

**Ask Anansi record dock (2026-08-27, LOCAL ONLY):** A global minimizable dock
now mounts from `RootAppProviders` and opens through side-panel record footers.
Immutable stacked tabs bind exact Task/Approval, Engagement, JobPosting/Job,
Touchpoint, Resume, and Interview/CalendarEvent contexts. Exact custom-record
`anansiId` values resolve Core records; malformed, ambiguous, ApplicationAttempt,
and AnansiStatus contexts render no button until Core supports them. Bearer tokens
are used only to reopen context and submit messages. Poll requests carry only a
thread-bound `X-Anansi-Agent-Poll` capability, which remains in component state and
never enters Jotai or browser storage. Stable-session changes remount the session.
Access-token or context-scope changes synchronously increment a request generation;
every asynchronous load, reopen, poll, POST, retry timer, error, and final state
update verifies it before changing UI state. Pending turns recover from repeated
transient poll failures. Accepted POSTs stay pending by exact message ID until polling
observes that message, so transient receipt-poll failures cannot strand a turn.
Automatic poll and bearer-reopen recovery uses bounded 1.5-second then 3-second
backoff and stops after three failures. Permanent failures and exhausted retries keep
the turn pending with a manual `Retry` control, preventing unbounded requests from
mounted inactive tabs without allowing duplicate accepted work. Unchanged retries
after an uncertain POST reuse one client key. Loading and pending states block
duplicate submission. Minimized and inactive panels stay mounted to preserve drafts
and poll capabilities. Unsupported object names use own-property checks, so inherited
keys fail closed. Tabs use separate tab and close buttons with focus recovery. Exact
proof passes 6 suites and 39 tests. Full `twenty-front` passes 1,063 suites, 6,543
tests, and 139 snapshots. `twenty-front` typecheck, focused type-aware Oxlint with
zero warnings, Oxfmt, diff, and scoped Gitleaks checks pass. Final review found no
surviving issue. No browser launch, commit, push, PR, merge, deployment, model
command, or live data change occurred.

**Complete Anansi automation expansion (2026-08-26, APPROVED FOR LOCAL
IMPLEMENTATION):** Preserve friend provisioning recovery. Screen 7 stays the
seventh onboarding screen but will require a reusable multi-Gmail card, extension
or remote-browser readiness, resume/roles, and `Review first` versus immediate
`Auto now`. Profile gets Gmail primary/reconnect/disconnect, labels primary as
**Main application email**, uses that verified address for new resumes/forms/mail,
browser pairing,
remote fallback, `Auto all`, and per-chunk controls. An item-bound Ask Anansi dock
will use `PageLayoutRecordPageRenderer.tsx` for Task and every Anansi-managed
record popout; Core, not Twenty's stock agent backend, owns threads and typed tools.
Greenhouse, Lever, and Ashby may auto-submit after exact gates. LinkedIn, Indeed,
Dice, Wellfound, challenges, and unsupported portals remain human-submit. The
managed dashboard expands through Core-owned ApplicationAttempt/AnansiStatus
projections. No local browser is allowed. No commit, push, publication, deployment,
OAuth consent, real email send, or real application submission is authorized.
Design sources are the three `2026-08-26` Gmail/contextual-agent/apply-engine specs
in the Anansi repository.

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
