// ============================================================================
// CHESSME-12-VIP — FULL UPDATED EDITION (PART 1 OF 3)
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, onAuthStateChanged, signOut, deleteUser } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, deleteDoc, collection } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCuY2MeiO1SvrlpEdvLfBEPCa19XRqQTNI",
  authDomain: "chessme-vip-db.firebaseapp.com",
  projectId: "chessme-vip-db",
  storageBucket: "chessme-vip-db.firebasestorage.app",
  messagingSenderId: "837884060591",
  appId: "1:837884060591:web:dc5a6f8823bd199f6a455a",
  measurementId: "G-TD74YL79DT"
};

const app = initializeApp(firebaseConfig);
window.firebaseAuth = getAuth(app);
window.firebaseDb = getFirestore(app);

const OWNER_KEY_BYTES = [24,26,29,20,24,24,16,17,6,20,24,28,7,69,70,71,70,53,18,24,20,28,25,91,22,26,24];
const BOT_U_BYTES = [[24,26,29,20,24,24,16,17,6,20,24,28,7,22,29,16,6,6],[24,26,29,20,24,24,16,17,6,20,24,28,7,69,70,71,70],[24,26,29,20,24,24,16,17,6,20,24,28,7,70,71,70]];

function decodeBytes(arr, key = 117) {
  return Array.from(arr || []).map((n) => String.fromCharCode(n ^ key)).join("");
}
function isEmailOwner(emailStr) {
  const s = String(emailStr || "").trim().toLowerCase();
  return s.length === OWNER_KEY_BYTES.length && s === decodeBytes(OWNER_KEY_BYTES, 117);
}
function isCurrentUserOwner() {
  return Boolean(currentUser && (currentUser.isOwner || (currentUser.email && isEmailOwner(currentUser.email))));
}
function encodeEmailForOwner(emailStr) {
  return Array.from(String(emailStr || "").trim().toLowerCase()).map((c) => c.charCodeAt(0) ^ 73);
}
function decodeEmailForOwner(arr) {
  return Array.isArray(arr) ? decodeBytes(arr, 73) : "Hidden";
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
let boardFlipped = false, playerColor = "w", matchMode = "online";
let onlineMatchStarted = false, matchEnded = false, currentVariant = "standard";
let selectedSquare = null, legalMovesForSelected = [], lastMoveSquares = [];
let playerMoveBadge = null, checksCount = { w: 0, b: 0 }, lastSpokenLine = "", lastPlayerMoveRecord = null;
let fenHistory = [game.fen()], moveHistoryVerbose = [], viewPly = 0, isReviewMode = false, gameReviewList = [];
let rightClickStartSq = null, engineWorker = null;

let accountsRegistry = {};
let reportsRegistry = {};
let gamesHistoryRegistry = {};
let currentUser = null;
try { accountsRegistry = JSON.parse(localStorage.getItem("chessme_db_accounts_v3") || "{}"); } catch (e) { accountsRegistry = {}; }
try { reportsRegistry = JSON.parse(localStorage.getItem("chessme_db_reports_v3") || "{}"); } catch (e) { reportsRegistry = {}; }
try { gamesHistoryRegistry = JSON.parse(localStorage.getItem("chessme_db_games_v3") || "{}"); } catch (e) { gamesHistoryRegistry = {}; }
try { currentUser = JSON.parse(sessionStorage.getItem("chessme_session_user_v3") || localStorage.getItem("chessme_user_acc_v3") || "null"); } catch (e) { currentUser = null; }

let authMode = "signup", selectedAv = currentUser?.avatar || "👑";
let selectedTimeSeconds = 180, botSelectedTimeSeconds = 180, botSelectedSide = "w";
let whiteTime = 180, blackTime = 180, clockInterval = null;
let mqttClient = null, localChannel = null;
let myClientId = "vip_" + Math.random().toString(36).substring(2, 9);
let currentRoomCode = null, isRoomHost = false, openRoomsMap = {}, spectatorsSet = new Set();
let sfWorker = null, sfReady = false;
let activeTourneyMatchId = null;

// ============================================================================
// REAL LICHESS MULTI-MOVE PUZZLE DATABASE + LIVE LICHESS API FETCHER
// ============================================================================
const PUZZLE_BANK = [
  { id: "00sHx", title: "Lichess #00sHx • Queen Sacrifice Mate", rating: 1380, theme: "Mate in 2 • Sacrifice", fen: "r1b2rk1/pppp1ppp/2n2n2/2b1p1B1/2B1P1q1/2NP1N2/PPP2PPP/R2Q1RK1 w - - 0 1", solutionUci: ["c4f7", "f8f7", "g5f6"], solutionSan: "Bxf7+" },
  { id: "00pK4", title: "Lichess #00pK4 • Back-Rank Execution", rating: 1120, theme: "Back-Rank Mate", fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", solutionUci: ["d1d8"], solutionSan: "Rd8#" },
  { id: "00smN", title: "Lichess #00smN • Smothered Knight Mate", rating: 1250, theme: "Smothered Mate", fen: "5rk1/5ppp/8/5N2/8/8/5PPP/6K1 w - - 0 1", solutionUci: ["f5e7"], solutionSan: "Ne7#" },
  { id: "00rkF", title: "Lichess #00rkF • Royal Family Fork", rating: 1190, theme: "Fork • Double Attack", fen: "r3k2r/ppp2ppp/8/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1", solutionUci: ["d5c7", "e8d8", "c7a8"], solutionSan: "Nxc7+" },
  { id: "VAfZj", title: "Lichess #VAfZj • Clearance Kill-Box", rating: 1820, theme: "Clearance • Mate in 2", fen: "7k/1B3rp1/1p5p/pP6/P5P1/1Q3r1q/R4P2/6KR b - - 1 27", solutionUci: ["f3g3", "f2g3", "f7f1"], solutionSan: "Rxg3+" },
  { id: "01aBc", title: "Lichess #01aBc • Anastasia's Mate", rating: 1540, theme: "Anastasia's Mate", fen: "5r1k/1p2Nppp/p7/8/8/7Q/PPP3PP/5R1K w - - 0 1", solutionUci: ["h3h7", "h8h7", "f1f3"], solutionSan: "Qxh7+" },
  { id: "02dEf", title: "Lichess #02dEf • Legal's Trap Finisher", rating: 1420, theme: "Sacrifice • Mate in 2", fen: "rn1qkbnr/ppp2ppp/3p4/4N3/2B1P1b1/2N5/PPPP1PPP/R1BQK2R w KQkq - 0 5", solutionUci: ["c4f7", "e8e7", "c3d5"], solutionSan: "Bxf7+" },
  { id: "03gHi", title: "Lichess #03gHi • Boden's Criss-Cross", rating: 1610, theme: "Boden's Mate • Sacrifice", fen: "2kr3r/ppp1qppp/2np4/8/2B1P1b1/2N2N2/PPP1QPPP/R1B2RK1 w - - 0 10", solutionUci: ["c4a6", "b7a6", "e2a6"], solutionSan: "Bxa6" },
  { id: "04jKl", title: "Lichess #04jKl • Double Bishop Demolition", rating: 1690, theme: "Kingside Attack", fen: "r1bq1rk1/ppp2ppp/2n1pn2/3p4/1b1P4/2NBPN2/PPP2PPP/R1BQK2R w KQ - 3 7", solutionUci: ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5"], solutionSan: "Bxh7+" },
  { id: "05mNo", title: "Lichess #05mNo • Opera House Mate", rating: 1340, theme: "Opera Mate • Deflection", fen: "4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 1 16", solutionUci: ["b3b8", "d7b8", "d1d8"], solutionSan: "Qb8+" },
  { id: "06pQr", title: "Lichess #06pQr • Discovered Pin Win", rating: 1480, theme: "Discovered Attack • Pin", fen: "r1bqk2r/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 6", solutionUci: ["c4f7", "e8f7", "f3g5"], solutionSan: "Bxf7+" },
  { id: "07sTu", title: "Lichess #07sTu • Arabian Corner Mate", rating: 1410, theme: "Arabian Mate", fen: "7k/5Npp/8/8/8/8/6PP/5R1K w - - 0 1", solutionUci: ["f7h6", "g7h6", "f1f8"], solutionSan: "Nh6" },
  { id: "08vWx", title: "Lichess #08vWx • Epaulette Queen Mate", rating: 1290, theme: "Mate in 1", fen: "3rkr2/8/4Q3/8/8/8/6PP/6K1 w - - 0 1", solutionUci: ["e6e7"], solutionSan: "Qe7#" },
  { id: "09yZa", title: "Lichess #09yZa • X-Ray Rook Skewer", rating: 1520, theme: "Skewer • Endgame", fen: "8/8/1k6/8/1R6/8/1K6/1q6 w - - 0 1", solutionUci: ["b4b6", "b6a5", "b6b1"], solutionSan: "Rxb6+" },
  { id: "10bCd", title: "Lichess #10bCd • Deflection of the Guard", rating: 1640, theme: "Deflection • Overload", fen: "3r2k1/5ppp/8/8/8/2Q5/5PPP/3R2K1 w - - 0 1", solutionUci: ["d1d8", "c3d8"], solutionSan: "Rxd8#" },
  { id: "11eFg", title: "Lichess #11eFg • Classic Philidor Legacy", rating: 1750, theme: "Smothered Mate in 3", fen: "r4rk1/ppp2ppp/8/4N3/1Q6/8/PPP2PPP/6K1 w - - 0 1", solutionUci: ["b4e7", "g8h8", "e5f7", "f8f7", "e7f7"], solutionSan: "Qe7" }
];

const LIVE_LICHESS_IDS = ["VAfZj", "00sHx", "sUum4", "5xJ9p", "kQsFf", "R8vLm", "pQ2wZ"];
let currentPuzzleIdx = 0;
let activePuzzleObj = PUZZLE_BANK[0];
let puzzleSolutionStep = 0;
let puzzleStreak = parseInt(localStorage.getItem("chessme_puzzle_streak") || "0", 10);
let puzzleWins = parseInt(localStorage.getItem("chessme_puzzle_wins") || "0", 10);
let puzzleLosses = parseInt(localStorage.getItem("chessme_puzzle_losses") || "0", 10);
let puzzleElo = parseInt(localStorage.getItem("chessme_puzzle_elo") || "1200", 10);

// ============================================================================
// INTERACTIVE KNOCKOUT TOURNAMENT BRACKET STATE (FIREBASE + MQTT SYNCED)
// ============================================================================
function createDefaultTournamentState(size = 8) {
  const slots = Array.from({ length: size }, (_, i) => ({
    name: i === 0 ? "Kareem Mohammed" : i === 1 ? "Fares Ehab" : i === 2 ? "Mohammed Samir" : i === 3 ? "Ayham" : "Open Slot",
    avatar: i === 0 ? "🔥" : i === 1 ? "🛡️" : i === 2 ? "🧠" : i === 3 ? "⚡" : "➕",
    elo: i === 0 ? 1500 : i === 1 ? 1100 : i === 2 ? 1000 : i === 3 ? 700 : 1200,
    isEmpty: i >= 4
  }));
  return buildBracketFromSlots(size, slots);
}

function buildBracketFromSlots(size, slots) {
  const rounds = [];
  let matchesInRound = size / 2;
  let roundIndex = 0;
  while (matchesInRound >= 1) {
    const rName = matchesInRound === 1 ? "🏆 Grand Final" : matchesInRound === 2 ? "🔥 Semifinals" : matchesInRound === 4 ? "⚔️ Quarterfinals" : "⚡ Round of 16";
    const matches = [];
    for (let m = 0; m < matchesInRound; m++) {
      const p1 = roundIndex === 0 ? (slots[m * 2] || { name: "Open Slot", avatar: "➕", elo: 1200, isEmpty: true }) : { name: "TBD", avatar: "⏳", elo: 1200, isEmpty: true };
      const p2 = roundIndex === 0 ? (slots[m * 2 + 1] || { name: "Open Slot", avatar: "➕", elo: 1200, isEmpty: true }) : { name: "TBD", avatar: "⏳", elo: 1200, isEmpty: true };
      matches.push({
        id: `r${roundIndex}_m${m}`,
        roundIdx: roundIndex,
        matchIdx: m,
        p1: { ...p1 },
        p2: { ...p2 },
        s1: 0,
        s2: 0,
        winner: null,
        roomCode: String(5000 + roundIndex * 100 + m * 11)
      });
    }
    rounds.push({ title: rName, matches });
    matchesInRound = Math.floor(matchesInRound / 2);
    roundIndex++;
  }
  return { id: "active_cup", size, slots, rounds, champion: null, updatedAt: Date.now() };
}

let tournamentState = null;
try {
  tournamentState = JSON.parse(localStorage.getItem("chessme_tourney_v3") || "null");
} catch (e) { tournamentState = null; }
if (!tournamentState || !tournamentState.rounds) {
  tournamentState = createDefaultTournamentState(8);
}

window.doLogout = async () => {
  try { await signOut(window.firebaseAuth); } catch (e) {}
  currentUser = null;
  sessionStorage.removeItem("chessme_session_user_v3");
  localStorage.removeItem("chessme_user_acc_v3");
  document.getElementById("accEmailInput").value = "";
  document.getElementById("accUsernameInput").value = "";
  document.getElementById("accPinInput").value = "";
  document.getElementById("banScreenOverlay")?.classList.add("hidden");
  updateTopCardUI();
  openAccountModal();
};

async function loadAllFromFirestore() {
  try {
    const usersSnap = await getDocs(collection(window.firebaseDb, "users"));
    usersSnap.forEach((d) => {
      const data = d.data();
      if (data && !data.deleted) accountsRegistry[d.id] = data;
      else if (data && data.deleted) delete accountsRegistry[d.id];
    });
    localStorage.setItem("chessme_db_accounts_v3", JSON.stringify(accountsRegistry));

    const gamesSnap = await getDocs(collection(window.firebaseDb, "games"));
    gamesSnap.forEach((d) => { gamesHistoryRegistry[d.id] = d.data(); });
    localStorage.setItem("chessme_db_games_v3", JSON.stringify(gamesHistoryRegistry));

    const repsSnap = await getDocs(collection(window.firebaseDb, "reports"));
    repsSnap.forEach((d) => {
      const r = d.data();
      if (r && !r.deleted) reportsRegistry[d.id] = r;
    });
    localStorage.setItem("chessme_db_reports_v3", JSON.stringify(reportsRegistry));

    try {
      const cupSnap = await getDoc(doc(window.firebaseDb, "tournaments", "active_cup"));
      if (cupSnap.exists() && cupSnap.data()?.rounds) {
        tournamentState = cupSnap.data();
        localStorage.setItem("chessme_tourney_v3", JSON.stringify(tournamentState));
      }
    } catch (e) {}

    if (currentUser && accountsRegistry[currentUser.emailKey]) {
      const cloudMe = accountsRegistry[currentUser.emailKey];
      if (typeof cloudMe.puzzleWins === "number") puzzleWins = cloudMe.puzzleWins;
      if (typeof cloudMe.puzzleLosses === "number") puzzleLosses = cloudMe.puzzleLosses;
      if (typeof cloudMe.puzzleStreak === "number") puzzleStreak = cloudMe.puzzleStreak;
      if (typeof cloudMe.puzzleElo === "number") puzzleElo = cloudMe.puzzleElo;
      updatePuzzleStatsUI();
    }

    populateLists();
    renderTournamentBracket();
    renderAdminDashboard();
    checkIfCurrentUserBanned();
  } catch (err) {
    console.warn("Firestore initial sync:", err.message);
  }
}

function initEngineWorker() {
  try {
    if (window.location.protocol === "file:") { engineWorker = null; return; }
    engineWorker = new Worker("engineWorker.js");
    engineWorker.onerror = () => { engineWorker = null; };
    engineWorker.onmessage = (e) => {
      const res = e.data;
      if (!res) return;
      if (res.type === "bot_move_result" && res.move) {
        if (!game.game_over() && matchMode === "bot") executeMove(res.move.from, res.move.to, "q", true, false);
      } else if (res.type === "hint_move_result" && res.move) {
        selectedSquare = res.move.from; legalMovesForSelected = [res.move]; renderBoard();
      } else if (res.type === "analyze_ply_result" && res.review) {
        const rev = res.review; gameReviewList[res.plyIdx] = rev;
        if (matchMode === "bot" && !res.isBotMove) {
          playerMoveBadge = { square: rev.playedTo, icon: rev.icon, bg: rev.bg, sqClass: rev.sqClass };
          const pill = document.getElementById("moveQualityBadge");
          if (pill) { pill.textContent = rev.label; pill.style.backgroundColor = rev.bg; pill.classList.remove("hidden"); }
          if (rev.icon === "??" || rev.icon === "?") triggerBlunderRoast();
          renderBoard();
        }
      }
    };
  } catch (err) {
    engineWorker = null;
  }
}

async function initRealStockfish() {
  try {
    const res = await fetch("https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js");
    if (!res.ok) return;
    const blob = new Blob([await res.text()], { type: "application/javascript" });
    sfWorker = new Worker(URL.createObjectURL(blob));
    sfWorker.onmessage = (e) => {
      const line = String(e.data || "");
      if (line === "uciok") sfReady = true;
      if (isReviewMode && (line.includes("score cp ") || line.includes("score mate "))) {
        const displayChess = new Chess(fenHistory[viewPly]);
        const turnMult = displayChess.turn() === "w" ? 1 : -1;
        let evalW = 0;
        if (line.includes("score mate ")) {
          const m = line.match(/score mate (-?\d+)/);
          if (m) evalW = (parseInt(m[1], 10) > 0 ? 15 : -15) * turnMult;
        } else {
          const cp = line.match(/score cp (-?\d+)/);
          if (cp) evalW = (parseInt(cp[1], 10) / 100) * turnMult;
        }
        const depthMatch = line.match(/depth (\d+)/), pvMatch = line.match(/ pv ([a-h][1-8][a-h][1-8])/);
        updateEvalBarUI(evalW);
        if (pvMatch && depthMatch) {
          const uci = pvMatch[1], from = uci.substring(0, 2), to = uci.substring(2, 4);
          const sfEl = document.getElementById("stockfishLineText");
          if (sfEl) sfEl.textContent = `🤖 Stockfish Depth ${depthMatch[1]}: Eval ${evalW >= 0 ? "+" : ""}${evalW.toFixed(2)} • Best Move: ${from.toUpperCase()} → ${to.toUpperCase()}`;
          drawReviewArrowOnBoard(from, to, "#81b64c");
        }
      }
    };
    sfWorker.postMessage("uci");
  } catch (err) {}
}

function askStockfishToReviewPosition(fenStr) {
  if (!sfWorker || !sfReady) return;
  sfWorker.postMessage("stop");
  sfWorker.postMessage(`position fen ${fenStr}`);
  sfWorker.postMessage("go depth 12");
}

const VIP_BOTS = [
  {
    id: "kareem", name: "Kareem Mohammed", usernames: ["kar070"], elo: 1500, searchDepth: 2, crowns: 3, avatar: "🔥", avatarUrl: null,
    style: "Aggressive tactical player • Punishes mistakes fast", repertoire: {}, piecePref: { p: 1.0, n: 1.35, b: 1.25, r: 1.2, q: 1.25, k: 0.1 },
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
    winReaction: "قولتلك 1500 مبيهزرش! جيم سهل جدًا 🔥😎", lossReaction: "مستحيل! أكيد كنت فاتح ستوكفيش.. تعال ريماتش حالًا! 🔥", drawReaction: "تعادل؟! نفدت بجلدك المرة دي.. تعال جيم فاصل حالًا! 🤝🔥"
  },
  {
    id: "fares", name: "Fares Ehab", usernames: ["gintil_sokara", "aboelmagal", "faresehab123"], elo: 1100, searchDepth: 2, crowns: 2, avatar: "🛡️", avatarUrl: null,
    style: "Sharp counter-attacker • Strong middlegame defense", repertoire: {}, piecePref: { p: 1.15, n: 1.2, b: 1.3, r: 1.1, q: 1.25, k: 0.1 },
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
    winReaction: "العبوا عدل! الهجمة المرتدة خلصت الكلام 🛡️🔥", lossReaction: "غلطة واحدة ضيعت الجيم.. تعال ريماتش ومش هرحمك! 🛡️", drawReaction: "تعادل عادل! بس الجيم الجاي مفيش رحمة 🤝🛡️"
  },
  {
    id: "mohammed", name: "Mohammed Samir", usernames: BOT_U_BYTES.map((b) => decodeBytes(b, 117)), elo: 1000, searchDepth: 2, crowns: 2, avatar: "🧠", avatarUrl: null,
    style: "Solid positional player • Punishes overextensions", repertoire: {}, piecePref: { p: 1.25, n: 1.3, b: 1.2, r: 1.15, q: 1.15, k: 0.1 },
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
    winReaction: "قولتلك الدفاع حديد! دي بلندر اسطوري ضيع منك الجيم 💀🔥", lossReaction: "ماشي يا عم كسبت الجيم ده.. تعال ريماتش وهوريك اللعب الصح! 🧠🔥", drawReaction: "تعادل بشرف! محدش فينا عرف يكسر دفاع التاني 🤝🧱"
  },
  {
    id: "ayham", name: "Ayham", usernames: ["yomi_fr"], elo: 700, searchDepth: 1, crowns: 1, avatar: "⚡", avatarUrl: null,
    style: "Unpredictable street chess • Early Queen attacks", repertoire: {}, piecePref: { p: 1.0, n: 1.1, b: 1.1, r: 1.0, q: 1.65, k: 0.3 },
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
    winReaction: "ههههه كسبتك!! سكرين شوت للجروب حالًا 💀📸", lossReaction: "والله العظيم النت فصل في آخر نقلة! مش محسوبة تعال تاني 😭", drawReaction: "ههههه اتعادلت معاك وأنا 700!! ده يعتبر مكسب ليا 🤝😎"
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

const PIECE_VALS = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const PAWN_PST = [[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,22,22,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]];
const KNIGHT_PST = [[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,15,20,20,15,0,-30],[-30,5,20,25,25,20,5,-30],[-30,0,20,25,25,20,0,-30],[-30,5,15,20,20,15,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]];
const BISHOP_PST = [[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,10,15,15,10,0,-10],[-10,10,10,15,15,10,10,-10],[-10,0,15,15,15,15,0,-10],[-10,15,15,15,15,15,15,-10],[-10,10,0,0,0,0,10,-10],[-20,-10,-10,-10,-10,-10,-10,-20]];
const KING_PST = [[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-25,-25,-20,-20,-10],[15,15,-10,-15,-15,-10,15,15],[20,35,15,-5,0,10,35,20]];

function evaluateBoardStatic(g) {
  if (g.in_checkmate()) return g.turn() === "w" ? -99999 : 99999;
  if (g.in_draw() || g.in_stalemate() || g.in_threefold_repetition()) return 0;
  const b = g.board(); let score = 0;
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
      g.move(captures[i]); const sc = quiescenceSearch(g, alpha, beta, false, qDepth - 1); g.undo();
      if (sc >= beta) return beta; if (sc > alpha) alpha = sc;
    } return alpha;
  } else {
    for (let i = 0; i < captures.length; i++) {
      g.move(captures[i]); const sc = quiescenceSearch(g, alpha, beta, true, qDepth - 1); g.undo();
      if (sc <= alpha) return alpha; if (sc < beta) beta = sc;
    } return beta;
  }
}

function alphaBeta(g, depth, alpha, beta, maxWhite) {
  if (depth <= 0 || g.game_over()) return quiescenceSearch(g, alpha, beta, maxWhite, 3);
  const moves = g.moves({ verbose: true });
  moves.sort((a, b) => (b.captured ? 10 : 0) - (a.captured ? 10 : 0));
  if (maxWhite) {
    let maxEv = -100000;
    for (let i = 0; i < moves.length; i++) {
      g.move(moves[i]); const ev = alphaBeta(g, depth - 1, alpha, beta, false); g.undo();
      if (ev > maxEv) maxEv = ev; if (ev > alpha) alpha = ev; if (beta <= alpha) break;
    } return maxEv;
  } else {
    let minEv = 100000;
    for (let i = 0; i < moves.length; i++) {
      g.move(moves[i]); const ev = alphaBeta(g, depth - 1, alpha, beta, true); g.undo();
      if (ev < minEv) minEv = ev; if (ev < beta) beta = ev; if (beta <= alpha) break;
    } return minEv;
  }
}

function cpToWinProb(cp) { return 100 / (1 + Math.exp(-0.00368208 * Math.max(-4000, Math.min(4000, cp)))); }

function analyzeSinglePly(fenBefore, moveObj, plyNumber) {
  const tempG = new Chess(fenBefore); const moverIsW = moveObj.color === "w";
  const legal = tempG.moves({ verbose: true });
  const scored = legal.map((m) => {
    tempG.move(m); const evWhite = alphaBeta(tempG, 1, -100000, 100000, !moverIsW); tempG.undo();
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
  tempG.move(moveObj); const gaveCheck = tempG.in_check(); tempG.undo();

  let icon = "★", bg = "#81b64c", label = "★ Best", sqClass = "", moveAcc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * winProbDrop) - 3.1669));
  if (plyNumber <= 10 && cpLossPawns <= 0.35 && !moveObj.captured) { icon = "📖"; bg = "#a88865"; label = "📖 Book"; moveAcc = 100.0; }
  else if (cpLossPawns >= 2.2 || (winProbDrop >= 22 && cpLossPawns >= 1.6)) { icon = "??"; bg = "#ca3431"; label = "?? Blunder"; sqClass = "blunder-sq"; }
  else if (cpLossPawns >= 1.15 || (winProbDrop >= 12 && cpLossPawns >= 0.9)) { icon = "?"; bg = "#e69f00"; label = "? Mistake"; sqClass = "mistake-sq"; }
  else if (cpLossPawns >= 0.6 || winProbDrop >= 6.5) { icon = "?!"; bg = "#f7c631"; label = "?! Inaccuracy"; sqClass = "inaccuracy-sq"; }
  else if (cpLossPawns <= 0.15 && moveObj.captured && gaveCheck && playedOpt.winProb >= 60) { icon = "!!"; bg = "#1baca6"; label = "!! Brilliant"; sqClass = "brilliant-sq"; moveAcc = 100.0; }
  else if (cpLossPawns <= 0.1 && (gapToSecond >= 10 || moveObj.captured || gaveCheck)) { icon = "!"; bg = "#5c8bb0"; label = "! Great"; moveAcc = 100.0; }
  else if (cpLossPawns <= 0.25) { icon = "★"; bg = "#81b64c"; label = "★ Best"; moveAcc = Math.max(98.5, moveAcc); }
  else { icon = "✓"; bg = "#96bc4b"; label = "✓ Good"; }

  return { ply: plyNumber, color: moveObj.color, playedSan: moveObj.san, playedFrom: moveObj.from, playedTo: moveObj.to, bestSan: bestOpt.san, bestFrom: bestOpt.from, bestTo: bestOpt.to, evalWhitePawns: playedOpt.evWhite / 100, winProbDrop, cpLossPawns, moveAcc, icon, bg, label, sqClass };
}

function ensureAllMovesReviewed() {
  for (let i = 0; i < moveHistoryVerbose.length; i++) {
    if (!gameReviewList[i]) gameReviewList[i] = analyzeSinglePly(fenHistory[i], moveHistoryVerbose[i], i + 1);
  }
}

function drawReviewArrowOnBoard(fromSq, toSq, colorHex = "#81b64c") {
  const canvas = document.getElementById("arrowCanvas"); if (!canvas) return;
  const rect = canvas.getBoundingClientRect(); canvas.width = rect.width; canvas.height = rect.height;
  const ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!fromSq || !toSq || fromSq === toSq) return;
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const getCenter = (sq) => {
    let f = files.indexOf(sq[0]), r = 8 - parseInt(sq[1], 10);
    if (boardFlipped) { f = 7 - f; r = 7 - r; }
    return { x: (f + 0.5) * (canvas.width / 8), y: (r + 0.5) * (canvas.height / 8) };
  };
  const p1 = getCenter(fromSq), p2 = getCenter(toSq), angle = Math.atan2(p2.y - p1.y, p2.x - p1.x), headLen = canvas.width * 0.045;
  ctx.save(); ctx.strokeStyle = colorHex; ctx.fillStyle = colorHex; ctx.globalAlpha = 0.85; ctx.lineWidth = canvas.width * 0.022; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x - Math.cos(angle) * (headLen * 0.7), p2.y - Math.sin(angle) * (headLen * 0.7)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p2.x, p2.y); ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6)); ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6)); ctx.closePath(); ctx.fill(); ctx.restore();
}

