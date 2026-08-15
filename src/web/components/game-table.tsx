import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useEffect, useState } from "react";

import type { PlayerView, TransportCommand } from "../../shared/transport";
import { commandForDrop, destinationKey, sameSource, sourceKey, type CardSource, type DropDestination } from "../commands";
import { MOUSE_ACTIVATION_CONSTRAINT, TOUCH_ACTIVATION_CONSTRAINT } from "../dnd-config";
import { CardFace, DraggableCard } from "./card";
import { DropPile } from "./drop-pile";
import { Button } from "./ui/button";
import { Panel } from "./ui/panel";

type ActiveGameView = Extract<PlayerView, { status: "playing" | "finished" }>;

interface GameTableProps {
  view: ActiveGameView;
  busy: boolean;
  selectedCommand: TransportCommand | null;
  onSelect: (command: TransportCommand | null) => void;
  onCommand: (command: TransportCommand) => void;
  onExit: () => void;
}

function top(pile: readonly number[]): number | null {
  return pile.at(-1) ?? null;
}

function cardName(value: number): string {
  return value === 0 ? "Skip-Bo wild" : `card ${value}`;
}

function sourceCommands(view: ActiveGameView, source: CardSource): TransportCommand[] {
  return view.legalCommands.filter((command) => sameSource(command.source, source));
}

function sourceFromDrag(event: DragStartEvent | DragEndEvent): CardSource | null {
  const source = event.active.data.current?.source as CardSource | undefined;
  return source ?? null;
}

function destinationFromDrag(event: DragEndEvent): DropDestination | null {
  const destination = event.over?.data.current?.destination as DropDestination | undefined;
  return destination ?? null;
}

function PileCard({ pile }: { pile: readonly number[] }) {
  const value = top(pile);
  if (value === null) return <span className="text-2xl text-emerald-100/25">+</span>;
  return <CardFace assignedValue={value === 0 ? pile.length : undefined} value={value} />;
}

