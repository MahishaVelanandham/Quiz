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

/* ---------------- DOM ---------------- */

const enableBtn = document.getElementById("enableBtn");
const disableBtn = document.getElementById("disableBtn");
const resetBtn = document.getElementById("resetBtn");
const buzzerStateLabel = document.getElementById("buzzerStateLabel");
const adminWinnerName = document.getElementById("adminWinnerName");
const adminWinnerTime = document.getElementById("adminWinnerTime");
const adminStatusText = document.getElementById("adminStatusText");
const adminStatusPill = document.getElementById("adminStatusPill");
const scoresBody = document.getElementById("scoresBody");

/* ---------------- Helpers ---------------- */

function encodeKey(name) {
  return name.trim().replace(/[.#$/\[\]\s]/g, "_");
}

function formatTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString();
}

function playCyberBuzzerSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
    oscillator.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.4);
  } catch (e) {
    console.warn("Audio playback failed:", e);
  }
}


/* ---------------- Auth ---------------- */

signInAnonymously(auth);

/* ---------------- Quiz State ---------------- */

const stateRef = ref(db, "quizState");
let lastWinner = null;

onValue(stateRef, (snap) => {
  const state = snap.val() || {};
  const { buzzerEnabled = false, winner = null } = state;

  if (winner && !lastWinner) {
    playCyberBuzzerSound();
  }
  lastWinner = winner;


  buzzerStateLabel.textContent = buzzerEnabled ? "Enabled" : "Disabled";

  if (winner) {
    adminWinnerName.textContent = winner.name;
    adminWinnerTime.textContent = formatTime(winner.pressedAt);
    adminStatusText.textContent = "Winner Locked";
    adminStatusPill.className = "status-pill status-pill--winner";
  } else {
    adminWinnerName.textContent = "—";
    adminWinnerTime.textContent = "—";
    adminStatusText.textContent = buzzerEnabled ? "Buzzer Live" : "Waiting";
    adminStatusPill.className =
      "status-pill " +
      (buzzerEnabled ? "status-pill--active" : "status-pill--waiting");
  }

  enableBtn.disabled = buzzerEnabled;
  disableBtn.disabled = !buzzerEnabled;
});

/* ---------------- Admin Buttons ---------------- */

enableBtn.onclick = () =>
  update(stateRef, { buzzerEnabled: true, winner: null });

disableBtn.onclick = () =>
  update(stateRef, { buzzerEnabled: false });

resetBtn.onclick = () =>
  set(stateRef, { buzzerEnabled: false, winner: null });

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
  const add = e.target.dataset.add;
  const reset = e.target.dataset.reset;
  const del = e.target.dataset.delete;

  if (add) {
    const refScore = ref(db, `scores/${add ? e.target.dataset.key : ""}/score`);
  }

  if (add) {
    const key = e.target.dataset.key;
    runTransaction(ref(db, `scores/${key}/score`), cur => (cur || 0) + Number(add));
  }

  if (reset) {
    update(ref(db, `scores/${reset}`), { score: 0 });
  }

  if (del) {
    if (confirm("Delete this participant?")) {
      remove(ref(db, `scores/${del}`));
    }
  }
});
