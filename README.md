# skibo

Multiplayer Skip-Bo built on Cloudflare with a pure rules engine, one
authoritative Durable Object per game, and a playable browser client.

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

## Play In The Browser

Start the local Worker:

```bash
bun run dev
```

Open the URL Wrangler prints, normally `http://localhost:8787`. Create a table
in one browser tab, copy its game code, then join from a second tab. Each tab
keeps its own player token for the duration of that tab, including refreshes.
Choose the 5-card stock option for a quick test game.

On your turn, select a highlighted hand, stock, or discard card. The action tray
shows only the exact commands accepted by the authoritative game engine.

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

## Test The Multiplayer Backend Directly

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
