"use strict";

// Peças e convenções compartilhadas pelas regras e pela interface.
const symbols = {
  white: { king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙" },
  black: { king: "♚", queen: "♛", rook: "♜", bishop: "♝", knight: "♞", pawn: "♟" }
};
const pieceNames = { king: "rei", queen: "dama", rook: "torre", bishop: "bispo", knight: "cavalo", pawn: "peão" };
const files = "abcdefgh";
const promotionTypes = ["queen", "rook", "bishop", "knight"];

// Referências aos elementos atualizados durante a partida.
const boardElement = document.querySelector("#board");
const rankLabels = document.querySelector("#rank-labels");
const fileLabels = document.querySelector("#file-labels");
const statusLabel = document.querySelector("#status-label");
const statusMessage = document.querySelector("#status-message");
const statusIcon = document.querySelector("#status-icon");
const moveList = document.querySelector("#move-list");
const moveCount = document.querySelector("#move-count");
const undoButton = document.querySelector("#undo-button");
const restartButton = document.querySelector("#restart-button");
const promotionDialog = document.querySelector("#promotion-dialog");
const promotionChoices = document.querySelector("#promotion-choices");
const gameAlert = document.querySelector("#game-alert");
const modeSelect = document.querySelector("#mode-select");
const difficultySelect = document.querySelector("#difficulty-select");
const difficultyField = document.querySelector("#difficulty-field");
const statsNotice = document.querySelector("#stats-notice");

const statsStorageKey = "chess-game-stats-v1";
const pieceValues = { pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 20000 };

// Estatísticas independentes para partidas locais e partidas contra a IA.
const emptyStats = () => ({
  local: { whiteWins: 0, blackWins: 0, draws: 0, resignations: 0 },
  ai: { wins: 0, losses: 0, draws: 0, resignations: 0 }
});

let state;
let aiThinking = false;
let aiTimerId = null;
let gameAlertTimerId = null;
let stats = emptyStats();

// Mostra avisos temporários, como o resultado de uma desistência.
function showGameAlert(message) {
  if (gameAlertTimerId !== null) window.clearTimeout(gameAlertTimerId);
  gameAlert.textContent = message;
  gameAlert.hidden = false;
  requestAnimationFrame(() => gameAlert.classList.add("visible"));
  gameAlertTimerId = window.setTimeout(() => {
    gameAlert.classList.remove("visible");
    gameAlertTimerId = window.setTimeout(() => {
      gameAlert.hidden = true;
      gameAlertTimerId = null;
    }, 220);
  }, 3600);
}

function hideGameAlert() {
  if (gameAlertTimerId !== null) {
    window.clearTimeout(gameAlertTimerId);
    gameAlertTimerId = null;
  }
  gameAlert.classList.remove("visible");
  gameAlert.hidden = true;
}

// Criação e cópia dos dados da partida.
function createPiece(type, color) {
  return { type, color, moved: false };
}

function createInitialBoard() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const backRank = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

  for (let col = 0; col < 8; col += 1) {
    board[0][col] = createPiece(backRank[col], "black");
    board[1][col] = createPiece("pawn", "black");
    board[6][col] = createPiece("pawn", "white");
    board[7][col] = createPiece(backRank[col], "white");
  }
  return board;
}

function cloneBoard(board) {
  return board.map(row => row.map(piece => piece ? { ...piece } : null));
}

function cloneState(current) {
  return {
    board: cloneBoard(current.board),
    turn: current.turn,
    enPassant: current.enPassant ? { ...current.enPassant } : null,
    moves: current.moves.map(move => ({ ...move })),
    snapshots: current.snapshots.slice()
  };
}

function coordinate(row, col) {
  return `${files[col]}${8 - row}`;
}

function inside(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

// Regras do tabuleiro: ataques, xeque, material e movimentos legais.
function findKing(board, color) {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (piece && piece.type === "king" && piece.color === color) return { row, col };
    }
  }
  return null;
}

