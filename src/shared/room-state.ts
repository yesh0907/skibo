export type RoomStatus = "waiting" | "started";

export type RoomState = {
  gameId: string;
  status: RoomStatus;
  players: string[];
  turnIndex: number | null;
};

export type JoinRoomRequest = {
  playerName: string;
};
