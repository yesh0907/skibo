# Skip-Bo Implementation Plan

## Status

- Current phase: Planning
- Current focus: define and execute the Phase 0 Durable Object spike
- Progress:
  - established project goals and collaboration model
  - chose a CLI-first architecture
  - decided on one Durable Object per game
  - outlined the phased implementation plan

## Working Agreement

- This document is the source of truth for current scope and progress
- As work is completed, update this file to reflect what changed and what phase is next
- The intended workflow is: complete a small slice, update this plan, and commit code plus plan progress together

## Goals

- Prioritize learning over product polish
- Learn Cloudflare Durable Objects by building a real multiplayer system
- Build Skip-Bo in a way that keeps the core game rules separate from infrastructure
- Start with a CLI client so we can iterate quickly without UI overhead
- Preserve an easy path to a future web app
- Keep the interesting, high-learning parts manual and use the agent mainly to remove project friction

## Learning Priorities

In order of importance:

1. Learn the Durable Object model firsthand
2. Implement the core Skip-Bo rules manually
3. Keep the client/server and Worker/DO boundaries visible
4. Avoid spending early cycles on product polish or UI work

## Focus Rule

Prefer the smallest step that teaches the next important concept.

For this project, that means we should not jump straight to a fully finished multiplayer game if a smaller end-to-end slice would teach the same Cloudflare concept more clearly.

## Product Direction

The first version will be a networked CLI game, not a local-only script and not a browser app.

That means:

- the backend still runs on Cloudflare
- the game still supports multiple players
- the game still updates live
- the client is a Bun CLI instead of a web UI

This gives us fast iteration while still teaching the important Cloudflare concepts.

The first milestone should be a thin vertical slice, not a complete polished game.

That first slice should prove:

- Worker routes can create and address a game room
- one Durable Object can coordinate a single game
- a CLI client can join and observe updates
- state survives beyond a single request

Once that slice is working, we can safely expand into the full official ruleset.

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

We will build two programs:

1. `worker/`
   Cloudflare Worker plus Durable Object backend
2. `cli/`
   Bun-based multiplayer CLI client

Request flow:

1. CLI sends HTTP request to the Worker
2. Worker resolves the correct Durable Object with `getByName(gameId)`
3. Worker calls the Durable Object
4. Durable Object updates durable state and broadcasts changes
5. CLI receives updates over HTTP responses or WebSockets

This same backend architecture can later support a browser app with minimal backend changes.

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
- browser UI
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
- `POST /api/games/:gameId/moves`
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

For the learning-focused first version, use a simple storage shape:

- one current game snapshot
- optional move log after the core loop works

This keeps the implementation easy to reason about while still teaching:

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

## Learning Checkpoints

Each phase should leave behind a runnable checkpoint.

1. A tiny room can be created, joined, started, and advanced through a placeholder turn action
2. That room survives multiple requests and reconnects through the Durable Object
3. The pure Skip-Bo engine correctly models official rules under `bun test`
4. The real engine is wired into the Durable Object and drives live multiplayer state
5. The CLI is playable enough for real-world friend testing

## Phase Plan

## Phase 0: Durable Object Spike

Goal: learn the Cloudflare shape before implementing the full rules engine.

Build:

- `wrangler.jsonc` with one DO binding and migration
- a minimal `GameRoomDO`
- `create`, `join`, `start`, and `passTurn` or placeholder action
- a tiny CLI path that can exercise the room end to end

You should do:

- DO binding and migration setup
- the first hand-written Durable Object class
- basic state persistence in DO storage

I should do:

- minimal repo scaffolding
- Worker route glue
- a simple CLI command path to hit the room

What you learn:

- DO lifecycle
- `getByName(gameId)` addressing
- Worker to DO boundaries
- durable state versus in-memory state

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

You should do:

- state modeling
- core game rules
- move validation and transitions

I should do:

- test scaffolding
- edge-case test suggestions
- review and refinement of the engine shape

What you learn:

- how to model a non-trivial turn-based game cleanly
- how to keep rules isolated from networking concerns

## Phase 2: Real Game Durable Object

Goal: wrap one game in one authoritative Durable Object.

Build:

- `GameRoomDO`
- storage initialization and hydration
- `joinGame`
- `startGame`
- `playMove`
- `getSnapshot`

You should do:

- the first `GameRoomDO` class
- state load and save behavior
- turn enforcement in the DO boundary

I should do:

- route scaffolding around the DO
- review for Durable Object best practices

What you learn:

- DO lifecycle
- `getByName(gameId)` addressing
- durable storage usage
- why one coordinator per game is powerful

## Phase 3: Real-Time Transport

Goal: make multiplayer updates live.

Build:

- WebSocket upgrade route
- client registration in the DO
- broadcast on game state changes
- reconnect support
- if it stays manageable, use the DO hibernation WebSocket API so the project teaches a Cloudflare-specific real-time pattern

You should do:

- WebSocket ownership inside the DO
- player-to-connection association
- broadcast flow
- hibernation-related connection metadata if we opt into it early

I should do:

- CLI-side WebSocket client code
- transport helpers and glue code

What you learn:

- how DOs combine durable state with in-memory live connections
- the difference between persisted state and ephemeral session state
- how WebSocket upgrades differ from normal DO RPC calls

## Phase 4: CLI UX

Goal: make the game easily playable from the terminal.

Build:

- `create-game`
- `join-game <id>`
- `start-game`
- `show-state`
- `play <move>`
- live event stream rendering

You should do:

- only the CLI pieces you want practice with

I should do:

- most of the CLI shell and ergonomics

What you learn:

- enough client behavior to understand the end-to-end system without spending most of the time on interface work

## Phase 5: Hardening

Goal: make the system resilient enough for real playtesting.

Build:

- reconnect after disconnect
- persisted local player identity
- invalid action handling
- out-of-turn protection
- tests for reconnect and state recovery

You should do:

- reconnect semantics
- player identity decisions

I should do:

- failure-case tests
- cleanup and implementation polish

What you learn:

- the practical details that make stateful distributed apps actually usable

## You Do / I Do Split

Recommended ownership for the first implementation pass:

You do manually:

- `wrangler.jsonc` Durable Object binding and migration setup
- the first minimal `GameRoomDO` spike
- `src/shared/game-engine.ts`
- `src/worker/game-room-do.ts`
- state persistence logic in the DO
- move validation at the authoritative boundary
- WebSocket registration and broadcast logic

I do:

- initial repo structure
- shared type stubs where helpful
- test scaffolding
- Worker route scaffolding
- most CLI command plumbing
- reviews and explanations of your DO code

Why this split:

- you spend time on the highest-value learning areas
- I absorb the boilerplate and glue code
- we keep momentum without hiding the important parts from you

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

The next concrete planning step should be to define:

- the minimal phase-0 room state and placeholder turn action
- the first version of the Worker routes for `create`, `join`, `start`, and `passTurn`
- the first public methods on `GameRoomDO`
- the event shape for HTTP responses and WebSocket updates

Once that is in place, we can implement Phase 0, prove the DO shape end to end, and then move into the full `GameState`, `PlayerState`, and `Move` model for Phase 1.
