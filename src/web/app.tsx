import { useReducer } from "react";
import { Toaster } from "sonner";

import { appReducer, initialAppState } from "./app-state";

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-16">
      <section className="w-full rounded-xl border bg-card p-8 text-card-foreground shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">
          Skibo React checkpoint
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          The shared client contract is ready.
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          This route proves the React 19, reducer, Tailwind, and Bun build seam.
          The playable client remains at the site root while its screens migrate.
        </p>
        <button
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
          onClick={() => dispatch({ type: "scaffoldOpened" })}
          type="button"
        >
          {state.phase === "ready" ? "Reducer ready" : "Check reducer"}
        </button>
      </section>
      <Toaster />
    </main>
  );
}