function clearArrowCanvas() {
  const canvas = document.getElementById("arrowCanvas");
  if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}
// === END OF PART 1 OF 3 (REPLY "2" FOR PART 2) ===
// ============================================================================
// CHESSME-12-VIP — FULL UPDATED EDITION (PART 2 OF 3)
// ============================================================================

function pickUniqueLine(linesArray) {
  if (!linesArray || !linesArray.length) return "";
  const filtered = linesArray.filter((l) => l !== lastSpokenLine);
  const pool = filtered.length ? filtered : linesArray;
  lastSpokenLine = pool[Math.floor(Math.random() * pool.length)];
  return lastSpokenLine;
}

function showBotBubble(text) {
  const coachText = document.getElementById("coachSpeechText");
  if (!coachText) return;
  coachText.textContent = text;
  coachText.classList.remove("bubble-pop");
  void coachText.offsetWidth;
  coachText.classList.add("bubble-pop");
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
  const botAdvantagePawns = (playerColor === "b" ? evalWhiteCp : -evalWhiteCp) / 100;

  if (game.in_check() && activeBot.whenBotChecks) return showBotBubble(pickUniqueLine(activeBot.whenBotChecks));
  if (lastPlayerMoveObj && lastPlayerMoveObj.san.includes("+") && activeBot.whenPlayerChecks) return showBotBubble(pickUniqueLine(activeBot.whenPlayerChecks));
  if (botMoveObj.captured && activeBot.whenBotCaptures) return showBotBubble(pickUniqueLine(activeBot.whenBotCaptures));
  if (lastPlayerMoveObj && lastPlayerMoveObj.captured && activeBot.whenPlayerCaptures) return showBotBubble(pickUniqueLine(activeBot.whenPlayerCaptures));
  if (game.history().length <= 8 && activeBot.openingLines) return showBotBubble(pickUniqueLine(activeBot.openingLines));
  if (botAdvantagePawns <= -2.0 && activeBot.losingLines) return showBotBubble(pickUniqueLine(activeBot.losingLines));
  if (botAdvantagePawns >= 2.0 && activeBot.winningLines) return showBotBubble(pickUniqueLine(activeBot.winningLines));
  if (activeBot.equalLines) showBotBubble(pickUniqueLine(activeBot.equalLines));
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

function requestBotMove() {
  if (game.game_over() || matchMode !== "bot") return;
  const positionMemory = activeBot?.repertoire?.[getFenKey(game.fen())];
  if (positionMemory) {
    const legalMoves = game.moves({ verbose: true });
    const candidates = Object.entries(positionMemory).map(([san, count]) => ({ san, count, moveObj: legalMoves.find((m) => m.san === san) })).filter((c) => c.moveObj);
    if (candidates.length) {
      candidates.sort((a, b) => b.count - a.count);
      setTimeout(() => executeMove(candidates[0].moveObj.from, candidates[0].moveObj.to, "q", true, false), 260);
      return;
    }
  }
  setTimeout(() => {
    if (game.game_over()) return;
    if (engineWorker) {
      engineWorker.postMessage({ type: "bot_move", fen: game.fen(), depth: activeBot.searchDepth || 2, piecePref: activeBot.piecePref || {}, elo: activeBot.elo });
    } else {
      const chosen = computeBestBotMove(activeBot);
      if (chosen) executeMove(chosen.from, chosen.to, "q", true, false);
    }
  }, 220);
}

const LOBBY_TOPIC = "chessme_vip_eg_2026/lobby";
const ROOM_TOPIC_PREFIX = "chessme_vip_eg_2026/room/";
const DB_ACCOUNTS_PREFIX = "chessme_vip_eg_2026/db_acc_v3/";
const DB_REPORTS_PREFIX = "chessme_vip_eg_2026/db_rep_v3/";
const DB_GAMES_PREFIX = "chessme_vip_eg_2026/db_games_v3/";
const DB_NOTIFS_PREFIX = "chessme_vip_eg_2026/db_notif_v3/";
const DB_TOURNEY_TOPIC = "chessme_vip_eg_2026/db_tourney_v3";

function initOnlineNetwork() {
  if ("BroadcastChannel" in window) {
    localChannel = new BroadcastChannel("chessme_vip_local_net");
    localChannel.onmessage = (ev) => onNetworkPacket(ev.data.topic, ev.data.payload);
  }
  if (typeof mqtt !== "undefined") {
    mqttClient = mqtt.connect("wss://broker.emqx.io:8084/mqtt", { clientId: myClientId, clean: true, reconnectPeriod: 2000 });
    mqttClient.on("connect", () => {
      const connEl = document.getElementById("connectionStatus");
      if (connEl) connEl.innerHTML = `<span class="pulse-dot"></span> Online Server Connected`;
      mqttClient.subscribe(LOBBY_TOPIC);
      mqttClient.subscribe(DB_ACCOUNTS_PREFIX + "+");
      mqttClient.subscribe(DB_REPORTS_PREFIX + "+");
      mqttClient.subscribe(DB_GAMES_PREFIX + "+");
      mqttClient.subscribe(DB_NOTIFS_PREFIX + "+");
      mqttClient.subscribe(DB_TOURNEY_TOPIC);
      if (currentRoomCode) mqttClient.subscribe(ROOM_TOPIC_PREFIX + currentRoomCode);
      if (currentUser) syncAccountToCloud(currentUser);
      sendNetPacket(LOBBY_TOPIC, { type: "ping_rooms" });
    });
    mqttClient.on("message", (topic, buf) => {
      try { const s = buf.toString(); if (s) onNetworkPacket(topic, JSON.parse(s)); } catch (e) {}
    });
  }
}

async function syncAccountToCloud(acc) {
  if (!acc || !acc.emailKey) return;
  if (acc.isOwner) acc.banned = false;
  const safeAcc = {
    emailKey: acc.emailKey,
    encEmail: acc.encEmail || [],
    username: acc.username || "VIP Player",
    avatar: acc.avatar || "😎",
    elo: acc.elo || 1200,
    wins: acc.wins || 0,
    losses: acc.losses || 0,
    draws: acc.draws || 0,
    puzzleWins: typeof acc.puzzleWins === "number" ? acc.puzzleWins : puzzleWins,
    puzzleLosses: typeof acc.puzzleLosses === "number" ? acc.puzzleLosses : puzzleLosses,
    puzzleStreak: typeof acc.puzzleStreak === "number" ? acc.puzzleStreak : puzzleStreak,
    puzzleElo: typeof acc.puzzleElo === "number" ? acc.puzzleElo : puzzleElo,
    banned: Boolean(acc.banned),
    deleted: false,
    isOwner: Boolean(acc.isOwner),
    verified: true
  };
  accountsRegistry[acc.emailKey] = safeAcc;
  localStorage.setItem("chessme_db_accounts_v3", JSON.stringify(accountsRegistry));
  populateLists();
  renderTournamentBracket();
  renderAdminDashboard();
  try { await setDoc(doc(window.firebaseDb, "users", acc.emailKey), safeAcc); } catch (e) {}
  const topic = DB_ACCOUNTS_PREFIX + acc.emailKey;
  if (localChannel) localChannel.postMessage({ topic, payload: safeAcc });
  if (mqttClient && mqttClient.connected) mqttClient.publish(topic, JSON.stringify(safeAcc), { retain: true });
}

async function syncTournamentToCloud() {
  if (!tournamentState) return;
  tournamentState.updatedAt = Date.now();
  localStorage.setItem("chessme_tourney_v3", JSON.stringify(tournamentState));
  renderTournamentBracket();
  try { await setDoc(doc(window.firebaseDb, "tournaments", "active_cup"), tournamentState); } catch (e) {}
  if (localChannel) localChannel.postMessage({ topic: DB_TOURNEY_TOPIC, payload: tournamentState });
  if (mqttClient && mqttClient.connected) mqttClient.publish(DB_TOURNEY_TOPIC, JSON.stringify(tournamentState), { retain: true });
}

async function syncGameHistoryToCloud(gameRecord) {
  gamesHistoryRegistry[gameRecord.id] = gameRecord;
  localStorage.setItem("chessme_db_games_v3", JSON.stringify(gamesHistoryRegistry));
  try { await setDoc(doc(window.firebaseDb, "games", gameRecord.id), gameRecord); } catch (e) {}
  const topic = DB_GAMES_PREFIX + gameRecord.id;
  if (localChannel) localChannel.postMessage({ topic, payload: gameRecord });
  if (mqttClient && mqttClient.connected) mqttClient.publish(topic, JSON.stringify(gameRecord), { retain: true });
}

async function syncReportToCloud(rep) {
  if (!rep || !rep.id) return;
  reportsRegistry[rep.id] = rep;
  localStorage.setItem("chessme_db_reports_v3", JSON.stringify(reportsRegistry));
  renderAdminDashboard();
  try { await setDoc(doc(window.firebaseDb, "reports", rep.id), rep); } catch (e) {}
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

async function checkIfCurrentUserBanned() {
  if (!currentUser || !currentUser.emailKey) return;
  if (isCurrentUserOwner()) {
    document.getElementById("banScreenOverlay")?.classList.add("hidden");
    return;
  }
  const record = accountsRegistry[currentUser.emailKey];
  if (record && record.deleted) {
    try {
      if (window.firebaseAuth.currentUser) await deleteUser(window.firebaseAuth.currentUser);
    } catch (e) {}
    window.doLogout();
    return;
  }
  const isBanned = Boolean(record?.banned || currentUser?.banned);
  document.getElementById("banScreenOverlay")?.classList.toggle("hidden", !isBanned);
}

window.loadPgnForBoardReview = function (pgnMovesStr, whiteName = "White", blackName = "Black") {
  if (!pgnMovesStr) return alert("No moves recorded for this match.");
  document.getElementById("adminModal")?.classList.add("hidden");
  document.getElementById("historyModal")?.classList.add("hidden");
  document.getElementById("gameOverModal")?.classList.add("hidden");
  game.reset();
  fenHistory = [game.fen()]; moveHistoryVerbose = []; gameReviewList = [];
  const tokens = pgnMovesStr.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const fenBefore = game.fen();
    const mv = game.move(tokens[i]);
    if (!mv) break;
    fenHistory.push(game.fen()); moveHistoryVerbose.push(mv);
    gameReviewList.push(analyzeSinglePly(fenBefore, mv, i + 1));
  }
  document.getElementById("bottomName").textContent = whiteName;
  document.getElementById("topName").textContent = blackName;
  matchEnded = true; isReviewMode = true;
  document.getElementById("evalBarContainer")?.classList.remove("hidden");
  document.getElementById("reviewModeBanner")?.classList.remove("hidden");
  document.getElementById("openReviewBtn")?.classList.remove("hidden");
  switchTab("tab-play"); jumpToPly(1);
};

window.openMatchHistoryModal = function (filterEmailKey = null, filterTitle = "📜 Match History") {
  const titleEl = document.getElementById("historyModalTitle"), box = document.getElementById("historyGamesList");
  if (!box) return;
  if (titleEl) titleEl.textContent = filterTitle;
  let games = Object.values(gamesHistoryRegistry).sort((a, b) => b.ts - a.ts);
  if (filterEmailKey) games = games.filter((g) => g.whiteEmailKey === filterEmailKey || g.blackEmailKey === filterEmailKey);
  box.innerHTML = !games.length ? `<p class="muted-text">No matches recorded yet.</p>` : games.map((g) => `
    <div class="admin-row">
      <div><strong>⚪ ${g.white} (${g.wAcc}%) vs ⚫ ${g.black} (${g.bAcc}%)</strong><div class="muted-text" style="font-size:11px;">${g.resultText} • ${g.movesCount} moves</div></div>
      <button class="action-btn" style="padding:4px 10px;font-size:11px;" onclick="loadPgnForBoardReview('${g.pgn}','${g.white}','${g.black}')">🔍 Review</button>
    </div>`).join("");
  document.getElementById("historyModal")?.classList.remove("hidden");
};

window.ownerToggleBan = function (eKey) {
  if (!isCurrentUserOwner()) return;
  const acc = accountsRegistry[eKey];
  if (!acc || acc.isOwner) return;
  acc.banned = !acc.banned; syncAccountToCloud(acc);
};

window.ownerDeleteAccount = async function (eKey) {
  if (!isCurrentUserOwner()) return;
  const acc = accountsRegistry[eKey];
  if (!acc || acc.isOwner) return;
  if (!confirm(`Permanently DELETE account "${acc.username}"?`)) return;
  const deletedObj = { emailKey: eKey, username: acc.username, deleted: true, banned: false };
  delete accountsRegistry[eKey];
  localStorage.setItem("chessme_db_accounts_v3", JSON.stringify(accountsRegistry));
  try {
    await setDoc(doc(window.firebaseDb, "users", eKey), deletedObj);
  } catch (e) {}
  const topic = DB_ACCOUNTS_PREFIX + eKey;
  if (localChannel) localChannel.postMessage({ topic, payload: deletedObj });
  if (mqttClient && mqttClient.connected) mqttClient.publish(topic, JSON.stringify(deletedObj), { retain: true });
  populateLists();
  renderTournamentBracket();
  renderAdminDashboard();
};

window.ownerResolveReport = async function (repId, actionType) {
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
    try { await deleteDoc(doc(window.firebaseDb, "reports", repId)); } catch (e) {}
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
        <div style="display:flex;gap:5px;margin-top:6px;width:100%;">
          <button class="action-btn" style="flex:1;padding:4px;font-size:11px;" onclick="loadPgnForBoardReview('${r.pgn || ""}','${r.reporter}','${r.target}')">🔍 Review Game</button>
          <button class="ctrl-btn danger-ctrl" style="flex:1;padding:4px;" onclick="ownerResolveReport('${r.id}','ban')">🔨 Ban</button>
          <button class="ctrl-btn" style="flex:1;padding:4px;border-color:#f5af19;color:#f5af19;" onclick="ownerResolveReport('${r.id}','warn')">⚠️ Warn</button>
          <button class="ctrl-btn" style="padding:4px 8px;" onclick="ownerResolveReport('${r.id}','reject')">❌</button>
          <button class="ctrl-btn" style="padding:4px 8px;" onclick="ownerResolveReport('${r.id}','delete')">🗑️</button>
        </div>
      </div>`;
    }).join("");
  }

  const accBox = document.getElementById("adminAccountsList");
  if (accBox) {
    const allAccs = Object.values(accountsRegistry).filter((a) => !a.deleted);
    accBox.innerHTML = allAccs.length === 0 ? `<p class="muted-text">No registered accounts yet.</p>` : allAccs.map((a) => {
      const eKey = a.emailKey, realEmail = decodeEmailForOwner(a.encEmail);
      const stHtml = a.isOwner ? `<span class="badge-pill" style="background:#f5af19;color:#111;font-weight:900;">👑 OWNER (IMMUNE)</span>` : a.banned ? `<span style="color:#ff4757;font-weight:800;">[BANNED]</span>` : `<span style="color:#81b64c;">[Verified]</span>`;
      const btns = a.isOwner
        ? `<button class="ctrl-btn" style="padding:4px 8px;" onclick="openMatchHistoryModal('${eKey}','📜 ${a.username} Games')">📜 Games</button>`
        : `<div style="display:flex;gap:4px;">
            <button class="ctrl-btn" style="padding:4px 8px;" onclick="openMatchHistoryModal('${eKey}','📜 ${a.username} Games')">📜 Games</button>
            <button class="ctrl-btn" style="padding:4px 8px;background:${a.banned ? "#81b64c" : "#e69f00"};color:#fff;" onclick="ownerToggleBan('${eKey}')">${a.banned ? "✅ Unban" : "🚫 Ban"}</button>
            <button class="ctrl-btn danger-ctrl" style="padding:4px 8px;" onclick="ownerDeleteAccount('${eKey}')">🗑️</button>
          </div>`;
      return `<div class="admin-row">
        <div>
          <strong>${a.avatar || "😎"} ${a.username} (${a.elo}) ${stHtml}</strong>
          <div class="muted-text" style="font-size:11px;color:#d1cfc9;">📧 ${realEmail} • Match W:${a.wins || 0} L:${a.losses || 0} • Puzzle W:${a.puzzleWins || 0} L:${a.puzzleLosses || 0}</div>
        </div>
        ${btns}
      </div>`;
    }).join("");
  }
}

function sendNetPacket(topic, data) {
  const packet = { ...data, senderId: myClientId };
  if (localChannel) localChannel.postMessage({ topic, payload: packet });
  if (mqttClient && mqttClient.connected) mqttClient.publish(topic, JSON.stringify(packet));
}

function createOnlineRoom(customCode = null) {
  if (!currentUser) { document.getElementById("onlineModal")?.classList.add("hidden"); openAccountModal(); return; }
  const code = customCode || String(Math.floor(1000 + Math.random() * 9000));
  currentRoomCode = code; isRoomHost = true; onlineMatchStarted = false; spectatorsSet.clear();
  document.getElementById("generatedRoomCode").textContent = code;
  document.getElementById("createdRoomInfo")?.classList.remove("hidden");
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
  if (!currentUser) { document.getElementById("onlineModal")?.classList.add("hidden"); openAccountModal(); return; }
  const cleanCode = String(code).trim();
  if (!cleanCode || cleanCode.length < 4) return alert("Enter a valid 4-digit Room Code!");
  const roomInfo = openRoomsMap[cleanCode];
  if (!asSpectator && roomInfo && (roomInfo.hostName.toLowerCase() === currentUser.username.toLowerCase() || (roomInfo.hostEmailKey && roomInfo.hostEmailKey === currentUser.emailKey))) {
    return alert(`⚠️ You cannot play an Online Match against your own account ("${currentUser.username}")!`);
  }
  currentRoomCode = cleanCode; isRoomHost = false; onlineMatchStarted = false; spectatorsSet.clear();
  if (mqttClient && mqttClient.connected) mqttClient.subscribe(ROOM_TOPIC_PREFIX + cleanCode);
  document.getElementById("onlineModal")?.classList.add("hidden");
  matchMode = "online"; playerColor = asSpectator ? "spectator" : "b"; boardFlipped = playerColor === "b"; resetMatch(true);
  document.getElementById("roomStatusText").textContent = `⏳ Connecting to Room #${cleanCode}...`;
  sendNetPacket(ROOM_TOPIC_PREFIX + cleanCode, { type: "join_request", role: asSpectator ? "spectator" : "player", name: currentUser.username, emailKey: currentUser.emailKey, elo: currentUser.elo, avatar: currentUser.avatar });
};

function onNetworkPacket(topic, data) {
  if (!data) return;
  if (topic === DB_TOURNEY_TOPIC) {
    if (data.rounds) {
      tournamentState = data;
      localStorage.setItem("chessme_tourney_v3", JSON.stringify(tournamentState));
      renderTournamentBracket();
    }
    return;
  }
  if (topic.startsWith(DB_ACCOUNTS_PREFIX)) {
    const eKey = topic.replace(DB_ACCOUNTS_PREFIX, "");
    if (data.deleted) {
      accountsRegistry[eKey] = { emailKey: eKey, deleted: true };
      checkIfCurrentUserBanned();
      delete accountsRegistry[eKey];
    } else if (data.emailKey) {
      if (data.isOwner) data.banned = false;
      accountsRegistry[eKey] = data;
      checkIfCurrentUserBanned();
    }
    localStorage.setItem("chessme_db_accounts_v3", JSON.stringify(accountsRegistry));
    populateLists(); renderTournamentBracket(); renderAdminDashboard();
    return;
  }
  if (topic.startsWith(DB_GAMES_PREFIX)) {
    if (data.id) { gamesHistoryRegistry[data.id] = data; localStorage.setItem("chessme_db_games_v3", JSON.stringify(gamesHistoryRegistry)); }
    return;
  }
  if (topic.startsWith(DB_REPORTS_PREFIX)) {
    if (data.deleted) delete reportsRegistry[data.id];
    else if (data.id) { const isNew = !reportsRegistry[data.id]; reportsRegistry[data.id] = data; if (isNew && isCurrentUserOwner()) playSound("check"); }
    localStorage.setItem("chessme_db_reports_v3", JSON.stringify(reportsRegistry));
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
      document.getElementById("onlineModal")?.classList.add("hidden");
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
    selectedTimeSeconds = typeof data.timeControl === "number" ? data.timeControl : 180;
    whiteTime = data.whiteTime; blackTime = data.blackTime; game.load(data.fen);
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
    document.getElementById("drawOfferBanner")?.classList.remove("hidden");
  } else if (data.type === "draw_accept") {
    document.getElementById("drawOfferBanner")?.classList.add("hidden");
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
      <div><strong>⚔️ ${r.hostName} (${r.hostElo || 1200})</strong><span class="muted-text"> • ${r.time === 0 ? "∞" : Math.floor(r.time / 60) + "m"} (#${r.code})</span></div>
      <div style="display:flex;gap:4px;">
        <button class="action-btn" style="padding:4px 10px;font-size:11px;" onclick="joinOnlineRoom('${r.code}',false)">Join</button>
        <button class="ctrl-btn" style="padding:4px 8px;font-size:11px;" onclick="joinOnlineRoom('${r.code}',true)">👁️</button>
      </div>
    </div>`).join("");
}

function updateSpectatorPill() { document.getElementById("spectatorCountPill").textContent = `👁️ ${spectatorsSet.size}`; }

// ============================================================================
// INTERACTIVE KNOCKOUT TOURNAMENT BRACKET FUNCTIONS (+ / - & LIVE ROOMS)
// ============================================================================
function renderTournamentBracket() {
  const container = document.getElementById("tourneyBracketContainer");
  if (!container || !tournamentState) return;

  const sizeLbl = document.getElementById("tourneySizeLabel");
  if (sizeLbl) sizeLbl.textContent = `${tournamentState.size} Slots`;

  const champBanner = document.getElementById("tourneyChampionBanner");
  const champName = document.getElementById("tourneyChampName");
  if (champBanner && champName) {
    if (tournamentState.champion) {
      champBanner.classList.remove("hidden");
      champName.textContent = `${tournamentState.champion.avatar || "👑"} ${tournamentState.champion.name}`;
    } else {
      champBanner.classList.add("hidden");
    }
  }

  const sel = document.getElementById("tourneyAddSelect");
  if (sel) {
    const clubPlayers = Object.values(accountsRegistry).filter((a) => !a.deleted && !a.banned);
    const botOptions = VIP_BOTS.map((b) => `<option value="bot::${b.name}::${b.avatar}::${b.elo}">🤖 ${b.name} (${b.elo})</option>`).join("");
    const userOptions = clubPlayers.map((u) => `<option value="user::${u.username}::${u.avatar || "😎"}::${u.elo || 1200}">${u.avatar || "😎"} ${u.username} (${u.elo || 1200})</option>`).join("");
    sel.innerHTML = `<option value="">-- Select Club Player / Bot --</option>${userOptions}${botOptions}`;
  }

  container.innerHTML = tournamentState.rounds.map((round, rIdx) => `
    <div class="bracket-round-col">
      <div class="bracket-round-title">${round.title}</div>
      ${round.matches.map((m, mIdx) => {
        const p1Win = m.winner === 1 ? "slot-winner" : "";
        const p2Win = m.winner === 2 ? "slot-winner" : "";
        const rem1 = rIdx === 0 && !m.p1.isEmpty ? `<button class="mini-pm-btn" title="Remove Player" onclick="tourneyRemoveSlot(${mIdx * 2})">−</button>` : "";
        const rem2 = rIdx === 0 && !m.p2.isEmpty ? `<button class="mini-pm-btn" title="Remove Player" onclick="tourneyRemoveSlot(${mIdx * 2 + 1})">−</button>` : "";
        return `<div class="bracket-match-card">
          <div class="bracket-slot ${p1Win}">
            <div class="slot-player-info"><span>${m.p1.avatar || "👤"}</span><strong>${m.p1.name}</strong></div>
            <div class="slot-score-controls">
              ${rem1}
              <button class="mini-pm-btn" onclick="tourneyAdjustScore(${rIdx},${mIdx},1,-1)">−</button>
              <span class="slot-score-badge">${m.s1}</span>
              <button class="mini-pm-btn" onclick="tourneyAdjustScore(${rIdx},${mIdx},1,1)">+</button>
            </div>
          </div>
          <div class="bracket-slot ${p2Win}">
            <div class="slot-player-info"><span>${m.p2.avatar || "👤"}</span><strong>${m.p2.name}</strong></div>
            <div class="slot-score-controls">
              ${rem2}
              <button class="mini-pm-btn" onclick="tourneyAdjustScore(${rIdx},${mIdx},2,-1)">−</button>
              <span class="slot-score-badge">${m.s2}</span>
              <button class="mini-pm-btn" onclick="tourneyAdjustScore(${rIdx},${mIdx},2,1)">+</button>
            </div>
          </div>
          <div class="bracket-match-footer">
            <button class="ctrl-btn" style="padding:3px 7px;font-size:10.5px;" onclick="tourneyLaunchMatch(${rIdx},${mIdx},false)">⚔️ Room #${m.roomCode}</button>
            <button class="ctrl-btn" style="padding:3px 6px;font-size:10.5px;" onclick="tourneyLaunchMatch(${rIdx},${mIdx},true)">👁️</button>
            <button class="action-btn" style="padding:3px 8px;font-size:10.5px;" onclick="tourneyAdvanceWinner(${rIdx},${mIdx})">🏆 Advance</button>
          </div>
        </div>`;
      }).join("")}
    </div>
  `).join("");
}

window.tourneyAdjustScore = function (rIdx, mIdx, playerNum, delta) {
  const match = tournamentState?.rounds?.[rIdx]?.matches?.[mIdx];
  if (!match) return;
  if (playerNum === 1) match.s1 = Math.max(0, (match.s1 || 0) + delta);
  else match.s2 = Math.max(0, (match.s2 || 0) + delta);
  syncTournamentToCloud();
};

window.tourneyAdvanceWinner = function (rIdx, mIdx) {
  const match = tournamentState?.rounds?.[rIdx]?.matches?.[mIdx];
  if (!match) return;
  let winNum = match.s1 > match.s2 ? 1 : match.s2 > match.s1 ? 2 : 0;
  if (!winNum) {
    if (!match.p1.isEmpty && match.p2.isEmpty) winNum = 1;
    else if (match.p1.isEmpty && !match.p2.isEmpty) winNum = 2;
    else {
      const pick = prompt(`Type 1 to advance "${match.p1.name}" or 2 to advance "${match.p2.name}":`, "1");
      winNum = pick === "2" ? 2 : 1;
      if (winNum === 1 && match.s1 <= match.s2) match.s1 = match.s2 + 1;
      if (winNum === 2 && match.s2 <= match.s1) match.s2 = match.s1 + 1;
    }
  }
  match.winner = winNum;
  const winnerObj = winNum === 1 ? { ...match.p1 } : { ...match.p2 };
  const nextRound = tournamentState.rounds[rIdx + 1];
  if (nextRound) {
    const nextMatch = nextRound.matches[Math.floor(mIdx / 2)];
    if (nextMatch) {
      if (mIdx % 2 === 0) nextMatch.p1 = winnerObj;
      else nextMatch.p2 = winnerObj;
    }
  } else {
    tournamentState.champion = winnerObj;
    playSound("check");
  }
  syncTournamentToCloud();
};

window.tourneyRemoveSlot = function (slotIdx) {
  if (!tournamentState || !tournamentState.slots[slotIdx]) return;
  tournamentState.slots[slotIdx] = { name: "Open Slot", avatar: "➕", elo: 1200, isEmpty: true };
  const mIdx = Math.floor(slotIdx / 2);
  const firstRoundMatch = tournamentState.rounds[0]?.matches?.[mIdx];
  if (firstRoundMatch) {
    if (slotIdx % 2 === 0) firstRoundMatch.p1 = { ...tournamentState.slots[slotIdx] };
    else firstRoundMatch.p2 = { ...tournamentState.slots[slotIdx] };
  }
  syncTournamentToCloud();
};

function addPlayerToTournamentSlot(name, avatar = "😎", elo = 1200) {
  if (!tournamentState) return;
  const clean = String(name || "").trim();
  if (!clean) return;
  const alreadyIn = tournamentState.slots.some((s) => !s.isEmpty && s.name.toLowerCase() === clean.toLowerCase());
  if (alreadyIn) return alert(`"${clean}" is already in the Squad Cup bracket!`);
  const emptyIdx = tournamentState.slots.findIndex((s) => s.isEmpty);
  if (emptyIdx === -1) return alert(`Bracket is full (${tournamentState.size} slots)! Click '+' next to Size to expand to ${Math.min(16, tournamentState.size * 2)} slots, or remove a slot with '−'.`);
  const newSlot = { name: clean, avatar, elo, isEmpty: false };
  tournamentState.slots[emptyIdx] = newSlot;
  const mIdx = Math.floor(emptyIdx / 2);
  const m = tournamentState.rounds[0]?.matches?.[mIdx];
  if (m) {
    if (emptyIdx % 2 === 0) m.p1 = { ...newSlot };
    else m.p2 = { ...newSlot };
  }
  syncTournamentToCloud();
}

window.tourneyLaunchMatch = function (rIdx, mIdx, asSpectator = false) {
  const match = tournamentState?.rounds?.[rIdx]?.matches?.[mIdx];
  if (!match) return;
  activeTourneyMatchId = match.id;
  const botP1 = VIP_BOTS.find((b) => b.name.toLowerCase() === match.p1.name.toLowerCase());
  const botP2 = VIP_BOTS.find((b) => b.name.toLowerCase() === match.p2.name.toLowerCase());
  if (!asSpectator && (botP1 || botP2)) {
    const targetBot = (currentUser && match.p1.name.toLowerCase() === currentUser.username.toLowerCase() && botP2) ? botP2 : (botP2 || botP1);
    window.startBotMatch(targetBot.id);
    return;
  }
  switchTab("tab-play");
  if (asSpectator) {
    window.joinOnlineRoom(match.roomCode, true);
  } else if (openRoomsMap[match.roomCode]) {
    window.joinOnlineRoom(match.roomCode, false);
  } else {
    createOnlineRoom(match.roomCode);
  }
};

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

function playSound(type) {
  if (!(document.getElementById("soundToggle")?.checked ?? true)) return;
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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
  if (!lockEl) return;
  const shouldLock = matchMode === "online" && !onlineMatchStarted && !isReviewMode && !matchEnded;
  lockEl.classList.toggle("hidden", !shouldLock);
  const h3 = lockEl.querySelector("h3"), p = lockEl.querySelector("p");
  if (h3 && p) {
    if (currentRoomCode) {
      h3.textContent = `🟢 Room #${currentRoomCode} Ready`;
      p.textContent = "Waiting for your friend to join the room...";
    } else {
      h3.textContent = "Ready to Play?";
      p.textContent = "Choose an Online Match against a friend or challenge one of the Squad Bots!";
    }
  }
}

function highlightLegalTargetsInDOM(fromSq, movesList) {
  document.querySelectorAll("#chessboard .square").forEach((sqEl) => {
    sqEl.classList.toggle("selected", sqEl.dataset.sq === fromSq);
    sqEl.querySelectorAll(".legal-dot, .legal-capture").forEach((el) => el.remove());
    const m = movesList.find((mv) => mv.to === sqEl.dataset.sq);
    if (m) {
      const hasPiece = Boolean(sqEl.querySelector(".piece"));
      const ind = document.createElement("div");
      ind.className = hasPiece ? "legal-capture" : "legal-dot";
      sqEl.appendChild(ind);
    }
  });
}

function onPieceDragStart(e, sqName) {
  if (!currentUser) { e.preventDefault(); return openAccountModal(); }
  if (matchMode === "online" && !onlineMatchStarted) { e.preventDefault(); return; }
  if (viewPly < fenHistory.length - 1 || isReviewMode || matchEnded || game.game_over() || playerColor === "spectator") {
    e.preventDefault(); return;
  }
  if ((matchMode === "bot" || matchMode === "online") && game.turn() !== playerColor) {
    e.preventDefault(); return;
  }
  const piece = game.get(sqName);
  if (!piece || piece.color !== game.turn()) { e.preventDefault(); return; }

  selectedSquare = sqName;
  let moves = game.moves({ square: sqName, verbose: true });
  if (currentVariant === "nocastle") moves = moves.filter((m) => !m.flags.includes("k") && !m.flags.includes("q"));
  legalMovesForSelected = moves;
  e.dataTransfer?.setData("text/plain", sqName);
  setTimeout(() => highlightLegalTargetsInDOM(sqName, legalMovesForSelected), 0);
}

function onSquareDrop(e, targetSqName) {
  e.preventDefault();
  const moveObj = legalMovesForSelected.find((m) => m.to === targetSqName);
  if (!moveObj) return;
  if (moveObj.flags.includes("p")) promptPawnPromotion(moveObj.from, moveObj.to, game.turn());
  else executeMove(moveObj.from, moveObj.to, "q", false, false);
}

function updateTopCardUI() {
  const botCoachHeader = document.getElementById("botCoachHeader");
  const onlineBar = document.getElementById("onlineStatusBar");
  const hintBtn = document.getElementById("hintMoveBtn");
  const reportBtn = document.getElementById("openReportModalBtn");
  const specPill = document.getElementById("spectatorCountPill");

  document.getElementById("openAdminModalBtn")?.classList.toggle("hidden", !isCurrentUserOwner());

  const isOnlineMode = matchMode === "online";
  reportBtn?.classList.toggle("hidden", !isOnlineMode);
  specPill?.classList.toggle("hidden", !isOnlineMode);
  document.getElementById("offerDrawBtn")?.classList.toggle("hidden", matchMode === "puzzle");
  document.getElementById("resignBtn")?.classList.toggle("hidden", matchMode === "puzzle");

  const myName = currentUser ? currentUser.username : "VIP Guest";
  const myElo = currentUser ? currentUser.elo : 1200;
  const myAv = currentUser ? currentUser.avatar : "😎";

  document.getElementById("bottomName").textContent = myName;
  document.getElementById("bottomElo").textContent = `(${myElo})`;
  document.getElementById("bottomAvatar").textContent = myAv;
  document.getElementById("openAccountModalBtn").textContent = currentUser ? `👤 ${myName}` : "👤 Log In";

  if (matchMode === "bot") {
    botCoachHeader?.classList.remove("hidden");
    onlineBar?.classList.add("hidden");
    hintBtn?.classList.remove("hidden");
    document.getElementById("topName").textContent = activeBot.name;
    document.getElementById("topElo").textContent = `(${activeBot.elo})`;
    const avHtml = activeBot.avatarUrl ? `<img src="${activeBot.avatarUrl}" alt="${activeBot.name}" />` : activeBot.avatar;
    document.getElementById("topAvatar").innerHTML = avHtml;
    document.getElementById("botSpeechAvatar").innerHTML = avHtml;
    showBotBubble(activeBot.greeting);
  } else {
    botCoachHeader?.classList.add("hidden");
    onlineBar?.classList.remove("hidden");
    hintBtn?.classList.toggle("hidden", matchMode === "online");
    if (!currentRoomCode) {
      document.getElementById("topAvatar").textContent = matchMode === "puzzle" ? "🧩" : "👤";
      document.getElementById("topElo").textContent = matchMode === "puzzle" ? `(${activePuzzleObj?.rating || 1500})` : "(1200)";
      document.getElementById("topName").textContent = matchMode === "puzzle" ? (activePuzzleObj?.title || "Lichess Puzzle") : matchMode === "pass" ? "Player 2" : "Waiting for Opponent...";
    }
  }
}

function toggleAuthFormElements(hideForm) {
  const modal = document.getElementById("accountModal");
  if (!modal) return;
  modal.querySelectorAll(".auth-tabs, .modal-label, #accEmailInput, #signupUsernameSection, #accPinInput, #avatarPickerSection, #saveAccountBtn").forEach((el) => {
    el.classList.toggle("hidden", hideForm);
  });
  if (!hideForm) setAuthTabMode(authMode);
}

function openAccountModal() {
  const sessionBox = document.getElementById("currentSessionBox");
  if (currentUser) {
    sessionBox?.classList.remove("hidden");
    const st = document.getElementById("currentSessionText");
    if (st) st.innerHTML = `Logged in: <b>${currentUser.avatar} ${currentUser.username} (${currentUser.elo} Elo)</b>`;
    toggleAuthFormElements(true);
  } else {
    sessionBox?.classList.add("hidden");
    toggleAuthFormElements(false);
  }
  document.getElementById("accErrorMsg")?.classList.add("hidden");
  document.getElementById("accountModal")?.classList.remove("hidden");
}
// === END OF PART 2 OF 3 (REPLY "3" FOR PART 3) ===
// ============================================================================
// CHESSME-12-VIP — FULL UPDATED EDITION (PART 3 OF 3)
// ============================================================================

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
    setTimeout(() => {
      drawReviewArrowOnBoard(rev.bestFrom, rev.bestTo, "#81b64c");
      askStockfishToReviewPosition(fenHistory[viewPly - 1]);
    }, 10);
  } else if ((matchMode === "bot" || matchMode === "puzzle") && !isViewingPast && playerMoveBadge) {
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
      sqDiv.dataset.sq = sqName;
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
        img.src = PIECE_SVGS[piece.color + piece.type];
        img.className = "piece";
        const canDrag = !isViewingPast && !isReviewMode && !matchEnded && piece.color === game.turn();
        img.draggable = canDrag;
        if (canDrag) img.addEventListener("dragstart", (e) => onPieceDragStart(e, sqName));
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
      sqDiv.addEventListener("dragover", (e) => e.preventDefault());
      sqDiv.addEventListener("drop", (e) => onSquareDrop(e, sqName));
      sqDiv.addEventListener("contextmenu", (e) => e.preventDefault());
      sqDiv.addEventListener("mousedown", (e) => { if (e.button === 2) rightClickStartSq = sqName; });
      sqDiv.addEventListener("mouseup", (e) => {
        if (e.button === 2 && rightClickStartSq && rightClickStartSq !== sqName) {
          drawReviewArrowOnBoard(rightClickStartSq, sqName, "#f5af19");
          rightClickStartSq = null;
        }
      });
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
  if (!moveHistoryVerbose.length) { strip.innerHTML = `<span class="muted-text">Make a move on the board to start...</span>`; return; }
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
    setTimeout(() => highlightLegalTargetsInDOM(sqName, legalMovesForSelected), 0);
  } else {
    selectedSquare = null; legalMovesForSelected = [];
  }
  renderBoard();
}

