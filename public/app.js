const state = {
  gameId: null,
  playerToken: null,
  view: null,
  drag: null,
  liveSocket: null,
  reconnectTimer: null,
  reconnectAttempt: 0,
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
  winnerOverlay: document.querySelector("#winner-overlay"),
  winnerTitle: document.querySelector("#winner-title"),
  winnerMessage: document.querySelector("#winner-message"),
  toast: document.querySelector("#toast"),
};

document.querySelector("#create-form").addEventListener("submit", createGame);
document.querySelector("#join-form").addEventListener("submit", joinGame);
document.querySelector("#start-game").addEventListener("click", startGame);
document.querySelector("#refresh-game").addEventListener("click", refreshView);
document.querySelector("#copy-game").addEventListener("click", copyGameCode);
document.querySelector("#leave-game").addEventListener("click", leaveGame);
document.querySelector("#winner-leave").addEventListener("click", leaveGame);

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
  connectLiveUpdates();
}

async function startGame() {
  await withBusy(async () => {
    const stockPileSize = Number(elements.stockSize.value);
    state.view = await api(`/api/games/${state.gameId}/start`, {
      method: "POST",
      headers: authorizedHeaders(true),
      body: JSON.stringify({
        expectedRevision: state.view.revision,
        stockPileSize,
      }),
    });
    render();
  });
}

async function refreshView() {
  if (!state.gameId || !state.playerToken || state.busy || state.drag) return;
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

async function refreshLiveSnapshot(socket) {
  if (!state.gameId || !state.playerToken) return;
  try {
    const view = await api(`/api/games/${state.gameId}/state`, {
      headers: authorizedHeaders(false),
    });
    if (state.liveSocket !== socket) return;
    state.reconnectAttempt = 0;
    if (!state.view || view.revision > state.view.revision) {
      state.view = view;
      render();
    }
  } catch (error) {
    if (state.liveSocket === socket) {
      elements.connectionState.textContent = "Connection issue";
      showToast(error.message, true);
    }
  }
}

function connectLiveUpdates() {
  if (!state.gameId || !state.playerToken || state.view?.status === "finished") {
    return;
  }
  stopLiveUpdates(false);
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(
    `${protocol}//${location.host}/api/games/${encodeURIComponent(state.gameId)}/ws`,
  );
  state.liveSocket = socket;
  elements.connectionState.textContent = "Connecting";
  socket.addEventListener("open", () => {
    if (state.liveSocket !== socket) return;
    elements.connectionState.textContent = "Connected";
    void refreshLiveSnapshot(socket);
  });
  socket.addEventListener("message", (event) => {
    if (state.liveSocket !== socket || typeof event.data !== "string") return;
    try {
      const envelope = JSON.parse(event.data);
      if (
        envelope?.version !== 1 ||
        envelope?.type !== "room.view" ||
        envelope.view?.gameId !== state.gameId ||
        !Number.isInteger(envelope.view?.revision) ||
        envelope.view.revision <= state.view.revision
      ) {
        return;
      }
      state.view = envelope.view;
      render();
    } catch {
      showToast("The game server sent an invalid live update.", true);
    }
  });
  socket.addEventListener("error", () => {
    if (state.liveSocket === socket) {
      elements.connectionState.textContent = "Connection issue";
    }
  });
  socket.addEventListener("close", () => {
    if (state.liveSocket !== socket) return;
    state.liveSocket = null;
    scheduleLiveReconnect();
  });
}

function scheduleLiveReconnect() {
  if (state.reconnectTimer || !state.gameId || state.view?.status === "finished") {
    return;
  }
  const exponential = Math.min(10_000, 500 * 2 ** state.reconnectAttempt);
  const delay = Math.min(10_000, Math.round(exponential * (0.75 + Math.random() * 0.5)));
  state.reconnectAttempt += 1;
  elements.connectionState.textContent = "Reconnecting";
  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = null;
    connectLiveUpdates();
  }, delay);
}

function stopLiveUpdates(resetAttempt = true) {
  if (state.reconnectTimer) window.clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;
  const socket = state.liveSocket;
  state.liveSocket = null;
  if (socket) socket.close(1000, "Session ended");
  if (resetAttempt) state.reconnectAttempt = 0;
}

