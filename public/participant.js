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

// ================= UI Error Helper =================
function showParticipantError(title, message, code) {
  buzzerHelper.innerHTML = `
    <div style="background: rgba(244,63,94,0.1); border: 1px solid #f43f5e; padding: 12px; border-radius: 12px; color: #fca5a5; font-size: 0.8rem;">
      <strong>⚠️ ${title}</strong><br/>
      ${message}
      <div style="margin-top:6px; font-family: monospace; color:#94a3b8;">${code}</div>
    </div>
  `;
}

// ================= Auth + Startup =================
signInAnonymously(auth)
  .then(() => {
    const connectedRef = ref(db, ".info/connected");
    onValue(connectedRef, (snap) => {
      if (snap.val() === true && !isInitialized) {
        isInitialized = true;
        initParticipantLogic();
      }
    });
  })
  .catch((error) => {
    showParticipantError(
      "Connection Failed",
      "Cannot connect to Firebase backend.",
      error.code
    );
  });

// ================= Main Logic =================
function initParticipantLogic() {
  // ---------- Helpers ----------
  function encodeKey(name) {
    return (name || "").trim().replace(/[.#$/\[\]\s]/g, "_");
  }

  function setStatusPill(mode, text) {
    statusPill.className = "status-pill status-pill--" + mode;
    statusPillText.textContent = text;
  }

  function formatTime(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleTimeString();
  }

  // ---------- Load Saved Name ----------
  const savedName = localStorage.getItem("quizParticipantName");
  if (savedName) {
    participantName = savedName;
    encodedKey = encodeKey(savedName);
    nameInput.value = savedName;
    youStatus.textContent = `Joined as ${savedName}`;
    registerInScoreboard(savedName);
    listenToOwnScore();
  }

  // ---------- Register Score ----------
  function registerInScoreboard(name) {
    const key = encodeKey(name);
    return runTransaction(ref(db, "scores/" + key), (current) => {
      if (current === null) {
        return { displayName: name, score: 0 };
      }
      if (!current.displayName) current.displayName = name;
      return current;
    });
  }

  // ---------- Listen Own Score ----------
  function listenToOwnScore() {
    if (!encodedKey) return;
    onValue(ref(db, "scores/" + encodedKey), (snap) => {
      const data = snap.val();
      if (data && typeof data.score === "number") {
        youStatus.textContent = `Joined as ${participantName} | Score: ${data.score}`;
      }
    });
  }

  // ---------- Save Name ----------
  saveNameBtn.addEventListener("click", () => {
    const value = nameInput.value.trim();
    if (!value) {
      nameHint.textContent = "Enter a name first.";
      nameHint.style.color = "#f97373";
      return;
    }

    participantName = value;
    encodedKey = encodeKey(value);
    localStorage.setItem("quizParticipantName", value);

    registerInScoreboard(value).then(() => {
      nameHint.textContent = "Joined successfully!";
      nameHint.style.color = "#22c55e";
      listenToOwnScore();
    });
  });

  // ---------- Quiz State ----------
  const stateRef = ref(db, "quizState");

  onValue(stateRef, (snap) => {
    const { buzzerEnabled = false, winner = null } = snap.val() || {};

    if (!buzzerEnabled && winner === null) {
      hasBuzzedThisRound = false;
    }

    if (winner?.name) {
      winnerSummary.textContent =
        winner.name + (winner.pressedAt ? " @ " + formatTime(winner.pressedAt) : "");

      if (winner.name === participantName) {
        setStatusPill("winner", "You are first!");
      } else {
        setStatusPill("locked", "Round finished");
      }
    } else {
      winnerSummary.textContent = "—";
    }

    if (buzzerEnabled && !winner) {
      setStatusPill("active", "Buzzer live");
      buzzerHelper.textContent = hasBuzzedThisRound
        ? "Already attempted"
        : "Hit BUZZ!";
    } else if (!winner) {
      setStatusPill("waiting", "Waiting for host");
      buzzerHelper.textContent = "Waiting…";
    }

    buzzerBtn.disabled =
      !participantName || !buzzerEnabled || winner !== null || hasBuzzedThisRound;
  });

  // ---------- Buzz ----------
  buzzerBtn.addEventListener("click", () => {
    if (!participantName) return;

    hasBuzzedThisRound = true;
    buzzerBtn.disabled = true;

    runTransaction(ref(db, "quizState/winner"), (current) => {
      if (current === null) {
        return { name: participantName, pressedAt: serverTimestamp() };
      }
      return current;
    }).then((res) => {
      if (res.committed) {
        update(stateRef, { buzzerEnabled: false });
        setStatusPill("winner", "You are first!");
      } else {
        setStatusPill("locked", "Too late");
      }
    });
  });
}
