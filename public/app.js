const state = {
  gameId: null,
  playerToken: null,
  view: null,
  selectedSource: null,
  pollTimer: null,
  busy: false,
};

const elements = {
  entryView: document.querySelector("#entry-view"),
  waitingView: document.querySelector("#waiting-view"),
  gameView: document.querySelector("#game-view"),
  headerActions: document.querySelector("#header-actions"),
  gameCode: document.querySelector("#game-code"),
  waitingRoster: document.querySelector("#waiting-roster"),
  startGame: document.querySelector("#start-game"),
  stockSize: document.querySelector("#stock-size"),
  turnLabel: document.querySelector("#turn-label"),
  turnName: document.querySelector("#turn-name"),
  connectionState: document.querySelector("#connection-state"),
  opponentsZone: document.querySelector("#opponents-zone"),
  deckCount: document.querySelector("#deck-count"),
  completedCount: document.querySelector("#completed-count"),
  buildPiles: document.querySelector("#build-piles"),
  viewerName: document.querySelector("#viewer-name"),
  turnGuidance: document.querySelector("#turn-guidance"),
  yourStock: document.querySelector("#your-stock"),
  yourDiscards: document.querySelector("#your-discards"),
  yourHand: document.querySelector("#your-hand"),
  actionTray: document.querySelector("#action-tray"),
  selectedCardLabel: document.querySelector("#selected-card-label"),
  actionOptions: document.querySelector("#action-options"),
  toast: document.querySelector("#toast"),
};

document.querySelector("#create-form").addEventListener("submit", createGame);
document.querySelector("#join-form").addEventListener("submit", joinGame);
document.querySelector("#start-game").addEventListener("click", startGame);
document.querySelector("#refresh-game").addEventListener("click", refreshView);
document.querySelector("#copy-game").addEventListener("click", copyGameCode);
document.querySelector("#leave-game").addEventListener("click", leaveGame);
document.querySelector("#cancel-selection").addEventListener("click", clearSelection);

restoreSession();

async function createGame(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const playerName = String(data.get("playerName") || "").trim();
  if (!playerName) return;

  await withBusy(async () => {
    const created = await api("/api/games", { method: "POST" });
    await joinCreatedGame(created.gameId, playerName);
  });
}

async function joinGame(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const gameId = String(data.get("gameId") || "").trim();
  const playerName = String(data.get("playerName") || "").trim();
  if (!gameId || !playerName) return;

  await withBusy(() => joinCreatedGame(gameId, playerName));
}

