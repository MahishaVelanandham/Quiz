// ================= Firebase Modular SDK (v11) =================
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
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
  return name.trim().replace(/[.#$/\[\]\s]/g, "_");
}

function setStatusPill(mode, text) {
  statusPill.className = "status-pill status-pill--" + mode;
  statusPillText.textContent = text;
}

function lockNameUI(name) {
  nameInput.value = name;
  nameInput.disabled = true;
  nameInput.classList.add("input-locked");
  saveNameBtn.style.display = "none";

  nameHint.innerHTML = `<span style="color:#22c55e;">✅ IDENTITY VERIFIED: ${name}</span>`;

  const chip = document.querySelector(".input-chip");
  if (chip) chip.style.display = "none";
}

function unlockNameUI() {
  nameInput.value = "";
  nameInput.disabled = false;
  nameInput.classList.remove("input-locked");
  saveNameBtn.style.display = "inline-block";
  nameHint.innerHTML = "This name will appear on the host screen if you win the buzzer.";
  nameHint.style.color = "var(--text-muted)";

  const chip = document.querySelector(".input-chip");
  if (chip) chip.style.display = "inline";
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

// ================= Global Helper for UI =================
function renderStep(num, label, name, statusClass) {
  const displayNum = num < 10 ? `0${num}` : num;
  return `
    <div class="status-step ${statusClass}">
      <div class="step-number">${displayNum}</div>
      <div class="step-indicator"></div>
      <div class="step-info">
        <div class="step-label">${label}</div>
        <div class="step-name">${name || "WAITING..."}</div>
      </div>
    </div>
  `;
}

// ================= Auth & Connection Monitoring =================
onValue(ref(db, ".info/connected"), (snap) => {
  const isConnected = snap.val() === true;
  console.log("[NETWORK] Firebase connected:", isConnected);

  if (isConnected) {
    if (!isInitialized) {
      isInitialized = true;
      signInAnonymously(auth)
        .then(() => {
          console.log("[AUTH] Anonymous sign-in successful");
          init();
        })
        .catch(err => {
          console.error("[AUTH] Sign-in failed:", err);
          setStatusPill("locked", "AUTH ERROR");
        });
    } else {
      // Reconnected
      setStatusPill("waiting", "RECONNECTED");
    }
  } else {
    // Offline
    setStatusPill("locked", "OFFLINE");
    if (isInitialized) buzzerBtn.disabled = true;
  }
});



// ================= Main Logic =================
function init() {
  const stateRef = ref(db, "quizState");
  let currentQuizState = {};

  function refreshBuzzerUI() {
    const { buzzerEnabled = false, winner = null, runnerUp = null } = currentQuizState;
    console.log("Refreshing Buzzer UI. Enabled:", buzzerEnabled, "Name:", participantName);

    if (buzzerEnabled && !winner && !runnerUp) {
      hasBuzzedThisRound = false;
    }

    const wClass = winner ? "status-step--filled" : (buzzerEnabled ? "status-step--active" : "");
    const rClass = runnerUp ? "status-step--filled" : (winner && buzzerEnabled ? "status-step--active" : "");

    winnerSummary.innerHTML =
      renderStep(1, "1ST PLACE", winner?.name, wClass) +
      renderStep(2, "2ND PLACE", runnerUp?.name, rClass);

    if (winner?.name === participantName) {
      setStatusPill("winner", "WINNER ✅");
      buzzerHelper.textContent = "You are FIRST!";
    } else if (runnerUp?.name === participantName) {
      setStatusPill("winner", "RUNNER-UP ✅");
      buzzerHelper.textContent = "You are SECOND!";
    } else if (runnerUp) {
      setStatusPill("locked", "ROUND CLOSED");
      buzzerHelper.textContent = "Both slots filled.";
    } else if (!buzzerEnabled) {
      setStatusPill("waiting", "STANDBY");
      buzzerHelper.textContent = "Waiting for host to enable...";
    } else if (winner) {
      setStatusPill("active", "1/2 SLOTS OPEN");
      buzzerHelper.textContent = "Hurry! 2nd place is still open!";
    } else {
      setStatusPill("active", "LIVE — BUZZ NOW");
      buzzerHelper.textContent = "ROUND IS ACTIVE!";
    }


    const canBuzz = participantName && buzzerEnabled && !hasBuzzedThisRound && !(winner && runnerUp);
    buzzerBtn.disabled = !canBuzz;
    console.log(`[STATE] Name: ${participantName || "None"} | Enabled: ${buzzerEnabled} | Buzzed: ${hasBuzzedThisRound} | Result: ${canBuzz ? "ENABLE" : "DISABLE"}`);
  }


  // ---------- Load & LOCK saved name ----------

  const saved = localStorage.getItem("quizParticipantName");
  if (saved) {
    participantName = saved;
    encodedKey = encodeKey(saved);
    lockNameUI(saved);
    youStatus.textContent = `Joined as ${saved}`;
    registerInScoreboard(saved);
    listenToOwnScore();
  }

  function registerInScoreboard(name) {
    return runTransaction(ref(db, "scores/" + encodeKey(name)), (cur) => {
      if (cur === null) return { displayName: name, score: 0 };
      return cur;
    });
  }

  let unsubscribeScore = null;
  function listenToOwnScore() {
    if (unsubscribeScore) unsubscribeScore();
    if (!encodedKey) return;

    unsubscribeScore = onValue(ref(db, "scores/" + encodedKey), (snap) => {
      const d = snap.val();

      if (d === null) {
        // ADMIN DELETED US
        if (participantName) {
          console.log("Identity purged by host. Rebooting...");
          localStorage.removeItem("quizParticipantName");
          participantName = "";
          encodedKey = "";
          unlockNameUI();
          youStatus.innerHTML = `<span style="color:var(--danger);">ACCESS REVOKED BY HOST</span>`;
          if (unsubscribeScore) {
            unsubscribeScore();
            unsubscribeScore = null;
          }
        }
        return;
      }

      if (d?.score !== undefined) {
        youStatus.innerHTML = `<span style="color:var(--accent);">YOU:</span> ${participantName} | <span style="color:var(--success);">SCORE: ${d.score}</span>`;
      }
    });
  }




  // ---------- Save Name (ONLY ONCE) ----------
  saveNameBtn.onclick = () => {
    const val = nameInput.value.trim();
    if (!val) return;

    if (localStorage.getItem("quizParticipantName")) {
      nameHint.textContent = "Name already locked.";
      nameHint.style.color = "#f97373";
      return;
    }

    participantName = val;
    encodedKey = encodeKey(val);
    localStorage.setItem("quizParticipantName", val);

    registerInScoreboard(val).then(() => {
      lockNameUI(val);
      youStatus.textContent = `Joined as ${val}`;
      listenToOwnScore();
      refreshBuzzerUI(); // Force check button state now that name is set
    });
  };

  // ---------- Listen Quiz State ----------
  onValue(stateRef, (snap) => {
    const data = snap.val() || {};
    currentQuizState = data;
    refreshBuzzerUI();
  });


  // ---------- Buzz ----------
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
    }).then((res) => {
      if (res.committed) playCyberBuzzerSound();
    });
  };
}
