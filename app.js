// ============================================================================
// CHESSME-12-VIP — COMPLETE APP.JS (HASHED PASSWORDS + OWNER PANEL + REVIEW)
// ============================================================================

// Encrypted Owner Email Verification (Matches mohammedsamir0323@gmail.com without plain text!)
const OWNER_KEY_BYTES = [24,26,29,20,24,24,16,17,6,20,24,28,7,69,70,71,70,53,18,24,20,28,25,91,22,26,24];

function isEmailOwner(emailStr) {
  const s = String(emailStr || "").trim().toLowerCase();
  if (s.length !== OWNER_KEY_BYTES.length) return false;
  for (let i = 0; i < s.length; i++) {
    if ((s.charCodeAt(i) ^ 117) !== OWNER_KEY_BYTES[i]) return false;
  }
  return true;
}

function isCurrentUserOwner() {
  return Boolean(currentUser && (currentUser.isOwner || (currentUser.email && isEmailOwner(currentUser.email))));
}

function hashPassword(email, password) {
  const str = `chessme_salt_2026::${String(email).trim().toLowerCase()}::${String(password)}`;
  let h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return "h_" + (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

function emailToKey(email) { return hashPassword(email, "key_id"); }
function getFenKey(fenString) { return fenString.split(" ").slice(0, 3).join(" "); }

const game = new Chess();
let boardFlipped = false;
let playerColor = "w";
let matchMode = "online";
let onlineMatchStarted = false;
let matchEnded = false;
let currentVariant = "standard";
let selectedSquare = null;
let legalMovesForSelected = [];
let lastMoveSquares = [];
let playerMoveBadge = null;
let checksCount = { w: 0, b: 0 };
let lastSpokenLine = "";
let lastPlayerMoveRecord = null;

let fenHistory = [game.fen()];
let moveHistoryVerbose = [];
let viewPly = 0;
let isReviewMode = false;
let gameReviewList = [];

let accountsRegistry = JSON.parse(localStorage.getItem("chessme_db_accounts_v2") || "{}");
let reportsRegistry = JSON.parse(localStorage.getItem("chessme_db_reports_v2") || "{}");
let currentUser = JSON.parse(sessionStorage.getItem("chessme_session_user_v2") || localStorage.getItem("chessme_user_acc_v2") || "null");
let authMode = "signup";

let selectedTimeSeconds = 180, whiteTime = 180, blackTime = 180, clockInterval = null;
let mqttClient = null, localChannel = null;
let myClientId = "vip_" + Math.random().toString(36).substring(2, 9);
let currentRoomCode = null, isRoomHost = false;
let openRoomsMap = {}, spectatorsSet = new Set();

const PUZZLE_BANK = [
  { title: "Puzzle #1 • Queen Sacrifice Mate", fen: "r1b2rk1/pppp1ppp/2n2n2/2b1p1B1/2B1P1q1/2NP1N2/PPP2PPP/R2Q1RK1 w - - 0 1", solutionSan: "Bxf7+" },
  { title: "Puzzle #2 • Back-Rank Checkmate", fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", solutionSan: "Rd8#" },
  { title: "Puzzle #3 • Smothered Knight Mate", fen: "5rk1/5ppp/8/5N2/8/8/5PPP/6K1 w - - 0 1", solutionSan: "Ne7#" },
  { title: "Puzzle #4 • Royal Knight Fork", fen: "r3k2r/ppp2ppp/8/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1", solutionSan: "Nxc7+" }
];
let currentPuzzleIdx = 0;
let puzzleStreak = parseInt(localStorage.getItem("chessme_puzzle_streak") || "0", 10);

// ============================================================================
// 1. SQUAD BOTS
// ============================================================================
const VIP_BOTS = [
  {
    id: "kareem", name: "Kareem Mohammed", usernames: ["kar070"], elo: 1500, searchDepth: 2, crowns: 3, avatar: "🔥", avatarUrl: null,
    style: "Aggressive tactical player • Punishes mistakes fast", repertoire: {},
    piecePref: { p: 1.0, n: 1.35, b: 1.25, r: 1.2, q: 1.25, k: 0.1 },
    fallbackBook: { "start": { e4: 30, d4: 8 }, "e4": { e5: 30 }, "e4 e5": { Nf3: 30 }, "e4 e5 Nf3": { Nc6: 30 }, "e4 e5 Nf3 Nc6": { Nc3: 28, Bc4: 12 }, "e4 e5 Nf3 Nc6 Nc3": { Nf6: 30 }, "e4 c5": { Nf3: 25 }, "e4 c6": { d4: 25 }, "d4": { Nf6: 20, d5: 18 } },
    greeting: "جاهز تخسر قدام 1500؟ ركز عشان مبرحمش 🔥",
    openingLines: ["بداية تقليدية.. بس أنا حافظ الافتتاح ده صم 🔥", "أربع أحصنة في نص الرقعة ومش هتعرف تعدي!"],
    winningLines: ["الجيم ده بقى في جيبي خلاص.. انسحب أحسنلك 🔥😎", "الفرق بقى واضح.. 1500 مبيرحمش!"],
    losingLines: ["إيه ده.. الجيم اتعقد كده ليه؟ استنى هعوضها! 😤", "ماشي أخدت تفوق صغير بس لسه الجيم مخلصش!"],
    equalLines: ["الجيم متقفل.. نشوف مين هيغلط الأول 🔥", "خلي بالك من الوقت يا بطل ⏱️", "الأحصنة بتاعتي بدأت تشتغل!"],
    whenBotCaptures: ["هات دي هنا! قطعة ورا قطعة وهتستسلم 🔥", "شكرًا على القطعة يا بطل 😎"],
    whenPlayerCaptures: ["فاكر إنك كسبت قطعة؟ استنى الرد التقيل 🔥"],
    whenBotChecks: ["كش يا معلم! الملك بتاعك هيروح فين؟ 🔥"],
    whenPlayerChecks: ["كش في الهوا.. الملك في أمان 👑"],
    blunderTaunts: ["إيه النقلة دي يا عم؟! حتى أيهم ميعملش النقلة دي 💀🔥", "دي بلندر اسطوري! هات القطعة دي وانسحب أحسنلك 😂🔥", "بتلعب كده قدام 1500؟! روح العب مع أيهم 🤡"],
    winReaction: "قولتلك 1500 مبيهزرش! جيم سهل جدًا 🔥😎",
    lossReaction: "مستحيل! أكيد كنت فاتح ستوكفيش.. تعال ريماتش حالًا! 🔥",
    drawReaction: "تعادل؟! نفدت بجلدك المرة دي.. تعال جيم فاصل حالًا! 🤝🔥"
  },
  {
    id: "fares", name: "Fares Ehab", usernames: ["gintil_sokara", "aboelmagal", "faresehab123"], elo: 1100, searchDepth: 2, crowns: 2, avatar: "🛡️", avatarUrl: null,
    style: "Sharp counter-attacker • Strong middlegame defense", repertoire: {},
    piecePref: { p: 1.15, n: 1.2, b: 1.3, r: 1.1, q: 1.25, k: 0.1 },
    fallbackBook: { "start": { e4: 25, d4: 10 }, "e4": { c5: 35 }, "e4 c5": { Nf3: 25, Nc3: 12 }, "e4 c5 Nf3": { d6: 25, Nc6: 18 }, "e4 c5 Nf3 d6": { d4: 25 }, "e4 c5 Nf3 d6 d4": { cxd4: 30 }, "d4": { c5: 18, Nf6: 16 } },
    greeting: "العبوا عدل! جاهز للهجوم المضاد 🛡️",
    openingLines: ["الدفاع الصقلي جاهز.. وريني هتهجم إزاي 🛡️", "العبوا عدل من أول الجيم كده 😎"],
    winningLines: ["الهجمة المرتدة نجحت والزيادة معايا 🛡️😎", "العبوا عدل! الجيم رايح في سكتي خلاص 🔥"],
    losingLines: ["العبوا عدل! النقلة دي فلتت مني إزاي؟ 😤", "لسه في فخاخ في الرقعة.. متفرحش بدري 🛡️"],
    equalLines: ["مش هتعرف تخترق دفاعي 🛡️", "مستنيك تغلط بس عشان أرد بهجمة مرتدة!"],
    whenBotCaptures: ["هات القطعة دي! هجمة مرتدة سريعة 🔥"],
    whenPlayerCaptures: ["فتحتلي العمود بإيدك.. شكرًا ليك 😎"],
    whenBotChecks: ["كش ملك! الهجمة المرتدة وصلت 🔥"],
    whenPlayerChecks: ["كش على الفاضي.. الملك محمي 🛡️"],
    blunderTaunts: ["العبوا عدل! إيه البلندر الاسطوري ده؟! 💀🔥", "حتى أيهم ميعملش النقلة دي! هات القطعة 😂"],
    winReaction: "العبوا عدل! الهجمة المرتدة خلصت الكلام 🛡️🔥",
    lossReaction: "غلطة واحدة ضيعت الجيم.. تعال ريماتش ومش هرحمك! 🛡️",
    drawReaction: "تعادل عادل! بس الجيم الجاي مفيش رحمة 🤝🛡️"
  },
  {
    id: "mohammed", name: "Mohammed Samir", usernames: ["mohammedsamirchess", "mohammedsamir0323", "mohammedsamir323"], elo: 1000, searchDepth: 2, crowns: 2, avatar: "🧠", avatarUrl: null,
    style: "Solid positional player • Punishes overextensions", repertoire: {},
    piecePref: { p: 1.25, n: 1.3, b: 1.2, r: 1.15, q: 1.15, k: 0.1 },
    fallbackBook: { "start": { e4: 28, d4: 12 }, "e4": { c6: 40 }, "e4 c6": { d4: 30, Nf3: 15, Nc3: 15 }, "e4 c6 d4": { d5: 40 }, "e4 c6 Nf3": { d5: 40 }, "e4 c6 d4 d5": { e5: 18, Nc3: 18, exd5: 18 }, "e4 c6 d4 d5 e5": { Bf5: 35 }, "e4 c6 d4 d5 exd5": { cxd5: 35 }, "d4": { d5: 30, c6: 18 } },
    greeting: "وريني هتعمل إيه النهاردة! الدفاع حديد 🧱🧠",
    openingLines: ["حيطة الكاروكان اتبنت خلاص.. عدي لو تعرف 🧱", "نقلات هادية وموزونة من أول الجيم 🧠"],
    winningLines: ["التفوق بقى معايا والحيطة لسه حديد 🧠🔥", "خطوة بخطوة بنقفل الجيم على الهادي 😎"],
    losingLines: ["ماشي أخدت تفوق صغير بس لسه الجيم مخلصش! 🧠", "استنى بس.. هقفل الرقعة وأعوض الفرق ده 🧱"],
    equalLines: ["كل حاجة محمية بالملي 🧱", "فكر براحتك بس متعملش بلندر!", "وضعي في السليم، الدور عليك 🧠"],
    whenBotCaptures: ["هات القطعة دي! خطوة بخطوة بنقفل الجيم 🧠🔥"],
    whenPlayerCaptures: ["كلت؟ طب أنا هرد وآخد المبادرة 🧠"],
    whenBotChecks: ["كش يا بطل! الدفاع اتحول لهجوم خلاص 🧠🔥"],
    whenPlayerChecks: ["كش عادي جدًا.. الملك في أمان تام 🧱"],
    blunderTaunts: ["دي بلندر اسطوري! حتى أيهم ميعملش النقلة دي 💀🔥", "دي بلندر اسطوري 😂 هات القطعة دي!", "دي بلندر اسطوري! انت بتلعب وأنت مغمض ولا إيه؟ 💀"],
    winReaction: "قولتلك الدفاع حديد! دي بلندر اسطوري ضيع منك الجيم 💀🔥",
    lossReaction: "ماشي يا عم كسبت الجيم ده.. تعال ريماتش وهوريك اللعب الصح! 🧠🔥",
    drawReaction: "تعادل بشرف! محدش فينا عرف يكسر دفاع التاني 🤝🧱"
  },
  {
    id: "ayham", name: "Ayham", usernames: ["yomi_fr"], elo: 700, searchDepth: 1, crowns: 1, avatar: "⚡", avatarUrl: null,
    style: "Unpredictable street chess • Early Queen attacks", repertoire: {},
    piecePref: { p: 1.0, n: 1.1, b: 1.1, r: 1.0, q: 1.65, k: 0.3 },
    fallbackBook: { "start": { e4: 30 }, "e4": { e5: 30 }, "e4 e5": { Qh5: 18, Bc4: 18, Nf3: 12 }, "e4 e5 Nf3": { Qf6: 20, Nc6: 15 }, "d4": { d5: 25 } },
    greeting: "والله لو خسرت يبقى بسبب إن النت بيقطع عندي 😭",
    openingLines: ["طلع الوزير من أولها ومش مهم النظريات 🔥😂", "أنا بلعب شطرنج شوارع ملوش حل!"],
    winningLines: ["ههههه أنا كسبان؟! يلا سكرين شوت للجروب بسرعة 📸🔥"],
    losingLines: ["يا عم النت عندي بيهنج والله مش شايف الرقعة 😭", "الماوس علق لوحده والله العظيم مكنتش أقصد! 😭"],
    equalLines: ["ثانية واحدة بفكر في خطة جهنمية...", "النت عندي شرطة واحدة والله العظيم 😭"],
    whenBotCaptures: ["ههههه أكلتلك قطعة!! يلا بينا 🔥😂"],
    whenPlayerCaptures: ["يا عم سيب قطعي في حالها بقى 😭"],
    whenBotChecks: ["كش ملك يا معلم!! شفت التكتيك ده؟ 😂🔥"],
    whenPlayerChecks: ["يا عم براحة على الملك بتاعي 😭"],
    blunderTaunts: ["ههههه عملت بلندر قدام أيهم 700؟! سكرين شوت للجروب فورًا 💀📸", "دي بلندر اسطوري! حتى أنا شفت إن القطعة دي ببلاش 😂🔥"],
    winReaction: "ههههه كسبتك!! سكرين شوت للجروب حالًا 💀📸",
    lossReaction: "والله العظيم النت فصل في آخر نقلة! مش محسوبة تعال تاني 😭",
    drawReaction: "ههههه اتعادلت معاك وأنا 700!! ده يعتبر مكسب ليا 🤝😎"
  }
];

let activeBot = VIP_BOTS[2];

const PIECE_SVGS = {
  wp: "https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg",
  wn: "https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg",
  wb: "https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg",
  wr: "https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg",
  wq: "https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg",
  wk: "https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg",
  bp: "https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg",
  bn: "https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg",
  bb: "https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg",
  br: "https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg",
  bq: "https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg",
  bk: "https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg"
};
Object.values(PIECE_SVGS).forEach((u) => { const i = new Image(); i.src = u; });

// ============================================================================
// 2. QUIESCENCE + ALPHA-BETA + EXACT WIN% ACCURACY ENGINE
// ============================================================================
const PIECE_VALS = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const PAWN_PST = [[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,22,22,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]];
const KNIGHT_PST = [[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,15,20,20,15,0,-30],[-30,5,20,25,25,20,5,-30],[-30,0,20,25,25,20,0,-30],[-30,5,15,20,20,15,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]];
const BISHOP_PST = [[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,10,15,15,10,0,-10],[-10,10,10,15,15,10,10,-10],[-10,0,15,15,15,15,0,-10],[-10,15,15,15,15,15,15,-10],[-10,10,0,0,0,0,10,-10],[-20,-10,-10,-10,-10,-10,-10,-20]];
const KING_PST = [[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-25,-25,-20,-20,-10],[15,15,-10,-15,-15,-10,15,15],[20,35,15,-5,0,10,35,20]];

function evaluateBoardStatic(g) {
  if (g.in_checkmate()) return g.turn() === "w" ? -99999 : 99999;
  if (g.in_draw() || g.in_stalemate() || g.in_threefold_repetition()) return 0;
  const b = g.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p) continue;
      const isW = p.color === "w", row = isW ? r : 7 - r;
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
  if (maxWhite) { if (standPat >= beta) return beta; if (alpha < standPat) alpha = standPat; }
  else { if (standPat <= alpha) return alpha; if (beta > standPat) beta = standPat; }
  const captures = g.moves({ verbose: true }).filter((m) => m.captured || m.promotion);
  if (!captures.length) return standPat;
  captures.sort((a, b) => ((PIECE_VALS[b.captured] || 100) * 10 - (PIECE_VALS[b.piece] || 100)) - ((PIECE_VALS[a.captured] || 100) * 10 - (PIECE_VALS[a.piece] || 100)));
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

function ensureAllMovesReviewed() {
  for (let i = 0; i < moveHistoryVerbose.length; i++) {
    if (!gameReviewList[i]) gameReviewList[i] = analyzeSinglePly(fenHistory[i], moveHistoryVerbose[i], i + 1);
  }
}

function drawReviewArrowOnBoard(fromSq, toSq, colorHex = "#81b64c") {
  const canvas = document.getElementById("arrowCanvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width; canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!fromSq || !toSq || fromSq === toSq) return;

  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const getCenter = (sq) => {
    let f = files.indexOf(sq[0]), r = 8 - parseInt(sq[1], 10);
    if (boardFlipped) { f = 7 - f; r = 7 - r; }
    return { x: (f + 0.5) * (canvas.width / 8), y: (r + 0.5) * (canvas.height / 8) };
  };
  const p1 = getCenter(fromSq), p2 = getCenter(toSq);
  const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x), headLen = canvas.width * 0.045;

  ctx.save();
  ctx.strokeStyle = colorHex; ctx.fillStyle = colorHex; ctx.globalAlpha = 0.85;
  ctx.lineWidth = canvas.width * 0.022; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x - Math.cos(angle) * (headLen * 0.7), p2.y - Math.sin(angle) * (headLen * 0.7));
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p2.x, p2.y);
  ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath(); ctx.fill(); ctx.restore();
}

function clearArrowCanvas() {
  const canvas = document.getElementById("arrowCanvas");
  if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

// ============================================================================
// 3. BOT DIALOGUE & MOVE ENGINE
// ============================================================================
function pickUniqueLine(linesArray) {
  if (!linesArray || !linesArray.length) return "";
  const filtered = linesArray.filter((l) => l !== lastSpokenLine);
  const pool = filtered.length ? filtered : linesArray;
  lastSpokenLine = pool[Math.floor(Math.random() * pool.length)];
  return lastSpokenLine;
}

function triggerBlunderRoast() {
  if (!activeBot || matchMode !== "bot") return;
  showBotBubble(pickUniqueLine(activeBot.blunderTaunts));
  spawnEmote("⁉️", true);
}

function triggerScoreAwareBotDialogue(botMoveObj, lastPlayerMoveObj) {
  if (!activeBot || matchMode !== "bot") return;
  if (playerMoveBadge && (playerMoveBadge.icon === "??" || playerMoveBadge.icon === "?")) return;
  const evalWhiteCp = evaluateBoardStatic(game);
  const botAdvantagePawns = ((playerColor === "b" ? evalWhiteCp : -evalWhiteCp)) / 100;

  if (game.in_check() && activeBot.whenBotChecks) return showBotBubble(pickUniqueLine(activeBot.whenBotChecks));
  if (lastPlayerMoveObj && lastPlayerMoveObj.san.includes("+") && activeBot.whenPlayerChecks) return showBotBubble(pickUniqueLine(activeBot.whenPlayerChecks));
  if (botMoveObj.captured && activeBot.whenBotCaptures) return showBotBubble(pickUniqueLine(activeBot.whenBotCaptures));
  if (lastPlayerMoveObj && lastPlayerMoveObj.captured && activeBot.whenPlayerCaptures) return showBotBubble(pickUniqueLine(activeBot.whenPlayerCaptures));
  if (game.history().length <= 8 && activeBot.openingLines) return showBotBubble(pickUniqueLine(activeBot.openingLines));
  if (botAdvantagePawns <= -2.0 && activeBot.losingLines) return showBotBubble(pickUniqueLine(activeBot.losingLines));
  if (botAdvantagePawns >= 2.0 && activeBot.winningLines) return showBotBubble(pickUniqueLine(activeBot.winningLines));
  if (activeBot.equalLines) showBotBubble(pickUniqueLine(activeBot.equalLines));
}

function requestBotMove() {
  if (game.game_over() || matchMode !== "bot") return;
  const positionMemory = activeBot?.repertoire?.[getFenKey(game.fen())];
  if (positionMemory) {
    const legalMoves = game.moves({ verbose: true });
    const candidates = Object.entries(positionMemory).map(([san, count]) => ({ san, count, moveObj: legalMoves.find((m) => m.san === san) })).filter((c) => c.moveObj);
    if (candidates.length) {
      candidates.sort((a, b) => b.count - a.count);
      setTimeout(() => executeMove(candidates[0].moveObj.from, candidates[0].moveObj.to, "q", true, false), 280);
      return;
    }
  }
  setTimeout(() => {
    if (game.game_over()) return;
    const chosen = computeBestBotMove(activeBot);
    if (chosen) executeMove(chosen.from, chosen.to, "q", true, false);
  }, 260);
}

function computeBestBotMove(bot) {
  const legal = game.moves({ verbose: true });
  if (!legal.length) return null;
  const botIsW = game.turn() === "w", depth = bot.searchDepth || 2, pref = bot.piecePref || {};
  const scored = legal.map((m) => {
    game.move(m);
    const evW = alphaBeta(game, depth - 1, -100000, 100000, !botIsW);
    game.undo();
    let score = (botIsW ? evW : -evW) + ((pref[m.piece] || 1.0) - 1.0) * 25;
    if (m.flags.includes("k") || m.flags.includes("q")) score += 45;
    const noise = bot.elo === 700 ? 120 : bot.elo === 1000 ? 22 : bot.elo === 1100 ? 14 : 4;
    return { move: m, score: score + (Math.random() - 0.5) * noise };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].move;
}

// ============================================================================
// 4. CLOUD DATABASE + OWNER ADMIN PANEL + FAIR PLAY NOTIFICATIONS
// ============================================================================
const LOBBY_TOPIC = "chessme_vip_eg_2026/lobby";
const ROOM_TOPIC_PREFIX = "chessme_vip_eg_2026/room/";
const DB_ACCOUNTS_PREFIX = "chessme_vip_eg_2026/db_acc_v2/";
const DB_REPORTS_PREFIX = "chessme_vip_eg_2026/db_rep_v2/";
const DB_NOTIFS_PREFIX = "chessme_vip_eg_2026/db_notif_v2/";

function initOnlineNetwork() {
  if ("BroadcastChannel" in window) {
    localChannel = new BroadcastChannel("chessme_vip_local_net");
    localChannel.onmessage = (ev) => onNetworkPacket(ev.data.topic, ev.data.payload);
  }
  if (typeof mqtt !== "undefined") {
    mqttClient = mqtt.connect("wss://broker.emqx.io:8084/mqtt", { clientId: myClientId, clean: true, reconnectPeriod: 2000 });
    mqttClient.on("connect", () => {
      document.getElementById("connectionStatus").innerHTML = `<span class="pulse-dot"></span> Online Server Connected`;
      mqttClient.subscribe(LOBBY_TOPIC);
      mqttClient.subscribe(DB_ACCOUNTS_PREFIX + "+");
      mqttClient.subscribe(DB_REPORTS_PREFIX + "+");
      mqttClient.subscribe(DB_NOTIFS_PREFIX + "+");
      if (currentRoomCode) mqttClient.subscribe(ROOM_TOPIC_PREFIX + currentRoomCode);
      if (currentUser) syncAccountToCloud(currentUser);
      sendNetPacket(LOBBY_TOPIC, { type: "ping_rooms" });
    });
    mqttClient.on("message", (topic, buf) => {
      try { const s = buf.toString(); if (s) onNetworkPacket(topic, JSON.parse(s)); } catch (e) {}
    });
  }
}

function syncAccountToCloud(acc) {
  if (!acc || !acc.emailKey) return;
  if (acc.isOwner) acc.banned = false;
  const safeAcc = {
    emailKey: acc.emailKey, username: acc.username, passHash: acc.passHash, avatar: acc.avatar,
    elo: acc.elo, wins: acc.wins || 0, losses: acc.losses || 0, draws: acc.draws || 0,
    banned: Boolean(acc.banned), isOwner: Boolean(acc.isOwner)
  };
  accountsRegistry[acc.emailKey] = safeAcc;
  localStorage.setItem("chessme_db_accounts_v2", JSON.stringify(accountsRegistry));
  populateLists(); renderAdminDashboard();
  const topic = DB_ACCOUNTS_PREFIX + acc.emailKey;
  if (localChannel) localChannel.postMessage({ topic, payload: safeAcc });
  if (mqttClient && mqttClient.connected) mqttClient.publish(topic, JSON.stringify(safeAcc), { retain: true });
}

function syncReportToCloud(rep) {
  if (!rep || !rep.id) return;
  reportsRegistry[rep.id] = rep;
  localStorage.setItem("chessme_db_reports_v2", JSON.stringify(reportsRegistry));
  renderAdminDashboard();
  const topic = DB_REPORTS_PREFIX + rep.id;
  if (localChannel) localChannel.postMessage({ topic, payload: rep });
  if (mqttClient && mqttClient.connected) mqttClient.publish(topic, JSON.stringify(rep), { retain: true });
}

function sendFairPlayNotification(targetEmailKey, title, messageText) {
  if (!targetEmailKey) return;
  const notif = { id: "notif_" + Date.now(), targetEmailKey, title, messageText, ts: Date.now() };
  const topic = DB_NOTIFS_PREFIX + targetEmailKey;
  if (localChannel) localChannel.postMessage({ topic, payload: notif });
  if (mqttClient && mqttClient.connected) mqttClient.publish(topic, JSON.stringify(notif), { retain: true });
}

function showOwnerToast(title, bodyText) {
  const toast = document.getElementById("ownerNotificationToast");
  if (!toast) return;
  document.getElementById("toastTitle").textContent = title;
  document.getElementById("toastBodyText").textContent = bodyText;
  toast.classList.remove("hidden");
  playSound("check");
}

function checkIfCurrentUserBanned() {
  if (!currentUser || !currentUser.emailKey) return;
  if (isCurrentUserOwner()) {
    document.getElementById("banScreenOverlay")?.classList.add("hidden");
    return;
  }
  const record = accountsRegistry[currentUser.emailKey];
  if (record && record.deleted) {
    currentUser = null;
    sessionStorage.removeItem("chessme_session_user_v2");
    localStorage.removeItem("chessme_user_acc_v2");
    openAccountModal();
    return;
  }
  document.getElementById("banScreenOverlay")?.classList.toggle("hidden", !Boolean(record?.banned || currentUser?.banned));
}

window.ownerToggleBan = function (eKey) {
  if (!isCurrentUserOwner()) return;
  const acc = accountsRegistry[eKey];
  if (!acc || acc.isOwner) return;
  acc.banned = !acc.banned;
  syncAccountToCloud(acc);
};

window.ownerDeleteAccount = function (eKey) {
  if (!isCurrentUserOwner()) return;
  const acc = accountsRegistry[eKey];
  if (!acc || acc.isOwner) return;
  if (!confirm(`Permanently DELETE account "${acc.username}"?`)) return;
  const deletedObj = { emailKey: eKey, username: acc.username, deleted: true };
  delete accountsRegistry[eKey];
  localStorage.setItem("chessme_db_accounts_v2", JSON.stringify(accountsRegistry));
  const topic = DB_ACCOUNTS_PREFIX + eKey;
  if (localChannel) localChannel.postMessage({ topic, payload: deletedObj });
  if (mqttClient && mqttClient.connected) mqttClient.publish(topic, JSON.stringify(deletedObj), { retain: true });
  populateLists(); renderAdminDashboard();
};

window.ownerResolveReport = function (repId, actionType) {
  if (!isCurrentUserOwner()) return;
  const rep = reportsRegistry[repId];
  if (!rep) return;
  const targetAcc = Object.values(accountsRegistry).find((a) => !a.deleted && a.username.toLowerCase() === rep.target.toLowerCase());

  if (actionType === "ban") {
    if (targetAcc && !targetAcc.isOwner) { targetAcc.banned = true; syncAccountToCloud(targetAcc); }
    rep.status = "✅ Approved • Target Banned"; rep.resolved = true;
    if (rep.reporterEmailKey) sendFairPlayNotification(rep.reporterEmailKey, "⚖️ Fair Play Action Taken!", `The Owner approved your report against "${rep.target}". Their account has been BANNED!`);
  } else if (actionType === "warn") {
    rep.status = "⚠️ Approved • Warning Sent"; rep.resolved = true;
    if (targetAcc) sendFairPlayNotification(targetAcc.emailKey, "⚠️ Official Fair Play Warning", `The Club Owner issued an official warning regarding "${rep.reason}". Play fair!`);
    if (rep.reporterEmailKey) sendFairPlayNotification(rep.reporterEmailKey, "⚖️ Report Reviewed", `The Owner reviewed your report against "${rep.target}" and issued an official warning.`);
  } else if (actionType === "reject") {
    rep.status = "❌ Reviewed • No Violation"; rep.resolved = true;
    if (rep.reporterEmailKey) sendFairPlayNotification(rep.reporterEmailKey, "ℹ️ Report Update", `The Owner reviewed your report against "${rep.target}" and found no Fair Play violation.`);
  } else if (actionType === "delete") {
    rep.deleted = true;
  }
  syncReportToCloud(rep);
};

function renderAdminDashboard() {
  const isOwner = isCurrentUserOwner();
  document.getElementById("openAdminModalBtn")?.classList.toggle("hidden", !isOwner);
  if (!isOwner) return;

  const activeReports = Object.values(reportsRegistry).filter((r) => !r.deleted).sort((a, b) => b.ts - a.ts);
  const pendingCount = activeReports.filter((r) => !r.resolved).length;
  const badge = document.getElementById("adminNotifBadge");
  if (badge) { badge.textContent = pendingCount; badge.classList.toggle("hidden", pendingCount === 0); }

  const repBox = document.getElementById("adminReportsList");
  if (repBox) {
    repBox.innerHTML = activeReports.length === 0 ? `<p class="muted-text">No active reports.</p>` : activeReports.map((r) => {
      const st = r.status ? `<span class="badge-pill" style="background:#1c251c;color:#81b64c;">${r.status}</span>` : `<span class="badge-pill" style="background:#ca3431;color:#fff;">PENDING</span>`;
      return `<div class="admin-row" style="flex-direction:column;align-items:flex-start;">
        <div style="display:flex;justify-content:space-between;width:100%;align-items:center;"><strong>🚨 Target: <span style="color:#ff6b6b;">${r.target}</span> • ${r.reason}</strong>${st}</div>
        <div class="muted-text">Reporter: ${r.reporter} • Note: "${r.note || "None"}"</div>
        <div class="muted-text" style="font-size:10px;">Moves: ${r.pgn || "N/A"}</div>
        <div style="display:flex;gap:5px;margin-top:6px;width:100%;">
          <button class="ctrl-btn danger-ctrl" style="flex:1;padding:4px;" onclick="ownerResolveReport('${r.id}','ban')">🔨 Ban & Notify</button>
          <button class="ctrl-btn" style="flex:1;padding:4px;border-color:#f5af19;color:#f5af19;" onclick="ownerResolveReport('${r.id}','warn')">⚠️ Warn & Notify</button>
          <button class="ctrl-btn" style="flex:1;padding:4px;" onclick="ownerResolveReport('${r.id}','reject')">❌ Clean</button>
          <button class="ctrl-btn" style="padding:4px 8px;" onclick="ownerResolveReport('${r.id}','delete')">🗑️</button>
        </div>
      </div>`;
    }).join("");
  }

  const accBox = document.getElementById("adminAccountsList");
  if (accBox) {
    const allAccs = Object.values(accountsRegistry).filter((a) => !a.deleted);
    accBox.innerHTML = allAccs.length === 0 ? `<p class="muted-text">No registered accounts yet.</p>` : allAccs.map((a) => {
      const eKey = a.emailKey;
      const stHtml = a.isOwner ? `<span class="badge-pill" style="background:#f5af19;color:#111;font-weight:900;">👑 OWNER (IMMUNE)</span>` : a.banned ? `<span style="color:#ff4757;font-weight:800;">[BANNED]</span>` : `<span style="color:#81b64c;">[Active]</span>`;
      const btns = a.isOwner ? `<span class="muted-text" style="font-size:11px;">Protected</span>` : `<div style="display:flex;gap:4px;">
        <button class="ctrl-btn" style="padding:4px 8px;background:${a.banned ? "#81b64c" : "#e69f00"};color:#fff;" onclick="ownerToggleBan('${eKey}')">${a.banned ? "✅ Unban" : "🚫 Ban"}</button>
        <button class="ctrl-btn danger-ctrl" style="padding:4px 8px;" onclick="ownerDeleteAccount('${eKey}')">🗑️ Delete</button>
      </div>`;
      return `<div class="admin-row"><div><strong>${a.avatar || "😎"} ${a.username} (${a.elo}) ${stHtml}</strong><div class="muted-text" style="font-size:10px;">W:${a.wins || 0} L:${a.losses || 0} D:${a.draws || 0}</div></div>${btns}</div>`;
    }).join("");
  }
}

function sendNetPacket(topic, data) {
  const packet = { ...data, senderId: myClientId };
  if (localChannel) localChannel.postMessage({ topic, payload: packet });
  if (mqttClient && mqttClient.connected) mqttClient.publish(topic, JSON.stringify(packet));
}

function createOnlineRoom() {
  if (!currentUser) { document.getElementById("onlineModal").classList.add("hidden"); openAccountModal(); return; }
  const code = String(Math.floor(1000 + Math.random() * 9000));
  currentRoomCode = code; isRoomHost = true; onlineMatchStarted = false; spectatorsSet.clear();
  document.getElementById("generatedRoomCode").textContent = code;
  document.getElementById("createdRoomInfo").classList.remove("hidden");
  if (mqttClient && mqttClient.connected) mqttClient.subscribe(ROOM_TOPIC_PREFIX + code);
  matchMode = "online"; playerColor = "w"; boardFlipped = false; resetMatch(true);
  document.getElementById("topName").textContent = "Waiting for Friend...";
  document.getElementById("roomStatusText").textContent = `🟢 Room #${code} Created • Waiting for opponent...`;
  announceRoomToLobby();
}

function announceRoomToLobby() {
  if (!isRoomHost || !currentRoomCode || !currentUser) return;
  sendNetPacket(LOBBY_TOPIC, { type: "room_open", code: currentRoomCode, hostName: currentUser.username, hostEmailKey: currentUser.emailKey, hostElo: currentUser.elo, time: selectedTimeSeconds });
}

window.joinOnlineRoom = function (code, asSpectator = false) {
  if (!currentUser) { document.getElementById("onlineModal").classList.add("hidden"); openAccountModal(); return; }
  const cleanCode = String(code).trim();
  if (!cleanCode || cleanCode.length < 4) return alert("Enter a valid 4-digit Room Code!");
  const roomInfo = openRoomsMap[cleanCode];
  if (!asSpectator && roomInfo && (roomInfo.hostName.toLowerCase() === currentUser.username.toLowerCase() || (roomInfo.hostEmailKey && roomInfo.hostEmailKey === currentUser.emailKey))) {
    return alert(`⚠️ You cannot play an Online Match against your own account ("${currentUser.username}")!`);
  }
  currentRoomCode = cleanCode; isRoomHost = false; onlineMatchStarted = false; spectatorsSet.clear();
  if (mqttClient && mqttClient.connected) mqttClient.subscribe(ROOM_TOPIC_PREFIX + cleanCode);
  document.getElementById("onlineModal").classList.add("hidden");
  matchMode = "online"; playerColor = asSpectator ? "spectator" : "b"; boardFlipped = playerColor === "b"; resetMatch(true);
  document.getElementById("roomStatusText").textContent = `⏳ Connecting to Room #${cleanCode}...`;
  sendNetPacket(ROOM_TOPIC_PREFIX + cleanCode, { type: "join_request", role: asSpectator ? "spectator" : "player", name: currentUser.username, emailKey: currentUser.emailKey, elo: currentUser.elo, avatar: currentUser.avatar });
};

function onNetworkPacket(topic, data) {
  if (!data) return;
  if (topic.startsWith(DB_ACCOUNTS_PREFIX)) {
    const eKey = topic.replace(DB_ACCOUNTS_PREFIX, "");
    if (data.deleted) delete accountsRegistry[eKey];
    else if (data.emailKey) { if (data.isOwner) data.banned = false; accountsRegistry[eKey] = data; }
    localStorage.setItem("chessme_db_accounts_v2", JSON.stringify(accountsRegistry));
    populateLists(); renderAdminDashboard(); checkIfCurrentUserBanned();
    return;
  }
  if (topic.startsWith(DB_REPORTS_PREFIX)) {
    if (data.deleted) delete reportsRegistry[data.id];
    else if (data.id) { const isNew = !reportsRegistry[data.id]; reportsRegistry[data.id] = data; if (isNew && isCurrentUserOwner()) playSound("check"); }
    localStorage.setItem("chessme_db_reports_v2", JSON.stringify(reportsRegistry));
    renderAdminDashboard();
    return;
  }
  if (topic.startsWith(DB_NOTIFS_PREFIX)) {
    if (currentUser && data.targetEmailKey === currentUser.emailKey) {
      const seenKey = "chessme_seen_" + data.id;
      if (!localStorage.getItem(seenKey)) { localStorage.setItem(seenKey, "1"); showOwnerToast(data.title, data.messageText); }
    }
    return;
  }
  if (data.senderId === myClientId) return;
  if (topic === LOBBY_TOPIC) {
    if (data.type === "room_open") { openRoomsMap[data.code] = data; renderLiveRoomsList(); }
    else if (data.type === "room_closed") { delete openRoomsMap[data.code]; renderLiveRoomsList(); }
    else if (data.type === "ping_rooms" && isRoomHost && currentRoomCode && !onlineMatchStarted) announceRoomToLobby();
    return;
  }
  if (topic !== ROOM_TOPIC_PREFIX + currentRoomCode) return;

  if (data.type === "join_request" && isRoomHost) {
    if (data.role === "player") {
      if (currentUser && ((data.name && data.name.toLowerCase() === currentUser.username.toLowerCase()) || (data.emailKey && data.emailKey === currentUser.emailKey))) {
        sendNetPacket(ROOM_TOPIC_PREFIX + currentRoomCode, { type: "join_rejected", reason: `Cannot play against your own account ("${currentUser.username}")!` });
        return;
      }
      onlineMatchStarted = true; updateBoardLockOverlay();
      document.getElementById("topName").textContent = data.name;
      document.getElementById("topElo").textContent = `(${data.elo || 1200})`;
      document.getElementById("topAvatar").textContent = data.avatar || "👤";
      document.getElementById("onlineModal").classList.add("hidden");
      document.getElementById("roomStatusText").textContent = `⚔️ Live Match vs ${data.name} (Room #${currentRoomCode})`;
      appendChatMessage("System", `⚔️ ${data.name} (${data.elo || 1200}) joined! Rated Match (Win +18 / Draw +2 / Loss -14)`, true);
      sendNetPacket(LOBBY_TOPIC, { type: "room_closed", code: currentRoomCode });
      sendNetPacket(ROOM_TOPIC_PREFIX + currentRoomCode, { type: "match_start", hostName: currentUser.username, hostElo: currentUser.elo, hostAvatar: currentUser.avatar, guestName: data.name, guestElo: data.elo || 1200, fen: game.fen(), whiteTime, blackTime, timeControl: selectedTimeSeconds, spectators: spectatorsSet.size });
    } else {
      spectatorsSet.add(data.senderId); updateSpectatorPill();
      appendChatMessage("System", `👁️ ${data.name} is now spectating!`, true);
      sendNetPacket(ROOM_TOPIC_PREFIX + currentRoomCode, { type: "spectator_sync", hostName: currentUser.username, guestName: document.getElementById("topName").textContent, fen: game.fen(), whiteTime, blackTime, spectators: spectatorsSet.size });
    }
  } else if (data.type === "join_rejected" && !isRoomHost) {
    currentRoomCode = null; onlineMatchStarted = false; updateBoardLockOverlay();
    alert(`⚠️ ${data.reason}`); openAccountModal();
  } else if (data.type === "match_start") {
    onlineMatchStarted = true; updateBoardLockOverlay();
    selectedTimeSeconds = data.timeControl || 180; whiteTime = data.whiteTime; blackTime = data.blackTime; game.load(data.fen);
    if (playerColor === "b") {
      document.getElementById("topName").textContent = data.hostName;
      document.getElementById("topElo").textContent = `(${data.hostElo || 1200})`;
      document.getElementById("topAvatar").textContent = data.hostAvatar || "👤";
      document.getElementById("roomStatusText").textContent = `⚔️ Live Match vs ${data.hostName} (Room #${currentRoomCode})`;
      appendChatMessage("System", `⚔️ Rated Match started vs ${data.hostName}!`, true);
    }
    renderBoard();
  } else if (data.type === "spectator_sync") {
    document.getElementById("spectatorCountPill").textContent = `👁️ ${data.spectators}`;
    if (playerColor === "spectator") {
      onlineMatchStarted = true; updateBoardLockOverlay();
      document.getElementById("bottomName").textContent = `${data.hostName} (W)`;
      document.getElementById("topName").textContent = `${data.guestName} (B)`;
      document.getElementById("roomStatusText").textContent = `👁️ Watching Room #${currentRoomCode}`;
      whiteTime = data.whiteTime; blackTime = data.blackTime; game.load(data.fen); renderBoard();
    }
  } else if (data.type === "move") {
    whiteTime = data.whiteTime; blackTime = data.blackTime;
    executeMove(data.from, data.to, data.promotion || "q", false, true);
  } else if (data.type === "draw_offer") {
    document.getElementById("drawOfferText").textContent = `🤝 ${data.fromName} offered a Draw!`;
    document.getElementById("drawOfferBanner").classList.remove("hidden");
  } else if (data.type === "draw_accept") {
    document.getElementById("drawOfferBanner").classList.add("hidden");
    handleGameOver("🤝 Draw by Agreement!", true);
  } else if (data.type === "draw_decline") {
    appendChatMessage("System", "❌ Draw offer declined.", true);
  } else if (data.type === "resign") {
    handleGameOver(`🏳️ ${data.fromName} Resigned! You Win!`, false, playerColor);
  } else if (data.type === "emote") {
    spawnEmote(data.symbol, true);
  } else if (data.type === "chat") {
    appendChatMessage(data.sender, data.text, false);
  } else if (data.type === "rematch") {
    resetMatch(true);
  }
}

function renderLiveRoomsList() {
  const listEl = document.getElementById("liveRoomsList");
  if (!listEl) return;
  const rooms = Object.values(openRoomsMap);
  listEl.innerHTML = rooms.length === 0 ? `<p class="muted-text" style="text-align:center;padding:6px;">No open rooms yet — create one above or enter code below!</p>` : rooms.map((r) => `
    <div class="live-room-item">
      <div><strong>⚔️ ${r.hostName} (${r.hostElo || 1200})</strong><span class="muted-text"> • ${Math.floor(r.time / 60)}m (#${r.code})</span></div>
      <div style="display:flex;gap:4px;">
        <button class="action-btn" style="padding:4px 10px;font-size:11px;" onclick="joinOnlineRoom('${r.code}',false)">Join</button>
        <button class="ctrl-btn" style="padding:4px 8px;font-size:11px;" onclick="joinOnlineRoom('${r.code}',true)">👁️</button>
      </div>
    </div>`).join("");
}

function updateSpectatorPill() { document.getElementById("spectatorCountPill").textContent = `👁️ ${spectatorsSet.size}`; }

// ============================================================================
// 5. CACHED ARCHIVE SYNC & BOARD RENDERING
// ============================================================================
async function extractAllSquadGames() {
  for (const bot of VIP_BOTS) {
    seedFallbackBookIntoFenRepertoire(bot);
    const cacheKey = `chessme_dna_v11_${bot.id}`;
    const cachedRaw = localStorage.getItem(cacheKey);
    if (cachedRaw) {
      try { const p = JSON.parse(cachedRaw); bot.repertoire = p.repertoire || bot.repertoire; bot.avatarUrl = p.avatarUrl || bot.avatarUrl; populateLists(); continue; } catch (e) {}
    }
    for (const uname of bot.usernames) {
      try {
        const profRes = await fetch(`https://api.chess.com/pub/player/${uname}`);
        if (profRes.ok) { const prof = await profRes.json(); if (prof.avatar && !bot.avatarUrl) bot.avatarUrl = prof.avatar; }
        const archRes = await fetch(`https://api.chess.com/pub/player/${uname}/games/archives`);
        if (!archRes.ok) continue;
        const archData = await archRes.json();
        const archiveUrls = (archData.archives || []).slice(-3);
        for (let i = archiveUrls.length - 1; i >= 0; i--) {
          const mRes = await fetch(archiveUrls[i]);
          if (!mRes.ok) continue;
          const mData = await mRes.json();
          (mData.games || []).forEach((g) => { if (g.pgn) learnOpeningsFromPgn(g.pgn, g.white?.username?.toLowerCase() === uname.toLowerCase(), bot.repertoire); });
        }
      } catch (err) {}
    }
    try { localStorage.setItem(cacheKey, JSON.stringify({ repertoire: bot.repertoire, avatarUrl: bot.avatarUrl })); } catch (e) {}
    populateLists();
  }
}

function seedFallbackBookIntoFenRepertoire(bot) {
  if (!bot.fallbackBook) return;
  Object.entries(bot.fallbackBook).forEach(([seqKey, movesObj]) => {
    const temp = new Chess();
    if (seqKey !== "start") { for (const san of seqKey.split(" ")) if (!temp.move(san)) return; }
    const fenKey = getFenKey(temp.fen());
    if (!bot.repertoire[fenKey]) bot.repertoire[fenKey] = {};
    Object.entries(movesObj).forEach(([san, weight]) => { bot.repertoire[fenKey][san] = (bot.repertoire[fenKey][san] || 0) + weight; });
  });
}

function learnOpeningsFromPgn(pgnString, botIsWhite, repertoire) {
  const body = pgnString.replace(/\[.*?\]\s*/g, "").replace(/\{.*?\}/g, "").replace(/\([^)]*\)/g, "");
  const tokens = body.split(/\s+/).map((t) => t.replace(/^\d+\.+/, "").trim()).filter((t) => t && !["1-0", "0-1", "1/2-1/2", "*"].includes(t) && !/^\$\d+$/.test(t));
  if (!tokens.length) return false;
  const tempChess = new Chess();
  for (let ply = 0; ply < Math.min(14, tokens.length); ply++) {
    const currentFenKey = getFenKey(tempChess.fen());
    const moveObj = tempChess.move(tokens[ply]);
    if (!moveObj) break;
    if ((ply % 2 === 0 && botIsWhite) || (ply % 2 === 1 && !botIsWhite)) {
      if (!repertoire[currentFenKey]) repertoire[currentFenKey] = {};
      repertoire[currentFenKey][moveObj.san] = (repertoire[currentFenKey][moveObj.san] || 0) + 1;
    }
  }
  return true;
}

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
  if (!(document.getElementById("soundToggle")?.checked ?? true)) return;
  if (audioCtx.state === "suspended") audioCtx.resume();
  const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  osc.type = type === "capture" ? "sawtooth" : type === "check" ? "sine" : "triangle";
  osc.frequency.setValueAtTime(type === "check" ? 580 : 180, now);
  osc.frequency.exponentialRampToValueAtTime(70, now + 0.08);
  gain.gain.setValueAtTime(0.35, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
  osc.start(now); osc.stop(now + 0.08);
}

function updateBoardLockOverlay() {
  const lockEl = document.getElementById("boardLockOverlay");
  if (lockEl) lockEl.classList.toggle("hidden", !(matchMode === "online" && !onlineMatchStarted && !isReviewMode && !matchEnded));
}

function renderBoard() {
  updateBoardLockOverlay();
  const boardEl = document.getElementById("chessboard"), frag = document.createDocumentFragment();
  const isViewingPast = viewPly < fenHistory.length - 1;
  const displayChess = isViewingPast ? new Chess(fenHistory[viewPly]) : game;
  const boardState = displayChess.board();

  document.getElementById("historyViewBanner")?.classList.toggle("hidden", !isViewingPast && !isReviewMode);

  let activeMoveSquares = [], activeBadge = null;
  if (viewPly > 0 && moveHistoryVerbose[viewPly - 1]) {
    const m = moveHistoryVerbose[viewPly - 1];
    activeMoveSquares = [m.from, m.to];
  }

  if (isReviewMode && viewPly > 0 && gameReviewList[viewPly - 1]) {
    const rev = gameReviewList[viewPly - 1];
    activeBadge = { square: rev.playedTo, icon: rev.icon, bg: rev.bg, sqClass: rev.sqClass };
    updateEvalBarUI(rev.evalWhitePawns);
    document.getElementById("reviewMoveComment").textContent = `Move ${Math.ceil(viewPly / 2)} (${rev.playedSan}): ${rev.label} (${rev.moveAcc.toFixed(0)}% Acc) • Best: ${rev.bestSan}`;
    setTimeout(() => drawReviewArrowOnBoard(rev.bestFrom, rev.bestTo, "#81b64c"), 10);
  } else if (matchMode === "bot" && !isViewingPast && playerMoveBadge) {
    activeBadge = playerMoveBadge; clearArrowCanvas();
  } else {
    clearArrowCanvas();
  }

  const files = ["a", "b", "c", "d", "e", "f", "g", "h"], ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
  const rOrder = boardFlipped ? [...ranks].reverse() : ranks, fOrder = boardFlipped ? [...files].reverse() : files;

  rOrder.forEach((rank, rIdx) => {
    fOrder.forEach((file, fIdx) => {
      const sqName = file + rank, realRow = 8 - parseInt(rank), realCol = files.indexOf(file);
      const piece = boardState[realRow][realCol];
      const sqDiv = document.createElement("div");
      sqDiv.className = `square ${(realRow + realCol) % 2 === 0 ? "light" : "dark"}`;
      if (!isViewingPast && selectedSquare === sqName) sqDiv.classList.add("selected");
      if (activeMoveSquares.includes(sqName)) sqDiv.classList.add("last-move");

      if (activeBadge && activeBadge.square === sqName) {
        if (activeBadge.sqClass) sqDiv.classList.add(activeBadge.sqClass);
        const badge = document.createElement("div");
        badge.className = "square-move-badge"; badge.style.backgroundColor = activeBadge.bg; badge.textContent = activeBadge.icon;
        sqDiv.appendChild(badge);
      }
      if (displayChess.in_check() && piece && piece.type === "k" && piece.color === displayChess.turn()) sqDiv.classList.add("in-check");

      if (fIdx === 0) { const rs = document.createElement("span"); rs.className = "coord-rank"; rs.textContent = rank; sqDiv.appendChild(rs); }
      if (rIdx === 7) { const fs = document.createElement("span"); fs.className = "coord-file"; fs.textContent = file; sqDiv.appendChild(fs); }

      if (piece) {
        const img = document.createElement("img");
        img.src = PIECE_SVGS[piece.color + piece.type]; img.className = "piece"; img.draggable = false;
        sqDiv.appendChild(img);
      }
      if (!isViewingPast && !isReviewMode && !matchEnded) {
        const legalMove = legalMovesForSelected.find((m) => m.to === sqName);
        if (legalMove) {
          const ind = document.createElement("div");
          ind.className = piece ? "legal-capture" : "legal-dot";
          sqDiv.appendChild(ind);
        }
      }
      sqDiv.addEventListener("click", () => onSquareClick(sqName));
      frag.appendChild(sqDiv);
    });
  });

  boardEl.replaceChildren(frag);
  updateCapturedPiecesAndClocksUI(displayChess);
  updateMoveHistoryStrip();
}

function updateEvalBarUI(evalWhitePawns) {
  const pct = Math.max(5, Math.min(95, 50 + evalWhitePawns * 7));
  document.getElementById("evalFillWhite").style.height = `${pct}%`;
  document.getElementById("evalScoreText").textContent = (evalWhitePawns >= 0 ? "+" : "") + evalWhitePawns.toFixed(1);
}

function updateMoveHistoryStrip() {
  const strip = document.getElementById("moveHistoryStrip");
  if (!strip) return;
  if (!moveHistoryVerbose.length) { strip.innerHTML = `<span class="muted-text">Start a match to record moves...</span>`; return; }
  let html = "";
  for (let i = 0; i < moveHistoryVerbose.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1, wMove = moveHistoryVerbose[i], bMove = moveHistoryVerbose[i + 1];
    html += `<span class="move-pair"><b>${moveNum}.</b> <span class="move-chip ${viewPly === i + 1 ? "active-ply" : ""}" onclick="jumpToPly(${i + 1})">${wMove.san}</span>`;
    if (bMove) html += `<span class="move-chip ${viewPly === i + 2 ? "active-ply" : ""}" onclick="jumpToPly(${i + 2})">${bMove.san}</span>`;
    html += `</span>`;
  }
  strip.innerHTML = html; strip.scrollTop = strip.scrollHeight; strip.scrollLeft = strip.scrollWidth;
}

window.jumpToPly = function (plyIndex) {
  viewPly = Math.max(0, Math.min(fenHistory.length - 1, plyIndex));
  selectedSquare = null; legalMovesForSelected = []; renderBoard();
};

function promptPawnPromotion(fromSq, toSq, color) {
  const overlay = document.getElementById("promoOverlay");
  if (!overlay) return executeMove(fromSq, toSq, "q", false, false);
  overlay.innerHTML = ["q", "n", "r", "b"].map((pt) => `<button class="promo-btn" data-pt="${pt}"><img src="${PIECE_SVGS[color + pt]}" /></button>`).join("");
  overlay.classList.remove("hidden");
  overlay.querySelectorAll(".promo-btn").forEach((btn) => {
    btn.addEventListener("click", () => { overlay.classList.add("hidden"); executeMove(fromSq, toSq, btn.dataset.pt, false, false); });
  });
}

function onSquareClick(sqName) {
  if (!currentUser) return openAccountModal();
  if (matchMode === "online" && !onlineMatchStarted) return;
  if (viewPly < fenHistory.length - 1 || isReviewMode || matchEnded) return;
  if (game.game_over() || playerColor === "spectator") return;
  if (matchMode === "bot" && game.turn() !== playerColor) return;
  if (matchMode === "online" && game.turn() !== playerColor) return;

  const moveObj = legalMovesForSelected.find((m) => m.to === sqName);
  if (moveObj) {
    if (moveObj.flags.includes("p")) promptPawnPromotion(moveObj.from, moveObj.to, game.turn());
    else executeMove(moveObj.from, moveObj.to, "q", false, false);
    return;
  }
  const piece = game.get(sqName);
  if (piece && piece.color === game.turn()) {
    selectedSquare = sqName;
    let moves = game.moves({ square: sqName, verbose: true });
    if (currentVariant === "nocastle") moves = moves.filter((m) => !m.flags.includes("k") && !m.flags.includes("q"));
    legalMovesForSelected = moves;
  } else {
    selectedSquare = null; legalMovesForSelected = [];
  }
  renderBoard();
}

function executeMove(from, to, promoPiece = "q", isBotMove = false, isNetworkMove = false) {
  const fenBefore = game.fen();
  const move = game.move({ from, to, promotion: promoPiece });
  if (!move) return;

  fenHistory.push(game.fen()); moveHistoryVerbose.push(move); viewPly = fenHistory.length - 1;
  const currentPlyIdx = moveHistoryVerbose.length - 1;
  selectedSquare = null; legalMovesForSelected = []; lastMoveSquares = [move.from, move.to]; playerMoveBadge = null;

  if (game.in_check()) { playSound("check"); checksCount[move.color]++; }
  else if (move.captured) playSound("capture");
  else playSound("move");

  if (matchMode === "puzzle") {
    const currentPuzzle = PUZZLE_BANK[currentPuzzleIdx];
    if (move.san === currentPuzzle.solutionSan || game.in_checkmate()) {
      puzzleStreak++; localStorage.setItem("chessme_puzzle_streak", String(puzzleStreak));
      document.getElementById("puzzleStreakVal").textContent = `${puzzleStreak} 🔥`;
      playerMoveBadge = { square: move.to, icon: "!!", bg: "#1baca6", sqClass: "brilliant-sq" }; renderBoard();
      setTimeout(() => { alert(`🎉 Puzzle Solved! Streak: ${puzzleStreak} 🔥`); currentPuzzleIdx = (currentPuzzleIdx + 1) % PUZZLE_BANK.length; loadNextPuzzle(); }, 300);
    } else {
      puzzleStreak = 0; localStorage.setItem("chessme_puzzle_streak", "0");
      document.getElementById("puzzleStreakVal").textContent = `0 🔥`;
      playerMoveBadge = { square: move.to, icon: "??", bg: "#ca3431", sqClass: "blunder-sq" }; renderBoard();
      setTimeout(() => { game.undo(); fenHistory.pop(); moveHistoryVerbose.pop(); viewPly = fenHistory.length - 1; playerMoveBadge = null; renderBoard(); }, 650);
    }
    return;
  }

  setTimeout(() => {
    const rev = analyzeSinglePly(fenBefore, move, currentPlyIdx + 1);
    gameReviewList[currentPlyIdx] = rev;
    if (matchMode === "bot" && !isBotMove) {
      playerMoveBadge = { square: move.to, icon: rev.icon, bg: rev.bg, sqClass: rev.sqClass };
      const pill = document.getElementById("moveQualityBadge");
      if (pill) { pill.textContent = rev.label; pill.style.backgroundColor = rev.bg; pill.classList.remove("hidden"); }
      if (rev.icon === "??" || rev.icon === "?") triggerBlunderRoast();
      renderBoard();
    }
  }, 10);

  startClockIfNeeded(); renderBoard();

  if (!isBotMove && !isNetworkMove && matchMode === "online" && currentRoomCode) {
    sendNetPacket(ROOM_TOPIC_PREFIX + currentRoomCode, { type: "move", from, to, promotion: promoPiece, whiteTime, blackTime });
  } else if (isBotMove) {
    lastPlayerMoveRecord = moveHistoryVerbose[moveHistoryVerbose.length - 2] || null;
    triggerScoreAwareBotDialogue(move, lastPlayerMoveRecord);
  }

  if (checkVariantWin(move)) return;
  if (game.game_over()) return handleGameOver();
  if (matchMode === "bot" && game.turn() !== playerColor) requestBotMove();
}

function checkVariantWin(move) {
  if (currentVariant === "koth" && move.piece === "k" && ["e4", "d4", "e5", "d5"].includes(move.to)) {
    handleGameOver(`⛰️ King of the Hill Victory! (${move.to.toUpperCase()})`); return true;
  }
  if (currentVariant === "3check" && checksCount[move.color] >= 3) {
    handleGameOver(`⚡ 3-Check Victory! (${checksCount.w} - ${checksCount.b})`); return true;
  }
  return false;
}

function updateCapturedPiecesAndClocksUI(chessRef = game) {
  const startCounts = { p: 8, n: 2, b: 2, r: 2, q: 1 }, currentW = { p: 0, n: 0, b: 0, r: 0, q: 0 }, currentB = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }, icons = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛" };
  let wScore = 0, bScore = 0;
  chessRef.board().forEach((row) => row.forEach((p) => {
    if (!p) return;
    if (p.color === "w") { wScore += values[p.type]; if (currentW[p.type] !== undefined) currentW[p.type]++; }
    else { bScore += values[p.type]; if (currentB[p.type] !== undefined) currentB[p.type]++; }
  }));
  let capW = "", capB = "";
  ["q", "r", "b", "n", "p"].forEach((t) => { capW += icons[t].repeat(Math.max(0, startCounts[t] - currentB[t])); capB += icons[t].repeat(Math.max(0, startCounts[t] - currentW[t])); });
  const diff = wScore - bScore, wAdv = diff > 0 ? ` +${diff}` : "", bAdv = diff < 0 ? ` +${Math.abs(diff)}` : "";
  if (playerColor !== "b") { document.getElementById("bottomCaptured").textContent = `${capW}${wAdv}`; document.getElementById("topCaptured").textContent = `${capB}${bAdv}`; }
  else { document.getElementById("bottomCaptured").textContent = `${capB}${bAdv}`; document.getElementById("topCaptured").textContent = `${capW}${wAdv}`; }
  const bottomSide = playerColor === "b" ? "b" : "w";
  document.getElementById("bottomClock")?.classList.toggle("active-clock", !matchEnded && game.turn() === bottomSide);
  document.getElementById("topClock")?.classList.toggle("active-clock", !matchEnded && game.turn() !== bottomSide);
}

function startClockIfNeeded() {
  if (clockInterval) return;
  clockInterval = setInterval(() => {
    if (game.game_over() || matchEnded) return clearInterval(clockInterval);
    if (game.turn() === "w") whiteTime = Math.max(0, whiteTime - 1);
    else blackTime = Math.max(0, blackTime - 1);
    const bottomSide = playerColor === "b" ? "b" : "w";
    const myTime = bottomSide === "w" ? whiteTime : blackTime, oppTime = bottomSide === "w" ? blackTime : whiteTime;
    const bClock = document.getElementById("bottomClock"), tClock = document.getElementById("topClock");
    bClock.textContent = formatTime(myTime); tClock.textContent = formatTime(oppTime);
    bClock.classList.toggle("low-time", myTime > 0 && myTime <= 20);
    tClock.classList.toggle("low-time", oppTime > 0 && oppTime <= 20);
    if (whiteTime === 0 || blackTime === 0) handleGameOver("⏰ Flagged on Time!", false, whiteTime === 0 ? "b" : "w");
  }, 1000);
}

function formatTime(sec) { return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`; }

function handleGameOver(customMessage = null, forceDraw = false, forcedWinnerColor = null) {
  if (matchEnded) return;
  matchEnded = true; clearInterval(clockInterval); clockInterval = null;
  document.getElementById("openReviewBtn")?.classList.remove("hidden");

  const isCheckmate = game.in_checkmate();
  const isDraw = forceDraw || (!isCheckmate && !customMessage && !forcedWinnerColor);
  const winnerSide = forcedWinnerColor || (isCheckmate ? (game.turn() === "w" ? "b" : "w") : null);
  const playerWon = winnerSide && winnerSide === playerColor;

  let drawReason = "Match Drawn";
  if (game.in_stalemate()) drawReason = "Draw by Stalemate";
  else if (game.in_threefold_repetition()) drawReason = "Draw by 3-Fold Repetition";
  else if (game.insufficient_material()) drawReason = "Draw by Insufficient Material";

  if (currentUser && (matchMode === "online" || matchMode === "bot") && playerColor !== "spectator" && moveHistoryVerbose.length >= 4) {
    if (isDraw) { currentUser.draws = (currentUser.draws || 0) + 1; currentUser.elo += 2; }
    else if (playerWon) { currentUser.wins = (currentUser.wins || 0) + 1; currentUser.elo += 18; }
    else { currentUser.losses = (currentUser.losses || 0) + 1; currentUser.elo = Math.max(400, currentUser.elo - 14); }
    sessionStorage.setItem("chessme_session_user_v2", JSON.stringify(currentUser));
    localStorage.setItem("chessme_user_acc_v2", JSON.stringify(currentUser));
    syncAccountToCloud(currentUser); updateTopCardUI();
  }
  openPostGameReviewModal(isDraw, playerWon, winnerSide, customMessage || (isDraw ? drawReason : null));
}

function openPostGameReviewModal(isDraw = false, playerWon = false, winnerSide = "w", customMessage = null) {
  ensureAllMovesReviewed();
  const modal = document.getElementById("gameOverModal");
  document.getElementById("modalTitle").textContent = isDraw ? "🤝 Draw!" : playerWon ? "🏆 Victory!" : "🏁 Game Over!";
  document.getElementById("modalSubtitle").textContent = customMessage || (winnerSide ? `${winnerSide === "w" ? "White" : "Black"} wins by Checkmate!` : "Match Drawn");

  const wRevs = gameReviewList.filter((r) => r && r.color === "w");
  const bRevs = gameReviewList.filter((r) => r && r.color === "b");
  document.getElementById("revWhiteName").textContent = playerColor === "b" ? document.getElementById("topName").textContent : document.getElementById("bottomName").textContent;
  document.getElementById("revBlackName").textContent = playerColor === "b" ? document.getElementById("bottomName").textContent : document.getElementById("topName").textContent;
  document.getElementById("revWhiteAcc").textContent = wRevs.length ? `${(wRevs.reduce((s, r) => s + r.moveAcc, 0) / wRevs.length).toFixed(1)}%` : "— (0 moves)";
  document.getElementById("revBlackAcc").textContent = bRevs.length ? `${(bRevs.reduce((s, r) => s + r.moveAcc, 0) / bRevs.length).toFixed(1)}%` : "— (0 moves)";

  const myColor = playerColor === "b" ? "b" : "w";
  const myRevs = gameReviewList.filter((r) => r && r.color === myColor);
  const counts = { "!!": 0, "!": 0, best: 0, "?!": 0, "?": 0, "??": 0 };
  let worst = null;
  myRevs.forEach((r) => {
    if (r.icon === "!!") counts["!!"]++;
    else if (r.icon === "!") counts["!"]++;
    else if (r.icon === "?!") counts["?!"]++;
    else if (r.icon === "?") counts["?"]++;
    else if (r.icon === "??") counts["??"]++;
    else counts.best++;
    if (r.winProbDrop >= 12 && (!worst || r.winProbDrop > worst.winProbDrop)) worst = r;
  });

  document.getElementById("revBrilliant").textContent = counts["!!"];
  document.getElementById("revGreat").textContent = counts["!"];
  document.getElementById("revBest").textContent = counts.best;
  document.getElementById("revInacc").textContent = counts["?!"];
  document.getElementById("revMistake").textContent = counts["?"];
  document.getElementById("revBlunder").textContent = counts["??"];

  const worstBox = document.getElementById("worstBlunderReport");
  if (!myRevs.length) worstBox.textContent = `ℹ️ No moves played by ${myColor === "w" ? "White" : "Black"}.`;
  else if (worst) worstBox.textContent = `🥐 Key Moment: Move ${Math.ceil(worst.ply / 2)} (${worst.playedSan}) lost ${worst.winProbDrop.toFixed(0)}% Win Prob — Best was ${worst.bestSan}!`;
  else worstBox.textContent = `✨ Zero major blunders detected — Clean game!`;

  document.getElementById("roastAuthor").textContent = matchMode === "bot" ? activeBot.name : "Match Summary";
  let reaction = "";
  if (matchMode === "bot") {
    reaction = isDraw ? activeBot.drawReaction : playerWon ? activeBot.lossReaction : activeBot.winReaction;
    showBotBubble(reaction);
  } else {
    reaction = isDraw ? "🤝 تعادل قوي بين الطرفين!" : playerWon ? "🔥 عاش يا بطل! جيم عالمي!" : "هارد لك! تعال ريماتش وعوضها 🔥";
  }
  document.getElementById("roastText").textContent = reaction;
  modal.classList.remove("hidden");
}

function enterInteractiveBoardReview() {
  if (!moveHistoryVerbose.length) return;
  ensureAllMovesReviewed();
  document.getElementById("gameOverModal").classList.add("hidden");
  isReviewMode = true;
  document.getElementById("evalBarContainer")?.classList.remove("hidden");
  document.getElementById("reviewModeBanner")?.classList.remove("hidden");
  jumpToPly(1);
}

// ============================================================================
// 6. UI HELPERS, MANDATORY AUTH & EVENT LISTENERS
// ============================================================================
function setAuthTabMode(mode) {
  authMode = mode;
  document.getElementById("tabBtnSignup")?.classList.toggle("active", mode === "signup");
  document.getElementById("tabBtnLogin")?.classList.toggle("active", mode === "login");
  document.getElementById("signupUsernameSection")?.classList.toggle("hidden", mode === "login");
  document.getElementById("avatarPickerSection")?.classList.toggle("hidden", mode === "login");
  document.getElementById("saveAccountBtn").textContent = mode === "signup" ? "📝 Create Verified Account" : "🔐 Log In with Email";
  document.getElementById("accErrorMsg")?.classList.add("hidden");
}

function openAccountModal() {
  const sessionBox = document.getElementById("currentSessionBox"), closeBtn = document.getElementById("closeAccountModalBtn");
  if (currentUser) {
    sessionBox?.classList.remove("hidden"); closeBtn?.classList.remove("hidden");
    document.getElementById("currentSessionText").innerHTML = `Logged in: <b>${currentUser.avatar} ${currentUser.username}</b>`;
  } else {
    sessionBox?.classList.add("hidden"); closeBtn?.classList.add("hidden");
  }
  document.getElementById("accErrorMsg")?.classList.add("hidden");
  document.getElementById("accountModal").classList.remove("hidden");
}

function appendChatMessage(sender, text, isSystem = false) {
  const box = document.getElementById("chatMessagesBox");
  if (!box) return;
  const div = document.createElement("div");
  div.className = `chat-msg ${isSystem ? "system-msg" : ""}`;
  div.innerHTML = isSystem ? text : `<b>${sender}:</b> ${text}`;
  box.appendChild(div); box.scrollTop = box.scrollHeight;
}

function updateTopCardUI() {
  const botCoachHeader = document.getElementById("botCoachHeader"), onlineBar = document.getElementById("onlineStatusBar"), hintBtn = document.getElementById("hintMoveBtn");
  document.getElementById("openAdminModalBtn")?.classList.toggle("hidden", !isCurrentUserOwner());

  const myName = currentUser ? currentUser.username : "Not Logged In";
  const myElo = currentUser ? currentUser.elo : 1200;
  const myAv = currentUser ? currentUser.avatar : "😎";

  document.getElementById("bottomName").textContent = myName;
  document.getElementById("bottomElo").textContent = `(${myElo})`;
  document.getElementById("bottomAvatar").textContent = myAv;
  document.getElementById("openAccountModalBtn").textContent = currentUser ? `👤 ${myName}` : "👤 Log In";

  if (matchMode === "bot") {
    botCoachHeader?.classList.remove("hidden"); onlineBar?.classList.add("hidden"); hintBtn?.classList.remove("hidden");
    document.getElementById("topName").textContent = activeBot.name;
    document.getElementById("topElo").textContent = `(${activeBot.elo})`;
    const avHtml = activeBot.avatarUrl ? `<img src="${activeBot.avatarUrl}" alt="${activeBot.name}" />` : activeBot.avatar;
    document.getElementById("topAvatar").innerHTML = avHtml; document.getElementById("botSpeechAvatar").innerHTML = avHtml;
    showBotBubble(activeBot.greeting);
  } else {
    botCoachHeader?.classList.add("hidden"); onlineBar?.classList.remove("hidden");
    hintBtn?.classList.toggle("hidden", matchMode === "online");
    if (!currentRoomCode) {
      document.getElementById("topAvatar").textContent = "👤"; document.getElementById("topElo").textContent = "(1200)";
      document.getElementById("topName").textContent = matchMode === "pass" ? "Player 2" : "Waiting for Opponent...";
    }
  }
}

function showBotBubble(text) {
  const coachText = document.getElementById("coachSpeechText");
  if (!coachText) return;
  coachText.textContent = text; coachText.classList.remove("bubble-pop");
  void coachText.offsetWidth; coachText.classList.add("bubble-pop");
}

function spawnEmote(symbol, fromNetwork = false) {
  const stage = document.getElementById("emoteStage"), el = document.createElement("div");
  el.className = "floating-emote"; el.textContent = symbol; el.style.left = `${15 + Math.random() * 70}%`;
  stage.appendChild(el); setTimeout(() => el.remove(), 1600);
  if (!fromNetwork && matchMode === "online" && currentRoomCode) sendNetPacket(ROOM_TOPIC_PREFIX + currentRoomCode, { type: "emote", symbol });
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
  document.getElementById(tabId)?.classList.add("active");
  document.querySelector(`.nav-item[data-target="${tabId}"]`)?.classList.add("active");
}

window.startBotMatch = function (botId) {
  if (!currentUser) return openAccountModal();
  activeBot = VIP_BOTS.find((b) => b.id === botId) || VIP_BOTS[2];
  matchMode = "bot"; onlineMatchStarted = true; currentVariant = "standard"; currentRoomCode = null; playerColor = "w"; boardFlipped = false;
  resetMatch(true); switchTab("tab-play");
};

window.startPassAndPlay = function () {
  if (!currentUser) return openAccountModal();
  matchMode = "pass"; onlineMatchStarted = true; currentVariant = "standard"; currentRoomCode = null; playerColor = "w"; boardFlipped = false;
  resetMatch(true); document.getElementById("roomStatusText").textContent = "📱 Pass & Play (2 Players on 1 Device • Unrated)"; switchTab("tab-play");
};

window.setVariant = function (variant) {
  if (!currentUser) return openAccountModal();
  matchMode = "bot"; onlineMatchStarted = true; currentVariant = variant; resetMatch(true); switchTab("tab-play");
};

window.loadNextPuzzle = function () {
  if (!currentUser) return openAccountModal();
  matchMode = "puzzle"; onlineMatchStarted = true; currentVariant = "puzzle";
  const p = PUZZLE_BANK[currentPuzzleIdx]; game.load(p.fen);
  fenHistory = [game.fen()]; moveHistoryVerbose = []; viewPly = 0; isReviewMode = false; matchEnded = false;
  selectedSquare = null; legalMovesForSelected = []; playerMoveBadge = null;
  document.getElementById("openReviewBtn")?.classList.add("hidden");
  document.getElementById("puzzleTitleText").textContent = p.title;
  document.getElementById("roomStatusText").textContent = `🧩 ${p.title} (White to Move)`;
  switchTab("tab-play"); renderBoard();
};

function resetMatch(fromNetwork = false) {
  game.reset(); clearInterval(clockInterval); clockInterval = null;
  whiteTime = selectedTimeSeconds; blackTime = selectedTimeSeconds; checksCount = { w: 0, b: 0 };
  fenHistory = [game.fen()]; moveHistoryVerbose = []; viewPly = 0; isReviewMode = false; matchEnded = false; gameReviewList = [];
  selectedSquare = null; legalMovesForSelected = []; lastMoveSquares = []; playerMoveBadge = null; lastPlayerMoveRecord = null;

  document.getElementById("openReviewBtn")?.classList.add("hidden");
  document.getElementById("evalBarContainer")?.classList.add("hidden");
  document.getElementById("reviewModeBanner")?.classList.add("hidden");
  document.getElementById("drawOfferBanner")?.classList.add("hidden");
  document.getElementById("promoOverlay")?.classList.add("hidden");
  document.getElementById("moveQualityBadge")?.classList.add("hidden");

  const bClock = document.getElementById("bottomClock"), tClock = document.getElementById("topClock");
  bClock.textContent = formatTime(selectedTimeSeconds); tClock.textContent = formatTime(selectedTimeSeconds);
  bClock.classList.remove("low-time"); tClock.classList.remove("low-time");

  updateTopCardUI();
  document.getElementById("gameOverModal").classList.add("hidden");
  renderBoard();

  if (!fromNetwork && matchMode === "online" && currentRoomCode) sendNetPacket(ROOM_TOPIC_PREFIX + currentRoomCode, { type: "rematch" });
  if (matchMode === "bot" && playerColor === "b") setTimeout(requestBotMove, 350);
}

function populateLists() {
  const botListEl = document.getElementById("botList");
  if (botListEl) {
    botListEl.innerHTML = VIP_BOTS.map((b) => {
      const crownsHtml = "👑".repeat(b.crowns) + '<span style="opacity:0.25;">' + "👑".repeat(3 - b.crowns) + "</span>";
      return `<div class="bot-card">
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="avatar" style="border:2px solid #81b64c;">${b.avatarUrl ? `<img src="${b.avatarUrl}" style="width:100%;height:100%;object-fit:cover;"/>` : b.avatar}</div>
          <div>
            <div style="display:flex;align-items:center;gap:6px;"><strong style="font-size:15px;">${b.name}</strong><span class="badge-pill">${b.elo}</span><span style="font-size:12px;">🇪🇬</span></div>
            <p class="muted-text" style="margin-top:2px;">${b.style}</p>
            <div style="font-size:11px;margin-top:4px;">${crownsHtml}</div>
          </div>
        </div>
        <button class="action-btn" onclick="startBotMatch('${b.id}')">Play</button>
      </div>`;
    }).join("");
  }

  const rankListEl = document.getElementById("leaderboardList");
  if (rankListEl) {
    const accountsList = Object.values(accountsRegistry).filter((a) => !a.deleted && !a.banned).sort((a, b) => b.elo - a.elo);
    rankListEl.innerHTML = accountsList.length === 0 ? `<div class="card-box"><p class="muted-text" style="text-align:center;">No verified accounts yet — Sign Up to claim #1 on the Leaderboard!</p></div>` : accountsList.map((acc, idx) => {
      const badge = acc.isOwner ? "👑 Club Owner" : idx === 0 ? "🏆 Season King" : idx === accountsList.length - 1 && accountsList.length > 1 ? "🪵 Wood Division" : "⚔️ VIP";
      return `<div class="rank-row">
        <div style="display:flex;align-items:center;gap:10px;">
          <strong>#${idx + 1}</strong><div class="mini-avatar">${acc.avatar || "😎"}</div>
          <div><strong>${acc.username}</strong><span class="badge-pill" style="margin-left:6px;">${badge}</span><p class="muted-text" style="font-size:11px;">W: ${acc.wins || 0} • L: ${acc.losses || 0} • D: ${acc.draws || 0}</p></div>
        </div>
        <strong style="font-size:15px;color:#81b64c;">${acc.elo} Elo</strong>
      </div>`;
    }).join("");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  VIP_BOTS.forEach(seedFallbackBookIntoFenRepertoire);
  populateLists();

  matchMode = "online"; onlineMatchStarted = false;
  resetMatch(true); initOnlineNetwork(); extractAllSquadGames();
  checkIfCurrentUserBanned(); renderAdminDashboard();

  document.getElementById("puzzleStreakVal").textContent = `${puzzleStreak} 🔥`;
  if (!currentUser) openAccountModal();

  const invitedRoom = new URLSearchParams(window.location.search).get("room");
  if (invitedRoom) {
    document.getElementById("joinRoomInput").value = invitedRoom;
    if (currentUser) document.getElementById("onlineModal").classList.remove("hidden");
  }

  document.getElementById("closeToastBtn")?.addEventListener("click", () => document.getElementById("ownerNotificationToast").classList.add("hidden"));
  document.getElementById("overlayPlayOnlineBtn")?.addEventListener("click", () => {
    if (!currentUser) return openAccountModal();
    sendNetPacket(LOBBY_TOPIC, { type: "ping_rooms" });
    document.getElementById("onlineModal").classList.remove("hidden");
  });
  document.getElementById("overlayPlayBotsBtn")?.addEventListener("click", () => switchTab("tab-bots"));

  document.getElementById("tabBtnSignup")?.addEventListener("click", () => setAuthTabMode("signup"));
  document.getElementById("tabBtnLogin")?.addEventListener("click", () => setAuthTabMode("login"));

  const doLogout = () => {
    currentUser = null;
    sessionStorage.removeItem("chessme_session_user_v2");
    localStorage.removeItem("chessme_user_acc_v2");
    document.getElementById("accEmailInput").value = "";
    document.getElementById("accUsernameInput").value = "";
    document.getElementById("accPinInput").value = "";
    document.getElementById("banScreenOverlay")?.classList.add("hidden");
    updateTopCardUI(); openAccountModal();
  };
  document.getElementById("logoutBtn")?.addEventListener("click", doLogout);
  document.getElementById("bannedSwitchAccBtn")?.addEventListener("click", doLogout);

  let selectedAv = currentUser?.avatar || "😎";
  document.querySelectorAll(".av-choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".av-choice").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active"); selectedAv = btn.dataset.av;
    });
  });

  document.getElementById("saveAccountBtn")?.addEventListener("click", () => {
    const email = document.getElementById("accEmailInput").value.trim().toLowerCase();
    const uname = document.getElementById("accUsernameInput").value.trim();
    const pass = document.getElementById("accPinInput").value.trim();
    const errEl = document.getElementById("accErrorMsg");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errEl.textContent = "❌ Please enter a valid Email address (e.g. name@gmail.com)!";
      errEl.classList.remove("hidden"); return;
    }
    if (pass.length < 4) {
      errEl.textContent = "❌ Password must be at least 4 characters!";
      errEl.classList.remove("hidden"); return;
    }

    const eKey = emailToKey(email);
    const pHash = hashPassword(email, pass);
    const existingByEmail = accountsRegistry[eKey];

    if (authMode === "signup") {
      if (uname.length < 2) {
        errEl.textContent = "❌ Please enter a Display Username (2+ characters)!";
        errEl.classList.remove("hidden"); return;
      }
      if (existingByEmail && !existingByEmail.deleted) {
        errEl.textContent = `❌ This email is already registered! Switch to "🔐 Log In".`;
        errEl.classList.remove("hidden"); return;
      }
      const unameTaken = Object.values(accountsRegistry).some((a) => !a.deleted && a.username.toLowerCase() === uname.toLowerCase());
      if (unameTaken) {
        errEl.textContent = `❌ Username "${uname}" is already taken! Pick another username.`;
        errEl.classList.remove("hidden"); return;
      }
      currentUser = {
        emailKey: eKey, username: uname, passHash: pHash, avatar: selectedAv,
        elo: 1200, wins: 0, losses: 0, draws: 0, banned: false, isOwner: isEmailOwner(email)
      };
    } else {
      if (!existingByEmail || existingByEmail.deleted) {
        errEl.textContent = `❌ No account found for this email! Switch to "📝 Sign Up".`;
        errEl.classList.remove("hidden"); return;
      }
      if (existingByEmail.passHash !== pHash) {
        errEl.textContent = "❌ Incorrect password for this email!";
        errEl.classList.remove("hidden"); return;
      }
      currentUser = existingByEmail;
      if (isEmailOwner(email)) currentUser.isOwner = true;
    }

    sessionStorage.setItem("chessme_session_user_v2", JSON.stringify(currentUser));
    localStorage.setItem("chessme_user_acc_v2", JSON.stringify(currentUser));
    syncAccountToCloud(currentUser); updateTopCardUI(); renderAdminDashboard(); checkIfCurrentUserBanned();
    errEl.classList.add("hidden"); document.getElementById("accountModal").classList.add("hidden");
  });

  document.getElementById("openAccountModalBtn")?.addEventListener("click", openAccountModal);
  document.getElementById("switchAccountBtn")?.addEventListener("click", openAccountModal);
  document.getElementById("closeAccountModalBtn")?.addEventListener("click", () => {
    if (currentUser) document.getElementById("accountModal").classList.add("hidden");
  });

  document.getElementById("openReportModalBtn")?.addEventListener("click", () => {
    const oppName = document.getElementById("topName").textContent;
    if (oppName && !oppName.includes("Waiting")) document.getElementById("reportTargetInput").value = oppName;
    document.getElementById("reportModal").classList.remove("hidden");
  });
  document.getElementById("closeReportModalBtn")?.addEventListener("click", () => document.getElementById("reportModal").classList.add("hidden"));
  document.getElementById("submitReportBtn")?.addEventListener("click", () => {
    const target = document.getElementById("reportTargetInput").value.trim();
    const reason = document.getElementById("reportReasonSelect").value;
    const note = document.getElementById("reportNoteInput").value.trim();
    if (!target) return alert("Enter the username of the player you are reporting!");
    const rep = {
      id: "rep_" + Date.now(), reporter: currentUser ? currentUser.username : "Player",
      reporterEmailKey: currentUser ? currentUser.emailKey : "", target, reason, note,
      pgn: moveHistoryVerbose.map((m) => m.san).join(" "), status: "", resolved: false, ts: Date.now()
    };
    syncReportToCloud(rep);
    document.getElementById("reportNoteInput").value = "";
    document.getElementById("reportModal").classList.add("hidden");
    alert("🚨 Report submitted to Club Owner! You will receive a live notification once reviewed.");
  });

  document.getElementById("openAdminModalBtn")?.addEventListener("click", () => {
    if (!isCurrentUserOwner()) return;
    renderAdminDashboard(); document.getElementById("adminModal").classList.remove("hidden");
  });
  document.getElementById("closeAdminModalBtn")?.addEventListener("click", () => document.getElementById("adminModal").classList.add("hidden"));

  document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.target)));
  document.querySelectorAll(".emote-btn").forEach((btn) => btn.addEventListener("click", () => spawnEmote(btn.dataset.emote, false)));

  const sendChat = () => {
    const input = document.getElementById("quickChatInput"), msg = input?.value?.trim();
    if (!msg) return;
    input.value = "";
    const sender = currentUser ? currentUser.username : "VIP";
    appendChatMessage(sender, msg, false);
    if (matchMode === "online" && currentRoomCode) sendNetPacket(ROOM_TOPIC_PREFIX + currentRoomCode, { type: "chat", sender, text: msg });
  };
  document.getElementById("sendChatBtn")?.addEventListener("click", sendChat);
  document.getElementById("quickChatInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });

  document.getElementById("firstMoveBtn")?.addEventListener("click", () => jumpToPly(0));
  document.getElementById("prevMoveBtn")?.addEventListener("click", () => jumpToPly(viewPly - 1));
  document.getElementById("nextMoveBtn")?.addEventListener("click", () => jumpToPly(viewPly + 1));
  const exitReviewToLive = () => {
    isReviewMode = false;
    document.getElementById("evalBarContainer")?.classList.add("hidden");
    document.getElementById("reviewModeBanner")?.classList.add("hidden");
    jumpToPly(fenHistory.length - 1);
  };
  document.getElementById("lastMoveBtn")?.addEventListener("click", exitReviewToLive);
  document.getElementById("exitReviewModeBtn")?.addEventListener("click", exitReviewToLive);

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "ArrowLeft") jumpToPly(viewPly - 1);
    else if (e.key === "ArrowRight") jumpToPly(viewPly + 1);
  });

  document.getElementById("offerDrawBtn")?.addEventListener("click", () => {
    if (game.game_over() || matchEnded || moveHistoryVerbose.length < 2) return;
    if (matchMode === "online" && currentRoomCode) {
      sendNetPacket(ROOM_TOPIC_PREFIX + currentRoomCode, { type: "draw_offer", fromName: currentUser?.username || "Opponent" });
      appendChatMessage("System", "🤝 Draw offer sent to opponent...", true);
    } else if (matchMode === "bot") {
      if (Math.abs(evaluateBoardStatic(game)) <= 130) handleGameOver("🤝 Bot accepted your Draw offer!", true);
      else showBotBubble("تعادل إيه يا عم؟ كمل الجيم للأخر! 😂🔥");
    }
  });

  document.getElementById("acceptDrawBtn")?.addEventListener("click", () => {
    document.getElementById("drawOfferBanner").classList.add("hidden");
    if (currentRoomCode) sendNetPacket(ROOM_TOPIC_PREFIX + currentRoomCode, { type: "draw_accept" });
    handleGameOver("🤝 Draw by Agreement!", true);
  });

  document.getElementById("declineDrawBtn")?.addEventListener("click", () => {
    document.getElementById("drawOfferBanner").classList.add("hidden");
    if (currentRoomCode) sendNetPacket(ROOM_TOPIC_PREFIX + currentRoomCode, { type: "draw_decline" });
  });

  document.getElementById("resignBtn")?.addEventListener("click", () => {
    if (game.game_over() || matchEnded || !moveHistoryVerbose.length) return;
    if (!confirm("Are you sure you want to resign this match?")) return;
    const oppSide = playerColor === "b" ? "w" : "b";
    if (matchMode === "online" && currentRoomCode) sendNetPacket(ROOM_TOPIC_PREFIX + currentRoomCode, { type: "resign", fromName: currentUser?.username || "Player" });
    handleGameOver("🏳️ Match ended by Resignation", false, oppSide);
  });

  document.getElementById("openReviewBtn")?.addEventListener("click", () => {
    if (matchEnded) document.getElementById("gameOverModal").classList.remove("hidden");
  });
  document.getElementById("closeGameOverModalBtn")?.addEventListener("click", () => document.getElementById("gameOverModal").classList.add("hidden"));
  document.getElementById("stepReviewBoardBtn")?.addEventListener("click", enterInteractiveBoardReview);

  const openOnlineModal = () => {
    if (!currentUser) return openAccountModal();
    sendNetPacket(LOBBY_TOPIC, { type: "ping_rooms" });
    document.getElementById("onlineModal").classList.remove("hidden");
  };
  document.getElementById("openOnlineModalBtn")?.addEventListener("click", openOnlineModal);
  document.getElementById("newOnlineBtn")?.addEventListener("click", () => {
    if (matchMode === "bot") resetMatch(true);
    else openOnlineModal();
  });
  document.getElementById("closeOnlineModalBtn")?.addEventListener("click", () => document.getElementById("onlineModal").classList.add("hidden"));

  document.querySelectorAll(".time-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".time-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active"); selectedTimeSeconds = parseInt(btn.dataset.time, 10); resetMatch(true);
    });
  });

  document.getElementById("createRoomBtn")?.addEventListener("click", createOnlineRoom);
  document.getElementById("joinAsPlayerBtn")?.addEventListener("click", () => joinOnlineRoom(document.getElementById("joinRoomInput").value.trim(), false));
  document.getElementById("joinAsSpectatorBtn")?.addEventListener("click", () => joinOnlineRoom(document.getElementById("joinRoomInput").value.trim(), true));

  document.getElementById("copyRoomLinkBtn")?.addEventListener("click", () => {
    if (!currentRoomCode) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${currentRoomCode}`;
    navigator.clipboard?.writeText(url);
    alert(`Room #${currentRoomCode} Link Copied!\nSend this on WhatsApp:\n${url}`);
  });

  document.getElementById("flipBoardBtn")?.addEventListener("click", () => { boardFlipped = !boardFlipped; renderBoard(); });

  document.getElementById("hintMoveBtn")?.addEventListener("click", () => {
    if (game.game_over() || matchMode === "online") return;
    const best = computeBestBotMove(VIP_BOTS[0]);
    if (best) { selectedSquare = best.from; legalMovesForSelected = [best]; renderBoard(); }
  });

  document.getElementById("playAgainBtn")?.addEventListener("click", () => resetMatch(false));
  document.getElementById("boardThemeSelect")?.addEventListener("change", (e) => { document.body.dataset.theme = e.target.value; });
});
// === END OF APP.JS (100% COMPLETE) ===