async function joinCreatedGame(gameId, playerName) {
  const result = await api(`/api/games/${encodeURIComponent(gameId)}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerName }),
  });
  state.gameId = gameId;
  state.playerToken = result.playerToken;
  state.view = result.view;
  saveSession();
  render();
  startPolling();
}

async function startGame() {
  await withBusy(async () => {
    const stockPileSize = Number(elements.stockSize.value);
    state.view = await api(`/api/games/${state.gameId}/start`, {
      method: "POST",
      headers: authorizedHeaders(true),
      body: JSON.stringify({ stockPileSize }),
    });
    clearSelection();
    render();
  });
}

async function refreshView() {
  if (!state.gameId || !state.playerToken || state.busy) return;
  try {
    elements.connectionState.textContent = "Refreshing";
    state.view = await api(`/api/games/${state.gameId}/state`, {
      headers: authorizedHeaders(false),
    });
    render();
  } catch (error) {
    elements.connectionState.textContent = "Connection issue";
    showToast(error.message, true);
  }
}

async function submitCommand(command) {
  await withBusy(async () => {
    const result = await api(`/api/games/${state.gameId}/commands`, {
      method: "POST",
      headers: authorizedHeaders(true),
      body: JSON.stringify({ command }),
    });
    state.view = result.view;
    clearSelection();
    render();
  });
}

function render() {
  const hasSession = Boolean(state.gameId && state.playerToken && state.view);
  elements.entryView.hidden = hasSession;
  elements.headerActions.hidden = !hasSession;
  elements.waitingView.hidden = !hasSession || state.view.status !== "waiting";
  elements.gameView.hidden = !hasSession || state.view.status === "waiting";
  if (!hasSession) return;

  elements.gameCode.textContent = state.gameId;
  if (state.view.status === "waiting") {
    renderWaitingRoom();
  } else {
    renderGame();
  }
}

function renderWaitingRoom() {
  elements.waitingRoster.replaceChildren(
    ...state.view.players.map((player, index) => {
      const row = document.createElement("div");
      row.className = "roster-player";
      row.innerHTML = `<strong>${escapeHtml(player.name)}</strong><span>${index === 0 ? "First turn" : `Seat ${index + 1}`}</span>`;
      return row;
    }),
  );
  elements.startGame.disabled = state.view.players.length < 2 || state.busy;
}

function renderGame() {
  const view = state.view;
  const viewer = view.players.find((player) => player.name === view.viewerName);
  const opponents = view.players.filter((player) => player.name !== view.viewerName);

  elements.turnLabel.textContent = view.status === "finished" ? "Game complete" : "Current turn";
  elements.turnName.textContent =
    view.status === "finished" ? `${view.currentPlayerName} wins` : view.currentPlayerName;
  elements.connectionState.textContent = state.busy ? "Sending move" : "Connected";
  elements.viewerName.textContent = view.viewerName;
  elements.turnGuidance.textContent =
    view.status === "finished"
      ? view.currentPlayerName === view.viewerName
        ? "You cleared your stock pile."
        : `${view.currentPlayerName} cleared their stock pile.`
      : view.isYourTurn
        ? "Choose a highlighted card, then select an exact legal action."
        : `Waiting for ${view.currentPlayerName}. The table refreshes automatically.`;

  elements.deckCount.textContent = `${view.deckCount} in draw deck`;
  elements.completedCount.textContent = `${view.completedBuildPileCount} completed`;
  renderOpponents(opponents, view.currentPlayerName);
  renderBuildPiles(view.buildPiles);
  renderYourCards(viewer);
  renderActionTray();
}

function renderOpponents(opponents, currentPlayerName) {
  elements.opponentsZone.replaceChildren(
    ...opponents.map((player) => {
      const node = document.createElement("article");
      node.className = "opponent";
      const discards = player.discardPiles
        .map((pile, index) => `${index + 1}:${formatCard(top(pile))}`)
        .join(" · ");
      node.innerHTML = `
        <strong>${escapeHtml(player.name)}</strong>
        <span class="opponent-turn">${player.name === currentPlayerName ? "Playing" : ""}</span>
        <span>${player.stockCount} stock · top ${formatCard(player.stockTopCard)}</span>
        <span class="mini-piles">Discards ${discards}</span>
      `;
      return node;
    }),
  );
}

function renderBuildPiles(piles) {
  elements.buildPiles.replaceChildren(
    ...piles.map((pile, index) => {
      const slot = document.createElement("div");
      slot.className = "pile-slot";
      slot.dataset.destinationIndex = String(index);
      const cardValue = top(pile);
      if (cardValue !== null) slot.append(createCard(cardValue));
      const label = document.createElement("span");
      label.className = "pile-index";
      label.textContent = `BUILD ${index + 1}`;
      slot.append(label);
      return slot;
    }),
  );
}

function renderYourCards(viewer) {
  if (!viewer) return;
  elements.yourStock.replaceChildren(
    createSourceCard(
      viewer.stockTopCard,
      { type: "stockPile" },
      viewer.stockCount,
      "stock-card",
    ),
  );
  elements.yourDiscards.replaceChildren(
    ...viewer.discardPiles.map((pile, index) => {
      const slot = document.createElement("div");
      slot.className = "pile-slot";
      const cardValue = top(pile);
      if (cardValue !== null) {
        slot.append(createSourceCard(cardValue, { type: "discardPile", index }));
      }
      const label = document.createElement("span");
      label.className = "pile-index";
      label.textContent = String(index + 1);
      slot.append(label);
      return slot;
    }),
  );
  elements.yourHand.replaceChildren(
    ...(viewer.cardsInHand || []).map((cardValue, index) =>
      createSourceCard(cardValue, { type: "hand", index }),
    ),
  );
  if (!viewer.cardsInHand?.length) {
    const empty = document.createElement("span");
    empty.className = "empty-state";
    empty.textContent = "No cards in hand";
    elements.yourHand.append(empty);
  }
}

function createSourceCard(value, source, count, extraClass = "") {
  if (value === null || value === undefined) {
    const empty = document.createElement("div");
    empty.className = "pile-slot";
    empty.textContent = "—";
    return empty;
  }
  const card = createCard(value, true);
  if (extraClass) card.classList.add(extraClass);
  card.dataset.source = JSON.stringify(source);
  const commands = commandsForSource(source);
  card.disabled = commands.length === 0 || state.busy;
  if (commands.length > 0) card.classList.add("actionable");
  if (sameSource(source, state.selectedSource)) card.classList.add("selected");
  card.addEventListener("click", () => selectSource(source));
  if (count !== undefined) {
    const badge = document.createElement("span");
    badge.className = "card-count";
    badge.textContent = String(count);
    card.append(badge);
  }
  return card;
}

function createCard(value, button = false) {
  const card = document.createElement(button ? "button" : "div");
  card.className = `card${value === 0 ? " wild" : ""}`;
  if (button) {
    card.type = "button";
    card.setAttribute("aria-label", value === 0 ? "Skip-Bo wild card" : `Card ${value}`);
  }
  card.innerHTML = `
    <span class="card-corner">${value === 0 ? "S" : value}</span>
    <span class="card-value">${value === 0 ? "S" : value}</span>
  `;
  return card;
}

function selectSource(source) {
  state.selectedSource = sameSource(source, state.selectedSource) ? null : source;
  renderGame();
}

function renderActionTray() {
  const commands = state.selectedSource ? commandsForSource(state.selectedSource) : [];
  elements.actionTray.hidden = commands.length === 0;
  if (commands.length === 0) return;

  const selected = commands[0];
  elements.selectedCardLabel.textContent = describeSource(selected);
  elements.actionOptions.replaceChildren(
    ...commands.map((command) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `action-button${command.type === "discardCard" ? " discard" : ""}`;
      button.textContent =
        command.type === "playCard"
          ? `Play on build ${command.destinationIndex + 1}`
          : `Discard to pile ${command.discardPileIndex + 1}`;
      button.addEventListener("click", () => submitCommand(command));
      return button;
    }),
  );
}

function commandsForSource(source) {
  if (!state.view?.isYourTurn) return [];
  return state.view.legalCommands.filter((command) => sameSource(command.source, source));
}

function sameSource(left, right) {
  if (!left || !right || left.type !== right.type) return false;
  return left.type === "stockPile" || left.index === right.index;
}

function describeSource(command) {
  const value = formatCard(command.cardValue);
  if (command.source.type === "stockPile") return `Stock card ${value}`;
  if (command.source.type === "discardPile") {
    return `Discard pile ${command.source.index + 1} · ${value}`;
  }
  return `Hand card ${command.source.index + 1} · ${value}`;
}

function clearSelection() {
  state.selectedSource = null;
  elements.actionTray.hidden = true;
}

function startPolling() {
  window.clearInterval(state.pollTimer);
  state.pollTimer = window.setInterval(refreshView, 2_500);
}

function authorizedHeaders(json) {
  return {
    authorization: `Bearer ${state.playerToken}`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

async function api(path, init = {}) {
  const response = await fetch(path, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || `Request failed with ${response.status}`);
  }
  return body;
}

async function withBusy(operation) {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    await operation();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    state.busy = false;
    render();
  }
}

async function copyGameCode() {
  await navigator.clipboard.writeText(state.gameId);
  showToast("Game code copied.");
}

function leaveGame() {
  window.clearInterval(state.pollTimer);
  sessionStorage.removeItem("skibo-session");
  state.gameId = null;
  state.playerToken = null;
  state.view = null;
  clearSelection();
  render();
}

function saveSession() {
  sessionStorage.setItem(
    "skibo-session",
    JSON.stringify({ gameId: state.gameId, playerToken: state.playerToken }),
  );
}

async function restoreSession() {
  const saved = sessionStorage.getItem("skibo-session");
  if (!saved) return render();
  try {
    const session = JSON.parse(saved);
    state.gameId = session.gameId;
    state.playerToken = session.playerToken;
    await refreshView();
    startPolling();
  } catch {
    leaveGame();
  }
}

function showToast(message, error = false) {
  elements.toast.textContent = message;
  elements.toast.className = `toast${error ? " error" : ""}`;
  elements.toast.hidden = false;
  window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3_000);
}

function top(pile) {
  return pile.length ? pile[pile.length - 1] : null;
}

function formatCard(value) {
  if (value === null || value === undefined) return "—";
  return value === 0 ? "S" : String(value);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
