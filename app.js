import { Chess } from "chess.js";

const boardElement = document.getElementById("chessBoard");
const turnText = document.getElementById("turnText");
const statusText = document.getElementById("statusText");
const selectedText = document.getElementById("selectedText");
const resetButton = document.getElementById("resetButton");

const game = new Chess();

let selectedSquare = null;
let legalTargets = [];
let lastMoveSquares = [];

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

function handleSquareClick(squareName) {
  if (game.isGameOver()) return;

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

  clearSelection();
  renderBoard();
}

function updatePanel() {
  turnText.textContent = game.turn() === "w" ? "White" : "Black";
  selectedText.textContent = selectedSquare ? selectedSquare.toUpperCase() : "None";

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

  statusText.textContent = "In progress";
}

function isKingInCheckOnSquare(squareName) {
  if (!game.isCheck()) return false;

  const piece = game.get(squareName);

  return piece && piece.type === "k" && piece.color === game.turn();
}

function resetGame() {
  game.reset();
  selectedSquare = null;
  legalTargets = [];
  lastMoveSquares = [];
  renderBoard();
}

resetButton.addEventListener("click", resetGame);

renderBoard();