async function submitCommand(command) {
  await withBusy(async () => {
    const result = await api(`/api/games/${state.gameId}/commands`, {
      method: "POST",
      headers: authorizedHeaders(true),
      body: JSON.stringify({
        expectedRevision: state.view.revision,
        command,
      }),
    });
    state.view = result.view;
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
  const playerCount = state.view.players.length;
  const feasibleSizes = [...elements.stockSize.options].filter(
    (option) => playerCount * (Number(option.value) + 5) <= 162,
  );
  for (const option of elements.stockSize.options) {
    option.disabled = !feasibleSizes.includes(option);
  }
  if (elements.stockSize.selectedOptions[0]?.disabled) {
    elements.stockSize.value = feasibleSizes.at(-1)?.value ?? "5";
  }
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
        ? "Drag a highlighted card onto a glowing destination."
        : `Waiting for ${view.currentPlayerName}. Use Refresh game for a current snapshot.`;

  elements.deckCount.textContent = `${view.deckCount} in draw deck`;
  elements.completedCount.textContent = `${view.completedBuildPileCount} completed`;
  renderOpponents(opponents, view.currentPlayerName);
  renderBuildPiles(view.buildPiles);
  renderYourCards(viewer);
  renderWinner();
}

function renderOpponents(opponents, currentPlayerName) {
  elements.opponentsZone.replaceChildren(
    ...opponents.map((player) => {
      const node = document.createElement("article");
      node.className = "opponent";
      const stock = document.createElement("div");
      stock.className = "opponent-stock";
      if (player.stockTopCard !== null) {
        const card = createCard(player.stockTopCard);
        const count = document.createElement("span");
        count.className = "card-count";
        count.textContent = String(player.stockCount);
        card.append(count);
        stock.append(card);
      }
      const details = document.createElement("div");
      details.className = "opponent-details";
      const discards = player.discardPiles
        .map((pile, index) => `${index + 1}:${formatCard(top(pile))}`)
        .join(" · ");
      details.innerHTML = `
        <strong>${escapeHtml(player.name)}</strong>
        <span class="opponent-turn">${player.name === currentPlayerName ? "Playing" : ""}</span>
        <span>${player.stockCount} cards in stock</span>
        <span class="mini-piles">Discards ${discards}</span>
      `;
      node.append(stock, details);
      return node;
    }),
  );
}

function renderBuildPiles(piles) {
  elements.buildPiles.replaceChildren(
    ...piles.map((pile, index) => {
      const slot = document.createElement("div");
      slot.className = "pile-slot";
      slot.dataset.dropType = "build";
      slot.dataset.dropIndex = String(index);
      const cardValue = top(pile);
      if (cardValue !== null) {
        slot.append(createCard(cardValue, false, cardValue === 0 ? pile.length : null));
      }
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
      slot.dataset.dropType = "discard";
      slot.dataset.dropIndex = String(index);
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
  if (commands.length > 0) {
    card.classList.add("actionable");
    card.addEventListener("pointerdown", (event) =>
      beginDrag(event, card, source, commands),
    );
  }
  if (count !== undefined) {
    const badge = document.createElement("span");
    badge.className = "card-count";
    badge.textContent = String(count);
    card.append(badge);
  }
  return card;
}

function createCard(value, button = false, assignedValue = null) {
  const card = document.createElement(button ? "button" : "div");
  card.className = `card${value === 0 ? " wild" : ""}`;
  if (button) {
    card.type = "button";
    card.setAttribute(
      "aria-label",
      value === 0 ? "Drag Skip-Bo wild card" : `Drag card ${value}`,
    );
  }
  const displayValue = assignedValue ?? (value === 0 ? "S" : value);
  card.innerHTML = `
    <span class="card-corner">${value === 0 ? "S" : value}</span>
    <span class="card-value">${displayValue}</span>
    ${assignedValue === null ? "" : '<span class="wild-label">WILD</span>'}
  `;
  return card;
}

function commandsForSource(source) {
  if (!state.view?.isYourTurn) return [];
  return state.view.legalCommands.filter((command) => sameSource(command.source, source));
}

function sameSource(left, right) {
  if (!left || !right || left.type !== right.type) return false;
  return left.type === "stockPile" || left.index === right.index;
}

function beginDrag(event, card, source, commands) {
  if (event.button !== 0 || state.busy) return;
  event.preventDefault();
  card.setPointerCapture(event.pointerId);
  state.drag = {
    pointerId: event.pointerId,
    source,
    commands,
    origin: card,
    startX: event.clientX,
    startY: event.clientY,
    ghost: null,
  };
  card.addEventListener("pointermove", moveDrag);
  card.addEventListener("pointerup", finishDrag, { once: true });
  card.addEventListener("pointercancel", cancelDrag, { once: true });
}

function moveDrag(event) {
  const drag = state.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (
    drag.ghost === null &&
    Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6
  ) {
    return;
  }
  if (drag.ghost === null) {
    drag.ghost = drag.origin.cloneNode(true);
    drag.ghost.classList.add("drag-ghost");
    drag.ghost.removeAttribute("id");
    document.body.append(drag.ghost);
    drag.origin.classList.add("drag-origin");
    document.body.classList.add("dragging-card");
    markDropTargets(drag.commands);
  }
  drag.ghost.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) rotate(4deg)`;
  updateDropHover(event.clientX, event.clientY);
}

function finishDrag(event) {
  const drag = state.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const destination = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest("[data-drop-type]");
  const command = destination
    ? commandForDrop(
        drag.commands,
        destination.dataset.dropType,
        Number(destination.dataset.dropIndex),
      )
    : null;
  endDrag();
  if (command) submitCommand(command);
}

function cancelDrag() {
  endDrag();
}

function endDrag() {
  const drag = state.drag;
  if (!drag) return;
  drag.origin.removeEventListener("pointermove", moveDrag);
  drag.origin.classList.remove("drag-origin");
  drag.ghost?.remove();
  document.body.classList.remove("dragging-card");
  document
    .querySelectorAll(".drop-allowed, .drop-hover")
    .forEach((element) => element.classList.remove("drop-allowed", "drop-hover"));
  state.drag = null;
}

function markDropTargets(commands) {
  for (const command of commands) {
    const type = command.type === "playCard" ? "build" : "discard";
    const index =
      command.type === "playCard"
        ? command.destinationIndex
        : command.discardPileIndex;
    document
      .querySelector(`[data-drop-type="${type}"][data-drop-index="${index}"]`)
      ?.classList.add("drop-allowed");
  }
}

function updateDropHover(x, y) {
  document
    .querySelector(".drop-hover")
    ?.classList.remove("drop-hover");
  document
    .elementFromPoint(x, y)
    ?.closest(".drop-allowed")
    ?.classList.add("drop-hover");
}

function commandForDrop(commands, type, index) {
  return (
    commands.find((command) =>
      type === "build"
        ? command.type === "playCard" && command.destinationIndex === index
        : command.type === "discardCard" &&
          command.discardPileIndex === index,
    ) ?? null
  );
}

function renderWinner() {
  const finished = state.view.status === "finished";
  elements.winnerOverlay.hidden = !finished;
  if (!finished) return;
  const viewerWon = state.view.currentPlayerName === state.view.viewerName;
  elements.winnerTitle.textContent = viewerWon
    ? "You won!"
    : `${state.view.currentPlayerName} wins`;
  elements.winnerMessage.textContent = viewerWon
    ? "You cleared your stock pile."
    : `${state.view.currentPlayerName} cleared their stock pile first.`;
  stopLiveUpdates();
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
    throw new Error(
      body?.error?.message ?? body?.error ?? `Request failed with ${response.status}`,
    );
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

async function leaveGame() {
  if (state.view?.status === "waiting") {
    await withBusy(async () => {
      await api(`/api/games/${state.gameId}/players/me`, {
        method: "DELETE",
        headers: authorizedHeaders(true),
        body: JSON.stringify({ expectedRevision: state.view.revision }),
      });
      clearLocalSession();
    });
    return;
  }
  clearLocalSession();
}

function clearLocalSession() {
  stopLiveUpdates();
  sessionStorage.removeItem("skibo-session");
  state.gameId = null;
  state.playerToken = null;
  state.view = null;
  endDrag();
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
    connectLiveUpdates();
  } catch {
    clearLocalSession();
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