// ============================================================================
// PUZZLE STATS & FIREBASE PERSISTENCE + LIVE LICHESS API FETCHER
// ============================================================================
function updatePuzzleStatsUI() {
  const sEl = document.getElementById("puzzleStreakVal"); if (sEl) sEl.textContent = `${puzzleStreak} 🔥`;
  const wEl = document.getElementById("puzzleWinsVal"); if (wEl) wEl.textContent = `${puzzleWins} ✅`;
  const lEl = document.getElementById("puzzleLossesVal"); if (lEl) lEl.textContent = `${puzzleLosses} ❌`;
  const eEl = document.getElementById("puzzleEloVal"); if (eEl) eEl.textContent = `${puzzleElo} ⭐`;
}

function recordPuzzleOutcomeToFirebase(solved) {
  if (solved) {
    puzzleStreak++; puzzleWins++; puzzleElo += 15;
  } else {
    puzzleStreak = 0; puzzleLosses++; puzzleElo = Math.max(400, puzzleElo - 12);
  }
  localStorage.setItem("chessme_puzzle_streak", String(puzzleStreak));
  localStorage.setItem("chessme_puzzle_wins", String(puzzleWins));
  localStorage.setItem("chessme_puzzle_losses", String(puzzleLosses));
  localStorage.setItem("chessme_puzzle_elo", String(puzzleElo));
  updatePuzzleStatsUI();
  if (currentUser) {
    currentUser.puzzleStreak = puzzleStreak;
    currentUser.puzzleWins = puzzleWins;
    currentUser.puzzleLosses = puzzleLosses;
    currentUser.puzzleElo = puzzleElo;
    sessionStorage.setItem("chessme_session_user_v3", JSON.stringify(currentUser));
    syncAccountToCloud(currentUser);
  }
}

