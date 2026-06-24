import { Chess } from "chess.js";

const STOCKFISH_CDN = "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js";

const boardElement = document.getElementById("chessBoard");

const humanModeBtn = document.getElementById("humanModeBtn");
const botModeBtn = document.getElementById("botModeBtn");
const playerColorSelect = document.getElementById("playerColorSelect");
const eloSlider = document.getElementById("eloSlider");
const eloValue = document.getElementById("eloValue");
const resetButton = document.getElementById("resetButton");

const modeText = document.getElementById("modeText");
const turnText = document.getElementById("turnText");
const statusText = document.getElementById("statusText");
const selectedText = document.getElementById("selectedText");
const engineText = document.getElementById("engineText");

const winsText = document.getElementById("winsText");
const drawsText = document.getElementById("drawsText");
const lossesText = document.getElementById("lossesText");

const sharePanel = document.getElementById("sharePanel");
const resultText = document.getElementById("resultText");

const challengesGrid = document.getElementById("challengesGrid");
const challengeStatus = document.getElementById("challengeStatus");

const game = new Chess();

let selectedSquare = null;
let legalTargets = [];
let lastMoveSquares = [];
let wrongMoveSquares = [];

let mode = "human";
let playerColor = "w";
let botColor = "b";
let botElo = 1200;
let isBotThinking = false;
let gameResultRecorded = false;
let latestResultMessage = "";

let stockfish = null;
let engineAvailable = false;
let pendingEngineResolve = null;
let pendingEngineTimeout = null;

let activeChallenge = null;
let challengePly = 0;
let challengeLocked = false;

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

const pieceSymbols = {
  wp: "♙",
  wn: "♘",
  wb: "♗",
  wr: "♖",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  bn: "♞",
  bb: "♝",
  br: "♜",
  bq: "♛",
  bk: "♚",
};

const stats = loadStats();

const challenges = [
  {
    id: "scholars-mate",
    title: "Scholar's Mate",
    type: "Mate in 4",
    side: "White",
    fen: "start",
    description: "A fast queen and bishop battery against the black king.",
    solution: ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"],
  },
  {
    id: "legals-mate",
    title: "Légal Pattern",
    type: "Mate in 3",
    side: "White",
    fen: "rnbqk1nr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5",
    description: "A classical queen sacrifice leading to a knight mate.",
    solution: ["f3e5", "g4d1", "c4f7", "e8e7", "c3d5"],
  },
  {
    id: "blackburne-trap",
    title: "Blackburne Trap",
    type: "Mate in 4",
    side: "Black",
    fen: "r1bqkb1r/pppp1ppp/2n5/4N3/2BnP3/8/PPPP1PPP/RNBQK2R b KQkq - 0 4",
    description: "A sharp trap with queen activity and a final knight mate.",
    solution: ["d8g5", "e5f7", "g5g2", "h1f1", "g2e4", "c4e2", "d4f3"],
  },
  {
    id: "extended-fools",
    title: "Extended Fool's Net",
    type: "Mate in 3",
    side: "Black",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
    description: "A dark-square queen strike after severe kingside weaknesses.",
    solution: ["f7f5", "f2f3", "e7e6", "g2g4", "d8h4"],
  },
  {
    id: "queen-bishop-battery",
    title: "Queen Bishop Battery",
    type: "Mate in 4",
    side: "White",
    fen: "start",
    description: "A reversed move-order queen and bishop attack on f7.",
    solution: ["e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7"],
  },
];

/* =========================
   Initialization
========================= */

createStockfishWorker();
renderChallenges();
renderBoard();
updateStats();
configureEngine();

/* =========================
   Board Rendering
========================= */

function renderBoard() {
  boardElement.innerHTML = "";

  for (let rank = 8; rank >= 1; rank--) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex++) {
      const file = files[fileIndex];
      const squareName = `${file}${rank}`;
      const squareColor = (rank + fileIndex) % 2 === 0 ? "dark" : "light";

      const square = document.createElement("button");
      square.type = "button";
      square.className = `square ${squareColor}`;
      square.dataset.square = squareName;
      square.setAttribute("aria-label", `Square ${squareName}`);

      if (selectedSquare === squareName) {
        square.classList.add("selected");
      }

      if (legalTargets.some((move) => move.to === squareName)) {
        square.classList.add("legal");

        if (game.get(squareName)) {
          square.classList.add("capture");
        }
      }

      if (lastMoveSquares.includes(squareName)) {
        square.classList.add("last-move");
      }

      if (wrongMoveSquares.includes(squareName)) {
        square.classList.add("wrong");
      }

      if (isKingInCheckOnSquare(squareName)) {
        square.classList.add("check");
      }

      const piece = game.get(squareName);

      if (piece) {
        const pieceElement = document.createElement("span");
        pieceElement.className = `piece ${piece.color === "w" ? "white" : "black"}`;
        pieceElement.textContent = pieceSymbols[`${piece.color}${piece.type}`];
        square.appendChild(pieceElement);
      }

      if (file === "a" || rank === 1) {
        const coordinate = document.createElement("span");
        coordinate.className = "square-coordinate";
        coordinate.textContent = file === "a" ? rank : file;
        square.appendChild(coordinate);
      }

      square.addEventListener("click", () => handleSquareClick(squareName));

      boardElement.appendChild(square);
    }
  }

  updatePanel();
}

