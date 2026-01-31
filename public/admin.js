// Firebase Modular SDK (v11+)
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getDatabase, ref, onValue, set, update, runTransaction } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

// Firebase init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// DOM refs
const adminStatusPill = document.getElementById("adminStatusPill");
const adminStatusText = document.getElementById("adminStatusText");
const enableBtn = document.getElementById("enableBtn");
const disableBtn = document.getElementById("disableBtn");
const resetBtn = document.getElementById("resetBtn");
const buzzerStateLabel = document.getElementById("buzzerStateLabel");
const adminWinnerName = document.getElementById("adminWinnerName");
const adminWinnerTime = document.getElementById("adminWinnerTime");
const adminNotes = document.getElementById("adminNotes");
const scoresBody = document.getElementById("scoresBody");

// Disable buttons initially
if (enableBtn) enableBtn.disabled = true;
if (disableBtn) disableBtn.disabled = true;
if (resetBtn) resetBtn.disabled = true;

// Authenticate and Start
// Health Check UI Helper
function showConnectionError(title, message, code) {
  const container = adminNotes || document.body;
  container.innerHTML = `
    <div style="background: rgba(244, 63, 94, 0.1); border: 1px solid #f43f5e; padding: 15px; border-radius: 12px; margin: 10px 0;">
      <div style="color: #f43f5e; font-weight: 800; font-size: 0.9rem; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
        <svg style="width:18px; height:18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        ${title}
      </div>
      <div style="color: #fca5a5; font-size: 0.8rem; line-height: 1.4; margin-bottom: 8px;">${message}</div>
      <div style="font-family: monospace; font-size: 0.7rem; background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 4px; color: #94a3b8;">${code}</div>
    </div>
  `;
}

// 1. Authenticate
signInAnonymously(auth)
  .then(() => {
    // 2. Test Database Access
    const testRef = ref(db, ".info/connected");
    onValue(testRef, (snap) => {
      if (snap.val() === true) {
        if (adminNotes) {
          adminNotes.innerHTML = '<span style="color: #22c55e; font-weight: 600; display: flex; align-items: center; gap: 6px;"><svg style="width:16px; height:16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Backend Connected</span>';
        }
        initAdminLogic();
      } else {
        showConnectionError("Database Unreachable", "Auth passed, but cannot reach the Database. Check your internet or Firebase Realtime Database setup.", "db/offline");
      }
    }, (err) => {
      showConnectionError("Permission Denied", "Database Rules are blocking access. Set '.read' and '.write' to 'true' in Firebase Console.", "db/forbidden");
    });
  })
  .catch((error) => {
    let title = "Auth Connection Failed";
    let msg = "Check your internet connection and Firebase config.";
    if (error.code === 'auth/operation-not-allowed') {
      title = "Anonymous Auth Disabled";
      msg = "Enable 'Anonymous' sign-in in Firebase Console > Authentication > Sign-in method.";
    } else if (window.location.protocol === 'file:') {
      title = "Local Run Blocked";
      msg = "Firebase requires a local server. Please use VS Code Live Server.";
    }
    showConnectionError(title, msg, error.code);
  });

