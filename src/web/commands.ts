import type { TransportCommand } from "../shared/transport";

export type CardSource = TransportCommand["source"];
export type DropDestination =
  | { type: "build"; index: number }
  | { type: "discard"; index: number };

export function sourceKey(source: CardSource): string {
  return source.type === "stockPile" ? "stock" : `${source.type}-${source.index}`;
}

export function sameSource(left: CardSource, right: CardSource): boolean {
  return left.type === right.type &&
    (left.type === "stockPile" || ("index" in right && left.index === right.index));
}

export function commandForDrop(
  commands: readonly TransportCommand[],
  destination: DropDestination,
): TransportCommand | null {
  return commands.find((command) =>
    destination.type === "build"
      ? command.type === "playCard" && command.destinationIndex === destination.index
      : command.type === "discardCard" && command.discardPileIndex === destination.index,
  ) ?? null;
}

export function destinationKey(command: TransportCommand): string {
  return command.type === "playCard"
    ? `build-${command.destinationIndex}`
    : `discard-${command.discardPileIndex}`;
}