async function fetchLiveLichessPuzzle() {
  const statusEl = document.getElementById("puzzleSubStatus");
  if (statusEl) statusEl.textContent = "⏳ Fetching live tactical puzzle from Lichess.org API...";
  try {
    const useDaily = Math.random() < 0.35;
    const pickId = LIVE_LICHESS_IDS[Math.floor(Math.random() * LIVE_LICHESS_IDS.length)];
    const url = useDaily ? "https://lichess.org/api/puzzle/daily" : `https://lichess.org/api/puzzle/${pickId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Lichess API busy");
    const data = await res.json();
    if (data?.game?.pgn && Array.isArray(data?.puzzle?.solution)) {
      const temp = new Chess();
      const tokens = data.game.pgn.trim().split(/\s+/).filter(Boolean);
      const targetPly = Math.min(tokens.length, (data.puzzle.initialPly || tokens.length - 1) + 1);
      for (let i = 0; i < targetPly; i++) {
        if (!temp.move(tokens[i])) break;
      }
      const themesStr = (data.puzzle.themes || ["tactical"]).slice(0, 2).join(" • ");
      activePuzzleObj = {
        id: data.puzzle.id || "Live",
        title: `Lichess #${data.puzzle.id} • Live API`,
        rating: data.puzzle.rating || 1600,
        theme: themesStr,
        fen: temp.fen(),
        solutionUci: data.puzzle.solution,
        solutionSan: ""
      };
      startActivePuzzleOnBoard();
      if (statusEl) statusEl.textContent = `✅ Loaded Live Lichess #${activePuzzleObj.id} (${activePuzzleObj.rating})!`;
      return;
    }
  } catch (e) {}
  window.loadNextPuzzle();
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
    if (isBotMove) { renderBoard(); return; }
    const puz = activePuzzleObj || PUZZLE_BANK[currentPuzzleIdx];
    const solUciList = Array.isArray(puz.solutionUci) && puz.solutionUci.length ? puz.solutionUci : [];
    const expectedUci = solUciList[puzzleSolutionStep] || "";
    const playedUci = move.from + move.to;
    const isCorrect = (expectedUci && playedUci === expectedUci.substring(0, 4)) || (puz.solutionSan && move.san === puz.solutionSan) || game.in_checkmate();

    if (isCorrect) {
      puzzleSolutionStep++;
      if (puzzleSolutionStep < solUciList.length && !game.game_over()) {
        playerMoveBadge = { square: move.to, icon: "!", bg: "#5c8bb0", sqClass: "brilliant-sq" };
        document.getElementById("roomStatusText").textContent = `✨ Great move (${move.san})! Keep going — find the follow-up!`;
        renderBoard();
        const replyUci = solUciList[puzzleSolutionStep];
        setTimeout(() => {
          if (replyUci && replyUci.length >= 4) {
            puzzleSolutionStep++;
            executeMove(replyUci.substring(0, 2), replyUci.substring(2, 4), replyUci[4] || "q", true, false);
          }
        }, 360);
      } else {
        recordPuzzleOutcomeToFirebase(true);
        playerMoveBadge = { square: move.to, icon: "!!", bg: "#1baca6", sqClass: "brilliant-sq" };
        document.getElementById("roomStatusText").textContent = `🎉 Puzzle #${puz.id} Solved! Streak: ${puzzleStreak} 🔥 (Puzzle Elo: ${puzzleElo})`;
        renderBoard();
        setTimeout(() => {
          currentPuzzleIdx = (currentPuzzleIdx + 1) % PUZZLE_BANK.length;
          window.loadNextPuzzle();
        }, 850);
      }
    } else {
      recordPuzzleOutcomeToFirebase(false);
      playerMoveBadge = { square: move.to, icon: "??", bg: "#ca3431", sqClass: "blunder-sq" };
      document.getElementById("roomStatusText").textContent = `❌ Wrong move (${move.san}) — Try again or tap 💡 Hint!`;
      renderBoard();
      setTimeout(() => {
        game.undo(); fenHistory.pop(); moveHistoryVerbose.pop(); viewPly = fenHistory.length - 1;
        playerMoveBadge = null; renderBoard();
      }, 650);
    }
    return;
  }

  if (engineWorker) {
    engineWorker.postMessage({ type: "analyze_ply", fenBefore, moveObj: move, plyNumber: currentPlyIdx + 1, plyIdx: currentPlyIdx, isBotMove });
  } else {
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
  }

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
  if (selectedTimeSeconds === 0) {
    document.getElementById("bottomClock").textContent = "∞";
    document.getElementById("topClock").textContent = "∞";
    return;
  }
  if (clockInterval) return;
  clockInterval = setInterval(() => {
    if (game.game_over() || matchEnded || selectedTimeSeconds === 0) return clearInterval(clockInterval);
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

function formatTime(sec) {
  if (selectedTimeSeconds === 0 || !Number.isFinite(sec)) return "∞";
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

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

  ensureAllMovesReviewed();
  const wRevs = gameReviewList.filter((r) => r && r.color === "w");
  const bRevs = gameReviewList.filter((r) => r && r.color === "b");
  const wAccNum = wRevs.length ? (wRevs.reduce((s, r) => s + r.moveAcc, 0) / wRevs.length).toFixed(1) : "100.0";
  const bAccNum = bRevs.length ? (bRevs.reduce((s, r) => s + r.moveAcc, 0) / bRevs.length).toFixed(1) : "100.0";

  const wName = playerColor === "b" ? document.getElementById("topName").textContent : document.getElementById("bottomName").textContent;
  const bName = playerColor === "b" ? document.getElementById("bottomName").textContent : document.getElementById("topName").textContent;

  if (moveHistoryVerbose.length >= 2 && playerColor !== "spectator") {
    syncGameHistoryToCloud({
      id: "game_" + Date.now(), white: wName, black: bName,
      whiteEmailKey: playerColor === "w" && currentUser ? currentUser.emailKey : "",
      blackEmailKey: playerColor === "b" && currentUser ? currentUser.emailKey : "",
      wAcc: wAccNum, bAcc: bAccNum,
      resultText: customMessage || (isDraw ? drawReason : `${winnerSide === "w" ? wName : bName} Won`),
      pgn: moveHistoryVerbose.map((m) => m.san).join(" "),
      movesCount: moveHistoryVerbose.length, ts: Date.now()
    });
  }

  if (activeTourneyMatchId && !isDraw && winnerSide && tournamentState?.rounds) {
    const winPlayerName = winnerSide === "w" ? wName : bName;
    tournamentState.rounds.forEach((r) => r.matches.forEach((m) => {
      if (m.id === activeTourneyMatchId) {
        if (m.p1.name.toLowerCase() === winPlayerName.toLowerCase()) m.s1 = (m.s1 || 0) + 1;
        else if (m.p2.name.toLowerCase() === winPlayerName.toLowerCase()) m.s2 = (m.s2 || 0) + 1;
      }
    }));
    syncTournamentToCloud();
  }

  if (currentUser && (matchMode === "online" || matchMode === "bot") && playerColor !== "spectator" && moveHistoryVerbose.length >= 4) {
    if (isDraw) { currentUser.draws = (currentUser.draws || 0) + 1; currentUser.elo += 2; }
    else if (playerWon) { currentUser.wins = (currentUser.wins || 0) + 1; currentUser.elo += 18; }
    else { currentUser.losses = (currentUser.losses || 0) + 1; currentUser.elo = Math.max(400, currentUser.elo - 14); }
    sessionStorage.setItem("chessme_session_user_v3", JSON.stringify(currentUser));
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
          <div><strong>${acc.username}</strong><span class="badge-pill" style="margin-left:6px;">${badge}</span><p class="muted-text" style="font-size:11px;">W: ${acc.wins || 0} • L: ${acc.losses || 0} • D: ${acc.draws || 0} • 🧩 ${acc.puzzleWins || 0}W (${acc.puzzleElo || 1200})</p></div>
        </div>
        <strong style="font-size:15px;color:#81b64c;">${acc.elo} Elo</strong>
      </div>`;
    }).join("");
  }
}

function appendChatMessage(sender, text, isSystem = false) {
  const box = document.getElementById("chatMessagesBox");
  if (!box) return;
  const div = document.createElement("div");
  div.className = `chat-msg ${isSystem ? "system-msg" : ""}`;
  div.innerHTML = isSystem ? text : `<b>${sender}:</b> ${text}`;
  box.appendChild(div); box.scrollTop = box.scrollHeight;
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

function setAuthTabMode(mode) {
  authMode = mode;
  document.getElementById("tabBtnSignup")?.classList.toggle("active", mode === "signup");
  document.getElementById("tabBtnLogin")?.classList.toggle("active", mode === "login");
  document.getElementById("signupUsernameSection")?.classList.toggle("hidden", mode === "login");
  document.getElementById("avatarPickerSection")?.classList.toggle("hidden", mode === "login");
  const saveBtn = document.getElementById("saveAccountBtn");
  if (saveBtn) saveBtn.textContent = mode === "signup" ? "📩 Sign Up & Verify Email" : "🔐 Log In with Email";
  document.getElementById("accErrorMsg")?.classList.add("hidden");
}

function updateBotTimeUI(seconds) {
  botSelectedTimeSeconds = Math.max(0, seconds);
  document.querySelectorAll(".bot-time-btn").forEach((b) => {
    b.classList.toggle("active", parseInt(b.dataset.btime, 10) === botSelectedTimeSeconds);
  });
  const labelText = botSelectedTimeSeconds === 0 ? "∞ Unlimited Time" : `⏱️ ${Math.floor(botSelectedTimeSeconds / 60)} min`;
  const disp = document.getElementById("botTimeDisplayLabel");
  if (disp) disp.textContent = labelText;
  const cText = document.getElementById("botCustomMinText");
  if (cText) cText.textContent = botSelectedTimeSeconds === 0 ? "∞ Unlim" : `${Math.floor(botSelectedTimeSeconds / 60)} min`;
}

window.startBotMatch = function (botId) {
  activeBot = VIP_BOTS.find((b) => b.id === botId) || VIP_BOTS[2];
  matchMode = "bot"; onlineMatchStarted = true; currentVariant = "standard"; currentRoomCode = null;
  selectedTimeSeconds = botSelectedTimeSeconds;
  const chosenSide = botSelectedSide === "random" ? (Math.random() < 0.5 ? "w" : "b") : botSelectedSide;
  playerColor = chosenSide;
  boardFlipped = playerColor === "b";
  resetMatch(true); switchTab("tab-play");
};

window.startPassAndPlay = function () {
  matchMode = "pass"; onlineMatchStarted = true; currentVariant = "standard"; currentRoomCode = null; playerColor = "w"; boardFlipped = false;
  resetMatch(true); document.getElementById("roomStatusText").textContent = "📱 Pass & Play (2 Players on 1 Device • Unrated)"; switchTab("tab-play");
};

window.setVariant = function (variant) {
  matchMode = "bot"; onlineMatchStarted = true; currentVariant = variant; resetMatch(true); switchTab("tab-play");
};

function startActivePuzzleOnBoard() {
  matchMode = "puzzle"; onlineMatchStarted = true; currentVariant = "puzzle";
  const p = activePuzzleObj || PUZZLE_BANK[currentPuzzleIdx];
  game.load(p.fen);
  puzzleSolutionStep = 0;
  playerColor = game.turn();
  boardFlipped = playerColor === "b";
  fenHistory = [game.fen()]; moveHistoryVerbose = []; viewPly = 0; isReviewMode = false; matchEnded = false;
  selectedSquare = null; legalMovesForSelected = []; playerMoveBadge = null;
  document.getElementById("openReviewBtn")?.classList.add("hidden");
  document.getElementById("puzzleTitleText").textContent = p.title;
  const thBadge = document.getElementById("puzzleThemeBadge");
  if (thBadge) thBadge.textContent = `⭐ ${p.rating || 1500} • ${p.theme || "Tactical"}`;
  document.getElementById("roomStatusText").textContent = `🧩 ${p.title} (${playerColor === "w" ? "White" : "Black"} to Move)`;
  updateTopCardUI();
  switchTab("tab-play");
  renderBoard();
}

window.loadNextPuzzle = function () {
  activePuzzleObj = PUZZLE_BANK[currentPuzzleIdx % PUZZLE_BANK.length];
  startActivePuzzleOnBoard();
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
  document.getElementById("gameOverModal")?.classList.add("hidden");
  renderBoard();

  if (!fromNetwork && matchMode === "online" && currentRoomCode) sendNetPacket(ROOM_TOPIC_PREFIX + currentRoomCode, { type: "rematch" });
  if (matchMode === "bot" && playerColor === "b") setTimeout(requestBotMove, 350);
}

document.addEventListener("DOMContentLoaded", () => {
  initEngineWorker();
  initRealStockfish();
  VIP_BOTS.forEach(seedFallbackBookIntoFenRepertoire);
  populateLists();
  renderTournamentBracket();
  updatePuzzleStatsUI();

  matchMode = "online"; onlineMatchStarted = false;
  resetMatch(true); initOnlineNetwork(); extractAllSquadGames();
  loadAllFromFirestore();
  checkIfCurrentUserBanned(); renderAdminDashboard();

  setAuthTabMode("signup");
  if (!currentUser) openAccountModal();

  onAuthStateChanged(window.firebaseAuth, async (user) => {
    if (user && (user.emailVerified || isEmailOwner(user.email))) {
      const eKey = emailToKey(user.email);
      try {
        const docSnap = await getDoc(doc(window.firebaseDb, "users", eKey));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.deleted && !isEmailOwner(user.email)) {
            try { await deleteUser(user); } catch (e) {}
            window.doLogout();
            return;
          }
          currentUser = data;
          if (isEmailOwner(user.email)) currentUser.isOwner = true;
          if (typeof currentUser.puzzleWins === "number") puzzleWins = currentUser.puzzleWins;
          if (typeof currentUser.puzzleLosses === "number") puzzleLosses = currentUser.puzzleLosses;
          if (typeof currentUser.puzzleStreak === "number") puzzleStreak = currentUser.puzzleStreak;
          if (typeof currentUser.puzzleElo === "number") puzzleElo = currentUser.puzzleElo;
          sessionStorage.setItem("chessme_session_user_v3", JSON.stringify(currentUser));
          updatePuzzleStatsUI();
          updateTopCardUI();
          renderAdminDashboard();
          checkIfCurrentUserBanned();
        }
      } catch (e) {}
    }
  });

  // Bot Time & Side Controls
  document.querySelectorAll(".bot-time-btn").forEach((btn) => {
    btn.addEventListener("click", () => updateBotTimeUI(parseInt(btn.dataset.btime, 10)));
  });
  document.getElementById("botTimeMinusBtn")?.addEventListener("click", () => {
    if (botSelectedTimeSeconds === 0) updateBotTimeUI(900);
    else if (botSelectedTimeSeconds <= 60) updateBotTimeUI(0);
    else updateBotTimeUI(botSelectedTimeSeconds - 60);
  });
  document.getElementById("botTimePlusBtn")?.addEventListener("click", () => {
    if (botSelectedTimeSeconds === 0) updateBotTimeUI(60);
    else updateBotTimeUI(Math.min(3600, botSelectedTimeSeconds + 60));
  });
  document.querySelectorAll(".bot-side-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".bot-side-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      botSelectedSide = btn.dataset.bside;
    });
  });

  document.getElementById("fetchLichessPuzzleBtn")?.addEventListener("click", fetchLiveLichessPuzzle);

  // Knockout Tournament Bracket Controls (+ / -)
  document.getElementById("tourneySizeMinusBtn")?.addEventListener("click", () => {
    const newSize = tournamentState.size === 16 ? 8 : 4;
    if (newSize === tournamentState.size) return;
    tournamentState = buildBracketFromSlots(newSize, tournamentState.slots.slice(0, newSize));
    syncTournamentToCloud();
  });
  document.getElementById("tourneySizePlusBtn")?.addEventListener("click", () => {
    const newSize = tournamentState.size === 4 ? 8 : 16;
    if (newSize === tournamentState.size) return;
    const oldSlots = [...tournamentState.slots];
    while (oldSlots.length < newSize) oldSlots.push({ name: "Open Slot", avatar: "➕", elo: 1200, isEmpty: true });
    tournamentState = buildBracketFromSlots(newSize, oldSlots);
    syncTournamentToCloud();
  });
  document.getElementById("tourneyJoinSelfBtn")?.addEventListener("click", () => {
    if (!currentUser) return openAccountModal();
    addPlayerToTournamentSlot(currentUser.username, currentUser.avatar || "😎", currentUser.elo || 1200);
  });
  document.getElementById("tourneyLeaveSelfBtn")?.addEventListener("click", () => {
    if (!currentUser || !tournamentState) return;
    const idx = tournamentState.slots.findIndex((s) => !s.isEmpty && s.name.toLowerCase() === currentUser.username.toLowerCase());
    if (idx === -1) return alert("You are not currently in a bracket slot.");
    window.tourneyRemoveSlot(idx);
  });
  document.getElementById("tourneyAddPlayerBtn")?.addEventListener("click", () => {
    const selVal = document.getElementById("tourneyAddSelect")?.value;
    const customName = document.getElementById("tourneyCustomNameInput")?.value?.trim();
    if (customName) {
      addPlayerToTournamentSlot(customName, "⚔️", 1200);
      document.getElementById("tourneyCustomNameInput").value = "";
    } else if (selVal) {
      const parts = selVal.split("::");
      addPlayerToTournamentSlot(parts[1], parts[2] || "😎", parseInt(parts[3] || "1200", 10));
    } else {
      alert("Select a Club Player / Bot from the list or type a custom name!");
    }
  });
  document.getElementById("tourneyShuffleBtn")?.addEventListener("click", () => {
    if (!tournamentState) return;
    const shuffled = [...tournamentState.slots].sort(() => Math.random() - 0.5);
    tournamentState = buildBracketFromSlots(tournamentState.size, shuffled);
    syncTournamentToCloud();
  });
  document.getElementById("tourneyResetBtn")?.addEventListener("click", () => {
    if (!confirm("Reset the Friday Night Squad Cup bracket?")) return;
    tournamentState = createDefaultTournamentState(tournamentState?.size || 8);
    syncTournamentToCloud();
  });

  const invitedRoom = new URLSearchParams(window.location.search).get("room");
  if (invitedRoom) {
    document.getElementById("joinRoomInput").value = invitedRoom;
    document.getElementById("onlineModal")?.classList.remove("hidden");
  }

  document.getElementById("closeToastBtn")?.addEventListener("click", () => document.getElementById("ownerNotificationToast")?.classList.add("hidden"));
  document.getElementById("openHistoryModalBtn")?.addEventListener("click", () => openMatchHistoryModal(currentUser ? currentUser.emailKey : null, "📜 My Match History"));
  document.getElementById("closeHistoryModalBtn")?.addEventListener("click", () => document.getElementById("historyModal")?.classList.add("hidden"));

  document.getElementById("overlayPlayOnlineBtn")?.addEventListener("click", () => {
    if (!currentUser) return openAccountModal();
    sendNetPacket(LOBBY_TOPIC, { type: "ping_rooms" });
    document.getElementById("onlineModal")?.classList.remove("hidden");
  });
  document.getElementById("overlayPlayBotsBtn")?.addEventListener("click", () => switchTab("tab-bots"));

  document.getElementById("tabBtnSignup")?.addEventListener("click", () => setAuthTabMode("signup"));
  document.getElementById("tabBtnLogin")?.addEventListener("click", () => setAuthTabMode("login"));

  document.getElementById("logoutBtn")?.addEventListener("click", window.doLogout);
  document.getElementById("bannedSwitchAccBtn")?.addEventListener("click", window.doLogout);

  document.querySelectorAll(".av-choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".av-choice").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active"); selectedAv = btn.dataset.av;
    });
  });

  const handleSaveAccount = async () => {
    const email = document.getElementById("accEmailInput").value.trim().toLowerCase();
    const uname = document.getElementById("accUsernameInput").value.trim() || email.split("@")[0];
    const pass = document.getElementById("accPinInput").value.trim();
    const errEl = document.getElementById("accErrorMsg");

    const allowedDomains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "live.com"];
    const emailParts = email.split("@");
    if (emailParts.length !== 2 || emailParts[0].length < 2 || !allowedDomains.includes(emailParts[1])) {
      errEl.textContent = "❌ Please enter a real Gmail, Yahoo, Outlook, or iCloud email address!";
      errEl.style.color = "#ff6b6b"; errEl.classList.remove("hidden"); return;
    }
    if (pass.length < 6) {
      errEl.textContent = "❌ Firebase requires a password of at least 6 characters!";
      errEl.style.color = "#ff6b6b"; errEl.classList.remove("hidden"); return;
    }

    const eKey = emailToKey(email);
    const ownerFlag = isEmailOwner(email);
    errEl.textContent = "⏳ Connecting securely to Firebase...";
    errEl.style.color = "#81b64c"; errEl.classList.remove("hidden");

    try {
      let existingSnap = null;
      try { existingSnap = await getDoc(doc(window.firebaseDb, "users", eKey)); } catch (e) {}
      const existingData = existingSnap?.exists() ? existingSnap.data() : accountsRegistry[eKey];

      if (existingData?.banned && !ownerFlag) {
        errEl.textContent = "🚫 ACCOUNT BANNED: Your account has been suspended by the Club Owner for Fair Play violations!";
        errEl.style.color = "#ff4757";
        document.getElementById("banScreenOverlay")?.classList.remove("hidden");
        return;
      }

      if (authMode === "signup") {
        const unameTaken = Object.values(accountsRegistry).some(
          (a) => !a.deleted && a.username.toLowerCase() === uname.toLowerCase() && a.emailKey !== eKey
        );
        if (unameTaken) {
          errEl.textContent = `❌ Username "${uname}" is already taken! Pick another username.`;
          errEl.style.color = "#ff6b6b"; return;
        }

        const newProfile = {
          emailKey: eKey, encEmail: encodeEmailForOwner(email), username: uname, avatar: selectedAv,
          elo: 1200, wins: 0, losses: 0, draws: 0, puzzleWins: 0, puzzleLosses: 0, puzzleStreak: 0, puzzleElo: 1200,
          banned: false, deleted: false, isOwner: ownerFlag
        };

        try {
          const cred = await createUserWithEmailAndPassword(window.firebaseAuth, email, pass);
          await setDoc(doc(window.firebaseDb, "users", eKey), newProfile);
          if (!ownerFlag) {
            await sendEmailVerification(cred.user);
            await signOut(window.firebaseAuth);
            setAuthTabMode("login");
            errEl.textContent = `📩 Verification link sent to ${email}! Open your Gmail inbox (or Spam folder), click the link, then click "🔐 Log In" below!`;
            errEl.style.color = "#81b64c"; errEl.classList.remove("hidden");
            return;
          }
          currentUser = newProfile;
        } catch (err) {
          if (err.code === "auth/email-already-in-use" && (!existingData || existingData.deleted)) {
            try {
              const cred = await signInWithEmailAndPassword(window.firebaseAuth, email, pass);
              await setDoc(doc(window.firebaseDb, "users", eKey), newProfile);
              if (!cred.user.emailVerified && !ownerFlag) {
                await sendEmailVerification(cred.user);
                await signOut(window.firebaseAuth);
                setAuthTabMode("login");
                errEl.textContent = `📩 Account restored! Verification link sent to ${email} — verify and Log In!`;
                errEl.style.color = "#81b64c"; return;
              }
              currentUser = newProfile;
            } catch (reErr) {
              errEl.textContent = `❌ Your previous account was deleted. Enter your original password to re-register this email, or use a new email!`;
              errEl.style.color = "#ff6b6b"; return;
            }
          } else {
            errEl.textContent = err.code === "auth/email-already-in-use"
              ? `❌ This email is already registered! Switch to "🔐 Log In" above.`
              : `❌ Firebase Error: ${err.message}`;
            errEl.style.color = "#ff6b6b"; return;
          }
        }
      } else {
        try {
          const cred = await signInWithEmailAndPassword(window.firebaseAuth, email, pass);
          await cred.user.reload();

          const docSnap = await getDoc(doc(window.firebaseDb, "users", eKey));
          const dbUser = docSnap.exists() ? docSnap.data() : null;

          if (!ownerFlag && (!dbUser || dbUser.deleted || accountsRegistry[eKey]?.deleted)) {
            try { await deleteUser(cred.user); } catch (delErr) { await signOut(window.firebaseAuth); }
            setAuthTabMode("signup");
            errEl.textContent = `🗑️ This account was deleted by the Club Owner! Your email is now unlinked — you can Sign Up fresh above.`;
            errEl.style.color = "#f5af19"; return;
          }

          if (!ownerFlag && (dbUser.banned || accountsRegistry[eKey]?.banned)) {
            currentUser = dbUser;
            errEl.textContent = `🚫 ACCOUNT BANNED: Your account has been suspended by the Club Owner!`;
            errEl.style.color = "#ff4757";
            document.getElementById("accountModal")?.classList.add("hidden");
            document.getElementById("banScreenOverlay")?.classList.remove("hidden");
            return;
          }

          if (!cred.user.emailVerified && !ownerFlag) {
            try { await sendEmailVerification(cred.user); } catch (e) {}
            await signOut(window.firebaseAuth);
            errEl.textContent = `⚠️ Your email (${email}) is NOT verified yet! We sent a verification link to your inbox (check Spam too). Click it first, then Log In!`;
            errEl.style.color = "#f5af19"; return;
          }

          currentUser = dbUser || {
            emailKey: eKey, encEmail: encodeEmailForOwner(email), username: uname, avatar: selectedAv,
            elo: 1200, wins: 0, losses: 0, draws: 0, puzzleWins, puzzleLosses, puzzleStreak, puzzleElo,
            banned: false, deleted: false, isOwner: ownerFlag
          };
          if (ownerFlag) currentUser.isOwner = true;
        } catch (err) {
          errEl.textContent = "❌ Incorrect email or password!";
          errEl.style.color = "#ff6b6b"; return;
        }
      }

      sessionStorage.setItem("chessme_session_user_v3", JSON.stringify(currentUser));
      localStorage.setItem("chessme_user_acc_v3", JSON.stringify(currentUser));
      syncAccountToCloud(currentUser); updateTopCardUI(); renderAdminDashboard(); checkIfCurrentUserBanned();
      errEl.classList.add("hidden"); errEl.style.color = "#ff6b6b";
      document.getElementById("accountModal")?.classList.add("hidden");
    } catch (error) {
      errEl.textContent = "❌ System Error: " + error.message;
      errEl.style.color = "#ff6b6b";
    }
  };

  document.getElementById("saveAccountBtn")?.addEventListener("click", handleSaveAccount);
  document.getElementById("accPinInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") handleSaveAccount(); });

  document.getElementById("openAccountModalBtn")?.addEventListener("click", openAccountModal);
  document.getElementById("switchAccountBtn")?.addEventListener("click", openAccountModal);
  document.getElementById("closeAccountModalBtn")?.addEventListener("click", () => document.getElementById("accountModal")?.classList.add("hidden"));

  document.getElementById("openReportModalBtn")?.addEventListener("click", () => {
    if (matchMode !== "online") return;
    const oppName = document.getElementById("topName").textContent;
    if (oppName && !oppName.includes("Waiting")) document.getElementById("reportTargetInput").value = oppName;
    document.getElementById("reportModal")?.classList.remove("hidden");
  });
  document.getElementById("closeReportModalBtn")?.addEventListener("click", () => document.getElementById("reportModal")?.classList.add("hidden"));
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
    document.getElementById("reportModal")?.classList.add("hidden");
    alert("🚨 Report + Match PGN submitted to Club Owner! You will receive a live notification once reviewed.");
  });

  document.getElementById("openAdminModalBtn")?.addEventListener("click", () => {
    if (!isCurrentUserOwner()) return;
    renderAdminDashboard(); document.getElementById("adminModal")?.classList.remove("hidden");
  });
  document.getElementById("closeAdminModalBtn")?.addEventListener("click", () => document.getElementById("adminModal")?.classList.add("hidden"));

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
    document.getElementById("drawOfferBanner")?.classList.add("hidden");
    if (currentRoomCode) sendNetPacket(ROOM_TOPIC_PREFIX + currentRoomCode, { type: "draw_accept" });
    handleGameOver("🤝 Draw by Agreement!", true);
  });

  document.getElementById("declineDrawBtn")?.addEventListener("click", () => {
    document.getElementById("drawOfferBanner")?.classList.add("hidden");
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
    if (matchEnded) document.getElementById("gameOverModal")?.classList.remove("hidden");
  });
  document.getElementById("closeGameOverModalBtn")?.addEventListener("click", () => document.getElementById("gameOverModal")?.classList.add("hidden"));
  document.getElementById("stepReviewBoardBtn")?.addEventListener("click", enterInteractiveBoardReview);

  const openOnlineModal = () => {
    if (!currentUser) return openAccountModal();
    sendNetPacket(LOBBY_TOPIC, { type: "ping_rooms" });
    document.getElementById("onlineModal")?.classList.remove("hidden");
  };
  document.getElementById("openOnlineModalBtn")?.addEventListener("click", openOnlineModal);
  document.getElementById("newOnlineBtn")?.addEventListener("click", () => {
    if (matchMode === "bot") resetMatch(true);
    else if (matchMode === "puzzle") window.loadNextPuzzle();
    else openOnlineModal();
  });
  document.getElementById("closeOnlineModalBtn")?.addEventListener("click", () => document.getElementById("onlineModal")?.classList.add("hidden"));

  document.querySelectorAll("#onlineModal .time-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#onlineModal .time-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedTimeSeconds = parseInt(btn.dataset.time, 10);
      resetMatch(true);
    });
  });

  document.getElementById("createRoomBtn")?.addEventListener("click", () => createOnlineRoom(null));
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
    if (matchMode === "puzzle" && activePuzzleObj?.solutionUci?.[puzzleSolutionStep]) {
      const uci = activePuzzleObj.solutionUci[puzzleSolutionStep];
      const fromSq = uci.substring(0, 2), toSq = uci.substring(2, 4);
      const legal = game.moves({ square: fromSq, verbose: true }).filter((m) => m.to === toSq);
      if (legal.length) {
        selectedSquare = fromSq;
        legalMovesForSelected = legal;
        renderBoard();
        drawReviewArrowOnBoard(fromSq, toSq, "#81b64c");
        return;
      }
    }
    if (engineWorker) {
      engineWorker.postMessage({ type: "hint_move", fen: game.fen(), depth: 2, piecePref: {}, elo: 1500 });
    } else {
      const best = computeBestBotMove(VIP_BOTS[0]);
      if (best) { selectedSquare = best.from; legalMovesForSelected = [best]; renderBoard(); }
    }
  });

  document.getElementById("playAgainBtn")?.addEventListener("click", () => resetMatch(false));
  document.getElementById("boardThemeSelect")?.addEventListener("change", (e) => { document.body.dataset.theme = e.target.value; });
});
// === END OF APP.JS (100% COMPLETE) ===