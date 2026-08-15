import type { PlayerView } from "../../shared/transport";

import { Button } from "./ui/button";
import { Panel } from "./ui/panel";

const STOCK_SIZES = [5, 10, 15, 20, 25, 30] as const;

interface WaitingRoomProps {
  view: Extract<PlayerView, { status: "waiting" }>;
  busy: boolean;
  onStart: (size: number) => void;
}

export function WaitingRoom({ view, busy, onStart }: WaitingRoomProps) {
  return (
    <main className="lobby-layout mx-auto grid w-full max-w-4xl flex-1 content-center gap-6 px-4 py-10 sm:px-8">
      <section>
        <p className="eyebrow">Waiting room · revision {view.revision}</p>
        <h1 className="mt-2 font-serif text-5xl text-white sm:text-6xl">The table is open.</h1>
        <p className="mt-3 text-emerald-100/70">Share game code <code className="rounded bg-black/20 px-2 py-1 text-emerald-50">{view.gameId}</code>. The first player takes the first turn.</p>
      </section>
      <Panel className="overflow-hidden">
        <ul aria-label="Players waiting" className="divide-y divide-white/10">
          {view.players.map((player, index) => (
            <li className="flex min-h-16 items-center justify-between px-5" key={player.name}>
              <strong className="text-white">{player.name}{player.name === view.viewerName && <span className="ml-2 text-xs font-medium text-lime-300">You</span>}</strong>
              <span className="text-sm text-emerald-100/55">{index === 0 ? "First turn" : `Seat ${index + 1}`}</span>
            </li>
          ))}
        </ul>
        <form className="grid gap-4 border-t border-white/10 p-5 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={(event) => {
          event.preventDefault();
          onStart(Number(new FormData(event.currentTarget).get("stockPileSize")));
        }}>
          <label className="field-label">Game length
            <select defaultValue={30} name="stockPileSize">
              {STOCK_SIZES.map((size) => <option key={size} value={size}>{size === 30 ? "Standard" : size === 5 ? "Quick test" : `${size} cards`} · {size} stock cards</option>)}
            </select>
          </label>
          <Button disabled={busy} type="submit">{busy ? "Starting…" : "Start game"}</Button>
        </form>
      </Panel>
    </main>
  );
}