/* =========================
   Interaction
========================= */

function handleSquareClick(squareName) {
  if (game.isGameOver() || isBotThinking || challengeLocked) return;

  if (mode === "bot" && game.turn() === botColor) return;

  const clickedPiece = game.get(squareName);
  const currentTurn = game.turn();

  if (!selectedSquare) {
    if (!clickedPiece || clickedPiece.color !== currentTurn) return;

    selectSquare(squareName);
    return;
  }

  if (selectedSquare === squareName) {
    clearSelection();
    renderBoard();
    return;
  }

  if (clickedPiece && clickedPiece.color === currentTurn) {
    selectSquare(squareName);
    return;
  }

  if (mode === "challenge") {
    tryChallengeMove(selectedSquare, squareName);
    return;
  }

  tryMove(selectedSquare, squareName);
}

function selectSquare(squareName) {
  selectedSquare = squareName;
  legalTargets = game.moves({
    square: squareName,
    verbose: true,
  });

  renderBoard();
}

function clearSelection() {
  selectedSquare = null;
  legalTargets = [];
}

function tryMove(from, to) {
  const move = game.move({
    from,
    to,
    promotion: "q",
  });

  if (!move) {
    clearSelection();
    renderBoard();
    return;
  }

  lastMoveSquares = [move.from, move.to];
  wrongMoveSquares = [];

  clearSelection();
  renderBoard();
  handleGameEnd();

  if (mode === "bot" && !game.isGameOver() && game.turn() === botColor) {
    makeBotMove();
  }
}

/* =========================
   Bot / Stockfish
========================= */

function createStockfishWorker() {
  try {
    const workerSource = `importScripts("${STOCKFISH_CDN}");`;
    const blob = new Blob([workerSource], { type: "application/javascript" });
    const workerUrl = URL.createObjectURL(blob);

    stockfish = new Worker(workerUrl);

    stockfish.onmessage = (event) => handleEngineMessage(String(event.data));
    stockfish.onerror = () => {
      engineAvailable = false;
      engineText.textContent = "Fallback";
    };

    stockfish.postMessage("uci");
    stockfish.postMessage("isready");
  } catch (error) {
    engineAvailable = false;
    engineText.textContent = "Fallback";
  }
}

function handleEngineMessage(message) {
  if (message === "uciok" || message === "readyok") {
    engineAvailable = true;
    engineText.textContent = "Stockfish";
  }

  if (message.startsWith("bestmove")) {
    const bestMove = message.split(" ")[1];

    if (pendingEngineTimeout) {
      clearTimeout(pendingEngineTimeout);
    }

    if (pendingEngineResolve) {
      pendingEngineResolve(bestMove);
      pendingEngineResolve = null;
    }
  }
}

function configureEngine() {
  if (!stockfish) return;

  const skillLevel = Math.round(((botElo - 200) / 2300) * 20);
  const clampedElo = Math.max(1350, Math.min(botElo, 2500));

  stockfish.postMessage("ucinewgame");
  stockfish.postMessage(`setoption name Skill Level value ${skillLevel}`);
  stockfish.postMessage("setoption name UCI_LimitStrength value true");
  stockfish.postMessage(`setoption name UCI_Elo value ${clampedElo}`);
  stockfish.postMessage("isready");
}

function requestBestMove(fen) {
  return new Promise((resolve) => {
    if (!stockfish || !engineAvailable) {
      resolve(getFallbackMove());
      return;
    }

    pendingEngineResolve = resolve;

    const moveTime = Math.round(120 + ((botElo - 200) / 2300) * 1300);

    stockfish.postMessage(`position fen ${fen}`);
    stockfish.postMessage(`go movetime ${moveTime}`);

    pendingEngineTimeout = setTimeout(() => {
      pendingEngineResolve = null;
      resolve(getFallbackMove());
    }, moveTime + 1800);
  });
}

async function makeBotMove() {
  isBotThinking = true;
  statusText.textContent = "Bot thinking...";

  await sleep(300);

  const bestMove = await requestBestMove(game.fen());

  if (bestMove && bestMove !== "(none)") {
    const move = game.move(parseUciMove(bestMove));

    if (move) {
      lastMoveSquares = [move.from, move.to];
    }
  } else {
    makeFallbackMove();
  }

  isBotThinking = false;
  renderBoard();
  handleGameEnd();
}

