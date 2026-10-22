# Use native Durable Object WebSockets for live game views

Use Cloudflare's native Hibernation WebSocket API on the existing Game Room Durable Object instead of adopting the Cloudflare Agents SDK. The Agent state synchronization model broadcasts one shared state document, while Skip-Bo requires a distinct Player View for each authenticated connection so private hands never leak. Keeping the existing authoritative Durable Object and sending projected views directly preserves that security boundary with less abstraction and migration risk.

HTTP remains authoritative for commands during the first WebSocket slice. WebSockets initially carry live Player View updates only; polling can be removed after reconnection and fallback behavior are verified.
