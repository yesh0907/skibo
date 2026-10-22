# Use cookie-based player sessions

Authenticate a browser profile's HTTP requests and WebSocket upgrades with a secure HttpOnly cookie instead of exposing a bearer token to browser JavaScript. This allows the Worker to reject unauthorized WebSocket upgrades before accepting a connection and reduces the risk of credentials leaking through URLs, logs, DOM state, or client code.

Tabs in the same browser profile intentionally share one Player Session and therefore represent the same player. Development, automated multiplayer tests, and multiple players sharing one device must use isolated browser contexts, separate browser profiles, or different browsers. This replaces the earlier per-tab `sessionStorage` behavior in favor of the stronger production authentication boundary.

Player Sessions have a one-year maximum lifetime and are scoped to a single game. Leaving a waiting room removes the player's seat and revokes the session. Exiting an active or finished game only clears the browser's non-secret current-game pointer; it preserves the seat and cookie so the player can reconnect without corrupting the game roster.
