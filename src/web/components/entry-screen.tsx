import type { FormEvent } from "react";

interface EntryScreenProps {
  busy: boolean;
  onCreate: (name: string) => void;
  onJoin: (gameId: string, name: string) => void;
}

function fieldValue(form: HTMLFormElement, name: string): string {
  return String(new FormData(form).get(name) ?? "").trim();
}

export function EntryScreen({ busy, onCreate, onJoin }: EntryScreenProps) {
  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = fieldValue(event.currentTarget, "playerName");
    if (name) onCreate(name);
  }

  function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const gameId = fieldValue(event.currentTarget, "gameId");
    const name = fieldValue(event.currentTarget, "playerName");
    if (gameId && name) onJoin(gameId, name);
  }

  return (
    <main className="entry-shell">
      <div className="entry-heading">
        <p className="eyebrow">Local multiplayer preview</p>
        <h1>Pull up a seat.</h1>
        <p>Create a table or join one with a game code.</p>
      </div>

      <div className="entry-grid">
        <form className="entry-panel" onSubmit={submitCreate}>
          <div>
            <p className="step-number">01</p>
            <h2>Create a game</h2>
          </div>
          <label>
            Your name
            <input
              autoComplete="nickname"
              maxLength={24}
              name="playerName"
              placeholder="Yesh"
              required
            />
          </label>
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Opening table…" : "Create table"}
          </button>
        </form>

        <form className="entry-panel" onSubmit={submitJoin}>
          <div>
            <p className="step-number">02</p>
            <h2>Join a game</h2>
          </div>
          <label>
            Game code
            <input
              autoComplete="off"
              name="gameId"
              placeholder="game_..."
              required
            />
          </label>
          <label>
            Your name
            <input
              autoComplete="nickname"
              maxLength={24}
              name="playerName"
              placeholder="Player two"
              required
            />
          </label>
          <button className="secondary-button" disabled={busy} type="submit">
            {busy ? "Joining…" : "Join table"}
          </button>
        </form>
      </div>
    </main>
  );
}
