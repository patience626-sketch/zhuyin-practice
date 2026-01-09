// 注音練習小遊戲（GitHub Pages / 純前端）
// 模式1：聽音選正確注音（答對自動下一題，答錯需按下一題）
// 模式2：找出所有目標（目標多個、可重複，找完自動下一題）
// 模式3：依序散找（序列散在符號海裡，點錯閃紅「保留進度」）

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
};

const state = {
  data: null,
  mode: 1,
  score: 0,
  wrong: 0,
  soundOn: true,
  ttsOn: true,

  // mode1
  m1: {
    bag: [],
    current: null, // {target, options[], locked, wrongOnce}
    locked: false,
    wrongOnce: false
  },

  // mode2
  m2: {
    level: null, // {target, targetCount, cells[]}
  },

  // mode3
  m3: {
    level: null, // {sequence, cells[]}
    stepIndex: 0,
  }
};

const GRID_COLS = 7;

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
  el.style.gridTemplateColumns = `repeat(${cols}, minmax(0,1fr))`;
}
function updateStats() {
  els.score.textContent = String(state.score);
  els.wrong.textContent = String(state.wrong);
}
function setQuestion(title, sub="") {
  els.qTitle.textContent = title;
  els.qSub.textContent = sub;
}
function showMode(mode) {
  state.mode = mode;
  els.mode1.classList.toggle("hidden", mode !== 1);
  els.mode2.classList.toggle("hidden", mode !== 2);
  els.mode3.classList.toggle("hidden", mode !== 3);

  els.modeBtns.forEach(btn => btn.classList.toggle("active", Number(btn.dataset.mode) === mode));
}
function flashWrong(dom) {
  dom.classList.add("flash-wrong");
  setTimeout(() => dom.classList.remove("flash-wrong"), 450);
}

// ---------- sound ----------
let audioCtx = null;
function beep(type = "good") {
  if (!state.soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = (type === "good") ? 880 : 220;
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

function speakZhuyin(text) {
  if (!state.ttsOn) return;
  if (!("speechSynthesis" in window)) return;

  // 取消前一段避免疊音
  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.9;
  u.pitch = 1.0;

  // 盡量選 zh-TW / zh-Hant 的 voice
  const voices = window.speechSynthesis.getVoices?.() || [];
  const preferred =
    voices.find(v => (v.lang || "").toLowerCase().includes("zh-tw")) ||
    voices.find(v => (v.lang || "").toLowerCase().includes("zh-hant")) ||
    voices.find(v => (v.lang || "").toLowerCase().startsWith("zh")) ||
    null;

  if (preferred) u.voice = preferred;

  window.speechSynthesis.speak(u);
}

// ---------- load data ----------
async function loadData() {
  const res = await fetch("./data/zhuyin.json");
  if (!res.ok) throw new Error("Failed to load data/zhuyin.json");
  return await res.json();
}

// ---------- Mode 1 ----------
function refillM1Bag() {
  state.m1.bag = shuffle(state.data.zhuyin.slice());
}

function nextMode1() {
  if (!state.m1.bag.length) refillM1Bag();

  const target = state.m1.bag.pop();

  // options: target + 3 random others
  const pool = state.data.zhuyin.filter(z => z !== target);
  const others = sampleUnique(pool, 3);
  const options = shuffle([target, ...others]);

  state.m1.current = { target, options };
  state.m1.locked = false;
  state.m1.wrongOnce = false;

  setQuestion("模式 1：聽音選出正確注音", "按「重播」聽發音，點選正確符號。答對自動下一題。");
  renderMode1();

  // 進題就先念一次
  speakZhuyin(target);
}

function renderMode1() {
  els.choices.innerHTML = "";
  const cur = state.m1.current;
  if (!cur) return;

  cur.options.forEach(sym => {
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
        state.m1.locked = true;

        // 答對自動跳題
        setTimeout(() => {
          startRound();
        }, 380);
      } else {
        btn.classList.add("wrong");
        beep("bad");
        state.wrong += 1;
        state.score = Math.max(0, state.score - 2);
        updateStats();
        state.m1.wrongOnce = true;

        // 答錯不自動跳題：需要按「下一題」
        setQuestion("模式 1：再試一次或按下一題", `目標正在念：${cur.target}（可按重播）`);
      }
    });
    els.choices.appendChild(btn);
  });
}

function replayMode1() {
  const cur = state.m1.current;
  if (!cur) return;
  speakZhuyin(cur.target);
}

