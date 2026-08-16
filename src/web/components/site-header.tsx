import { Clipboard, LogOut, RefreshCw } from "lucide-react";

import { Button } from "./ui/button";

interface SiteHeaderProps {
  gameId: string | null;
  busy: boolean;
  onCopy: () => void;
  onRefresh: () => void;
  onExit: () => void;
  exitLabel?: string;
  exitDisabled?: boolean;
}

export function SiteHeader({ gameId, busy, onCopy, onRefresh, onExit, exitLabel = "Exit game", exitDisabled = false }: SiteHeaderProps) {
  return (
    <header className="flex min-h-18 items-center justify-between gap-4 border-b border-white/10 bg-emerald-950/90 px-4 py-3 sm:px-8">
      <div className="flex items-center gap-3" aria-label="Skibo multiplayer table">
        <span className="grid h-11 w-11 rotate-[-4deg] place-items-center rounded-lg border-2 border-emerald-950 bg-lime-300 text-xl font-black text-emerald-950 shadow-lg">S</span>
        <div>
          <strong className="block tracking-[0.16em] text-white">SKIBO</strong>
          <span className="text-xs text-emerald-200/70">multiplayer table</span>
        </div>
      </div>
      {gameId !== null && (
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <code className="hidden max-w-36 truncate rounded-md bg-black/20 px-2 py-1 text-xs text-emerald-100 sm:block">{gameId}</code>
          <Button aria-label="Copy game code" className="w-11 px-0" onClick={onCopy} type="button" variant="ghost"><Clipboard aria-hidden="true" size={18} /></Button>
          <Button aria-label="Refresh game" className="w-11 px-0" disabled={busy} onClick={onRefresh} type="button" variant="ghost"><RefreshCw aria-hidden="true" className={busy ? "animate-spin" : ""} size={18} /></Button>
          <Button aria-label={exitLabel} className="w-11 px-0 sm:w-auto sm:px-3" disabled={exitDisabled} onClick={onExit} type="button" variant="danger"><LogOut aria-hidden="true" size={18} /><span className="hidden sm:ml-2 sm:inline">{exitLabel === "Leave waiting room" ? "Leave" : "Exit"}</span></Button>
        </div>
      )}
    </header>
  );
}
