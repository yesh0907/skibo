# Project Priorities

- Build a correct, playable multiplayer Skip-Bo implementation quickly using agentic coding tools
- The agent should own implementation, tests, refactors, documentation, and verification by default
- Prefer small, complete, well-tested slices that move the project toward an end-to-end playable game
- Explain consequential architecture and domain decisions, but do not pause routine implementation for teaching
- When the user explicitly invokes `$teach`, pause implementation and use the teaching workspace workflow to explain the requested concept
- Use `docs/implementation-plan.md` as the source of truth for current scope, phase, and progress
- Treat `docs/implementation-plan.md` as a living document: update progress as work is completed, then commit code and plan updates together when requested

# Bun Project Rules

Default to using Bun instead of Node.js.

## Package Management

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Use `Bun.$` for shell commands instead of execa.

## Testing

Use `bun test` to run tests.

```ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use Vite. HTML imports fully support React, CSS, Tailwind.

```ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically.

```html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

Run with `bun --hot ./index.ts`.

## Cloudflare Docs

- This project includes the `cloudflare_docs` MCP server in `opencode.json`.
- When you need current Cloudflare product or API documentation, use `cloudflare_docs`.

# Collaboration Notes

- Default to autonomous implementation and verification once scope is clear.
- Surface genuine product or architecture forks; make conservative implementation decisions for routine details.
- Keep game rules in the pure engine and infrastructure concerns at the Worker and Durable Object boundaries.
- Use tests as the primary correctness feedback loop.
- Treat explicit `$teach` requests as focused learning interludes grounded in the work just completed.
