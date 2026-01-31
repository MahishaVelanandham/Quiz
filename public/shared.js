/* global firebase */
// Shared Firebase + RTDB helpers for the Quiz Buzzer app.

(function () {
  const APP_NS = "quizBuzzer";

  function mustHaveFirebase() {
    if (typeof firebase === "undefined") {
      throw new Error("Firebase SDK not loaded. Check script tags.");
    }
    if (!firebase.apps || firebase.apps.length === 0) {
      // When using Firebase Hosting, /__/firebase/init.js initializes automatically.
      // If you are not on Hosting, you must initialize manually.
      throw new Error(
        "Firebase is not initialized. If not using Firebase Hosting, call firebase.initializeApp(config)."
      );
    }
  }

  function safeTrim(s) {
    return (s ?? "").toString().trim();
  }

  function normalizeName(name) {
    const n = safeTrim(name).replace(/\s+/g, " ");
    return n.slice(0, 40);
  }

  function getOrCreateClientId() {
    const key = `${APP_NS}:clientId`;
    let id = localStorage.getItem(key);
    if (!id) {
      id =
        (crypto?.randomUUID?.() || `cid_${Math.random().toString(16).slice(2)}`) +
        `_${Date.now().toString(16)}`;
      localStorage.setItem(key, id);
    }
    return id;
  }

  async function ensureAnonAuth() {
    mustHaveFirebase();
    const auth = firebase.auth();
    if (auth.currentUser) return auth.currentUser;
    const cred = await auth.signInAnonymously();
    return cred.user;
  }

  function dbRefs() {
    mustHaveFirebase();
    const db = firebase.database();
    return {
      db,
      buzzer: db.ref("buzzer"),
      enabled: db.ref("buzzer/enabled"),
      winner: db.ref("buzzer/winner"),
      roundId: db.ref("buzzer/roundId"),
      lastResetTs: db.ref("buzzer/lastResetTs"),
      activity: db.ref("buzzer/activity"),
    };
  }

  function formatTime(ts) {
    if (!ts) return "—";
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return String(ts);
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  window.QB = {
    APP_NS,
    normalizeName,
    getOrCreateClientId,
    ensureAnonAuth,
    dbRefs,
    formatTime,
    nowIso,
  };
})();

