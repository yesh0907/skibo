# Skip-Bo Implementation Plan

## Status

- Current phase: Phase 2 Real Game Durable Object complete
- Current focus: build a minimal playable web UI against the authoritative HTTP game API
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

The next product checkpoint will be a playable browser game backed by the
networked Worker and Durable Object API.

That means:

- the backend still runs on Cloudflare
- the game still supports multiple players
- the game still updates live
- the initial browser client may poll over HTTP before WebSockets are added

The local CLI remains a useful diagnostic client, while the browser becomes the
primary product surface for gameplay iteration.

The first milestone was a thin vertical slice, not a complete polished game.

That first slice proved:

- Worker routes can create and address a game room
- one Durable Object can coordinate a single game
- a CLI client can exercise the room through HTTP commands
- state survives beyond a single request

With the engine and authoritative HTTP backend working, the current focus is a
minimal playable browser client.

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

- pure game engine tests should run with `bun test`
- Worker and Durable Object behavior should first be exercised through local `wrangler dev` smoke tests
- if needed, we can later add Cloudflare-specific integration testing once the basic shape is stable

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

## Phase 4: Real-Time Transport

Goal: make multiplayer updates live.

Build:

- WebSocket upgrade route
- client registration in the DO
- broadcast on game state changes
- reconnect support
- if it stays manageable, use the DO hibernation WebSocket API so the project teaches a Cloudflare-specific real-time pattern

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

The next concrete implementation step is to begin the playable web surface:

- complete official turn-transition and win-condition coverage
- build a minimal game table from the player-specific `GameView`
- support create, join, start, refresh, and command submission through HTTP
- keep exact legal commands as the browser's action source
- add polling first, then WebSockets after the browser workflow is playable

Supporting scaffolding now exists for the completed Phase 0 spike:

- `src/shared/room-state.ts`
- `src/worker/index.ts`
- `src/worker/game-room-do.ts`
- `src/tests/game-room-do.test.ts`
- `src/cli/index.ts`

That gives us a working reference boundary for the Durable Object spike, so the next learning-heavy work can stay focused on pure game rules.
