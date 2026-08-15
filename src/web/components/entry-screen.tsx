import type { FormEvent } from "react";

import { Button } from "./ui/button";
import { Panel } from "./ui/panel";

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
    <main className="entry-layout mx-auto grid w-full max-w-6xl flex-1 content-center gap-8 px-4 py-10 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="self-center">
        <p className="eyebrow">Local multiplayer preview</p>
        <h1 className="mt-3 max-w-lg font-serif text-5xl leading-[0.95] text-white sm:text-7xl">Pull up a seat.</h1>
        <p className="mt-5 max-w-md text-lg leading-7 text-emerald-100/70">Create a table or join friends with a game code. The server keeps every hand private and every move honest.</p>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="p-6">
          <form className="grid h-full content-start gap-5" onSubmit={submitCreate}>
            <div><p className="eyebrow">01</p><h2 className="mt-2 text-2xl font-bold text-white">Create a game</h2></div>
            <label className="field-label">Your name<input autoComplete="nickname" maxLength={32} name="playerName" placeholder="Yesh" required /></label>
            <Button disabled={busy} type="submit">{busy ? "Opening table…" : "Create table"}</Button>
          </form>
        </Panel>
        <Panel className="p-6">
          <form className="grid h-full content-start gap-5" onSubmit={submitJoin}>
            <div><p className="eyebrow">02</p><h2 className="mt-2 text-2xl font-bold text-white">Join a game</h2></div>
            <label className="field-label">Game code<input autoComplete="off" name="gameId" placeholder="game_…" required /></label>
            <label className="field-label">Your name<input autoComplete="nickname" maxLength={32} name="playerName" placeholder="Player two" required /></label>
            <Button disabled={busy} type="submit" variant="secondary">{busy ? "Joining…" : "Join table"}</Button>
          </form>
        </Panel>
      </div>
    </main>
  );
}
