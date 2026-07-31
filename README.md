# skibo

Multiplayer Skip-Bo built on Cloudflare, starting with a CLI-first experience so we can focus on game rules, Durable Objects, and real-time coordination before building a web UI.

## Aim

- Learn Cloudflare Durable Objects by building a real turn-based multiplayer game
- Implement the Skip-Bo engine cleanly in TypeScript
- Use a networked CLI client first so the Worker and DO architecture stays visible
- Reuse the same backend later when porting to a web app

## Collaboration Model

This project is also an experiment in building software quickly and correctly
with agentic coding tools. The agent owns implementation and verification by
default, while concise technical lessons preserve the important architecture,
rules, and tradeoffs as the system grows.

## Planned Stack

- Cloudflare Workers for the public API
- Cloudflare Durable Objects for per-game state and live coordination
- Bun for local tooling and the CLI client
- TypeScript for shared game logic and transport types

## Approach

- One game equals one Durable Object
- The game engine stays pure and Cloudflare-agnostic
- The Durable Object owns authority, persistence, and live broadcasts
- The CLI talks to the Worker over HTTP and WebSockets

## Project Notes

- This repo is intentionally starting simple
- The completed CLI milestone remains a diagnostic tool; the next playable
  product checkpoint is the browser UI
- The main implementation plan lives in `docs/implementation-plan.md`

## Setup

```bash
bun install
```

## Test The Engine

Play a short local game against the bot:

```bash
bun run play -- --seed 42 --stock 5 --name Yesh
```

Choose from the numbered legal commands shown each turn. Enter `q` to stop.
The seed makes the initial game and later shuffles reproducible.

Run a complete deterministic short game locally:

```bash
bun run simulate -- --seed 42 --stock 5 Ada Grace
```

The simulator uses the real legal-command and transition APIs. Change the seed
to explore another reproducible game, or omit the options for a quick default
run. Use `--stock 30` for the standard two-player stock size.

## Test The Multiplayer Backend

Start the local Worker:

```bash
bun run dev
```

In another terminal, create and exercise a room:

```bash
bun run cli create
bun run cli join <gameId> Alice
bun run cli join <gameId> Bob
bun run cli start <gameId> <alicePlayerToken> 5
bun run cli state <gameId> <alicePlayerToken>
bun run cli command <gameId> <alicePlayerToken> 1
```

Each join response contains a server-issued player token. Each player uses
their token to receive a private view containing their own hand, public pile
state, and exact legal commands only when it is their turn.
