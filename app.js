// 注音練習小遊戲（GitHub Pages / 純前端）
// ✅ 模式1：聽音選（答對自動下一題）
// ✅ 模式2：找出全部目標（找完自動下一題）
// ✅ 模式3：依序散找（點錯閃紅、保留進度）
// ✅ 5位玩家（西瓜/柚子/小樂/阿噗/安安）獨立分數/錯題本（localStorage）
// ✅ 錯題本 + 錯題再練（答對會扣回錯題數）
// ✅ TTS 速度 UI（slow/normal/fast，記住設定）
// ✅ 音檔優先播放：./audio/zhuyin/<符號>.mp3，沒有才 fallback TTS

const $ = (sel) => document.querySelector(sel);

const els = {
  score: $("#score"),
  wrong: $("#wrong"),
  qTitle: $("#qTitle"),
  qSub: $("#qSub"),
  btnNew: $("#btnNew"),
  btnReplay: $("#btnReplay"),
  soundToggle: $("#soundToggle"),
  ttsToggle: $("#ttsToggle"),
  ttsSpeedSelect: $("#ttsSpeedSelect"),
  modeBtns: Array.from(document.querySelectorAll(".modeBtn")),
  mode1: $("#mode1"),
  mode2: $("#mode2"),
  mode3: $("#mode3"),
  choices: $("#choices"),
  grid2: $("#grid2"),
  grid3: $("#grid3"),
  m2Progress: $("#m2Progress"),
  m3Progress: $("#m3Progress"),
  sequenceBar: $("#sequenceBar"),

  // players
  playerSelect: $("#playerSelect"),
  btnResetPlayer: $("#btnResetPlayer"),

  // wrongbook
  btnWrongbook: $("#btnWrongbook"),
  wrongbookPanel: $("#wrongbookPanel"),
  btnCloseWrongbook: $("#btnCloseWrongbook"),
  wbPlayerName: $("#wbPlayerName"),
  wbM1List: $("#wbM1List"),
  wbMisclickList: $("#wbMisclickList"),
  wbSeqList: $("#wbSeqList"),
  btnPracticeM1: $("#btnPracticeM1"),
  btnPracticeMisclick: $("#btnPracticeMisclick"),
  btnPracticeSeq: $("#btnPracticeSeq"),
  btnClearM1: $("#btnClearM1"),
  btnClearMisclick: $("#btnClearMisclick"),
  btnClearSeq: $("#btnClearSeq"),
};

const PLAYERS = ["西瓜", "柚子", "小樂", "阿噗", "安安"];
const STORAGE_PREFIX = "zhuyin_game_v3";
const KEY_ACTIVE_PLAYER = `${STORAGE_PREFIX}:active_player`;
const KEY_TTS_SPEED = `${STORAGE_PREFIX}:tts_speed`;

function keyForPlayer(player) {
  return `${STORAGE_PREFIX}:player:${player}`;
}

const GRID_COLS = 7;

const state = {
  data: null,
  mode: 1,

  // settings
  soundOn: true,
  ttsOn: true,
  ttsSpeed: "normal", // slow | normal | fast

  // player
  player: PLAYERS[0],
  score: 0,
  wrong: 0,

  // wrongbook (per player)
  wb: {
    m1Wrong: {},   // {sym: count}
    misclick: {},  // {sym: count}
    seqFail: {},   // {"ㄅㄆㄇ": count}
  },

  // practice state
  practice: {
    active: false,
    type: null,          // "m1" | "misclick" | "seq"
    m1Queue: [],
    misclickTarget: null,
    seq: null,
  },

  // mode1
  m1: { bag: [], current: null, locked: false },

  // mode2
  m2: { level: null },

  // mode3
  m3: { level: null, stepIndex: 0 },
};

