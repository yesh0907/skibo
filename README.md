# skibo

Multiplayer Skip-Bo built on Cloudflare, starting with a CLI-first experience so we can focus on game rules, Durable Objects, and real-time coordination before building a web UI.

## Aim

- Learn Cloudflare Durable Objects by building a real turn-based multiplayer game
- Implement the Skip-Bo engine cleanly in TypeScript
- Use a networked CLI client first so the Worker and DO architecture stays visible
- Reuse the same backend later when porting to a web app

## Collaboration Model

This project is also an experiment in building software with a coding agent.

The goal is not to have the agent build everything. The goal is for me to use the agent to remove friction while I manually implement the high-value, interesting parts of the project so I can learn by doing.

That means:

- I will write the important learning-heavy pieces myself, especially Durable Objects and core game mechanics
- the agent will help with scaffolding, boilerplate, glue code, reviews, and other annoying parts that slow projects down
- the project should stay structured in a way that makes the key technical ideas visible rather than hidden behind abstractions

This repo is meant to document both the game and that workflow.

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
- The first milestone is a playable CLI version, not a browser UI
- The main implementation plan lives in `docs/implementation-plan.md`

## Setup

```bash
bun install
```