function getFallbackMove() {
  const moves = game.moves({ verbose: true });

  if (!moves.length) return null;

  const randomMove = moves[Math.floor(Math.random() * moves.length)];

  return `${randomMove.from}${randomMove.to}${randomMove.promotion || ""}`;
}

function makeFallbackMove() {
  const fallbackMove = getFallbackMove();

  if (!fallbackMove) return;

  const move = game.move(parseUciMove(fallbackMove));

  if (move) {
    lastMoveSquares = [move.from, move.to];
  }
}

function parseUciMove(uci) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4] || "q",
  };
}

/* =========================
   Game State
========================= */

function updatePanel() {
  modeText.textContent =
    mode === "human"
      ? "Human vs Human"
      : mode === "bot"
        ? `Bot Match (${botElo} ELO)`
        : "Challenge";

  turnText.textContent = game.turn() === "w" ? "White" : "Black";
  selectedText.textContent = selectedSquare ? selectedSquare.toUpperCase() : "None";

  if (challengeLocked) {
    statusText.textContent = "Wrong challenge move";
    return;
  }

  if (game.isCheckmate()) {
    statusText.textContent = `Checkmate — ${game.turn() === "w" ? "Black" : "White"} wins`;
    return;
  }

  if (game.isDraw()) {
    statusText.textContent = "Draw";
    return;
  }

  if (game.isStalemate()) {
    statusText.textContent = "Stalemate";
    return;
  }

  if (game.isThreefoldRepetition()) {
    statusText.textContent = "Draw by repetition";
    return;
  }

  if (game.isInsufficientMaterial()) {
    statusText.textContent = "Draw by insufficient material";
    return;
  }

  if (game.isCheck()) {
    statusText.textContent = "Check";
    return;
  }

  statusText.textContent = isBotThinking ? "Bot thinking..." : "In progress";
}

function handleGameEnd() {
  if (!game.isGameOver()) return;

  if (mode === "bot" && !gameResultRecorded) {
    recordBotResult();
  }

  latestResultMessage = buildResultMessage();
  resultText.textContent = latestResultMessage;
  sharePanel.classList.remove("hidden");
}

function recordBotResult() {
  gameResultRecorded = true;

  if (game.isDraw()) {
    stats.draws += 1;
  } else if (game.isCheckmate()) {
    const winner = game.turn() === "w" ? "b" : "w";

    if (winner === playerColor) {
      stats.wins += 1;
    } else {
      stats.losses += 1;
    }
  }

  saveStats();
  updateStats();
}

function buildResultMessage() {
  if (mode === "challenge") {
    return activeChallenge
      ? `I completed the "${activeChallenge.title}" chess challenge on Dark Chess Arena.`
      : "I completed a chess challenge on Dark Chess Arena.";
  }

  if (game.isCheckmate()) {
    const winner = game.turn() === "w" ? "Black" : "White";
    return `Checkmate! ${winner} won a game on Dark Chess Arena.`;
  }

  if (game.isDraw()) {
    return "The game ended in a draw on Dark Chess Arena.";
  }

  return "I finished a chess game on Dark Chess Arena.";
}

function isKingInCheckOnSquare(squareName) {
  if (!game.isCheck()) return false;

  const piece = game.get(squareName);

  return piece && piece.type === "k" && piece.color === game.turn();
}

/* =========================
   Challenges
========================= */

function renderChallenges() {
  challengesGrid.innerHTML = "";

  challenges.forEach((challenge) => {
    const card = document.createElement("article");
    card.className = "challenge-card";

    card.innerHTML = `
      <h3>${challenge.title}</h3>

      <div class="challenge-meta">
        <span>${challenge.type}</span>
        <span>${challenge.side}</span>
      </div>

      <p>${challenge.description}</p>

      <button type="button" data-challenge="${challenge.id}">
        Load Challenge
      </button>
    `;

    challengesGrid.appendChild(card);
  });
}

function loadChallenge(challengeId) {
  const challenge = challenges.find((item) => item.id === challengeId);

  if (!challenge) return;

  activeChallenge = challenge;
  challengePly = 0;
  challengeLocked = false;
  wrongMoveSquares = [];
  lastMoveSquares = [];
  clearSelection();

  mode = "challenge";
  setModeButtons();

  if (challenge.fen === "start") {
    game.reset();
  } else {
    game.load(challenge.fen);
  }

  sharePanel.classList.add("hidden");

  challengeStatus.className = "challenge-status";
  challengeStatus.textContent = `${challenge.title} loaded. Play as ${challenge.side}. Find the exact line.`;

  renderBoard();
}