// ---------- utils ----------
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function sampleUnique(arr, n) {
  const copy = arr.slice();
  shuffle(copy);
  return copy.slice(0, n);
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function setGridCols(el, cols) {
  if (el) el.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
}
function setQuestion(title, sub = "") {
  if (els.qTitle) els.qTitle.textContent = title;
  if (els.qSub) els.qSub.textContent = sub;
}
function showMode(mode) {
  state.mode = mode;
  if (els.mode1) els.mode1.classList.toggle("hidden", mode !== 1);
  if (els.mode2) els.mode2.classList.toggle("hidden", mode !== 2);
  if (els.mode3) els.mode3.classList.toggle("hidden", mode !== 3);
  els.modeBtns.forEach((btn) =>
    btn.classList.toggle("active", Number(btn.dataset.mode) === mode)
  );
}
function flashWrong(dom) {
  if (!dom) return;
  dom.classList.add("flash-wrong");
  setTimeout(() => dom.classList.remove("flash-wrong"), 450);
}
function incCount(map, key, delta = 1) {
  map[key] = (map[key] || 0) + delta;
  if (map[key] <= 0) delete map[key];
}
function topEntries(map, limit = 12) {
  return Object.entries(map)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], "zh-Hant"))
    .slice(0, limit);
}

// ---------- stats ----------
function updateStats() {
  if (els.score) els.score.textContent = String(state.score);
  if (els.wrong) els.wrong.textContent = String(state.wrong);
}

// ---------- beeps ----------
let audioCtx = null;
function beep(type = "good") {
  if (!state.soundOn) return;
  try {
    audioCtx =
      audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = type === "good" ? 880 : 220;
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      o.disconnect();
      g.disconnect();
    }, 110);
  } catch (_) {}
}

// ---------- audio first, TTS fallback ----------
function speakZhuyin(text) {
  if (!text) return;

  // 音檔優先：路徑為 ./audio/zhuyin/<符號>.mp3
  const audioPath = `./audio/zhuyin/${text}.mp3`;
  const a = new Audio(audioPath);
  a.volume = 1.0;

  a.play().catch(() => {
    // 沒音檔或播放失敗才用 TTS
    fallbackTTS(text);
  });
}

function fallbackTTS(text) {
  if (!state.ttsOn) return;
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  const rateMap = { slow: 0.60, normal: 0.75, fast: 0.95 };
  u.rate = rateMap[state.ttsSpeed] ?? 0.75;
  u.pitch = 1.0;
  u.volume = 1.0;

  const voices = window.speechSynthesis.getVoices?.() || [];
  const preferred =
    voices.find((v) => (v.lang || "").toLowerCase().includes("zh-tw")) ||
    voices.find((v) => (v.lang || "").toLowerCase().includes("zh-hant")) ||
    voices.find((v) => (v.lang || "").toLowerCase().startsWith("zh")) ||
    null;
  if (preferred) u.voice = preferred;

  window.speechSynthesis.speak(u);
}

// ---------- storage ----------
function loadActivePlayer() {
  const saved = localStorage.getItem(KEY_ACTIVE_PLAYER);
  if (saved && PLAYERS.includes(saved)) return saved;
  return PLAYERS[0];
}
function saveActivePlayer(player) {
  localStorage.setItem(KEY_ACTIVE_PLAYER, player);
}

function loadTtsSpeed() {
  const v = localStorage.getItem(KEY_TTS_SPEED);
  if (v === "slow" || v === "normal" || v === "fast") return v;
  return "normal";
}
function saveTtsSpeed(v) {
  localStorage.setItem(KEY_TTS_SPEED, v);
}

function loadPlayerData(player) {
  try {
    const raw = localStorage.getItem(keyForPlayer(player));
    if (!raw) {
      return { score: 0, wrong: 0, wb: { m1Wrong: {}, misclick: {}, seqFail: {} } };
    }
    const obj = JSON.parse(raw);
    return {
      score: Number(obj?.score || 0),
      wrong: Number(obj?.wrong || 0),
      wb: {
        m1Wrong: obj?.wb?.m1Wrong || {},
        misclick: obj?.wb?.misclick || {},
        seqFail: obj?.wb?.seqFail || {},
      },
    };
  } catch (_) {
    return { score: 0, wrong: 0, wb: { m1Wrong: {}, misclick: {}, seqFail: {} } };
  }
}

