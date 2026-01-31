// Firebase Modular SDK (v11+)
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getDatabase, ref, onValue, runTransaction, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

// Firebase init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// DOM refs
const statusPill = document.getElementById("status-pill");
const statusPillText = document.getElementById("status-pill-text");
const nameInput = document.getElementById("nameInput");
const saveNameBtn = document.getElementById("saveNameBtn");
const nameHint = document.getElementById("nameHint");
const buzzerBtn = document.getElementById("buzzerBtn");
const buzzerHelper = document.getElementById("buzzerHelper");
const youStatus = document.getElementById("youStatus");
const winnerSummary = document.getElementById("winnerSummary");

// Local state
let participantName = "";
let encodedKey = "";
let hasBuzzedThisRound = false;

// Authenticate and Start
// Health Check UI Helper
function showParticipantError(title, message, code) {
  buzzerHelper.innerHTML = `
    <div style="background: rgba(244,63,94,0.1); border: 1px solid #f43f5e; padding: 12px; border-radius: 12px; color: #fca5a5; text-align: left; font-size: 0.8rem;">
      <div style="color: #f43f5e; font-weight: bold; margin-bottom: 4px;">⚠️ ${title}</div>
      ${message}
      <div style="margin-top: 8px; font-family: monospace; font-size: 0.7rem; color: #94a3b8;">${code}</div>
    </div>
  `;
}

signInAnonymously(auth)
  .then(() => {
    // Test DB
    const connectedRef = ref(db, ".info/connected");
    onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        initParticipantLogic();
      } else {
        showParticipantError("Server Unreachable", "Connected to Auth, but cannot reach Database. Check rules.", "db/offline");
      }
    }, (err) => {
      showParticipantError("Permission Denied", "Firebase Rules are blocking this participant. Ensure rules are set to public for testing.", "db/forbidden");
    });
  })
  .catch((error) => {
    let title = "Connection Failed";
    let msg = "Cannot reach the quiz backend. Please check your internet.";

    if (error.code === 'auth/operation-not-allowed') {
      title = "Backend Service Off";
      msg = "The host needs to enable 'Anonymous Auth' in the Firebase Console.";
    } else if (window.location.protocol === 'file:') {
      title = "Local Run Blocked";
      msg = "Please run via a local server (Live Server).";
    }
    showParticipantError(title, msg, error.code);
  });

function initParticipantLogic() {
  // ================= HELPERS =================

  function encodeKey(name) {
    return (name || "").trim().replace(/[.#$/\[\]\s]/g, "_");
  }

  function setStatusPill(mode, text) {
    statusPill.className = "status-pill";
    statusPill.classList.add(`status-pill--${mode}`);
    statusPillText.textContent = text;
  }

  function formatTime(ts) {
    if (!ts) return "—";
    try {
      return new Date(ts).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch {
      return "—";
    }
  }

  // ================= LOAD SAVED NAME =================

  (function initName() {
    const saved = localStorage.getItem("quizParticipantName");
    if (saved) {
      participantName = saved;
      encodedKey = encodeKey(saved);
      nameInput.value = saved;
      youStatus.textContent = `Joined as ${saved}`;

      // Ensure we are in the scoreboard on the host side
      registerInScoreboard(saved);

      listenToOwnScore();
    }
  })();

  function registerInScoreboard(name) {
    if (!name) return;
    const key = encodeKey(name);
    const scoreRef = ref(db, "scores/" + key);

    return runTransaction(scoreRef, (current) => {
      if (current === null) {
        return {
          displayName: name,
          score: 0
        };
      }
      // If display name is missing for some reason, fix it
      if (!current.displayName) {
        current.displayName = name;
      }
      return current;
    });
  }

  // ================= SCORE LISTENER =================

  function listenToOwnScore() {
    if (!encodedKey) return;

    const myScoreRef = ref(db, "scores/" + encodedKey);

    onValue(myScoreRef, (snap) => {
      const data = snap.val();
      if (data && typeof data.score === "number") {
        youStatus.textContent = `Joined as ${participantName} | Score: ${data.score}`;
      }
    });
  }

  // ================= NAME HANDLING =================

  saveNameBtn.addEventListener("click", () => {
    const value = nameInput.value.trim();
    if (!value) {
      nameHint.textContent = "Please enter a name before joining.";
      nameHint.style.color = "#f97373";
      return;
    }

    saveNameBtn.disabled = true;
    saveNameBtn.textContent = "Joining...";

    participantName = value;
    encodedKey = encodeKey(value);

    localStorage.setItem("quizParticipantName", value);

    registerInScoreboard(value)
      .then(() => {
        youStatus.textContent = `Joined as ${value}`;
        nameHint.textContent = "Successfully joined the quiz!";
        nameHint.style.color = "#22c55e";
        listenToOwnScore();
      })
      .catch((err) => {
        console.error("Registration error:", err);
        nameHint.textContent = "Error joining: Check your connection.";
        nameHint.style.color = "#f97373";
      })
      .finally(() => {
        saveNameBtn.disabled = false;
        saveNameBtn.textContent = "Save Name";
      });
  });

  // ================= QUIZ STATE LISTENER =================

  const stateRef = ref(db, "quizState");

  onValue(stateRef, (snap) => {
    const state = snap.val() || {};
    const { buzzerEnabled = false, winner = null } = state;

    if (!buzzerEnabled && winner === null) {
      hasBuzzedThisRound = false;
    }

    if (winner && winner.name) {
      const tsStr = winner.pressedAt ? ` @ ${formatTime(winner.pressedAt)}` : "";
      winnerSummary.textContent = `${winner.name}${tsStr}`;

      if (participantName && winner.name === participantName) {
        setStatusPill("winner", "You are first!");
        buzzerHelper.textContent =
          "Great job! Wait for the host to start the next round.";
      } else {
        setStatusPill("locked", "Round finished");
        buzzerHelper.textContent =
          "Round complete. Wait for the host to reset.";
      }
    } else {
      winnerSummary.textContent = "—";
    }

    if (buzzerEnabled && winner === null) {
      setStatusPill("active", "Buzzer active");
      document.body.classList.add("buzzer-live");
      buzzerHelper.textContent = hasBuzzedThisRound
        ? "You already attempted this round."
        : "Buzzer is LIVE! Hit BUZZ!";
    } else if (!buzzerEnabled && winner === null) {
      setStatusPill("waiting", "Waiting for host");
      document.body.classList.remove("buzzer-live");
      buzzerHelper.textContent = "Host will enable the buzzer shortly.";
    } else {
      document.body.classList.remove("buzzer-live");
    }

    buzzerBtn.disabled =
      !participantName || !buzzerEnabled || winner !== null || hasBuzzedThisRound;
  });

  // ================= BUZZER LOGIC =================

  buzzerBtn.addEventListener("click", () => {
    if (!participantName) return;

    buzzerBtn.disabled = true;
    hasBuzzedThisRound = true;

    const winnerRef = ref(db, "quizState/winner");

    runTransaction(winnerRef, (current) => {
      if (current === null) {
        return {
          name: participantName,
          pressedAt: serverTimestamp()
        };
      }
      return current;
    }).then((result) => {
      if (result.committed) {
        update(stateRef, { buzzerEnabled: false }).catch(() => { });
        setStatusPill("winner", "You are first!");
      } else {
        setStatusPill("locked", "Too late");
      }
    });
  });
}