function isSquareAttacked(board, row, col, byColor) {
  const pawnRow = row + (byColor === "white" ? 1 : -1);
  for (const pawnCol of [col - 1, col + 1]) {
    if (inside(pawnRow, pawnCol)) {
      const piece = board[pawnRow][pawnCol];
      if (piece && piece.color === byColor && piece.type === "pawn") return true;
    }
  }

  const knightOffsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  for (const [rowOffset, colOffset] of knightOffsets) {
    const targetRow = row + rowOffset;
    const targetCol = col + colOffset;
    if (!inside(targetRow, targetCol)) continue;
    const piece = board[targetRow][targetCol];
    if (piece && piece.color === byColor && piece.type === "knight") return true;
  }

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue;
      const targetRow = row + rowOffset;
      const targetCol = col + colOffset;
      if (!inside(targetRow, targetCol)) continue;
      const piece = board[targetRow][targetCol];
      if (piece && piece.color === byColor && piece.type === "king") return true;
    }
  }

  const directions = [
    [-1, 0, ["rook", "queen"]], [1, 0, ["rook", "queen"]],
    [0, -1, ["rook", "queen"]], [0, 1, ["rook", "queen"]],
    [-1, -1, ["bishop", "queen"]], [-1, 1, ["bishop", "queen"]],
    [1, -1, ["bishop", "queen"]], [1, 1, ["bishop", "queen"]]
  ];
  for (const [rowStep, colStep, attackers] of directions) {
    let targetRow = row + rowStep;
    let targetCol = col + colStep;
    let distance = 1;
    while (inside(targetRow, targetCol)) {
      const piece = board[targetRow][targetCol];
      if (piece) {
        if (piece.color === byColor && attackers.includes(piece.type)) return true;
        if (distance === 1 && piece.color === byColor && piece.type === "king") return true;
        break;
      }
      targetRow += rowStep;
      targetCol += colStep;
      distance += 1;
    }
  }
  return false;
}

function isInCheck(board, color) {
  const king = findKing(board, color);
  return king ? isSquareAttacked(board, king.row, king.col, color === "white" ? "black" : "white") : false;
}

function isInsufficientMaterial(board) {
  const minorPieces = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (!piece || piece.type === "king") continue;
      if (piece.type === "pawn" || piece.type === "rook" || piece.type === "queen") return false;
      minorPieces.push({ ...piece, squareColor: (row + col) % 2 });
    }
  }

  if (minorPieces.length <= 1) return true;
  if (minorPieces.every(piece => piece.type === "bishop")) {
    return minorPieces.every(piece => piece.squareColor === minorPieces[0].squareColor);
  }
  return minorPieces.length === 2
    && minorPieces.every(piece => piece.type === "knight")
    && minorPieces[0].color === minorPieces[1].color;
}

function addMove(moves, board, fromRow, fromCol, toRow, toCol, extra = {}) {
  if (!inside(toRow, toCol)) return;
  const target = board[toRow][toCol];
  const piece = board[fromRow][fromCol];
  if (target && (target.color === piece.color || target.type === "king")) return;
  moves.push({ fromRow, fromCol, toRow, toCol, ...extra });
}

