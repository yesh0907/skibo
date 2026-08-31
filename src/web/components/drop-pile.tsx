import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";

import type { DropDestination } from "../commands";
import { cn } from "../lib/utils";

interface DropPileProps {
  destination: DropDestination;
  allowed: boolean;
  selectedMode: boolean;
  label: string;
  children: ReactNode;
  onChoose: (destination: DropDestination) => void;
}

export function DropPile({
  destination,
  allowed,
  selectedMode,
  label,
  children,
  onChoose,
}: DropPileProps) {
  const id = `${destination.type}-${destination.index}`;
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: { destination },
  });

  return (
    <div
      aria-label={label}
      className={cn(
        "pile-slot",
        allowed && "drop-allowed",
        isOver && allowed && "drop-hover",
      )}
      data-drop-index={destination.index}
      data-drop-type={destination.type}
      ref={setNodeRef}
      role="group"
    >
      {children}
      {selectedMode && allowed && (
        <button
          aria-label={`Play selected card on ${label}`}
          className="drop-choice"
          onClick={() => onChoose(destination)}
          type="button"
        />
      )}
    </div>
  );
}