function savePlayerData(player) {
  const payload = {
    score: state.score,
    wrong: state.wrong,
    wb: state.wb,
  };
  localStorage.setItem(keyForPlayer(player), JSON.stringify(payload));
}

function resetCurrentPlayerAll() {
  state.score = 0;
  state.wrong = 0;
  state.wb = { m1Wrong: {}, misclick: {}, seqFail: {} };
  state.practice = {
    active: false,
    type: null,
    m1Queue: [],
    misclickTarget: null,
    seq: null,
  };
  savePlayerData(state.player);
  updateStats();
  renderWrongbook();
}

function clearWrongbookSection(section) {
  if (section === "m1") state.wb.m1Wrong = {};
  if (section === "misclick") state.wb.misclick = {};
  if (section === "seq") state.wb.seqFail = {};
  savePlayerData(state.player);
  renderWrongbook();
}

// ---------- load data ----------
async function loadData() {
  const res = await fetch("./data/zhuyin.json");
  if (!res.ok) throw new Error("Failed to load data/zhuyin.json");
  return await res.json();
}

// ---------- wrongbook UI ----------
function showWrongbook(open) {
  if (!els.wrongbookPanel) return;
  els.wrongbookPanel.classList.toggle("hidden", !open);
  if (open) renderWrongbook();
}

function renderWrongbook() {
  if (!els.wrongbookPanel) return;

  if (els.wbPlayerName) els.wbPlayerName.textContent = state.player;

  // Mode1 wrong targets
  const m1Top = topEntries(state.wb.m1Wrong, 18);
  if (els.wbM1List) {
    els.wbM1List.innerHTML = "";
    if (m1Top.length === 0) {
      els.wbM1List.innerHTML = `<div class="wbEmpty">目前沒有模式1錯題 🎉</div>`;
    } else {
      m1Top.forEach(([sym, c]) => {
        const tag = document.createElement("div");
        tag.className = "wbTag";
        tag.innerHTML = `<span>${sym}</span><span class="wbCount">×${c}</span>`;
        els.wbM1List.appendChild(tag);
      });
    }
  }

  // Misclick
  const misTop = topEntries(state.wb.misclick, 18);
  if (els.wbMisclickList) {
    els.wbMisclickList.innerHTML = "";
    if (misTop.length === 0) {
      els.wbMisclickList.innerHTML = `<div class="wbEmpty">目前沒有常點錯符號 🎉</div>`;
    } else {
      misTop.forEach(([sym, c]) => {
        const tag = document.createElement("div");
        tag.className = "wbTag";
        tag.innerHTML = `<span>${sym}</span><span class="wbCount">×${c}</span>`;
        els.wbMisclickList.appendChild(tag);
      });
    }
  }

  // Seq fails
  const seqTop = topEntries(state.wb.seqFail, 12);
  if (els.wbSeqList) {
    els.wbSeqList.innerHTML = "";
    if (seqTop.length === 0) {
      els.wbSeqList.innerHTML = `<div class="wbEmpty">目前沒有卡關序列 🎉</div>`;
    } else {
      seqTop.forEach(([seqKey, c]) => {
        const pretty = seqKey.split("").join(" → ");
        const tag = document.createElement("div");
        tag.className = "wbTag";
        tag.innerHTML = `<span>${pretty}</span><span class="wbCount">×${c}</span>`;
        els.wbSeqList.appendChild(tag);
      });
    }
  }
}

// ---------- practice starters ----------
function startPracticeM1FromWrongbook() {
  const list = topEntries(state.wb.m1Wrong, 50).map(([sym]) => sym);
  if (list.length === 0) {
    setQuestion("錯題本是空的", "先做幾題再回來吧～");
    return;
  }
  state.practice.active = true;
  state.practice.type = "m1";
  state.practice.m1Queue = shuffle(list.slice());
  showWrongbook(false);
  showMode(1);
  startRound();
}

function startPracticeMisclickAsMode2() {
  const top = topEntries(state.wb.misclick, 1);
  if (top.length === 0) {
    setQuestion("沒有常錯符號", "先玩模式2/3累積誤點再來～");
    return;
  }
  const target = top[0][0];
  state.practice.active = true;
  state.practice.type = "misclick";
  state.practice.misclickTarget = target;
  showWrongbook(false);
  showMode(2);
  startRound();
}

