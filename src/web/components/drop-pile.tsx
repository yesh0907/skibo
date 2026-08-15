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

export function DropPile({ destination, allowed, selectedMode, label, children, onChoose }: DropPileProps) {
  const id = `${destination.type}-${destination.index}`;
  const { isOver, setNodeRef } = useDroppable({ id, data: { destination } });
  const className = cn(
    "relative grid min-h-28 min-w-20 place-items-center rounded-2xl border-2 border-dashed border-emerald-200/20 bg-black/10 p-2 transition sm:min-h-36",
    allowed && "border-lime-300/80 bg-lime-300/10 shadow-[0_0_28px_rgba(190,242,100,.24)]",
    isOver && allowed && "scale-105 bg-lime-300/25",
  );

  if (selectedMode && allowed) {
    return (
      <div aria-label={label} className={className} ref={setNodeRef} role="group">
        {children}
        <button
          aria-label={`Play selected card on ${label}`}
          className="absolute inset-0 z-20 rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lime-300"
          onClick={() => onChoose(destination)}
          type="button"
        />
      </div>
    );
  }

  return <div aria-label={label} className={className} ref={setNodeRef} role="group">{children}</div>;
}
