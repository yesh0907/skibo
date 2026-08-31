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
import {
  commandForDrop,
  destinationKey,
  sameSource,
  sourceKey,
  type CardSource,
  type DropDestination,
} from "../commands";
import {
  MOUSE_ACTIVATION_CONSTRAINT,
  TOUCH_ACTIVATION_CONSTRAINT,
} from "../dnd-config";
import type { LiveUpdateStatus } from "../hooks/use-live-game-updates";
import { CardFace, DraggableCard } from "./card";
import { DropPile } from "./drop-pile";

type ActiveGameView = Extract<
  PlayerView,
  { status: "playing" | "finished" }
>;

interface GameTableProps {
  view: ActiveGameView;
  busy: boolean;
  liveStatus: LiveUpdateStatus;
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

function formatCard(value: number | null): string {
  if (value === null) return "—";
  return value === 0 ? "S" : String(value);
}

function sourceCommands(
  view: ActiveGameView,
  source: CardSource,
): TransportCommand[] {
  return view.legalCommands.filter((command) =>
    sameSource(command.source, source),
  );
}

function sourceFromDrag(event: DragStartEvent | DragEndEvent): CardSource | null {
  const source = event.active.data.current?.source as CardSource | undefined;
  return source ?? null;
}

function destinationFromDrag(event: DragEndEvent): DropDestination | null {
  const destination = event.over?.data.current?.destination as
    | DropDestination
    | undefined;
  return destination ?? null;
}

function PileCard({ pile }: { pile: readonly number[] }) {
  const value = top(pile);
  if (value === null) return null;
  return (
    <CardFace
      assignedValue={value === 0 ? pile.length : undefined}
      value={value}
    />
  );
}

function connectionLabel(status: LiveUpdateStatus, busy: boolean): string {
  if (busy) return "Sending move";
  switch (status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "reconnecting":
      return "Reconnecting";
    case "disconnected":
      return "Disconnected";
  }
}

export function GameTable({
  view,
  busy,
  liveStatus,
  selectedCommand,
  onSelect,
  onCommand,
  onExit,
}: GameTableProps) {
  const [dragSource, setDragSource] = useState<CardSource | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: MOUSE_ACTIVATION_CONSTRAINT,
    }),
    useSensor(TouchSensor, {
      activationConstraint: TOUCH_ACTIVATION_CONSTRAINT,
    }),
    useSensor(KeyboardSensor),
  );
  const selectedSource = dragSource ?? selectedCommand?.source ?? null;
  const activeCommands =
    selectedSource === null ? [] : sourceCommands(view, selectedSource);
  const allowedDestinations = new Set(activeCommands.map(destinationKey));
  const activeCardValue = activeCommands[0]?.cardValue;

  useEffect(() => {
    if (selectedCommand === null || dragSource !== null) return;
    const selectedKey = sourceKey(selectedCommand.source);
    function cancelSelection(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      onSelect(null);
      window.setTimeout(() =>
        document
          .querySelector<HTMLElement>(
            `[data-source-key="${CSS.escape(selectedKey)}"]`,
          )
          ?.focus(),
      );
    }
    window.addEventListener("keydown", cancelSelection);
    return () => window.removeEventListener("keydown", cancelSelection);
  }, [dragSource, onSelect, selectedCommand]);

  useEffect(() => {
    if (view.status !== "finished") return;
    document.querySelector<HTMLElement>("#completion-title")?.focus();
  }, [view.status]);

  const viewer = view.players.find(
    (player) => player.name === view.viewerName,
  );
  if (viewer === undefined || viewer.cardsInHand === null) return null;

  const opponents = view.players.filter(
    (player) => player.name !== view.viewerName,
  );

  function selectSource(source: CardSource) {
    const commands = sourceCommands(view, source);
    if (commands.length === 0) return;
    onSelect(
      selectedCommand !== null && sameSource(selectedCommand.source, source)
        ? null
        : (commands[0] ?? null),
    );
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
        screenReaderInstructions: {
          draggable:
            "Press space or Enter to pick up a card. Use arrow keys to move between legal piles, then press space or Enter to play. Press Escape to cancel.",
        },
      }}
      onDragCancel={() => {
        setDragSource(null);
        onSelect(null);
      }}
      onDragEnd={finishDrag}
      onDragStart={(event) => {
        const source = sourceFromDrag(event);
        setDragSource(source);
        if (source !== null) {
          onSelect(sourceCommands(view, source)[0] ?? null);
        }
      }}
      sensors={sensors}
    >
      <main className="game-view" data-revision={view.revision}>
        <div className="turn-bar">
          <div>
            <p className="eyebrow">
              {view.status === "finished" ? "Game complete" : "Current turn"}
            </p>
            <h1 id="turn-heading" tabIndex={-1}>
              {view.status === "finished"
                ? `${view.winnerName} wins`
                : view.currentPlayerName}
            </h1>
          </div>
          <div aria-live="polite" className="connection-state">
            {connectionLabel(liveStatus, busy)}
          </div>
        </div>

        <section
          aria-label="Opponents"
          className="opponents-zone"
          id="opponents-zone"
        >
          {opponents.map((player) => (
            <article className="opponent" key={player.name}>
              <div className="opponent-stock">
                {player.stockTopCard !== null && (
                  <CardFace
                    count={player.stockCount}
                    value={player.stockTopCard}
                  />
                )}
              </div>
              <div className="opponent-details">
                <strong>{player.name}</strong>
                <span className="opponent-turn">
                  {player.name === view.currentPlayerName ? "Playing" : ""}
                </span>
                <span>{player.stockCount} cards in stock</span>
                <span className="mini-piles">
                  Discards{" "}
                  {player.discardPiles
                    .map((pile, index) => `${index + 1}:${formatCard(top(pile))}`)
                    .join(" · ")}
                </span>
              </div>
            </article>
          ))}
        </section>

        <section aria-label="Shared build piles" className="table-zone">
          <div className="table-meta">
            <span>{view.deckCount} in draw deck</span>
            <span>{view.completedBuildPileCount} completed</span>
          </div>
          <div className="build-piles">
            {view.buildPiles.map((pile, index) => (
              <DropPile
                allowed={allowedDestinations.has(`build-${index}`)}
                destination={{ type: "build", index }}
                key={index}
                label={`Build pile ${index + 1}`}
                onChoose={chooseDestination}
                selectedMode={selectedCommand !== null && dragSource === null}
              >
                <PileCard pile={pile} />
                <span className="pile-index">BUILD {index + 1}</span>
              </DropPile>
            ))}
          </div>
        </section>

        <section aria-label="Your cards" className="player-zone">
          <div className="player-summary">
            <div>
              <p className="eyebrow">Your cards</p>
              <h2>{view.viewerName}</h2>
            </div>
            <p>
              {view.status === "finished"
                ? view.winnerName === view.viewerName
                  ? "You cleared your stock pile."
                  : `${view.winnerName} cleared their stock pile.`
                : view.isYourTurn
                  ? "Drag a highlighted card onto a glowing destination."
                  : `Waiting for ${view.currentPlayerName}. The table refreshes automatically.`}
            </p>
          </div>

          <div className="personal-piles">
            <section aria-label="Your stock pile" className="stock-area">
              <p className="zone-label">Stock</p>
              {viewer.stockTopCard === null ? (
                <div className="pile-slot">—</div>
              ) : (
                <DraggableCard
                  className="stock-card"
                  count={viewer.stockCount}
                  disabled={
                    busy ||
                    sourceCommands(view, { type: "stockPile" }).length === 0
                  }
                  label={`${cardName(viewer.stockTopCard)} from stock pile, ${viewer.stockCount} cards remain`}
                  onSelect={selectSource}
                  selected={selectedSource?.type === "stockPile"}
                  source={{ type: "stockPile" }}
                  value={viewer.stockTopCard}
                />
              )}
            </section>

            <section aria-label="Your discard piles" className="discard-area">
              <p className="zone-label">Discards</p>
              <div className="discard-piles">
                {viewer.discardPiles.map((pile, index) => {
                  const value = top(pile);
                  const source = { type: "discardPile" as const, index };
                  return (
                    <DropPile
                      allowed={allowedDestinations.has(`discard-${index}`)}
                      destination={{ type: "discard", index }}
                      key={index}
                      label={`Discard pile ${index + 1}`}
                      onChoose={chooseDestination}
                      selectedMode={
                        selectedCommand !== null && dragSource === null
                      }
                    >
                      {value !== null && (
                        <DraggableCard
                          disabled={
                            busy || sourceCommands(view, source).length === 0
                          }
                          label={`${cardName(value)} from discard pile ${index + 1}`}
                          onSelect={selectSource}
                          selected={
                            selectedSource?.type === "discardPile" &&
                            selectedSource.index === index
                          }
                          source={source}
                          value={value}
                        />
                      )}
                      <span className="pile-index">{index + 1}</span>
                    </DropPile>
                  );
                })}
              </div>
            </section>
          </div>

          <section aria-label="Your hand" className="hand-area">
            <p className="zone-label">Hand</p>
            <div className="hand">
              {viewer.cardsInHand.length === 0 ? (
                <span className="empty-state">No cards in hand</span>
              ) : (
                viewer.cardsInHand.map((value, index) => {
                  const source = { type: "hand" as const, index };
                  return (
                    <DraggableCard
                      disabled={
                        busy || sourceCommands(view, source).length === 0
                      }
                      key={`${index}-${value}`}
                      label={`${cardName(value)} from hand position ${index + 1}`}
                      onSelect={selectSource}
                      selected={
                        selectedSource?.type === "hand" &&
                        selectedSource.index === index
                      }
                      source={source}
                      value={value}
                    />
                  );
                })
              )}
            </div>
          </section>
        </section>

        {view.status === "finished" && (
          <section
            aria-labelledby="completion-title"
            aria-modal="true"
            className="winner-overlay"
            role="dialog"
          >
            <div className="winner-panel">
              <p className="eyebrow">Game over</p>
              <h1 id="completion-title" tabIndex={-1}>
                {view.winnerName === view.viewerName
                  ? "You won!"
                  : `${view.winnerName} wins`}
              </h1>
              <p>
                {view.winnerName === view.viewerName
                  ? "You cleared your stock pile."
                  : `${view.winnerName} cleared their stock pile first.`}
              </p>
              <button className="primary-button" onClick={onExit} type="button">
                Leave table
              </button>
            </div>
          </section>
        )}
      </main>

      <DragOverlay dropAnimation={null}>
        {activeCardValue === undefined ? null : (
          <CardFace className="drag-overlay" value={activeCardValue} />
        )}
      </DragOverlay>
    </DndContext>
  );
}
