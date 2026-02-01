// ================= Firebase Modular SDK (v11) =================
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  update,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

// ================= Firebase Init =================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ================= DOM Refs =================
const statusPill = document.getElementById("status-pill");
const statusPillText = document.getElementById("status-pill-text");
const nameInput = document.getElementById("nameInput");
const saveNameBtn = document.getElementById("saveNameBtn");
const nameHint = document.getElementById("nameHint");
const buzzerBtn = document.getElementById("buzzerBtn");
const buzzerHelper = document.getElementById("buzzerHelper");
const youStatus = document.getElementById("youStatus");
const winnerSummary = document.getElementById("winnerSummary");

// ================= Local State =================
let participantName = "";
let encodedKey = "";
let hasBuzzedThisRound = false;
let isInitialized = false;

// ================= Helpers =================
function encodeKey(name) {
  return (name || "").trim().replace(/[.#$/\[\]\s]/g, "_");
}

function setStatusPill(mode, text) {
  statusPill.className = "status-pill status-pill--" + mode;
  statusPillText.textContent = text;
}

function playCyberBuzzerSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch { }
}

// ================= Auth =================
signInAnonymously(auth).then(() => {
  onValue(ref(db, ".info/connected"), (snap) => {
    if (snap.val() === true && !isInitialized) {
      isInitialized = true;
      init();
    }
  });
});

// ================= Main Logic =================
function init() {
  const stateRef = ref(db, "quizState");

  // Load saved name
  const saved = localStorage.getItem("quizParticipantName");
  if (saved) {
    participantName = saved;
    encodedKey = encodeKey(saved);
    nameInput.value = saved;
    youStatus.textContent = `Joined as ${saved}`;
    registerInScoreboard(saved);
    listenToOwnScore();
  }

  function registerInScoreboard(name) {
    const key = encodeKey(name);
    return runTransaction(ref(db, "scores/" + key), (current) => {
      if (current === null) return { displayName: name, score: 0 };
      if (!current.displayName) current.displayName = name;
      return current;
    });
  }

  function listenToOwnScore() {
    if (!encodedKey) return;
    onValue(ref(db, "scores/" + encodedKey), (snap) => {
      const data = snap.val();
      if (data && typeof data.score === "number") {
        youStatus.textContent = `Joined as ${participantName} | Score: ${data.score}`;
      }
    });
  }


  // Save name
  saveNameBtn.onclick = () => {
    const val = nameInput.value.trim();
    if (!val) return;

    participantName = val;
    encodedKey = encodeKey(val);
    localStorage.setItem("quizParticipantName", val);

    registerInScoreboard(val).then(() => {
      youStatus.textContent = `Joined as ${val}`;
      listenToOwnScore();
    });
  };


  // ================= LISTEN QUIZ STATE =================
  onValue(stateRef, (snap) => {
    const state = snap.val() || {};
    const { buzzerEnabled = false, winner = null, runnerUp = null } = state;

    if (buzzerEnabled && !winner && !runnerUp) {
      hasBuzzedThisRound = false;
    }

    // Summary
    function renderStep(num, label, name, statusClass) {
      return `
        <div class="status-step ${statusClass}">
          <div class="step-number">0${num}</div>
          <div class="step-indicator"></div>
          <div class="step-info">
            <div class="step-label">${label}</div>
            <div class="step-name">${name || "WAITING..."}</div>
          </div>
        </div>
      `;
    }

    const winnerHtml = renderStep(1, "1ST PLACE", winner?.name, winner ? "status-step--filled" : "status-step--active");
    const runnerUpHtml = renderStep(2, "2ND PLACE", runnerUp?.name, runnerUp ? "status-step--filled" : (winner ? "status-step--active" : ""));

    winnerSummary.innerHTML = winnerHtml + runnerUpHtml;


    // YOUR status
    if (winner?.name === participantName) {
      setStatusPill("winner", "WINNER");
      buzzerHelper.textContent = "You are FIRST!";
    } else if (runnerUp?.name === participantName) {
      setStatusPill("winner", "RUNNER-UP");
      buzzerHelper.textContent = "You are SECOND!";
    } else if (runnerUp) {
      setStatusPill("locked", "CLOSED");
      buzzerHelper.textContent = "Too late";
    } else if (!buzzerEnabled) {
      setStatusPill("waiting", "WAITING");
      buzzerHelper.textContent = "Waiting for host";
    } else if (winner) {
      setStatusPill("active", "1/2 FILLED");
      buzzerHelper.textContent = "Second slot open!";
    } else {
      setStatusPill("active", "LIVE");
      buzzerHelper.textContent = "Hit BUZZ!";
    }

    buzzerBtn.disabled =
      !participantName ||
      !buzzerEnabled ||
      hasBuzzedThisRound ||
      (winner && runnerUp);
  });

  // ================= BUZZ =================
  buzzerBtn.onclick = () => {
    if (!participantName) return;

    hasBuzzedThisRound = true;
    buzzerBtn.disabled = true;

    runTransaction(stateRef, (cur) => {
      if (!cur || !cur.buzzerEnabled) return;

      if (!cur.winner) {
        cur.winner = { name: participantName, pressedAt: serverTimestamp() };
        return cur;
      }

      if (!cur.runnerUp && cur.winner.name !== participantName) {
        cur.runnerUp = { name: participantName, pressedAt: serverTimestamp() };
        cur.buzzerEnabled = false;
        return cur;
      }

      return;
    }).then((res) => {
      if (res.committed) {
        playCyberBuzzerSound(); // 🔊 ONLY winner & runner-up hear sound
      } else {
        setStatusPill("locked", "Too late");
      }
    });
  };
}
