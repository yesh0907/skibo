import { useDraggable } from "@dnd-kit/core";

import type { CardSource } from "../commands";
import { sourceKey } from "../commands";
import { cn } from "../lib/utils";

interface CardFaceProps {
  value: number;
  assignedValue?: number;
  count?: number;
  className?: string;
}

function CardContents({
  value,
  assignedValue,
  count,
}: Omit<CardFaceProps, "className">) {
  const display = assignedValue ?? (value === 0 ? "S" : value);
  return (
    <>
      <span className="card-corner">{value === 0 ? "S" : value}</span>
      <span className="card-value">{display}</span>
      {assignedValue !== undefined && (
        <span className="wild-label">WILD</span>
      )}
      {count !== undefined && <span className="card-count">{count}</span>}
    </>
  );
}

export function CardFace({
  value,
  assignedValue,
  count,
  className,
}: CardFaceProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("card", value === 0 && "wild", className)}
    >
      <CardContents
        assignedValue={assignedValue}
        count={count}
        value={value}
      />
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

export function DraggableCard({
  source,
  disabled,
  selected,
  label,
  onSelect,
  value,
  assignedValue,
  count,
  className,
}: DraggableCardProps) {
  const key = sourceKey(source);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
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
        "card",
        value === 0 && "wild",
        !disabled && "actionable",
        selected && "selected-card",
        isDragging && "drag-origin",
        className,
      )}
      data-source-key={key}
      disabled={disabled}
      onClick={() => onSelect(source)}
      ref={setNodeRef}
      type="button"
    >
      <CardContents
        assignedValue={assignedValue}
        count={count}
        value={value}
      />
    </button>
  );
}
