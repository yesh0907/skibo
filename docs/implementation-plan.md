# Skip-Bo Implementation Plan

## Status

- Current phase: Phase 3 Playable Web UI complete; React refactor designed
- Current focus: establish shared transport contracts, then implement the backend foundation and React client concurrently before adding real-time transport
- Progress:
  - established project goals and collaboration model
  - chose a CLI-first architecture
  - decided on one Durable Object per game
  - outlined the phased implementation plan
  - defined the first learning slice as a local HTTP-only Durable Object spike
  - chose a minimal room model: `gameId`, `status`, `players`, `turnIndex`
  - decided the Worker generates `gameId` and addresses rooms with `getByName(gameId)`
  - initially explored lazy room initialization, then replaced it with explicit creation to prevent arbitrary ids from persisting empty rooms
  - scaffolded Worker routes and shared room types around a hand-written `GameRoomDO`
  - added `wrangler.jsonc` with the `GAME_ROOM` binding and first DO migration
  - hand-wrote `GameRoomDO.getState()`, `join()`, `start()`, and `passTurn()`
  - refactored the room to hydrate from DO storage, persist valid transitions, and use `ctx.id.name` for the public `gameId`
  - added validating Bun tests around the room lifecycle and used them as part of the learning loop
  - verified the local Worker HTTP flow end to end through `wrangler dev` for `create`, `join`, `start`, `pass-turn`, and `state`
  - scaffolded a tiny Bun CLI path with `create`, `join`, `start`, `pass-turn`, and `state` commands for the local room spike
  - replaced the early class-heavy engine draft with snapshot-based `GameState`, `PlayerState`, command, and effect shapes
  - clarified the design split between canonical game state, internal engine resolution flow, visible effects, and derived available actions
  - implemented the first pure `resolveCommand(...)` loop for `playCard` and `discardCard`
  - normalized discard resolution so ending a turn advances to the next player and resolves that player's draw before returning
  - added Bun coverage for hand, discard-pile, and stock-pile play paths, game-over on empty stock pile, refill-from-deck, build-pile resolution, discard turn wraparound, and an invalid empty-build-pile play
  - hardened the engine contract around invalid discard-pile and build-pile indexes while keeping returned snapshots immutable
  - validated wild-card continuation behavior and confirmed the first command loop is a natural stopping point before broadening into more official-rule coverage
  - tightened build-pile validation so wild cards stand in for the next sequence position instead of allowing arbitrary later numeric cards
  - shifted the collaboration model from manual learning-first implementation to agent-led delivery with explicit `$teach` interludes
  - added exact legal-command calculation across hand, stock, and discard-pile sources and made it the final command-validation gate
  - derived broad available-action categories from exact legal commands instead of returning them unconditionally
  - rejected commands after game over and closed negative-index command validation gaps
  - enforced setup invariants for player rosters, official stock-pile defaults, short-game variants, and deck feasibility
  - added structural game-state validation for card values, pile shapes, hand size, build sequence, turn index, and game-over consistency
  - applied invariant checks at game creation and both sides of engine transitions
  - kept terminal snapshots canonical when a winning stock card also completes a build pile
  - modeled completed build piles as a distinct reserve instead of immediately mixing them into the draw deck
  - recycled the completed-pile reserve only when a hand draw exhausts the active deck
  - made exhausted supplies produce a partial draw instead of an engine error
  - injected the shuffle source into command resolution so recycling behavior is deterministic under test
  - added a deterministic whole-game simulator that chooses only from exact legal commands and reports winners or bounded diagnostic stops
  - exposed the simulator through a Bun CLI command for reproducible short and standard-stock engine playthroughs
  - added a playable local human-versus-bot CLI that renders canonical state and presents exact legal commands as numbered choices
  - kept terminal input, human choice, and bot policy outside the rules engine while routing every selected command through the same resolver
  - replaced placeholder Durable Object turn state with the canonical pure-engine `GameState`
  - added authoritative DO methods for starting games, reading player-specific views, and resolving player-owned commands
  - persisted resolved snapshots before updating the DO memory cache and verified rehydration through a fresh instance
  - exposed UI-ready HTTP routes for player views and exact legal commands while hiding opponent hands
  - verified create, join, start, stock play, discard turn transition, and second-player hydration through local `wrangler dev`
  - replaced player-name trust with server-issued player tokens used for private views and command authorization
  - filtered next-player draw effects so private card values cannot bypass view projection
  - required explicit room initialization so arbitrary game ids cannot create persisted Durable Objects
  - capped waiting rooms at the official six-player maximum and rejected incompatible legacy snapshots
  - served a responsive browser client and the game API from the same Worker using Cloudflare Static Assets
  - added create, join, waiting-room, short-game start, refresh, and leave flows
  - persisted each player token in per-tab session storage so two tabs can represent two players while surviving refreshes
  - rendered player-specific hands, stock piles, discard piles, shared build piles, opponent public state, and game completion
  - drove source selection and action presentation directly from the server-provided exact legal commands
  - added HTTP polling for opponent turns as the temporary update transport
  - verified a real two-browser create, join, start, card-selection flow at desktop and mobile sizes
  - caught and fixed a browser-only hand-rendering failure through the end-to-end interaction check
  - replaced the command action tray with mouse-and-touch pointer dragging onto exact legal destinations
  - derived glowing drop targets directly from server-provided legal commands instead of recreating rule predicates
  - displayed the effective sequence value on wild cards after they enter a build pile
  - rendered each opponent's public stock top as a visible card with its remaining count
  - added 10, 15, 20, and 25-card game lengths and disabled sizes that cannot fit the joined roster
  - made terminal games unmistakable with a full-screen winner or loser result overlay
  - verified drag interaction and a complete networked game through the winner state in a real browser
  - designed a behavior-preserving React refactor with freedom to evolve the visual design
  - chose React 19, `useReducer`, Tailwind CSS, selective shadcn/ui composition, Sonner, and dnd-kit
  - chose React Testing Library for component behavior and Playwright for browser acceptance
  - chose React Doctor as a blocking `prek` pre-commit hook and kept `agent-browser` optional for exploratory checks
  - rejected Cloudflare Agents SDK state synchronization because one shared state document would conflict with player-specific private views
  - chose native Durable Object Hibernation WebSockets for player-specific live updates while keeping gameplay commands on HTTP
  - chose one-year, game-scoped HttpOnly cookie sessions; browser profiles, rather than tabs, define player identity
  - chose a public current-game id in `localStorage` as the reload pointer while keeping credentials inaccessible to JavaScript
  - chose authoritative room revisions and Zod transport schemas to reject stale or malformed views