export function GameTable({ view, busy, selectedCommand, onSelect, onCommand, onExit }: GameTableProps) {
  const [dragSource, setDragSource] = useState<CardSource | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: MOUSE_ACTIVATION_CONSTRAINT }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION_CONSTRAINT }),
    useSensor(KeyboardSensor),
  );
  const viewer = view.players.find((player) => player.name === view.viewerName);
  if (viewer === undefined || viewer.cardsInHand === null) return null;

  const selectedSource = dragSource ?? selectedCommand?.source ?? null;
  const activeCommands = selectedSource === null ? [] : sourceCommands(view, selectedSource);
  const allowedDestinations = new Set(activeCommands.map(destinationKey));
  const opponents = view.players.filter((player) => player.name !== view.viewerName);
  const activeCardValue = activeCommands[0]?.cardValue;

  useEffect(() => {
    if (selectedCommand === null || dragSource !== null) return;
    function cancelSelection(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const key = sourceKey(selectedCommand!.source);
      onSelect(null);
      window.setTimeout(() => document.querySelector<HTMLElement>(`[data-source-key="${CSS.escape(key)}"]`)?.focus());
    }
    window.addEventListener("keydown", cancelSelection);
    return () => window.removeEventListener("keydown", cancelSelection);
  }, [dragSource, onSelect, selectedCommand]);

  useEffect(() => {
    if (view.status !== "finished") return;
    document.querySelector<HTMLElement>("#completion-title")?.focus();
  }, [view.status]);

  function selectSource(source: CardSource) {
    const commands = sourceCommands(view, source);
    if (commands.length === 0) return;
    onSelect(selectedCommand !== null && sameSource(selectedCommand.source, source) ? null : commands[0] ?? null);
  }

  function chooseDestination(destination: DropDestination) {
    const command = commandForDrop(activeCommands, destination);
    if (command !== null) onCommand(command);
  }

  function finishDrag(event: DragEndEvent) {
    const source = sourceFromDrag(event);
    const destination = destinationFromDrag(event);
    setDragSource(null);
    onSelect(null);
    if (source === null || destination === null) return;
    const command = commandForDrop(sourceCommands(view, source), destination);
    if (command !== null) onCommand(command);
  }

  return (
    <DndContext
      accessibility={{
        screenReaderInstructions: { draggable: "Press space or Enter to pick up a card. Use arrow keys to move between legal piles, then press space or Enter to play. Press Escape to cancel." },
      }}
      onDragCancel={() => { setDragSource(null); onSelect(null); }}
      onDragEnd={finishDrag}
      onDragStart={(event) => { const source = sourceFromDrag(event); setDragSource(source); if (source !== null) onSelect(sourceCommands(view, source)[0] ?? null); }}
      sensors={sensors}
    >
      <main className="table-layout mx-auto grid w-full max-w-[1500px] flex-1 gap-4 px-3 py-4 sm:px-6 sm:py-6">
        <section aria-labelledby="turn-heading" className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <p className="eyebrow">{view.status === "finished" ? "Game complete" : view.isYourTurn ? "Your turn" : "Current turn"} · revision {view.revision}</p>
            <h1 className="mt-1 text-3xl font-bold text-white outline-none sm:text-4xl" id="turn-heading" tabIndex={-1}>{view.status === "finished" ? `${view.winnerName} wins` : view.currentPlayerName}</h1>
          </div>
          <p aria-live="polite" className="max-w-xl text-sm text-emerald-100/70">
            {view.status === "finished" ? `${view.winnerName} cleared their stock pile.` : view.isYourTurn ? selectedSource === null ? "Drag a bright card, or select it and choose a glowing pile." : "Choose one of the glowing legal destinations. Escape cancels a keyboard drag." : `Waiting for ${view.currentPlayerName}. The table refreshes automatically.`}
          </p>
        </section>

        <section aria-label="Opponents" className="opponents-layout grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {opponents.map((player) => (
            <Panel className="flex items-center gap-4 p-4" key={player.name}>
              {player.stockTopCard === null ? <div className="grid aspect-[5/7] w-14 place-items-center rounded-lg border border-dashed border-white/20 text-emerald-100/30">—</div> : <CardFace className="w-14 sm:w-14" count={player.stockCount} value={player.stockTopCard} />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><h2 className="truncate font-bold text-white">{player.name}</h2>{player.name === view.currentPlayerName && <span className="rounded-full bg-lime-300/15 px-2 py-1 text-[0.65rem] font-bold uppercase text-lime-200">Playing</span>}</div>
                <p className="mt-1 text-xs text-emerald-100/60">{player.handCount} in hand · {player.stockCount} in stock</p>
                <p className="mt-2 font-mono text-xs text-emerald-100/45">Discards {player.discardPiles.map((pile) => top(pile) === 0 ? "S" : top(pile) ?? "—").join(" · ")}</p>
              </div>
            </Panel>
          ))}
        </section>

        <Panel className="tabletop-layout grid gap-5 bg-emerald-900/75 p-4 sm:p-6">
          <div className="flex flex-wrap justify-between gap-2 text-xs font-bold uppercase tracking-wider text-emerald-100/60">
            <span>{view.deckCount} in draw deck</span><span>{view.completedBuildPileCount} completed build piles</span>
          </div>
          <section aria-label="Shared build piles" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {view.buildPiles.map((pile, index) => (
              <DropPile allowed={allowedDestinations.has(`build-${index}`)} destination={{ type: "build", index }} key={index} label={`Build pile ${index + 1}`} onChoose={chooseDestination} selectedMode={selectedCommand !== null && dragSource === null}>
                <PileCard pile={pile} /><span className="absolute bottom-1 text-[0.6rem] font-bold uppercase tracking-widest text-emerald-100/45">Build {index + 1}</span>
              </DropPile>
            ))}
          </section>
        </Panel>

        <Panel className="player-layout grid gap-5 p-4 sm:p-6" id="player-area">
          <div className="flex items-center justify-between gap-4"><div><p className="eyebrow">Your cards</p><h2 className="text-2xl font-bold text-white">{view.viewerName}</h2></div><span className="text-sm text-emerald-100/55">{viewer.handCount} in hand</span></div>
          <div className="personal-piles-layout grid gap-5 lg:grid-cols-[auto_1fr]">
            <section aria-label="Your stock pile"><p className="zone-label">Stock</p><div className="mt-2">{viewer.stockTopCard === null ? <div className="grid h-28 w-20 place-items-center rounded-xl border-2 border-dashed border-white/15 text-emerald-100/30">Empty</div> : <DraggableCard count={viewer.stockCount} disabled={busy || sourceCommands(view, { type: "stockPile" }).length === 0} label={`${cardName(viewer.stockTopCard)} from stock pile, ${viewer.stockCount} cards remain`} onSelect={selectSource} selected={selectedSource?.type === "stockPile"} source={{ type: "stockPile" }} value={viewer.stockTopCard} />}</div></section>
            <section aria-label="Your discard piles"><p className="zone-label">Discards</p><div className="mt-2 grid grid-cols-4 gap-2">{viewer.discardPiles.map((pile, index) => {
              const value = top(pile);
              const destination = { type: "discard" as const, index };
              return <DropPile allowed={allowedDestinations.has(`discard-${index}`)} destination={destination} key={index} label={`Discard pile ${index + 1}`} onChoose={chooseDestination} selectedMode={selectedCommand !== null && dragSource === null}>{value === null ? <span className="text-2xl text-emerald-100/25">+</span> : <DraggableCard disabled={busy || sourceCommands(view, { type: "discardPile", index }).length === 0} label={`${cardName(value)} from discard pile ${index + 1}`} onSelect={selectSource} selected={selectedSource?.type === "discardPile" && selectedSource.index === index} source={{ type: "discardPile", index }} value={value} />}<span className="absolute bottom-1 text-[0.6rem] font-bold text-emerald-100/45">{index + 1}</span></DropPile>;
            })}</div></section>
          </div>
          <section aria-label="Your hand"><p className="zone-label">Hand</p><div className="hand-layout mt-2 flex min-h-30 gap-3 overflow-x-auto p-1 pb-3">{viewer.cardsInHand.length === 0 ? <p className="self-center text-sm text-emerald-100/45">No cards in hand</p> : viewer.cardsInHand.map((value, index) => {
            const source = { type: "hand" as const, index };
            return <DraggableCard disabled={busy || sourceCommands(view, source).length === 0} key={`${index}-${value}`} label={`${cardName(value)} from hand position ${index + 1}`} onSelect={selectSource} selected={selectedSource?.type === "hand" && selectedSource.index === index} source={source} value={value} />;
          })}</div></section>
        </Panel>
      </main>

      <DragOverlay dropAnimation={null}>{activeCardValue === undefined ? null : <CardFace className="rotate-3 scale-105" value={activeCardValue} />}</DragOverlay>

      {view.status === "finished" && (
        <div aria-labelledby="completion-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-emerald-950/85 p-4 backdrop-blur-md" role="dialog">
          <Panel className="w-full max-w-md p-8 text-center">
            <p className="eyebrow">Game over</p>
            <h1 className="mt-3 font-serif text-5xl text-white" id="completion-title" tabIndex={-1}>{view.winnerName === view.viewerName ? "You won!" : `${view.winnerName} wins`}</h1>
            <p className="mt-4 text-emerald-100/70">{view.winnerName === view.viewerName ? "You cleared your stock pile." : `${view.winnerName} cleared their stock pile first.`}</p>
            <Button className="mt-6 w-full" onClick={onExit} type="button">Return home</Button>
          </Panel>
        </div>
      )}
    </DndContext>
  );
}
