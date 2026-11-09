// ============================================================================
// CHESSME-12-VIP — DEDICATED BACKGROUND ENGINE WORKER (engineWorker.js)
// Runs Alpha-Beta + Quiescence Search & Move Analysis off the Main UI Thread
// ============================================================================

importScripts("https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js");

const PIECE_VALS = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const PAWN_PST = [
  [0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],
  [5,5,10,25,25,10,5,5],[0,0,0,22,22,0,0,0],[5,-5,-10,0,0,-10,-5,5],
  [5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]
];
const KNIGHT_PST = [
  [-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],
  [-30,0,15,20,20,15,0,-30],[-30,5,20,25,25,20,5,-30],
  [-30,0,20,25,25,20,0,-30],[-30,5,15,20,20,15,5,-30],
  [-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]
];
const BISHOP_PST = [
  [-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],
  [-10,0,10,15,15,10,0,-10],[-10,10,10,15,15,10,10,-10],
  [-10,0,15,15,15,15,0,-10],[-10,15,15,15,15,15,15,-10],
  [-10,10,0,0,0,0,10,-10],[-20,-10,-10,-10,-10,-10,-10,-20]
];
const KING_PST = [
  [-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],
  [-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-25,-25,-20,-20,-10],
  [15,15,-10,-15,-15,-10,15,15],[20,35,15,-5,0,10,35,20]
];

function evaluateBoardStatic(g) {
  if (g.in_checkmate()) return g.turn() === "w" ? -99999 : 99999;
  if (g.in_draw() || g.in_stalemate() || g.in_threefold_repetition()) return 0;
  const b = g.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p) continue;
      const isW = p.color === "w";
      const row = isW ? r : 7 - r;
      let val = PIECE_VALS[p.type] || 0;
      if (p.type === "p") val += PAWN_PST[row][c];
      else if (p.type === "n") val += KNIGHT_PST[row][c];
      else if (p.type === "b") val += BISHOP_PST[row][c];
      else if (p.type === "k") val += KING_PST[row][c];
      score += isW ? val : -val;
    }
  }
  return score;
}