## Working Agreement

- This document is the source of truth for current scope and progress
- As work is completed, update this file to reflect what changed and what phase is next
- The intended workflow is: complete a small slice, update this plan, and commit code plus plan progress together

## Goals

- Build a correct, playable multiplayer Skip-Bo game quickly with agentic coding tools
- Build Skip-Bo in a way that keeps the core game rules separate from infrastructure
- Start with a CLI client so we can iterate quickly without UI overhead
- Preserve an easy path to a future web app
- Produce a concise `$teach` artifact after each completed implementation slice
- Use deeper `$teach` sessions when the user wants to explore completed work or an upcoming design

## Delivery Priorities

In order of importance:

1. Complete and verify the pure Skip-Bo rules engine
2. Integrate the engine into one authoritative Durable Object per game
3. Deliver a playable browser game over the authoritative HTTP API
4. Keep client/server and Worker/DO boundaries explicit and testable

## Focus Rule

Prefer the smallest complete, tested slice that advances the playable multiplayer loop.

## Product Direction

The next product checkpoint will be a React browser game backed by the
networked Worker and Durable Object API.

That means:

- the backend still runs on Cloudflare
- the game still supports multiple players
- the game updates live through native Durable Object Hibernation WebSockets
- gameplay commands remain HTTP requests routed through Worker-to-DO RPC
- no background polling remains after the WebSocket slice

The local CLI remains a useful diagnostic client, while the browser becomes the
primary product surface for gameplay iteration.

The first milestone was a thin vertical slice, not a complete polished game.

That first slice proved:

- Worker routes can create and address a game room
- one Durable Object can coordinate a single game
- a CLI client can exercise the room through HTTP commands
- state survives beyond a single request

