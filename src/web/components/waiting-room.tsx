import { useEffect, useState, type FormEvent } from "react";

import type { PlayerView } from "../../shared/transport";

const STOCK_SIZES = [5, 10, 15, 20, 25, 30] as const;
const DECK_SIZE = 162;

const STOCK_SIZE_LABELS: Record<(typeof STOCK_SIZES)[number], string> = {
  5: "Quick test · 5 stock cards",
  10: "Short · 10 stock cards",
  15: "Medium · 15 stock cards",
  20: "Long · 20 stock cards",
  25: "Extended · 25 stock cards",
  30: "Standard · 30 stock cards",
};

interface WaitingRoomProps {
  view: Extract<PlayerView, { status: "waiting" }>;
  busy: boolean;
  onStart: (size: number) => void;
}

function isFeasible(playerCount: number, stockPileSize: number): boolean {
  return playerCount * (stockPileSize + 5) <= DECK_SIZE;
}

export function WaitingRoom({ view, busy, onStart }: WaitingRoomProps) {
  const [stockPileSize, setStockPileSize] = useState<number>(5);
  const largestFeasibleSize = STOCK_SIZES.findLast((size) =>
    isFeasible(view.players.length, size),
  ) ?? 5;

  useEffect(() => {
    if (isFeasible(view.players.length, stockPileSize)) return;
    setStockPileSize(largestFeasibleSize);
  }, [largestFeasibleSize, stockPileSize, view.players.length]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onStart(stockPileSize);
  }

  return (
    <main className="waiting-view">
      <div className="waiting-copy">
        <p className="eyebrow">Waiting room</p>
        <h1>The table is open.</h1>
        <p>
          Share the game code. The first joined player takes the first turn.
        </p>
      </div>

      <div aria-label="Players waiting" className="waiting-roster">
        {view.players.map((player, index) => (
          <div className="roster-player" key={player.name}>
            <strong>{player.name}</strong>
            <span>{index === 0 ? "First turn" : `Seat ${index + 1}`}</span>
          </div>
        ))}
      </div>

      <form className="waiting-controls" onSubmit={submit}>
        <label>
          Game length
          <select
            name="stockPileSize"
            onChange={(event) => setStockPileSize(Number(event.target.value))}
            value={stockPileSize}
          >
            {STOCK_SIZES.map((size) => (
              <option
                disabled={!isFeasible(view.players.length, size)}
                key={size}
                value={size}
              >
                {STOCK_SIZE_LABELS[size]}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary-button"
          disabled={busy || view.players.length < 2}
          type="submit"
        >
          {busy ? "Starting…" : "Start game"}
        </button>
      </form>
    </main>
  );
}