function tryChallengeMove(from, to) {
  if (!activeChallenge || challengeLocked) return;

  const expectedMove = activeChallenge.solution[challengePly];
  const attemptedMove = `${from}${to}`;

  if (!expectedMove || !expectedMove.startsWith(attemptedMove)) {
    markWrongChallengeMove(from, to);
    return;
  }

  const move = game.move(parseUciMove(expectedMove));

  if (!move) {
    markWrongChallengeMove(from, to);
    return;
  }

  challengePly += 1;
  lastMoveSquares = [move.from, move.to];
  wrongMoveSquares = [];
  clearSelection();
  renderBoard();

  if (challengePly >= activeChallenge.solution.length) {
    completeChallenge();
    return;
  }

  setTimeout(playChallengeReply, 450);
}

function playChallengeReply() {
  if (!activeChallenge || challengeLocked) return;

  const reply = activeChallenge.solution[challengePly];

  if (!reply) return;

  const move = game.move(parseUciMove(reply));

  if (move) {
    challengePly += 1;
    lastMoveSquares = [move.from, move.to];
  }

  renderBoard();

  if (challengePly >= activeChallenge.solution.length) {
    completeChallenge();
  }
}

function markWrongChallengeMove(from, to) {
  challengeLocked = true;
  wrongMoveSquares = [from, to];
  clearSelection();

  challengeStatus.className = "challenge-status error";
  challengeStatus.textContent = "Wrong move. Reset the challenge and start from zero.";

  renderBoard();
}

function completeChallenge() {
  challengeStatus.className = "challenge-status success";
  challengeStatus.textContent = `Solved: ${activeChallenge.title}. Excellent tactical line.`;

  latestResultMessage = `I solved the "${activeChallenge.title}" chess challenge on Dark Chess Arena.`;
  resultText.textContent = latestResultMessage;
  sharePanel.classList.remove("hidden");

  renderBoard();
}

/* =========================
   Stats
========================= */

function loadStats() {
  const savedStats = localStorage.getItem("darkChessStats");

  if (!savedStats) {
    return {
      wins: 0,
      draws: 0,
      losses: 0,
    };
  }

  return JSON.parse(savedStats);
}

function saveStats() {
  localStorage.setItem("darkChessStats", JSON.stringify(stats));
}

function updateStats() {
  winsText.textContent = stats.wins;
  drawsText.textContent = stats.draws;
  lossesText.textContent = stats.losses;
}

/* =========================
   Controls
========================= */

function setMode(newMode) {
  mode = newMode;
  setModeButtons();
  resetGame();
}

function setModeButtons() {
  humanModeBtn.classList.toggle("active", mode === "human");
  botModeBtn.classList.toggle("active", mode === "bot");
}

function resetGame() {
  game.reset();

  selectedSquare = null;
  legalTargets = [];
  lastMoveSquares = [];
  wrongMoveSquares = [];

  activeChallenge = null;
  challengePly = 0;
  challengeLocked = false;

  gameResultRecorded = false;
  latestResultMessage = "";
  sharePanel.classList.add("hidden");

  playerColor = playerColorSelect.value;
  botColor = playerColor === "w" ? "b" : "w";

  challengeStatus.className = "challenge-status";
  challengeStatus.textContent = "Select a challenge to begin.";

  configureEngine();
  renderBoard();

  if (mode === "bot" && botColor === "w") {
    makeBotMove();
  }
}

humanModeBtn.addEventListener("click", () => setMode("human"));
botModeBtn.addEventListener("click", () => setMode("bot"));

playerColorSelect.addEventListener("change", () => {
  if (mode === "bot") {
    resetGame();
  }
});

eloSlider.addEventListener("input", () => {
  botElo = Number(eloSlider.value);
  eloValue.textContent = botElo;
  configureEngine();
  updatePanel();
});

resetButton.addEventListener("click", resetGame);

challengesGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-challenge]");

  if (!button) return;

  loadChallenge(button.dataset.challenge);
});

/* =========================
   Social Sharing
========================= */

document.querySelectorAll("[data-share]").forEach((button) => {
  button.addEventListener("click", () => shareResult(button.dataset.share));
});

async function shareResult(platform) {
  const pageUrl = window.location.href;
  const text = latestResultMessage || "I played a chess game on Dark Chess Arena.";

  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(pageUrl);

  const urls = {
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedText}`,
    x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
  };

  if (platform === "instagram") {
    if (navigator.share) {
      await navigator.share({
        title: "Dark Chess Arena",
        text,
        url: pageUrl,
      });
      return;
    }

    await navigator.clipboard.writeText(`${text} ${pageUrl}`);
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
    return;
  }

  window.open(urls[platform], "_blank", "noopener,noreferrer");
}

/* =========================
   Utilities
========================= */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}