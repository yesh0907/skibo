import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import type { CardSource } from "../commands";
import { sourceKey } from "../commands";
import { cn } from "../lib/utils";

interface CardFaceProps {
  value: number;
  assignedValue?: number;
  count?: number;
  className?: string;
}

export function CardFace({ value, assignedValue, count, className }: CardFaceProps) {
  const display = assignedValue ?? (value === 0 ? "S" : value);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid aspect-[5/7] w-16 shrink-0 place-items-center rounded-xl border-2 border-emerald-950/30 bg-amber-100 text-2xl font-black text-emerald-950 shadow-lg sm:w-20",
        value === 0 && "bg-gradient-to-br from-fuchsia-300 via-amber-200 to-cyan-300",
        className,
      )}
    >
      <span className="absolute left-1.5 top-1 text-xs font-black">{value === 0 ? "S" : value}</span>
      <span>{display}</span>
      {assignedValue !== undefined && <span className="absolute bottom-1 text-[0.55rem] font-black uppercase">Wild</span>}
      {count !== undefined && (
        <span className="absolute -right-2 -top-2 grid min-h-7 min-w-7 place-items-center rounded-full bg-lime-300 px-1 text-xs text-emerald-950 ring-2 ring-emerald-950">
          {count}
        </span>
      )}
    </span>
  );
}

interface DraggableCardProps extends CardFaceProps {
  source: CardSource;
  disabled: boolean;
  selected: boolean;
  label: string;
  onSelect: (source: CardSource) => void;
}

export function DraggableCard({ source, disabled, selected, label, onSelect, ...face }: DraggableCardProps) {
  const key = sourceKey(source);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `card-${key}`,
    data: { source },
    disabled,
  });

  return (
    <button
      {...attributes}
      {...listeners}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        "draggable-card rounded-xl transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lime-300",
        !disabled && "cursor-grab hover:-translate-y-1 active:cursor-grabbing",
        disabled && "cursor-default opacity-55",
        selected && "ring-4 ring-lime-300",
        isDragging && "opacity-30",
      )}
      data-source-key={key}
      disabled={disabled}
      onClick={() => onSelect(source)}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      type="button"
    >
      <CardFace {...face} />
    </button>
  );
}
