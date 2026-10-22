# Skip-Bo Game

This context defines the language used for an authoritative multiplayer Skip-Bo game in which each player has both public and private information.

## Language

**Game Room**:
The authoritative multiplayer session for one game, including its roster, lifecycle, and game state.
_Avoid_: Table, lobby

**Canonical Game State**:
The complete server-owned snapshot of a game, including information hidden from players.
_Avoid_: Client state, room view

**Player View**:
A projection of the Game Room for one authenticated player that contains their private information and only the public information of opponents.
_Avoid_: Game state, shared state

**Player Session**:
The authenticated relationship between one browser profile and one player seated in a Game Room.
_Avoid_: Tab session, player token

**Legal Command**:
An exact game action that the current player may submit for the current Canonical Game State.
_Avoid_: Available action, move option
