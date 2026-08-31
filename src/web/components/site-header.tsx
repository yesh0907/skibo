interface SiteHeaderProps {
  gameId: string | null;
  busy: boolean;
  onCopy: () => void;
  onRefresh: () => void;
  onExit: () => void;
  exitLabel?: string;
  exitDisabled?: boolean;
}

export function SiteHeader({
  gameId,
  busy,
  onCopy,
  onRefresh,
  onExit,
  exitLabel = "Exit game",
  exitDisabled = false,
}: SiteHeaderProps) {
  return (
    <header className="app-header">
      <a
        aria-label="Skibo home"
        className="brand"
        href="/"
      >
        <span aria-hidden="true" className="brand-cards">
          <span>1</span>
          <span>S</span>
          <span>3</span>
        </span>
        <span>
          <strong>SKIBO</strong>
          <small>multiplayer table</small>
        </span>
      </a>
      {gameId !== null && (
        <div className="header-actions">
          <span className="game-code">{gameId}</span>
          <button
            aria-label="Copy game code"
            className="icon-button"
            onClick={onCopy}
            title="Copy game code"
            type="button"
          >
            <span aria-hidden="true">⧉</span>
          </button>
          <button
            aria-label="Refresh game"
            className={`icon-button${busy ? " is-spinning" : ""}`}
            disabled={busy}
            onClick={onRefresh}
            title="Refresh game"
            type="button"
          >
            <span aria-hidden="true">↻</span>
          </button>
          <button
            aria-label={exitLabel}
            className="quiet-button"
            disabled={exitDisabled}
            onClick={onExit}
            type="button"
          >
            {exitLabel === "Leave waiting room" ? "Leave" : "Exit"}
          </button>
        </div>
      )}
    </header>
  );
}