function startPracticeSeqAsMode3() {
  const top = topEntries(state.wb.seqFail, 1);
  if (top.length === 0) {
    setQuestion("沒有卡關序列", "先玩模式3累積卡關序列再來～");
    return;
  }
  const seqKey = top[0][0];
  state.practice.active = true;
  state.practice.type = "seq";
  state.practice.seq = seqKey.split("");
  showWrongbook(false);
  showMode(3);
  startRound();
}

function stopPracticeIfNoQueue() {
  if (!state.practice.active) return;
  if (state.practice.type === "m1" && state.practice.m1Queue.length === 0) {
    state.practice = {
      active: false,
      type: null,
      m1Queue: [],
      misclickTarget: null,
      seq: null,
    };
  }
}

// ---------- Mode 1 ----------
function refillM1Bag() {
  state.m1.bag = shuffle(state.data.zhuyin.slice());
}
function getNextM1Target() {
  if (state.practice.active && state.practice.type === "m1") {
    if (state.practice.m1Queue.length > 0) return state.practice.m1Queue.shift();
    stopPracticeIfNoQueue();
  }
  if (!state.m1.bag.length) refillM1Bag();
  return state.m1.bag.pop();
}

function nextMode1() {
  const target = getNextM1Target();
  const pool = state.data.zhuyin.filter((z) => z !== target);
  const others = sampleUnique(pool, 3);
  const options = shuffle([target, ...others]);

  state.m1.current = { target, options };
  state.m1.locked = false;

  const title =
    state.practice.active && state.practice.type === "m1"
      ? `錯題再練（模式1｜${state.player}）`
      : `模式 1：聽音選出正確注音（${state.player}）`;

  setQuestion(title, "按「重播」聽發音，點選正確符號。答對自動下一題。");
  renderMode1();
  speakZhuyin(target);
}

function renderMode1() {
  if (!els.choices) return;
  els.choices.innerHTML = "";
  const cur = state.m1.current;
  if (!cur) return;

  cur.options.forEach((sym) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.type = "button";
    btn.textContent = sym;

    btn.addEventListener("click", () => {
      if (state.m1.locked) return;

      const correct = sym === cur.target;
      if (correct) {
        btn.classList.add("correct");
        beep("good");

        state.score += 10;
        updateStats();

        // practice reward: reduce wrong count
        if (state.practice.active && state.practice.type === "m1") {
          incCount(state.wb.m1Wrong, cur.target, -1);
          renderWrongbook();
        }

        savePlayerData(state.player);
        state.m1.locked = true;
        setTimeout(() => startRound(), 380);
      } else {
        btn.classList.add("wrong");
        beep("bad");

        state.wrong += 1;
        state.score = Math.max(0, state.score - 2);

        // record wrong target
        incCount(state.wb.m1Wrong, cur.target, +1);

        updateStats();
        savePlayerData(state.player);
        renderWrongbook();

        setQuestion(`模式 1：再試一次或按下一題（${state.player}）`, `目標正在念：${cur.target}（可按重播）`);
      }
    });

    els.choices.appendChild(btn);
  });
}

function replayMode1() {
  const cur = state.m1.current;
  if (cur) speakZhuyin(cur.target);
}

// ---------- Mode 2 ----------
function createMode2Level(targetOverride = null) {
  const zh = state.data.zhuyin;
  const target = targetOverride || zh[randInt(0, zh.length - 1)];
  const gridSize = 42;
  const targetCount = randInt(5, 10);
  const decoyUniqueCount = 14;

  const decoyPool = zh.filter((z) => z !== target);
  const decoyTypes = sampleUnique(decoyPool, decoyUniqueCount);

  const symbols = [];
  for (let i = 0; i < targetCount; i++) symbols.push(target);
  while (symbols.length < gridSize) {
    symbols.push(decoyTypes[randInt(0, decoyTypes.length - 1)]);
  }
  shuffle(symbols);

  const cells = symbols.map((s, idx) => ({
    id: `m2_${Date.now()}_${idx}_${Math.random().toString(16).slice(2)}`,
    symbol: s,
    isTarget: s === target,
    found: false,
  }));

  return { target, targetCount, foundCount: 0, cells };
}