function quiescenceSearch(g, alpha, beta, maxWhite, qDepth) {
  const standPat = evaluateBoardStatic(g);
  if (qDepth <= 0 || Math.abs(standPat) >= 90000) return standPat;

  if (maxWhite) {
    if (standPat >= beta) return beta;
    if (alpha < standPat) alpha = standPat;
  } else {
    if (standPat <= alpha) return alpha;
    if (beta > standPat) beta = standPat;
  }

  const captures = g.moves({ verbose: true }).filter((m) => m.captured || m.promotion);
  if (!captures.length) return standPat;

  captures.sort(
    (a, b) =>
      (PIECE_VALS[b.captured] || 100) * 10 -
      (PIECE_VALS[b.piece] || 100) -
      ((PIECE_VALS[a.captured] || 100) * 10 - (PIECE_VALS[a.piece] || 100))
  );

  if (maxWhite) {
    for (let i = 0; i < captures.length; i++) {
      g.move(captures[i]);
      const sc = quiescenceSearch(g, alpha, beta, false, qDepth - 1);
      g.undo();
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  } else {
    for (let i = 0; i < captures.length; i++) {
      g.move(captures[i]);
      const sc = quiescenceSearch(g, alpha, beta, true, qDepth - 1);
      g.undo();
      if (sc <= alpha) return alpha;
      if (sc < beta) beta = sc;
    }
    return beta;
  }
}

function alphaBeta(g, depth, alpha, beta, maxWhite) {
  if (depth <= 0 || g.game_over()) return quiescenceSearch(g, alpha, beta, maxWhite, 3);
  const moves = g.moves({ verbose: true });
  moves.sort((a, b) => (b.captured ? 10 : 0) - (a.captured ? 10 : 0));

  if (maxWhite) {
    let maxEv = -100000;
    for (let i = 0; i < moves.length; i++) {
      g.move(moves[i]);
      const ev = alphaBeta(g, depth - 1, alpha, beta, false);
      g.undo();
      if (ev > maxEv) maxEv = ev;
      if (ev > alpha) alpha = ev;
      if (beta <= alpha) break;
    }
    return maxEv;
  } else {
    let minEv = 100000;
    for (let i = 0; i < moves.length; i++) {
      g.move(moves[i]);
      const ev = alphaBeta(g, depth - 1, alpha, beta, true);
      g.undo();
      if (ev < minEv) minEv = ev;
      if (ev < beta) beta = ev;
      if (beta <= alpha) break;
    }
    return minEv;
  }
}

function cpToWinProb(cp) {
  return 100 / (1 + Math.exp(-0.00368208 * Math.max(-4000, Math.min(4000, cp))));
}

function computeBestBotMove(fen, depth = 2, piecePref = {}, elo = 1000) {
  const g = new Chess(fen);
  const legal = g.moves({ verbose: true });
  if (!legal.length) return null;

  const botIsW = g.turn() === "w";
  const scored = legal.map((m) => {
    g.move(m);
    const evW = alphaBeta(g, depth - 1, -100000, 100000, !botIsW);
    g.undo();

    let score = (botIsW ? evW : -evW) + ((piecePref[m.piece] || 1.0) - 1.0) * 25;
    if (m.flags.includes("k") || m.flags.includes("q")) score += 45;
    const noise = elo === 700 ? 120 : elo === 1000 ? 22 : elo === 1100 ? 14 : 4;
    return { move: m, score: score + (Math.random() - 0.5) * noise };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].move;
}

function analyzeSinglePly(fenBefore, moveObj, plyNumber) {
  const tempG = new Chess(fenBefore);
  const moverIsW = moveObj.color === "w";
  const legal = tempG.moves({ verbose: true });

  const scored = legal.map((m) => {
    tempG.move(m);
    const evWhite = alphaBeta(tempG, 1, -100000, 100000, !moverIsW);
    tempG.undo();
    const moverCp = moverIsW ? evWhite : -evWhite;
    return { san: m.san, from: m.from, to: m.to, moverCp, evWhite, winProb: cpToWinProb(moverCp) };
  });
  scored.sort((a, b) => b.moverCp - a.moverCp);

  const bestOpt = scored[0] || { san: moveObj.san, from: moveObj.from, to: moveObj.to, moverCp: 0, evWhite: 0, winProb: 50 };
  const secondBest = scored[1] || bestOpt;
  const playedOpt = scored.find((x) => x.from === moveObj.from && x.to === moveObj.to) || bestOpt;

  const winProbDrop = Math.max(0, bestOpt.winProb - playedOpt.winProb);
  const cpLossPawns = Math.max(0, (bestOpt.moverCp - playedOpt.moverCp) / 100);
  const gapToSecond = bestOpt.winProb - secondBest.winProb;

  tempG.move(moveObj);
  const gaveCheck = tempG.in_check();
  tempG.undo();

  let icon = "★", bg = "#81b64c", label = "★ Best", sqClass = "";
  let moveAcc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * winProbDrop) - 3.1669));

  if (plyNumber <= 10 && cpLossPawns <= 0.35 && !moveObj.captured) {
    icon = "📖"; bg = "#a88865"; label = "📖 Book"; moveAcc = 100.0;
  } else if (cpLossPawns >= 2.2 || (winProbDrop >= 22 && cpLossPawns >= 1.6)) {
    icon = "??"; bg = "#ca3431"; label = "?? Blunder"; sqClass = "blunder-sq";
  } else if (cpLossPawns >= 1.15 || (winProbDrop >= 12 && cpLossPawns >= 0.9)) {
    icon = "?"; bg = "#e69f00"; label = "? Mistake"; sqClass = "mistake-sq";
  } else if (cpLossPawns >= 0.6 || winProbDrop >= 6.5) {
    icon = "?!"; bg = "#f7c631"; label = "?! Inaccuracy"; sqClass = "inaccuracy-sq";
  } else if (cpLossPawns <= 0.15 && moveObj.captured && gaveCheck && playedOpt.winProb >= 60) {
    icon = "!!"; bg = "#1baca6"; label = "!! Brilliant"; sqClass = "brilliant-sq"; moveAcc = 100.0;
  } else if (cpLossPawns <= 0.1 && (gapToSecond >= 10 || moveObj.captured || gaveCheck)) {
    icon = "!"; bg = "#5c8bb0"; label = "! Great"; moveAcc = 100.0;
  } else if (cpLossPawns <= 0.25) {
    icon = "★"; bg = "#81b64c"; label = "★ Best"; moveAcc = Math.max(98.5, moveAcc);
  } else {
    icon = "✓"; bg = "#96bc4b"; label = "✓ Good";
  }

  return {
    ply: plyNumber, color: moveObj.color, playedSan: moveObj.san, playedFrom: moveObj.from, playedTo: moveObj.to,
    bestSan: bestOpt.san, bestFrom: bestOpt.from, bestTo: bestOpt.to, evalWhitePawns: playedOpt.evWhite / 100,
    winProbDrop, cpLossPawns, moveAcc, icon, bg, label, sqClass
  };
}

self.onmessage = function (e) {
  const data = e.data;
  if (!data) return;

  if (data.type === "bot_move" || data.type === "hint_move") {
    const move = computeBestBotMove(data.fen, data.depth, data.piecePref, data.elo);
    self.postMessage({ type: data.type + "_result", move });
  } else if (data.type === "analyze_ply") {
    const review = analyzeSinglePly(data.fenBefore, data.moveObj, data.plyNumber);
    self.postMessage({ type: "analyze_ply_result", plyIdx: data.plyIdx, review, isBotMove: data.isBotMove });
  }
};