// ---------- Mode 2 ----------
function createMode2Level() {
  const zh = state.data.zhuyin;

  const target = zh[randInt(0, zh.length - 1)];
  const gridSize = 42;                 // 固定 7*6
  const targetCount = randInt(5, 10);  // 目標出現數
  const decoyUniqueCount = 14;         // 干擾種類數

  const decoyPool = zh.filter(z => z !== target);
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
    found: false
  }));

  return { target, targetCount, foundCount: 0, cells };
}

function nextMode2() {
  state.m2.level = createMode2Level();
  setGridCols(els.grid2, GRID_COLS);

  setQuestion("模式 2：找出全部目標", `請找出所有「${state.m2.level.target}」`);
  updateMode2Progress();
  renderMode2();
}

function updateMode2Progress() {
  const lv = state.m2.level;
  if (!lv) return;
  els.m2Progress.textContent = `已找到 ${lv.foundCount} / ${lv.targetCount}`;
}

function renderMode2() {
  const lv = state.m2.level;
  els.grid2.innerHTML = "";
  if (!lv) return;

  lv.cells.forEach(cell => {
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
          setQuestion("🎉 找完了！", "自動進入下一題…");
          setTimeout(() => startRound(), 520);
        }
      } else {
        state.wrong += 1;
        state.score = Math.max(0, state.score - 1);
        beep("bad");
        updateStats();
        flashWrong(d);
      }
    });

    els.grid2.appendChild(d);
  });
}

function replayMode2() {
  const lv = state.m2.level;
  if (!lv) return;
  // 模式2不一定需要念，但你也可以念目標一次（更親子）
  speakZhuyin(lv.target);
}

// ---------- Mode 3 ----------
function createMode3Level(sequence) {
  const zh = state.data.zhuyin;
  const gridSize = 42;
  const decoyUniqueCount = 14;
  const allowExtraTargets = true;

  const seqSet = new Set(sequence);
  const decoyPool = zh.filter(z => !seqSet.has(z));
  const decoyTypes = sampleUnique(decoyPool, decoyUniqueCount);

  const symbols = sequence.slice();

  if (allowExtraTargets) {
    const extraCount = randInt(0, sequence.length); // 0~len
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
    done: false
  }));

  return { sequence, cells };
}

function pickRandomSequence() {
  const seqs = state.data.sequences || [["ㄅ","ㄆ","ㄇ"]];
  const chosen = seqs[randInt(0, seqs.length - 1)];
  // 複製避免被改動
  return chosen.slice();
}

function nextMode3() {
  const sequence = pickRandomSequence();
  state.m3.level = createMode3Level(sequence);
  state.m3.stepIndex = 0;

  setGridCols(els.grid3, GRID_COLS);

  setQuestion("模式 3：依序散找（保留進度）", `依序點：${sequence.join(" → ")}`);
  renderMode3();
  updateMode3ProgressExplain();
}

function updateMode3ProgressExplain() {
  const lv = state.m3.level;
  if (!lv) return;
  const idx = state.m3.stepIndex;
  const next = lv.sequence[idx] ?? "完成";
  els.m3Progress.textContent = `下一個：${next}（${Math.min(idx+1, lv.sequence.length)}/${lv.sequence.length}）`;
}

function renderSequenceBar() {
  const lv = state.m3.level;
  if (!lv) return;
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
  els.grid3.innerHTML = "";
  if (!lv) return;

  renderSequenceBar();
  updateMode3ProgressExplain();

  lv.cells.forEach(cell => {
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
          setQuestion("🎉 序列完成！", "自動進入下一題…");
          setTimeout(() => startRound(), 560);
        }
      } else {
        // 點錯：閃紅 + 記錯，但「保留進度」
        state.wrong += 1;
        state.score = Math.max(0, state.score - 1);
        beep("bad");
        updateStats();
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

// ---------- Round control ----------
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

// ---------- init ----------
function bindUI() {
  els.modeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const m = Number(btn.dataset.mode);
      showMode(m);
      startRound();
    });
  });

  els.btnNew.addEventListener("click", () => startRound());
  els.btnReplay.addEventListener("click", () => replay());

  els.soundToggle.addEventListener("change", (e) => {
    state.soundOn = !!e.target.checked;
  });
  els.ttsToggle.addEventListener("change", (e) => {
    state.ttsOn = !!e.target.checked;
  });

  // iOS/Safari 某些情況要 user gesture 後 voices 才會就緒
  document.addEventListener("click", () => {
    try { window.speechSynthesis.getVoices(); } catch (_) {}
  }, { once: true });
}

(async function init() {
  bindUI();

  try {
    state.data = await loadData();
    updateStats();
    showMode(1);
    startRound();
  } catch (err) {
    setQuestion("載入失敗", String(err?.message || err));
  }
})();