function nextMode2() {
  const isPractice = state.practice.active && state.practice.type === "misclick";
  const target = isPractice ? state.practice.misclickTarget : null;

  state.m2.level = createMode2Level(target);
  setGridCols(els.grid2, GRID_COLS);

  const title = isPractice
    ? `錯題再練（常錯符號｜模式2｜${state.player}）`
    : `模式 2：找出全部目標（${state.player}）`;

  setQuestion(title, `請找出所有「${state.m2.level.target}」`);
  updateMode2Progress();
  renderMode2();
  speakZhuyin(state.m2.level.target);
}

function updateMode2Progress() {
  const lv = state.m2.level;
  if (!lv || !els.m2Progress) return;
  els.m2Progress.textContent = `已找到 ${lv.foundCount} / ${lv.targetCount}`;
}

function renderMode2() {
  const lv = state.m2.level;
  if (!lv || !els.grid2) return;

  els.grid2.innerHTML = "";
  lv.cells.forEach((cell) => {
    const d = document.createElement("div");
    d.className = "cell";
    d.textContent = cell.symbol;
    if (cell.found) d.classList.add("found");

    d.addEventListener("click", () => {
      if (cell.found) return;

      if (cell.isTarget) {
        cell.found = true;
        lv.foundCount += 1;

        state.score += 5;
        beep("good");
        updateStats();

        d.classList.add("found");
        updateMode2Progress();

        if (lv.foundCount >= lv.targetCount) {
          // practice reward: reduce misclick target count
          if (state.practice.active && state.practice.type === "misclick") {
            incCount(state.wb.misclick, lv.target, -1);
            renderWrongbook();
          }
          savePlayerData(state.player);
          setQuestion("🎉 找完了！", "自動進入下一題…");
          setTimeout(() => startRound(), 520);
        } else {
          savePlayerData(state.player);
        }
      } else {
        state.wrong += 1;
        state.score = Math.max(0, state.score - 1);
        beep("bad");
        updateStats();

        // record misclick symbol
        incCount(state.wb.misclick, cell.symbol, +1);
        savePlayerData(state.player);
        renderWrongbook();

        flashWrong(d);
      }
    });

    els.grid2.appendChild(d);
  });
}

function replayMode2() {
  const lv = state.m2.level;
  if (lv) speakZhuyin(lv.target);
}

// ---------- Mode 3 ----------
function pickRandomSequence() {
  if (state.practice.active && state.practice.type === "seq" && Array.isArray(state.practice.seq)) {
    return state.practice.seq.slice();
  }
  const seqs = state.data.sequences || [["ㄅ", "ㄆ", "ㄇ"]];
  const chosen = seqs[randInt(0, seqs.length - 1)];
  return chosen.slice();
}

function createMode3Level(sequence) {
  const zh = state.data.zhuyin;
  const gridSize = 42;
  const decoyUniqueCount = 14;
  const allowExtraTargets = true;

  const seqSet = new Set(sequence);
  const decoyPool = zh.filter((z) => !seqSet.has(z));
  const decoyTypes = sampleUnique(decoyPool, decoyUniqueCount);

  const symbols = sequence.slice();

  if (allowExtraTargets) {
    const extraCount = randInt(0, sequence.length);
    for (let i = 0; i < extraCount; i++) {
      symbols.push(sequence[randInt(0, sequence.length - 1)]);
    }
  }

  while (symbols.length < gridSize) {
    symbols.push(decoyTypes[randInt(0, decoyTypes.length - 1)]);
  }
  shuffle(symbols);

  const cells = symbols.map((s, idx) => ({
    id: `m3_${Date.now()}_${idx}_${Math.random().toString(16).slice(2)}`,
    symbol: s,
    done: false,
  }));

  return { sequence, cells };
}

function seqKeyOf(sequence) {
  return sequence.join("");
}

