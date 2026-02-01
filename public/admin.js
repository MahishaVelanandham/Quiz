// public/admin.js
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  update,
  runTransaction,
  remove
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

/* ---------------- Firebase Init ---------------- */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
signInAnonymously(auth);

/* ---------------- DOM ---------------- */

const enableBtn = document.getElementById("enableBtn");
const disableBtn = document.getElementById("disableBtn");
const resetBtn = document.getElementById("resetBtn");

const buzzerStateLabel = document.getElementById("buzzerStateLabel");
const adminWinnerName = document.getElementById("adminWinnerName");
const adminSecondName = document.getElementById("adminSecondName");
const adminWinnerTime = document.getElementById("adminWinnerTime");
const adminSecondTime = document.getElementById("adminSecondTime");
const adminStatusText = document.getElementById("adminStatusText");
const adminStatusPill = document.getElementById("adminStatusPill");
const scoresBody = document.getElementById("scoresBody");

/* ---------------- Helpers ---------------- */

function formatTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString();
}

function playCyberBuzzerSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(160, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch { }
}

/* ---------------- Quiz State ---------------- */

const stateRef = ref(db, "quizState");
let lastWinner = null;
let lastRunnerUp = null;

onValue(stateRef, (snap) => {
  const state = snap.val() || {};
  const { buzzerEnabled = false, winner = null, runnerUp = null } = state;

  // Play sound ONLY when new slot is filled
  if (
    (winner && !lastWinner) ||
    (runnerUp && !lastRunnerUp)
  ) {
    playCyberBuzzerSound();
  }

  lastWinner = winner;
  lastRunnerUp = runnerUp;

  buzzerStateLabel.textContent = buzzerEnabled ? "Enabled" : "Disabled";

  if (winner) {
    adminWinnerName.textContent = winner.name;
    adminWinnerName.style.color = "var(--success)";
    adminWinnerTime.textContent = formatTime(winner.pressedAt);

    if (runnerUp) {
      adminStatusText.textContent = "Winner & Runner-Up Selected";
      adminStatusPill.className = "status-pill status-pill--winner";
    } else {
      adminStatusText.textContent = "Winner Selected – Waiting for Runner-Up";
      adminStatusPill.className = "status-pill status-pill--active";
    }
  } else {
    adminWinnerName.textContent = "—";
    adminWinnerTime.textContent = "—";
    adminStatusText.textContent =
      buzzerEnabled ? "Waiting for Buzz…" : "Buzzer Disabled";
    adminStatusPill.className =
      "status-pill " + (buzzerEnabled ? "status-pill--active" : "status-pill--waiting");
  }

  if (runnerUp) {
    adminSecondName.textContent = runnerUp.name;
    adminSecondTime.textContent = formatTime(runnerUp.pressedAt);
  } else {
    adminSecondName.textContent = "—";
    adminSecondTime.textContent = "—";
  }

  enableBtn.disabled = buzzerEnabled;


  disableBtn.disabled = !buzzerEnabled;
});

/* ---------------- Admin Buttons ---------------- */

enableBtn.onclick = () =>
  update(stateRef, {
    buzzerEnabled: true,
    winner: null,
    runnerUp: null
  });

disableBtn.onclick = () =>
  update(stateRef, { buzzerEnabled: false });

resetBtn.onclick = () =>
  set(stateRef, {
    buzzerEnabled: false,
    winner: null,
    runnerUp: null
  });

/* ---------------- Scoreboard ---------------- */

const scoresRef = ref(db, "scores");

onValue(scoresRef, (snap) => {
  const scores = snap.val() || {};
  const list = Object.entries(scores).map(([key, v]) => ({
    key,
    name: v.displayName || key,
    score: v.score || 0
  }));

  list.sort((a, b) => b.score - a.score);

  scoresBody.innerHTML = list.length === 0
    ? `<tr><td colspan="3" style="text-align:center;">No participants</td></tr>`
    : list.map(p => `
      <tr>
        <td>${p.name}</td>
        <td style="text-align:right;">${p.score}</td>
        <td style="text-align:right; display:flex; gap:4px; justify-content:flex-end;">
          <button class="btn btn-primary" data-add="10" data-key="${p.key}">+10</button>
          <button class="btn btn-danger" data-add="-5" data-key="${p.key}">-5</button>
          <button class="btn btn-muted" data-reset="${p.key}">Reset</button>
          <button class="btn btn-delete" data-delete="${p.key}">Delete</button>
        </td>
      </tr>
    `).join("");
});

/* ---------------- Score Actions ---------------- */

scoresBody.addEventListener("click", (e) => {
  const btn = e.target;
  const key = btn.dataset.key;

  if (btn.dataset.add) {
    runTransaction(
      ref(db, `scores/${key}/score`),
      cur => (cur || 0) + Number(btn.dataset.add)
    );
  }

  if (btn.dataset.reset) {
    update(ref(db, `scores/${btn.dataset.reset}`), { score: 0 });
  }

  if (btn.dataset.delete) {
    if (confirm("Delete this participant?")) {
      remove(ref(db, `scores/${btn.dataset.delete}`));
    }
  }
});