function initAdminLogic() {
  // Refs
  const stateRef = ref(db, "quizState");
  const scoresRef = ref(db, "scores");

  // Helpers
  function encodeKey(name) {
    return (name || "").trim().replace(/[.#$/\[\]\s]/g, "_");
  }

  function setAdminStatus(mode, text) {
    if (adminStatusPill) {
      adminStatusPill.className = "status-pill status-pill--" + mode;
    }
    if (adminStatusText) {
      adminStatusText.textContent = text;
    }
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

  // ================= QUIZ STATE =================

  onValue(stateRef, (snap) => {
    const state = snap.val() || {};
    const { buzzerEnabled = false, winner = null } = state;

    if (buzzerStateLabel) buzzerStateLabel.textContent = buzzerEnabled ? "Enabled" : "Disabled";

    if (winner && winner.name) {
      if (adminWinnerName) adminWinnerName.textContent = winner.name;
      if (adminWinnerTime) adminWinnerTime.textContent = formatTime(winner.pressedAt);
      setAdminStatus("winner", "Winner locked");
      document.body.classList.remove("buzzer-live");
    } else {
      if (adminWinnerName) adminWinnerName.textContent = "—";
      if (adminWinnerTime) adminWinnerTime.textContent = "—";
      setAdminStatus(
        buzzerEnabled ? "active" : "waiting",
        buzzerEnabled ? "Buzzer enabled" : "Buzzer disabled"
      );
      if (buzzerEnabled) {
        document.body.classList.add("buzzer-live");
      } else {
        document.body.classList.remove("buzzer-live");
      }
    }

    // Update button states
    if (enableBtn) enableBtn.disabled = buzzerEnabled || (winner !== null);
    if (disableBtn) disableBtn.disabled = !buzzerEnabled;
    if (resetBtn) resetBtn.disabled = false; // Always allow reset if connected
  }, (err) => {
    console.error("Quiz State Error:", err);
    if (adminNotes) adminNotes.textContent = "Warning: Permission denied. Check Firebase Database Rules.";
  });

  // Admin button listeners (using addEventListener for better reliability)
  if (enableBtn) {
    enableBtn.addEventListener("click", () => {
      console.log("Enabling buzzer...");
      update(stateRef, { buzzerEnabled: true, winner: null })
        .then(() => console.log("Buzzer enabled successfully"))
        .catch((err) => {
          console.error("Error enabling buzzer:", err);
          alert("Failed to enable buzzer. Check console for details.");
        });
    });
  }

  if (disableBtn) {
    disableBtn.addEventListener("click", () => {
      console.log("Disabling buzzer...");
      update(stateRef, { buzzerEnabled: false })
        .then(() => console.log("Buzzer disabled successfully"))
        .catch((err) => console.error("Error disabling buzzer:", err));
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (!confirm("Are you sure you want to reset the current round and winner?")) return;
      console.log("Resetting round...");
      set(stateRef, { buzzerEnabled: false, winner: null })
        .then(() => console.log("Round reset successfully"))
        .catch((err) => console.error("Error resetting round:", err));
    });
  }

  // ================= SCOREBOARD =================

  // Live scoreboard
  onValue(scoresRef, (snap) => {
    const scores = snap.val() || {};
    const entries = Object.entries(scores).map(([key, v]) => ({
      name: v.displayName || key,
      score: typeof v.score === "number" ? v.score : 0
    }));

    entries.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    if (scoresBody) {
      scoresBody.innerHTML = entries.length === 0
        ? '<tr><td colspan="3" style="text-align:center; padding: 20px; color: #6b7280;">No participants joined yet.</td></tr>'
        : entries.map((e) => `
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.1); font-size: 0.9rem;">${e.name}</td>
              <td style="padding: 10px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.1); text-align:right;">
                <span style="font-weight: 700; color: #4f46e5; font-size: 1rem;">${e.score}</span>
              </td>
              <td style="padding: 10px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.1); text-align:right;">
                <button class="btn btn-primary" style="padding: 4px 10px; font-size: 0.7rem; margin-left: 4px;" data-action="add" data-name="${encodeURIComponent(e.name)}" data-key="${encodeKey(e.name)}" data-delta="10">+10</button>
                <button class="btn btn-danger" style="padding: 4px 10px; font-size: 0.7rem; margin-left: 4px;" data-action="add" data-name="${encodeURIComponent(e.name)}" data-key="${encodeKey(e.name)}" data-delta="-5">-5</button>
                <button class="btn btn-muted" style="padding: 4px 10px; font-size: 0.7rem; margin-left: 4px;" data-action="reset" data-name="${encodeURIComponent(e.name)}" data-key="${encodeKey(e.name)}">Reset</button>
              </td>
            </tr>
          `).join("");
    }
  }, (err) => {
    console.error("Scoreboard Error:", err);
    if (adminNotes) adminNotes.textContent = "Warning: Scoreboard access error. Check permissions.";
  });

  // Score handlers
  function updateScoreFromKey(key, name, delta) {
    const scoreRef = ref(db, `scores/${key}`);
    runTransaction(scoreRef, (cur) => {
      if (!cur) return { displayName: name, score: delta };
      return {
        ...cur,
        score: (cur.score || 0) + delta,
        displayName: name
      };
    }).catch(err => console.error("Update score failed:", err));
  }

  function resetScoreFromKey(key) {
    update(ref(db, `scores/${key}`), { score: 0 })
      .catch(err => console.error("Reset score failed:", err));
  }

  // Button delegation
  if (scoresBody) {
    scoresBody.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const name = decodeURIComponent(btn.dataset.name);
      const key = btn.dataset.key;
      if (btn.dataset.action === "add") {
        updateScoreFromKey(key, name, parseInt(btn.dataset.delta, 10));
      } else {
        if (confirm(`Reset score for ${name}?`)) {
          resetScoreFromKey(key);
        }
      }
    });
  }
}