function nextMode3() {
  const sequence = pickRandomSequence();
  state.m3.level = createMode3Level(sequence);
  state.m3.stepIndex = 0;

  setGridCols(els.grid3, GRID_COLS);

  const isPractice = state.practice.active && state.practice.type === "seq";
  const title = isPractice
    ? `錯題再練（卡關序列｜模式3｜${state.player}）`
    : `模式 3：依序散找（保留進度｜${state.player}）`;

  setQuestion(title, `依序點：${sequence.join(" → ")}`);
  renderMode3();
  speakZhuyin(sequence[0]);
}

function updateMode3ProgressExplain() {
  const lv = state.m3.level;
  if (!lv || !els.m3Progress) return;
  const idx = state.m3.stepIndex;
  const next = lv.sequence[idx] ?? "完成";
  els.m3Progress.textContent = `下一個：${next}（${Math.min(idx + 1, lv.sequence.length)}/${lv.sequence.length}）`;
}

function renderSequenceBar() {
  const lv = state.m3.level;
  if (!lv || !els.sequenceBar) return;

  const idx = state.m3.stepIndex;
  els.sequenceBar.innerHTML = "";

  lv.sequence.forEach((sym, i) => {
    const pill = document.createElement("div");
    pill.className = "seqItem";
    pill.textContent = sym;
    if (i < idx) pill.classList.add("done");
    if (i === idx) pill.classList.add("next");
    els.sequenceBar.appendChild(pill);
  });
}

function renderMode3() {
  const lv = state.m3.level;
  if (!lv || !els.grid3) return;

  els.grid3.innerHTML = "";
  renderSequenceBar();
  updateMode3ProgressExplain();

  lv.cells.forEach((cell) => {
    const d = document.createElement("div");
    d.className = "cell";
    d.textContent = cell.symbol;
    if (cell.done) d.classList.add("found");

    d.addEventListener("click", () => {
      if (cell.done) return;

      const expected = lv.sequence[state.m3.stepIndex];

      if (cell.symbol === expected) {
        cell.done = true;
        d.classList.add("found");

        state.m3.stepIndex += 1;
        state.score += 8;
        beep("good");
        updateStats();

        renderSequenceBar();
        updateMode3ProgressExplain();

        if (state.m3.stepIndex >= lv.sequence.length) {
          // practice reward: reduce seq fail count
          if (state.practice.active && state.practice.type === "seq") {
            incCount(state.wb.seqFail, seqKeyOf(lv.sequence), -1);
            renderWrongbook();
          }
          savePlayerData(state.player);
          setQuestion("🎉 序列完成！", "自動進入下一題…");
          setTimeout(() => startRound(), 560);
        } else {
          savePlayerData(state.player);
          speakZhuyin(lv.sequence[state.m3.stepIndex]);
        }
      } else {
        // wrong click: keep progress
        state.wrong += 1;
        state.score = Math.max(0, state.score - 1);
        beep("bad");
        updateStats();

        // record misclick + sequence fail
        incCount(state.wb.misclick, cell.symbol, +1);
        incCount(state.wb.seqFail, seqKeyOf(lv.sequence), +1);

        savePlayerData(state.player);
        renderWrongbook();
        flashWrong(d);
      }
    });

    els.grid3.appendChild(d);
  });
}

function replayMode3() {
  const lv = state.m3.level;
  if (!lv) return;
  const next = lv.sequence[state.m3.stepIndex];
  if (next) speakZhuyin(next);
}

// ---------- round control ----------
function startRound() {
  if (!state.data) return;
  if (state.mode === 1) nextMode1();
  if (state.mode === 2) nextMode2();
  if (state.mode === 3) nextMode3();
}

function replay() {
  if (state.mode === 1) replayMode1();
  if (state.mode === 2) replayMode2();
  if (state.mode === 3) replayMode3();
}