With the engine, authoritative HTTP backend, and initial browser game working,
the current focus is migrating the client to React without losing the proven
gameplay loop.

## Why Durable Objects Fit

Skip-Bo is a strong fit for Durable Objects because each game needs one authoritative coordinator.

One `GameRoomDO` can own:

- the player roster
- deck and pile state
- turn order
- move validation
- live client connections
- persistence for reconnects

The key Durable Object mental model for this project is:

`one game = one single-threaded coordinator = one Durable Object`

## High-Level Architecture

We will build three connected surfaces:

1. `worker/`
   Cloudflare Worker plus Durable Object backend
2. `web/`
   Browser-based multiplayer game client
3. `cli/`
   Bun-based diagnostic and local-play client

Request flow:

1. Browser or CLI sends an HTTP request to the Worker
2. Worker resolves the correct Durable Object with `getByName(gameId)`
3. Worker calls the Durable Object
4. Durable Object updates durable state and broadcasts changes
5. Client receives player-specific views over HTTP responses or WebSockets

### Transport split

For soundness, the plan should treat these two communication modes differently:

- normal commands such as `create`, `join`, `start`, and `play move` should go through Worker HTTP routes and then into DO RPC methods
- WebSocket upgrades should be validated by the Worker and then proxied to the DO with `stub.fetch(request)`

That distinction matters because DO RPC is the preferred internal Worker-to-DO API, but WebSocket upgrade handling still naturally follows the request/response path.

## Cloudflare Stack

- Cloudflare Workers for public routes
- Cloudflare Durable Objects for per-game coordination and storage
- WebSockets for live game updates
- DO SQLite-backed storage for game persistence
- Bun for the CLI and local development tasks

Not in the first version:

- D1
- R2
- Queues
- SMS sending
- auth providers
- analytics and observability extras
- deployment automation

These can come later after the DO-based gameplay loop is solid.

## Core Design Rules

### 1. Keep the game engine pure

The game engine should know nothing about Cloudflare.

It should only do things like:

- create a game state
- validate a move
- apply a move
- determine the next turn
- detect a win condition

This gives us easier testing and a clean separation of concerns.

### 2. Keep the Durable Object thin but authoritative

The Durable Object should orchestrate:

- loading state
- checking player identity and turn ownership
- calling the pure game engine
- persisting the new state
- broadcasting updates

The DO should not contain scattered game rules if they can live in the pure engine.

### 3. Persist first, broadcast second

On each valid move, the DO should:

1. load current state if needed
2. validate the acting player
3. run the engine transition
4. write the new state to storage
5. update in-memory cache
6. broadcast the result

This will reinforce correct Durable Object usage.

## MVP Scope

The first playable version should support:

- creating a game
- joining a game by id
- storing a player nickname locally in the CLI environment
- starting a game once enough players join
- full official Skip-Bo rules
- turn-by-turn multiplayer play
- live updates to all connected clients
- reconnecting to an existing game

Before that full MVP, we should intentionally complete a smaller systems milestone:

- create a room
- join multiple players
- start a room
- pass a turn or perform a placeholder action
- observe live updates from multiple CLI clients

That systems milestone is the fastest way to learn the Durable Object shape before layering in the full game engine.

The first version should not include:

- SMS invites
- rich auth
- timers
- spectators
- chat
- matchmaking
- leaderboards

## Suggested File Layout

```txt
src/
  shared/
    game-types.ts
    moves.ts
    game-engine.ts
  worker/
    index.ts
    routes.ts
    game-room-do.ts
  cli/
    index.ts
    commands.ts
    api.ts
    render.ts
  tests/
    game-engine.test.ts
    game-room-do.test.ts
```

## API and DO Shape

### Worker routes

Initial routes:

- `POST /api/games`
  Creates a game and returns `gameId`
- `POST /api/games/:gameId/join`
  Joins a player to a game
- `POST /api/games/:gameId/start`
  Starts the game
- `GET /api/games/:gameId/state`
  Returns a reconnect snapshot
- `POST /api/games/:gameId/commands`
  Applies a move through the game engine
- `GET /api/games/:gameId/ws`
  Opens a WebSocket for live updates