function getPseudoMoves(board, row, col, enPassant) {
  const piece = board[row][col];
  const moves = [];
  if (!piece) return moves;

  if (piece.type === "pawn") {
    const direction = piece.color === "white" ? -1 : 1;
    const startRow = piece.color === "white" ? 6 : 1;
    const nextRow = row + direction;
    if (inside(nextRow, col) && !board[nextRow][col]) {
      addMove(moves, board, row, col, nextRow, col);
      const doubleRow = row + direction * 2;
      if (row === startRow && !board[doubleRow][col]) {
        addMove(moves, board, row, col, doubleRow, col);
      }
    }
    for (const targetCol of [col - 1, col + 1]) {
      if (!inside(nextRow, targetCol)) continue;
      const target = board[nextRow][targetCol];
      if (target && target.color !== piece.color && target.type !== "king") {
        addMove(moves, board, row, col, nextRow, targetCol);
      } else if (enPassant && enPassant.row === nextRow && enPassant.col === targetCol) {
        moves.push({ fromRow: row, fromCol: col, toRow: nextRow, toCol: targetCol, enPassant: true });
      }
    }
    return moves;
  }

  if (piece.type === "knight") {
    for (const [rowOffset, colOffset] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
      addMove(moves, board, row, col, row + rowOffset, col + colOffset);
    }
    return moves;
  }

  if (piece.type === "king") {
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
        if (rowOffset !== 0 || colOffset !== 0) {
          addMove(moves, board, row, col, row + rowOffset, col + colOffset);
        }
      }
    }
    if (!piece.moved && !isSquareAttacked(board, row, col, piece.color === "white" ? "black" : "white")) {
      for (const side of ["king", "queen"]) {
        const rookCol = side === "king" ? 7 : 0;
        const rook = board[row][rookCol];
        const between = side === "king" ? [5, 6] : [1, 2, 3];
        const transit = side === "king" ? [5, 6] : [3, 2];
        const enemy = piece.color === "white" ? "black" : "white";
        if (!rook || rook.type !== "rook" || rook.color !== piece.color || rook.moved) continue;
        if (between.some(file => board[row][file])) continue;
        if (transit.some(file => isSquareAttacked(board, row, file, enemy))) continue;
        moves.push({ fromRow: row, fromCol: col, toRow: row, toCol: side === "king" ? 6 : 2, castle: side });
      }
    }
    return moves;
  }

  const directions = [];
  if (piece.type === "rook" || piece.type === "queen") {
    directions.push([-1, 0], [1, 0], [0, -1], [0, 1]);
  }
  if (piece.type === "bishop" || piece.type === "queen") {
    directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
  }
  for (const [rowStep, colStep] of directions) {
    let targetRow = row + rowStep;
    let targetCol = col + colStep;
    while (inside(targetRow, targetCol)) {
      const target = board[targetRow][targetCol];
      if (!target) {
        addMove(moves, board, row, col, targetRow, targetCol);
      } else {
        addMove(moves, board, row, col, targetRow, targetCol);
        break;
      }
      targetRow += rowStep;
      targetCol += colStep;
    }
  }
  return moves;
}

// Aplica lances ao tabuleiro e mantém os estados especiais do xadrez.
function applyMove(board, move, promotion = "queen") {
  const piece = board[move.fromRow][move.fromCol];
  const captured = move.enPassant
    ? board[move.fromRow][move.toCol]
    : board[move.toRow][move.toCol];
  board[move.fromRow][move.fromCol] = null;
  if (move.enPassant) board[move.fromRow][move.toCol] = null;
  board[move.toRow][move.toCol] = { ...piece, moved: true };

  if (move.castle) {
    const rookFrom = move.castle === "king" ? 7 : 0;
    const rookTo = move.castle === "king" ? 5 : 3;
    board[move.toRow][rookTo] = { ...board[move.toRow][rookFrom], moved: true };
    board[move.toRow][rookFrom] = null;
  }
  if (piece.type === "pawn" && (move.toRow === 0 || move.toRow === 7)) {
    board[move.toRow][move.toCol].type = promotion;
  }
  return { piece, captured };
}

function getLegalMoves(board, row, col, enPassant) {
  const piece = board[row][col];
  if (!piece) return [];
  return getPseudoMoves(board, row, col, enPassant).filter(move => {
    const simulated = cloneBoard(board);
    applyMove(simulated, move);
    return !isInCheck(simulated, piece.color);
  });
}

function allLegalMoves(board, color, enPassant) {
  const moves = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (piece && piece.color === color) {
        moves.push(...getLegalMoves(board, row, col, enPassant));
      }
    }
  }
  return moves;
}

// Avaliação material/posicional e busca minimax com poda alfa-beta para a IA.
function nextEnPassant(piece, move) {
  return piece.type === "pawn" && Math.abs(move.toRow - move.fromRow) === 2
    ? { row: (move.toRow + move.fromRow) / 2, col: move.fromCol }
    : null;
}

function orderMoves(board, moves) {
  return moves.sort((first, second) => movePriority(board, second) - movePriority(board, first));
}

function movePriority(board, move) {
  const movingPiece = board[move.fromRow][move.fromCol];
  const capturedPiece = move.enPassant
    ? board[move.fromRow][move.toCol]
    : board[move.toRow][move.toCol];
  const captureScore = capturedPiece ? pieceValues[capturedPiece.type] * 10 - pieceValues[movingPiece.type] : 0;
  const promotionScore = movingPiece.type === "pawn" && (move.toRow === 0 || move.toRow === 7)
    ? pieceValues.queen - pieceValues.pawn
    : 0;
  return captureScore + promotionScore;
}