// ---------- players UI ----------
function initPlayersUI() {
  if (!els.playerSelect) return;

  els.playerSelect.innerHTML = "";
  PLAYERS.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    els.playerSelect.appendChild(opt);
  });

  state.player = loadActivePlayer();
  els.playerSelect.value = state.player;

  const pd = loadPlayerData(state.player);
  state.score = pd.score;
  state.wrong = pd.wrong;
  state.wb = pd.wb;

  updateStats();
  renderWrongbook();

  els.playerSelect.addEventListener("change", (e) => {
    savePlayerData(state.player);

    const nextPlayer = e.target.value;
    state.player = nextPlayer;
    saveActivePlayer(nextPlayer);

    const pd2 = loadPlayerData(nextPlayer);
    state.score = pd2.score;
    state.wrong = pd2.wrong;
    state.wb = pd2.wb;

    // switch player stops practice to avoid mixing
    state.practice = {
      active: false,
      type: null,
      m1Queue: [],
      misclickTarget: null,
      seq: null,
    };

    updateStats();
    renderWrongbook();
    startRound();
  });

  if (els.btnResetPlayer) {
    els.btnResetPlayer.addEventListener("click", () => {
      if (!confirm(`要清除「${state.player}」的分數/錯誤 + 錯題本嗎？`)) return;
      resetCurrentPlayerAll();
      startRound();
    });
  }
}

// ---------- wrongbook bindings ----------
function bindWrongbook() {
  if (els.btnWrongbook) els.btnWrongbook.addEventListener("click", () => showWrongbook(true));
  if (els.btnCloseWrongbook) els.btnCloseWrongbook.addEventListener("click", () => showWrongbook(false));

  if (els.btnPracticeM1) els.btnPracticeM1.addEventListener("click", () => startPracticeM1FromWrongbook());
  if (els.btnPracticeMisclick) els.btnPracticeMisclick.addEventListener("click", () => startPracticeMisclickAsMode2());
  if (els.btnPracticeSeq) els.btnPracticeSeq.addEventListener("click", () => startPracticeSeqAsMode3());

  if (els.btnClearM1) {
    els.btnClearM1.addEventListener("click", () => {
      if (!confirm("要清除「模式1錯題」嗎？")) return;
      clearWrongbookSection("m1");
    });
  }
  if (els.btnClearMisclick) {
    els.btnClearMisclick.addEventListener("click", () => {
      if (!confirm("要清除「常點錯符號」嗎？")) return;
      clearWrongbookSection("misclick");
    });
  }
  if (els.btnClearSeq) {
    els.btnClearSeq.addEventListener("click", () => {
      if (!confirm("要清除「卡關序列」嗎？")) return;
      clearWrongbookSection("seq");
    });
  }
}

// ---------- bind UI ----------
function bindUI() {
  // mode switching
  els.modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = Number(btn.dataset.mode);
      showMode(m);

      // switching mode stops practice (避免混淆)
      state.practice = {
        active: false,
        type: null,
        m1Queue: [],
        misclickTarget: null,
        seq: null,
      };

      startRound();
    });
  });

  if (els.btnNew) els.btnNew.addEventListener("click", () => startRound());
  if (els.btnReplay) els.btnReplay.addEventListener("click", () => replay());

  if (els.soundToggle) {
    els.soundToggle.addEventListener("change", (e) => {
      state.soundOn = !!e.target.checked;
    });
  }
  if (els.ttsToggle) {
    els.ttsToggle.addEventListener("change", (e) => {
      state.ttsOn = !!e.target.checked;
    });
  }

  // TTS speed UI
  state.ttsSpeed = loadTtsSpeed();
  if (els.ttsSpeedSelect) {
    els.ttsSpeedSelect.value = state.ttsSpeed;
    els.ttsSpeedSelect.addEventListener("change", (e) => {
      const v = e.target.value;
      state.ttsSpeed = v;
      saveTtsSpeed(v);
    });
  }

  // warm-up voices (some browsers load voices lazily)
  document.addEventListener(
    "click",
    () => {
      try {
        window.speechSynthesis.getVoices();
      } catch (_) {}
    },
    { once: true }
  );
}

// ---------- init ----------
(async function init() {
  bindUI();
  bindWrongbook();
  initPlayersUI();

  try {
    state.data = await loadData();
    showMode(1);
    startRound();
  } catch (err) {
    setQuestion("載入失敗", String(err?.message || err));
  }
})();