Likely transport behavior:

- `POST` and `GET` routes call DO RPC methods where possible
- the WebSocket route validates the upgrade in the Worker and forwards the request to the DO `fetch()` handler

### Durable Object responsibilities

The `GameRoomDO` should handle:

- creating and hydrating durable game state
- managing connected sessions
- validating player actions
- calling the shared engine
- persisting state snapshots
- optionally appending a move log
- broadcasting updates

## Storage Strategy

For the first version, use a simple storage shape:

- one current game snapshot
- optional move log after the core loop works

This keeps the implementation easy to reason about while supporting:

- durable persistence
- rehydration after eviction
- state evolution over time

The move log is useful for debugging and learning, but it should not block the first end-to-end playable slice.

Later, we can revisit whether to keep the snapshot, rely more on event replay, or add external storage.

## Testing Strategy

The testing plan should match the runtime boundary.

- pure game engine, reducer, component, Worker, and Durable Object tests run with `bun test`
- React Testing Library covers reducer-driven screens and accessible interactions
- Playwright is the browser acceptance gate for two-player, drag, reload, privacy, completion, and responsive flows
- React Doctor runs as a blocking `prek` pre-commit hook on staged React changes
- `agent-browser` is optional exploratory tooling; if the dev environment cannot launch a browser, browser acceptance runs in a separate Mac Codex task
- local `wrangler dev` smoke tests continue to verify the Worker/DO runtime boundary

This is important because the pure engine can run anywhere, but Durable Object behavior depends on the Cloudflare runtime.

## Delivery Checkpoints

Each phase should leave behind a runnable checkpoint.

1. A tiny room can be created, joined, started, and advanced through a placeholder turn action
2. That room survives multiple requests and reconnects through the Durable Object
3. The pure Skip-Bo engine correctly models official rules under `bun test`
4. The real engine is wired into the Durable Object and drives live multiplayer state
5. A browser game is playable enough for real-world friend testing

## Phase Plan

## Phase 0: Durable Object Spike

Goal: learn the Cloudflare shape before implementing the full rules engine.

Build:

- `wrangler.jsonc` with one DO binding and migration
- a minimal `GameRoomDO`
- `create`, `join`, `start`, and `passTurn` or placeholder action
- a tiny CLI path that can exercise the room end to end

## Phase 1: Core Game Engine

Goal: implement pure TypeScript Skip-Bo rules with no Cloudflare dependency.

Build:

- `GameState`
- `PlayerState`
- deck generation and shuffle
- game initialization
- legal move calculation
- `applyMove`
- win detection

## Phase 2: Real Game Durable Object

Goal: wrap one game in one authoritative Durable Object.

Build:

- `GameRoomDO`
- storage initialization and hydration
- `joinGame`
- `startGame`
- `playMove`
- `getSnapshot`

## Phase 3: Playable Web UI

Goal: make the authoritative game easy to play and iterate on in a browser.

Build:

- create and join room flow
- locally persisted player token
- waiting-room roster and start action
- game table for build, stock, hand, and discard piles
- exact legal-command interaction
- HTTP polling for opponent turns

## Phase 3A: React Client Refactor

Goal: replace the imperative browser client with a maintainable React app while preserving the core gameplay UX.

Build:

- React 19 app under `src/web/` with one top-level reducer
- Bun HTML and Tailwind build into ignored `dist/`
- Wrangler custom build hook and Static Assets deployment from `dist/`
- Tailwind v4 theme with an evolutionary dark-green tabletop design
- selective shadcn/ui composition for conventional controls and dialogs
- custom domain components for cards, piles, player areas, legal targets, and drag overlays
- Sonner notifications and dnd-kit pointer interaction
- accessible drag-or-select keyboard interaction
- Zod-validated API client and room-revision reconciliation
- public current-game id in `localStorage`; no credential in client storage

## Phase 3B: Session and Transport Foundation

Goal: strengthen browser identity and transport contracts without breaking the current playable client during migration.

Build:

- monotonically increasing persisted room revision on accepted join, start, and command transitions
- revision included in every player-specific view
- one-year, game-scoped, Secure, SameSite=Strict, HttpOnly player-session cookie
- temporary bearer-token compatibility until the React cutover is complete
- waiting-room leave removes the seat and revokes the cookie
- active/finished exit clears only the browser's current-game pointer and preserves reconnect access
- Zod validation for HTTP requests, responses, API errors, and WebSocket envelopes

## Phase 4: Real-Time Transport

Goal: make multiplayer updates live.

Build:

- Worker-validated, cookie-authenticated WebSocket upgrade route
- native Durable Object Hibernation WebSocket acceptance
- resolved player identity in serialized per-connection attachments
- player-specific view projection after state is persisted
- client reconnect with capped exponential backoff and jitter
- authenticated HTTP snapshot after reconnect and revision-based reconciliation
- manual refresh while disconnected; no fallback polling
- removal of transitional bearer-token support

## Phase 5: Hardening

Goal: make the system resilient enough for real playtesting.

Build:

- reconnect after disconnect
- persisted local player identity
- invalid action handling
- out-of-turn protection
- tests for reconnect and state recovery

## Collaboration Model

- The agent owns implementation, tests, refactors, documentation, and verification by default.
- The user sets product direction and weighs in at meaningful architecture or game-rule forks.
- Each completed implementation slice ends with a concise technical `$teach` artifact.
- Explicit `$teach` requests pause delivery for a deeper lesson grounded in the current code.
- After a shared contract/scaffolding checkpoint, Phase 3A and Phase 3B run concurrently in separate Codex tasks and worktrees using GPT-5.6 Sol with medium reasoning.
- The main task owns shared schemas, dependency and lockfile setup, Wrangler configuration, integration, and the later WebSocket slice.

## React Refactor Acceptance Contract

- Preserve create, join, waiting, game-length selection, start, refresh/reconnect, copy-code, exit, and completion flows.
- Preserve waiting-room join order, first-turn labeling, two-player minimum, all-player start permission, and deck-feasible 5/10/15/20/25/30-card choices.
- Show the viewer's hand, stock top/count, and four discards; opponents' public turn, stock, and discard information; and all shared build/deck/completion information.
- Display both wild identity and its assigned build sequence value.
- Enable and submit only exact server-issued Legal Commands; prevent duplicate submissions and retain the last valid view after rejected or stale commands.
- Support mouse and touch dragging, cancellation and outside-drop no-ops, legal-target highlighting, and scrolling outside draggable cards.
- Support keyboard selection: activate a card, focus legal destinations, submit with Enter/Space, and cancel with Escape while restoring focus.
- Keep the Canonical Game State server-only and send a distinct Player View to each authenticated connection.
- Keep player credentials out of URLs, DOM, logs, `localStorage`, and browser JavaScript.
- Expose connecting, connected, reconnecting, and offline states; never automatically retry a gameplay command.
- Ensure all connected players receive the finished revision and commands become disabled at game completion.
- At named phone and desktop Playwright viewports, keep all four build/discard piles, full hand, opponent roster, header controls, and winner dialog reachable.

## Important Cloudflare Lesson To Reinforce

External clients cannot call Durable Object RPC methods directly.

Clients talk to the public Worker over:

- HTTP
- WebSockets

The Worker then talks to the Durable Object through internal bindings.

That same rule will apply later when this becomes a web app. The browser will still call the Worker, not the DO RPC surface directly.

For this project, a good mental shortcut is:

- HTTP commands: Worker route to DO RPC
- WebSocket connection: Worker upgrade route to DO `fetch()`

## Immediate Next Step

The next concrete implementation step is a short shared contract/scaffolding checkpoint:

- add Zod schemas and inferred transport types
- fix endpoint, cookie, revision, and error semantics
- add React/Tailwind/shadcn/testing dependencies and update the lockfile once
- add the Bun web build entrypoint and Wrangler build/output configuration
- add canonical waiting, playing, finished, and stale Player View fixtures

After that checkpoint, create two separate worktrees and Codex tasks:

1. Phase 3B backend foundation, owning `src/worker/` and backend tests
2. Phase 3A React client, owning `src/web/` and component tests

Merge both branches, complete the integration and Playwright acceptance pass,
then implement Phase 4 Hibernation WebSockets sequentially.