function evaluateBoard(board) {
  let score = 0;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (!piece) continue;
      const center = 7 - Math.abs(3.5 - row) - Math.abs(3.5 - col);
      let positional = 0;
      if (piece.type === "pawn") {
        positional = (piece.color === "white" ? 6 - row : row - 1) * 7 + center * 2;
      } else if (piece.type === "knight") {
        positional = center * 9;
      } else if (piece.type === "bishop") {
        positional = center * 4;
      } else if (piece.type === "queen") {
        positional = center * 2;
      }
      score += (piece.color === "white" ? 1 : -1) * (pieceValues[piece.type] + positional);
    }
  }
  return score;
}

function minimax(board, turn, depth, alpha, beta, enPassant, ply) {
  if (isInsufficientMaterial(board)) return 0;
  const moves = orderMoves(board, allLegalMoves(board, turn, enPassant));
  if (moves.length === 0) {
    if (!isInCheck(board, turn)) return 0;
    return turn === "white" ? -100000 + ply : 100000 - ply;
  }
  if (depth === 0) return evaluateBoard(board);

  const maximizing = turn === "white";
  let bestScore = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    const piece = board[move.fromRow][move.fromCol];
    const nextBoard = cloneBoard(board);
    applyMove(nextBoard, move);
    const score = minimax(
      nextBoard,
      maximizing ? "black" : "white",
      depth - 1,
      alpha,
      beta,
      nextEnPassant(piece, move),
      ply + 1
    );
    bestScore = maximizing ? Math.max(bestScore, score) : Math.min(bestScore, score);
    if (maximizing) alpha = Math.max(alpha, bestScore);
    else beta = Math.min(beta, bestScore);
    if (beta <= alpha) break;
  }
  return bestScore;
}

