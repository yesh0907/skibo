# Room Revision Contract

The React transport treats each player-specific room view as a versioned
snapshot. The Worker and Durable Object enforce this contract for all current
HTTP mutations. The planned WebSocket transport will distribute the same full
snapshots without adding a second command path.

## Server rules

- A newly initialized room starts at revision `0`.
- Each successful durable room mutation increments the revision exactly once.
- Reads, rejected mutations, and failed persistence do not change the revision.
- Every `PlayerView` carries the revision of the durable state from which it was
  projected.
- Mutations made from an existing view carry `expectedRevision`. A mismatch
  returns a `stale_revision` API error without applying the
  mutation. Create and join are exceptions because those callers do not yet
  hold an authenticated player view.

## Client rules

- A client may replace its snapshot only with a strictly newer revision.
- Equal or older snapshots are duplicates or stale deliveries and are ignored.
- A revision gap is safe because each message contains a complete `PlayerView`;
  the client replaces its snapshot rather than replaying missed transitions.
- `room.stale` tells a client that its requested revision is behind the room and
  that it should fetch or request a current full view.

HTTP remains the command transport. The planned WebSocket envelopes distribute
player-safe views and recovery signals; they do not add a second command path.