function chooseAiMove() {
  const moves = allLegalMoves(state.board, "black", state.enPassant);
  if (moves.length === 0) return null;
  if (state.difficulty === "easy") {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const depth = state.difficulty === "hard" ? 3 : 2;
  let bestScore = Infinity;
  let bestMoves = [];
  let beta = Infinity;
  for (const move of orderMoves(state.board, moves)) {
    const piece = state.board[move.fromRow][move.fromCol];
    const nextBoard = cloneBoard(state.board);
    applyMove(nextBoard, move);
    const score = minimax(nextBoard, "white", depth - 1, -Infinity, beta, nextEnPassant(piece, move), 1);
    if (score < bestScore) {
      bestScore = score;
      bestMoves = [move];
      beta = bestScore;
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

// Renderização do tabuleiro, do histórico e dos indicadores da interface.
function renderLabels() {
  rankLabels.replaceChildren();
  fileLabels.replaceChildren();
  for (let row = 8; row >= 1; row -= 1) {
    const label = document.createElement("span");
    label.textContent = String(row);
    rankLabels.append(label);
  }
  for (const file of files) {
    const label = document.createElement("span");
    label.textContent = file;
    fileLabels.append(label);
  }
}

function renderBoard() {
  boardElement.replaceChildren();
  const checkKing = isInCheck(state.board, state.turn) ? findKing(state.board, state.turn) : null;
  const legalMoves = state.selected
    ? getLegalMoves(state.board, state.selected.row, state.selected.col, state.enPassant)
    : [];

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      const square = document.createElement("button");
      square.type = "button";
      square.className = `square ${(row + col) % 2 === 0 ? "light" : "dark"}`;
      square.setAttribute("role", "gridcell");
      square.setAttribute("aria-label", `${coordinate(row, col)}${piece ? `, ${pieceNames[piece.type]} ${piece.color === "white" ? "brancas" : "pretas"}` : ""}`);
      square.dataset.row = String(row);
      square.dataset.col = String(col);

      if (state.selected && state.selected.row === row && state.selected.col === col) square.classList.add("selected");
      if (state.lastMove && (
        (state.lastMove.fromRow === row && state.lastMove.fromCol === col) ||
        (state.lastMove.toRow === row && state.lastMove.toCol === col)
      )) square.classList.add("last-move");
      if (legalMoves.some(move => move.toRow === row && move.toCol === col)) {
        square.classList.add("legal");
        if (piece || legalMoves.some(move => move.toRow === row && move.toCol === col && move.enPassant)) square.classList.add("has-piece");
      }
      if (checkKing && checkKing.row === row && checkKing.col === col) square.classList.add("in-check");
      if (piece) {
        const pieceElement = document.createElement("span");
        pieceElement.className = `piece ${piece.color === "white" ? "white-piece" : "black-piece"}`;
        pieceElement.textContent = symbols[piece.color][piece.type];
        pieceElement.setAttribute("aria-hidden", "true");
        square.append(pieceElement);
      }
      square.addEventListener("click", () => handleSquareClick(row, col));
      boardElement.append(square);
    }
  }
}

// Persistência local e apresentação dos resultados das partidas.
function isValidStats(value) {
  if (!value || !value.local || !value.ai) return false;
  const requiredCounters = [
    value.local.whiteWins, value.local.blackWins, value.local.draws,
    value.ai.wins, value.ai.losses, value.ai.draws
  ];
  const resignationCounters = [value.local.resignations, value.ai.resignations];
  return requiredCounters.every(count => Number.isSafeInteger(count) && count >= 0)
    && resignationCounters.every(count => count === undefined || (Number.isSafeInteger(count) && count >= 0));
}

function loadStats() {
  try {
    const saved = localStorage.getItem(statsStorageKey);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    if (!isValidStats(parsed)) {
      statsNotice.textContent = "O resumo salvo está inválido; as partidas desta sessão ainda serão contabilizadas.";
      return;
    }
    stats = {
      local: { ...parsed.local, resignations: parsed.local.resignations || 0 },
      ai: { ...parsed.ai, resignations: parsed.ai.resignations || 0 }
    };
  } catch {
    statsNotice.textContent = "Não foi possível carregar o resumo salvo neste navegador.";
  }
}

function saveStats() {
  try {
    localStorage.setItem(statsStorageKey, JSON.stringify(stats));
    statsNotice.textContent = "";
  } catch {
    statsNotice.textContent = "Não foi possível salvar o resumo neste navegador.";
  }
}

function renderStats() {
  const aiMode = state ? state.mode === "ai" : modeSelect.value === "ai";
  document.querySelector("#stat-wins-label").textContent = aiMode ? "Suas vitórias" : "Vitórias brancas";
  document.querySelector("#stat-losses-label").textContent = aiMode ? "Derrotas" : "Vitórias pretas";
  document.querySelector("#stat-wins").textContent = String(aiMode ? stats.ai.wins : stats.local.whiteWins);
  document.querySelector("#stat-losses").textContent = String(aiMode ? stats.ai.losses : stats.local.blackWins);
  document.querySelector("#stat-draws").textContent = String(aiMode ? stats.ai.draws : stats.local.draws);
  document.querySelector("#stat-resignations").textContent = String(aiMode ? stats.ai.resignations : stats.local.resignations);
}

function recordGameResult(winner) {
  if (state.mode === "ai") {
    if (!winner) stats.ai.draws += 1;
    else if (winner === "white") stats.ai.wins += 1;
    else stats.ai.losses += 1;
  } else if (!winner) {
    stats.local.draws += 1;
  } else if (winner === "white") {
    stats.local.whiteWins += 1;
  } else {
    stats.local.blackWins += 1;
  }
  saveStats();
  renderStats();
}

function recordResignation() {
  if (!state || state.finished || state.moves.length === 0) return null;
  const resignedColor = state.mode === "ai" ? "white" : state.turn;
  const winner = resignedColor === "white" ? "black" : "white";

  if (state.mode === "ai") {
    stats.ai.losses += 1;
    stats.ai.resignations += 1;
  } else {
    if (winner === "white") stats.local.whiteWins += 1;
    else stats.local.blackWins += 1;
    stats.local.resignations += 1;
  }

  state.finished = true;
  saveStats();
  return state.mode === "ai"
    ? "Desistência registrada. A IA venceu esta partida."
    : `Desistência registrada. ${winner === "white" ? "Brancas" : "Pretas"} vencem esta partida.`;
}

function renderPlayers() {
  const aiMode = state.mode === "ai";
  document.querySelector("#black-player-name").textContent = aiMode ? "IA" : "Pretas";
  document.querySelector("#black-player-caption").textContent = aiMode
    ? `NÍVEL ${state.difficulty === "easy" ? "FÁCIL" : state.difficulty === "medium" ? "MÉDIO" : "DIFÍCIL"}`
    : "JOGADOR 2";
  document.querySelector("#white-player-name").textContent = aiMode ? "Você" : "Brancas";
  document.querySelector("#white-player-caption").textContent = aiMode ? "JOGADOR" : "JOGADOR 1";
}

function renderMoves() {
  moveList.replaceChildren();
  if (state.moves.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-moves";
    empty.textContent = "A partida está pronta para começar.";
    moveList.append(empty);
  } else {
    for (let index = 0; index < state.moves.length; index += 2) {
      const item = document.createElement("li");
      const number = document.createElement("span");
      number.className = "move-number";
      number.textContent = `${Math.floor(index / 2) + 1}.`;
      const whiteMove = document.createElement("span");
      whiteMove.textContent = state.moves[index].notation;
      item.append(number, whiteMove);
      if (state.moves[index + 1]) {
        const blackMove = document.createElement("span");
        blackMove.textContent = state.moves[index + 1].notation;
        item.append(blackMove);
      }
      moveList.append(item);
    }
  }
  moveCount.textContent = `${Math.ceil(state.moves.length / 2)} ${Math.ceil(state.moves.length / 2) === 1 ? "lance" : "lances"}`;
  undoButton.disabled = state.snapshots.length === 0 || aiThinking || state.finished;
  moveList.scrollTop = moveList.scrollHeight;
}

// Determina o estado da partida e atualiza as mensagens para os jogadores.
function updateStatus() {
  const checked = isInCheck(state.board, state.turn);
  const possibleMoves = allLegalMoves(state.board, state.turn, state.enPassant);
  const checkmate = possibleMoves.length === 0 && checked;
  const insufficientMaterial = isInsufficientMaterial(state.board);
  const finished = checkmate || possibleMoves.length === 0 || insufficientMaterial;
  const colorName = state.turn === "white" ? "brancas" : "pretas";

  document.querySelector("#white-indicator").classList.toggle("active", state.turn === "white" && !finished);
  document.querySelector("#black-indicator").classList.toggle("active", state.turn === "black" && !finished);
  if (checkmate) {
    const winner = state.turn === "white" ? "Pretas" : "Brancas";
    statusLabel.textContent = "XEQUE-MATE";
    statusMessage.textContent = `${winner} vencem a partida!`;
    statusIcon.textContent = "♛";
    if (!state.finished) {
      state.finished = true;
      recordGameResult(state.turn === "white" ? "black" : "white");
    }
  } else if (finished) {
    statusLabel.textContent = "EMPATE";
    statusMessage.textContent = insufficientMaterial
      ? "Material insuficiente para dar xeque-mate."
      : "Afogamento: não há movimentos legais.";
    statusIcon.textContent = "½";
    if (!state.finished) {
      state.finished = true;
      recordGameResult(null);
      showGameAlert(insufficientMaterial
        ? "Empate! Material insuficiente para dar xeque-mate."
        : "Empatado! A partida terminou em empate.");
    }
  } else if (aiThinking) {
    statusLabel.textContent = "IA PENSANDO";
    statusMessage.textContent = "A IA está calculando o próximo lance.";
    statusIcon.textContent = "…";
  } else if (checked) {
    statusLabel.textContent = `XEQUE NAS ${colorName.toUpperCase()}`;
    statusMessage.textContent = `Rei das ${colorName} em perigo.`;
    statusIcon.textContent = "!";
  } else if (state.mode === "ai" && state.turn === "black") {
    statusLabel.textContent = "VEZ DA IA";
    statusMessage.textContent = "A IA joga com as pretas.";
    statusIcon.textContent = "♟";
  } else {
    statusLabel.textContent = `VEZ DAS ${colorName.toUpperCase()}`;
    statusMessage.textContent = `Jogam as ${colorName}.`;
    statusIcon.textContent = state.turn === "white" ? "♙" : "♟";
  }
  return finished;
}

function render() {
  renderBoard();
  updateStatus();
  renderMoves();
  renderPlayers();
  renderStats();
}

// Entrada do jogador, notação dos lances e execução da resposta da IA.
function handleSquareClick(row, col) {
  if (aiThinking || (state.mode === "ai" && state.turn === "black") || promotionDialog.hidden === false || state.finished) return;
  const piece = state.board[row][col];

  if (state.selected) {
    const legalMove = getLegalMoves(state.board, state.selected.row, state.selected.col, state.enPassant)
      .find(move => move.toRow === row && move.toCol === col);
    if (legalMove) {
      const movingPiece = state.board[state.selected.row][state.selected.col];
      if (movingPiece.type === "pawn" && (row === 0 || row === 7)) {
        showPromotion(legalMove, movingPiece.color);
      } else {
        makeMove(legalMove);
      }
      return;
    }
  }

  if (piece && piece.color === state.turn) {
    state.selected = { row, col };
  } else {
    state.selected = null;
  }
  renderBoard();
}

function formatMove(move, piece, captured, promotion) {
  if (move.castle === "king") return "O-O";
  if (move.castle === "queen") return "O-O-O";
  const from = coordinate(move.fromRow, move.fromCol);
  const to = coordinate(move.toRow, move.toCol);
  const captureMark = captured ? "×" : "–";
  const pieceMark = piece.type === "pawn" ? "" : symbols[piece.color][piece.type];
  const promotionMark = promotion ? `=${symbols[piece.color][promotion]}` : "";
  return `${pieceMark}${from}${captureMark}${to}${promotionMark}`;
}

function makeMove(move, promotion = "queen") {
  state.snapshots.push({
    board: cloneBoard(state.board),
    turn: state.turn,
    enPassant: state.enPassant ? { ...state.enPassant } : null,
    moves: state.moves.map(item => ({ ...item })),
    lastMove: state.lastMove ? { ...state.lastMove } : null
  });
  const piece = state.board[move.fromRow][move.fromCol];
  const { captured } = applyMove(state.board, move, promotion);
  state.moves.push({ notation: formatMove(move, piece, captured, piece.type === "pawn" && (move.toRow === 0 || move.toRow === 7) ? promotion : null) });
  state.enPassant = nextEnPassant(piece, move);
  state.lastMove = { ...move };
  state.turn = state.turn === "white" ? "black" : "white";
  state.selected = null;
  render();
  if (!state.finished && state.mode === "ai" && state.turn === "black") scheduleAiTurn();
}

function scheduleAiTurn() {
  aiThinking = true;
  render();
  aiTimerId = window.setTimeout(() => {
    aiTimerId = null;
    if (state.mode !== "ai" || state.turn !== "black" || state.finished) {
      aiThinking = false;
      render();
      return;
    }
    const move = chooseAiMove();
    aiThinking = false;
    if (move) makeMove(move);
    else render();
  }, 180);
}

function showPromotion(move, color) {
  promotionChoices.replaceChildren();
  for (const type of promotionTypes) {
    const choice = document.createElement("button");
    choice.type = "button";
    choice.className = "promotion-choice";
    choice.textContent = symbols[color][type];
    choice.setAttribute("aria-label", `Promover para ${pieceNames[type]}`);
    choice.addEventListener("click", () => {
      promotionDialog.hidden = true;
      makeMove(move, type);
    }, { once: true });
    promotionChoices.append(choice);
  }
  promotionDialog.hidden = false;
  promotionChoices.querySelector("button").focus();
}

// Inicia partidas e conecta os controles da página às ações do jogo.
function startNewGame() {
  const resignationMessage = recordResignation();
  hideGameAlert();
  if (aiTimerId !== null) {
    window.clearTimeout(aiTimerId);
    aiTimerId = null;
  }
  aiThinking = false;
  state = {
    board: createInitialBoard(),
    turn: "white",
    enPassant: null,
    selected: null,
    lastMove: null,
    moves: [],
    snapshots: [],
    mode: modeSelect.value,
    difficulty: difficultySelect.value,
    finished: false
  };
  promotionDialog.hidden = true;
  render();
  if (resignationMessage) showGameAlert(resignationMessage);
}

undoButton.addEventListener("click", () => {
  if (aiThinking || state.finished) return;
  const movesToUndo = state.mode === "ai" && state.turn === "white" && state.moves.length >= 2 ? 2 : 1;
  for (let count = 0; count < movesToUndo; count += 1) {
    const previous = state.snapshots.pop();
    if (!previous) break;
    state.board = previous.board;
    state.turn = previous.turn;
    state.enPassant = previous.enPassant;
    state.moves = previous.moves;
    state.lastMove = previous.lastMove;
  }
  state.selected = null;
  state.finished = false;
  render();
});

restartButton.addEventListener("click", startNewGame);
modeSelect.addEventListener("change", () => {
  difficultyField.hidden = modeSelect.value !== "ai";
  renderStats();
});

renderLabels();
loadStats();
startNewGame();