import { auth, db } from "./firebase.js";
import { state } from "./state.js";
import { playSound, getSoundSettings, updateSoundSettings, resetSoundSettings, unlockAudio } from "./sounds.js";

import { login } from "./auth/login.js";
import { register } from "./auth/register.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  collectionGroup,
  addDoc,
  query,
  orderBy,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
  listenConversations
} from "./chat/conversations.js";

import {
  searchUsers
} from "./chat/search.js";

import {
  createConversation
} from "./chat/conversations.js";

import {
  initCalls,
  startCall,
  endActiveCall
} from "./call.js";

let unsubscribeConversations = null;
let unsubscribeMessages = null;
let searchTimer = null;
let isSending = false;
let currentConversationId = null;
let messageListenerReady = false;
let unsubscribeIncomingMessages = null;
let incomingMessageReady = false;
let networkOnline = navigator.onLine;
let lastRealtimeActivity = 0;
let healthTimer = null;

document.addEventListener("DOMContentLoaded", init, { once: true });

function init() {
  try {
    createAuthUI();
    createAppUI();
    setupEvents();
    setupConnectionMonitor();
    setupAuth();
  } catch (error) {
    console.error("MissApp initialization error:", error);
    showFatalAuthError("MissApp could not start correctly. Refresh the page and try again.");
  }
}

function createAuthUI() {
  const container = document.getElementById("auth");

  if (!container) {
    console.error("MissApp: #auth not found.");
    return;
  }

  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-title">MissApp</div>
      <div class="auth-subtitle">Secure real-time messaging</div>
      <div id="auth-error" class="auth-error hidden" role="alert"></div>

      <form id="login-form" class="auth-form">
        <div class="auth-field">
          <label class="auth-label">Email</label>
          <input class="input" type="email" name="email" placeholder="Email" autocomplete="email" required>
        </div>

        <div class="auth-field">
          <label class="auth-label">Password</label>
          <input class="input" type="password" name="password" placeholder="Password" autocomplete="current-password" required>
        </div>

        <div class="auth-actions">
          <button class="btn" type="submit" id="login-button">Login</button>
        </div>
      </form>

      <form id="register-form" class="auth-form hidden">
        <div class="auth-field">
          <label class="auth-label">Display name</label>
          <input class="input" type="text" name="displayName" placeholder="Your name" autocomplete="name" minlength="2" maxlength="32" required>
        </div>

        <div class="auth-field">
          <label class="auth-label">Email</label>
          <input class="input" type="email" name="email" placeholder="Email" autocomplete="email" required>
        </div>

        <div class="auth-field">
          <label class="auth-label">Password</label>
          <input class="input" type="password" name="password" placeholder="At least 6 characters" autocomplete="new-password" minlength="6" required>
        </div>

        <div class="auth-actions">
          <button class="btn" type="submit" id="register-button">Create Account</button>
        </div>
      </form>

      <div class="auth-switch">
        <span id="auth-switch-text">Don't have an account?</span>
        <button id="auth-switch-button" type="button">Register</button>
      </div>
    </div>
  `;
}

function createAppUI() {
  if (!document.getElementById("incoming-notifications")) {
    const connection = document.createElement("div");
    connection.id = "connection-banner";
    connection.setAttribute("role", "status");
    connection.setAttribute("aria-live", "polite");
    connection.innerHTML = `<span id="connection-dot"></span><span id="connection-text">Connecting…</span><button id="connection-retry" type="button">Retry</button>`;
    document.body.appendChild(connection);

    const notifications = document.createElement("div");
    notifications.id = "incoming-notifications";
    notifications.setAttribute("aria-live", "polite");
    notifications.setAttribute("aria-label", "New message notifications");
    document.body.appendChild(notifications);
  }

  const sidebar = document.getElementById("sidebar");
  const chat = document.getElementById("chat");

  if (!sidebar || !chat) {
    console.error("MissApp: #sidebar or #chat not found.");
    return;
  }

  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-top">
        <div class="sidebar-title">WhatsApp</div>

        <button id="close-sidebar" class="mobile-sidebar-button" type="button" aria-label="Close conversations">
          ×
        </button>
      </div>

      <div id="current-user" class="current-user">
        <div id="current-user-avatar" class="conversation-avatar">?</div>

        <div class="current-user-info">
          <div id="current-user-name" class="current-user-name">User</div>
          <div id="current-user-email" class="current-user-email">Loading...</div>
        </div>
      </div>

      <div class="search-container">
        <input id="user-search" class="input" type="search" placeholder="Search or start new chat" autocomplete="off" aria-label="Search users">
        <div id="search-results" class="search-results"></div>
      </div>
    </div>

    <div id="conversation-list" class="conversation-list">
      <div class="chat-empty">
        <div>
          <div class="chat-empty-title">No conversations</div>
          <div>Search for someone to start chatting.</div>
        </div>
      </div>
    </div>

    <div class="sidebar-footer">
      <div class="sidebar-footer-actions">
        <button id="settings-button" class="btn secondary" type="button">⚙ Settings</button>
        <button id="logout-button" class="btn" type="button">Logout</button>
      </div>
    </div>
  `;

  chat.innerHTML = `
    <header class="chat-header">
      <button id="open-sidebar" class="chat-menu-button" type="button" aria-label="Open conversations">
        ☰
      </button>

      <button id="back-button" class="chat-back" type="button" aria-label="Back to conversations">
        ←
      </button>

      <div id="chat-avatar" class="conversation-avatar">?</div>

      <div class="chat-header-info">
        <div id="chat-name" class="chat-header-name">Select a conversation</div>
        <div id="chat-status" class="chat-header-status">Choose someone to start chatting</div>
      </div>

      <div class="chat-call-actions">
        <button id="voice-call-button" class="chat-call-button" type="button" aria-label="Voice call" title="Voice call">☎</button>
        <button id="video-call-button" class="chat-call-button" type="button" aria-label="Video call" title="Video call">▣</button>
      </div>
    </header>

    <div id="messages" class="messages">
      <div class="chat-empty">
        <div>
          <div class="chat-empty-title">Welcome to MissApp</div>
          <div>Select a conversation to start messaging.</div>
        </div>
      </div>
    </div>

    <div class="chat-composer">
      <form id="composer-form" class="composer-form">
        <div class="composer-wrapper">
          <textarea id="message-input" class="composer-input" rows="1" maxlength="4000" placeholder="Type a message" disabled></textarea>
          <div id="message-counter" class="message-counter">0 / 4000</div>
        </div>

        <button class="composer-send" type="submit" id="send-button" disabled aria-label="Send message">
          ➤
        </button>
      </form>
    </div>
  `;
}

function setupEvents() {
  document.getElementById("login-form")?.addEventListener("submit", handleLogin);
  document.getElementById("register-form")?.addEventListener("submit", handleRegister);
  document.getElementById("auth-switch-button")?.addEventListener("click", toggleAuth);
  document.getElementById("logout-button")?.addEventListener("click", handleLogout);
  document.getElementById("connection-retry")?.addEventListener("click", retryConnection);
  document.getElementById("settings-button")?.addEventListener("click", openSettings);
  document.getElementById("user-search")?.addEventListener("input", handleSearch);
  document.getElementById("open-sidebar")?.addEventListener("click", openSidebar);
  document.getElementById("close-sidebar")?.addEventListener("click", closeSidebar);
  document.getElementById("back-button")?.addEventListener("click", handleBack);
  document.getElementById("voice-call-button")?.addEventListener("click", () => beginCall(false));
  document.getElementById("video-call-button")?.addEventListener("click", () => beginCall(true));

  const composer = document.getElementById("composer-form");
  const input = document.getElementById("message-input");

  composer?.addEventListener("submit", handleSendMessage);
  input?.addEventListener("input", handleMessageInput);
  input?.addEventListener("keydown", handleMessageKeydown);

  document.addEventListener("click", event => {
    const container = document.querySelector(".search-container");

    if (!container || container.contains(event.target)) {
      return;
    }

    const results = document.getElementById("search-results");

    if (results) {
      results.innerHTML = "";
    }
  });
}

function setupConnectionMonitor() {
  updateConnectionUI();

  window.addEventListener("online", () => {
    networkOnline = true;
    updateConnectionUI();
    showToast("Connection restored.", "success");
  });

  window.addEventListener("offline", () => {
    networkOnline = false;
    updateConnectionUI();
    showToast("You are offline. MissApp will reconnect automatically.", "error");
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.user) {
      updateConnectionUI();
      startConversationListener();
      startIncomingMessageListener();
      if (currentConversationId) {
        listenToMessages(currentConversationId);
      }
    }
  });

  healthTimer = setInterval(updateConnectionUI, 15000);
}

function updateConnectionUI() {
  const banner = document.getElementById("connection-banner");
  const text = document.getElementById("connection-text");
  if (!banner || !text) return;

  if (!navigator.onLine) {
    banner.classList.add("visible", "offline");
    text.textContent = "Offline — waiting for connection";
    return;
  }

  if (!state.user) {
    banner.classList.remove("visible", "offline");
    return;
  }

  const stale = lastRealtimeActivity && Date.now() - lastRealtimeActivity > 45000;

  if (stale) {
    banner.classList.add("visible");
    banner.classList.remove("offline");
    text.textContent = "Realtime connection is reconnecting…";
  } else {
    banner.classList.remove("visible", "offline");
  }
}

async function retryConnection() {
  const button = document.getElementById("connection-retry");
  if (button) {
    button.disabled = true;
    button.textContent = "Retrying…";
  }

  try {
    if (!navigator.onLine) {
      showToast("You are still offline.", "error");
      return;
    }

    startConversationListener();
    startIncomingMessageListener();

    if (currentConversationId) {
      listenToMessages(currentConversationId);
    }

    lastRealtimeActivity = Date.now();
    updateConnectionUI();
    showToast("Realtime connection refreshed.", "success");
  } catch (error) {
    console.error("Realtime retry failed:", error);
    showToast("Could not refresh the realtime connection.", "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Retry";
    }
  }
}

function setupAuth() {
  let authResolved = false;

  const authTimeout = setTimeout(() => {
    if (!authResolved && !state.user) {
      setAuthLoading(false);
      showAuthError("Firebase authentication is taking too long. Check your connection and refresh.");
    }
  }, 10000);

  onAuthStateChanged(auth, async user => {
    authResolved = true;
    clearTimeout(authTimeout);
    setAuthLoading(false);

    try {
      state.user = user;
      state.me = user;

      if (!user) {
        cleanup();
        state.currentConversation = null;
        showAuth();
        return;
      }

      showApp();
      await ensureUserDocument(user);
      await loadCurrentUser(user);
      startConversationListener();
      startIncomingMessageListener();
      setupBrowserNotifications();
      initCalls();
    } catch (error) {
      console.error("Application startup error:", error);
      showApp();
      showToast(getFirestoreError(error), "error");
    }
  }, error => {
    authResolved = true;
    clearTimeout(authTimeout);
    setAuthLoading(false);
    console.error("Auth state listener error:", error);
    showAuth();
    showAuthError(getAuthError(error));
  });
}

function setAuthLoading(loading) {
  document.getElementById("auth")?.classList.toggle("auth-loading", loading);
}

function showAuthError(message) {
  const box = document.getElementById("auth-error");
  if (box) {
    box.textContent = message;
    box.classList.remove("hidden");
  }
}

function showFatalAuthError(message) {
  const auth = document.getElementById("auth");
  if (!auth) return;
  auth.innerHTML = '<div class="auth-card auth-fatal"><div class="auth-brand-mark">M</div><div class="auth-title">MissApp</div><div class="auth-subtitle">' + escapeHTML(message) + '</div><button class="btn" type="button" onclick="location.reload()">Refresh</button></div>';
}

async function ensureUserDocument(user) {
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);

  const displayName =
    user.displayName ||
    user.email?.split("@")[0] ||
    "User";

  const cleanUsername = displayName.trim();

  if (!snapshot.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email || "",
      username: cleanUsername,
      displayName: cleanUsername,
      key: cleanUsername.toLowerCase(),
      language: "en",
      lastSeen: serverTimestamp(),
      notificationMode: "all",
      online: true,
      createdAt: serverTimestamp()
    });

    return;
  }

  const data = snapshot.data();
  const updates = {};

  const existingName =
    data.username ||
    data.displayName ||
    user.displayName ||
    user.email?.split("@")[0] ||
    "User";

  const cleanExistingName = existingName.trim();

  if (!data.username) {
    updates.username = cleanExistingName;
  }

  if (!data.displayName) {
    updates.displayName = cleanExistingName;
  }

  if (!data.key) {
    updates.key = cleanExistingName.toLowerCase();
  }

  if (!data.email && user.email) {
    updates.email = user.email;
  }

  if (!data.language) {
    updates.language = "en";
  }

  if (!data.notificationMode) {
    updates.notificationMode = "all";
  }

  if (Object.keys(updates).length) {
    await setDoc(userRef, updates, { merge: true });
  }
}

async function loadCurrentUser(user) {
  const snapshot = await getDoc(doc(db, "users", user.uid));
  const data = snapshot.exists() ? snapshot.data() : {};

  const displayName =
    data.username ||
    data.displayName ||
    user.displayName ||
    user.email?.split("@")[0] ||
    "User";

  state.me = {
    uid: user.uid,
    email: data.email || user.email || "",
    username: data.username || displayName,
    displayName,
    key: data.key || displayName.trim().toLowerCase()
  };

  updateCurrentUserUI();
}

function updateCurrentUserUI() {
  const user = state.me;

  if (!user) return;

  const name = document.getElementById("current-user-name");
  const email = document.getElementById("current-user-email");
  const avatar = document.getElementById("current-user-avatar");

  if (name) {
    name.textContent = user.displayName || user.username || "User";
  }

  if (email) {
    email.textContent = user.email || "";
  }

  if (avatar) {
    avatar.textContent = getInitial(user.displayName || user.email);
  }
}

function showAuth() {
  document.getElementById("auth")?.classList.remove("hidden");
  document.getElementById("app")?.classList.add("hidden");
  document.body.classList.remove("chat-open");
}

function showApp() {
  document.getElementById("auth")?.classList.add("hidden");
  document.getElementById("app")?.classList.remove("hidden");
}

async function handleLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = document.getElementById("login-button");

  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;

  if (!email || !password) {
    showToast("Enter your email and password.", "error");
    return;
  }

  setButtonLoading(button, true, "Logging in...");
  const loginTimeout = setTimeout(() => {
    if (button?.disabled) {
      setButtonLoading(button, false, "Login");
      showToast("Login is taking too long. Check your connection and try again.", "error");
    }
  }, 15000);

  try {
    await login(email, password);
    form.reset();
    showToast("Welcome back!", "success");
  } catch (error) {
    console.error("Login error:", error);
    showToast(getAuthError(error), "error");
  } finally {
    setButtonLoading(button, false, "Login");
  }
}

async function handleRegister(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = document.getElementById("register-button");

  const displayName = form.elements.displayName.value.trim();
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;

  if (displayName.length < 2) {
    showToast("Display name must be at least 2 characters.", "error");
    return;
  }

  if (displayName.length > 32) {
    showToast("Display name cannot exceed 32 characters.", "error");
    return;
  }

  if (!email) {
    showToast("Enter your email address.", "error");
    return;
  }

  if (password.length < 6) {
    showToast("Password must be at least 6 characters.", "error");
    return;
  }

  setButtonLoading(button, true, "Creating...");

  try {
    await register(displayName, email, password);
    form.reset();
    showToast("Account created!", "success");
  } catch (error) {
    console.error("Registration error:", error);
    showToast(getAuthError(error), "error");
  } finally {
    setButtonLoading(button, false, "Create Account");
  }
}

function toggleAuth() {
  state.registerMode = !state.registerMode;

  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const text = document.getElementById("auth-switch-text");
  const button = document.getElementById("auth-switch-button");

  if (state.registerMode) {
    loginForm?.classList.add("hidden");
    registerForm?.classList.remove("hidden");

    if (text) {
      text.textContent = "Already have an account?";
    }

    if (button) {
      button.textContent = "Login";
    }
  } else {
    registerForm?.classList.add("hidden");
    loginForm?.classList.remove("hidden");

    if (text) {
      text.textContent = "Don't have an account?";
    }

    if (button) {
      button.textContent = "Register";
    }
  }
}

async function handleLogout() {
  try {
    await signOut(auth);
    showToast("Logged out.", "success");
  } catch (error) {
    console.error("Logout error:", error);
    showToast("Logout failed.", "error");
  }
}

function handleSearch(event) {
  const term = event.target.value.trim().toLowerCase();

  clearTimeout(searchTimer);

  const results = document.getElementById("search-results");

  if (!results) return;

  if (!term) {
    results.innerHTML = "";
    return;
  }

  results.innerHTML = `
    <div class="search-loading">
      Searching...
    </div>
  `;

  searchTimer = setTimeout(async () => {
    try {
      const users = await searchUsers(term);
      renderSearchResults(users);
    } catch (error) {
      console.error("Search error:", error);

      results.innerHTML = `
        <div class="search-empty">
          Search failed.
        </div>
      `;
    }
  }, 250);
}

function renderSearchResults(users) {
  const results = document.getElementById("search-results");

  if (!results) return;

  const filtered = users.filter(
    user => user.uid !== state.user?.uid
  );

  if (!filtered.length) {
    results.innerHTML = `
      <div class="search-empty">
        No users found.
      </div>
    `;
    return;
  }

  results.innerHTML = filtered
    .slice(0, 8)
    .map(user => {
      const name =
        user.username ||
        user.displayName ||
        user.email ||
        "User";

      return `
        <button
          class="search-result"
          type="button"
          data-user-id="${escapeHTML(user.uid || user.id)}"
        >
          <div class="conversation-avatar">
            ${escapeHTML(getInitial(name))}
          </div>

          <div class="search-result-info">
            <div>
              ${escapeHTML(name)}
            </div>

            <small>
              ${escapeHTML(user.email || "")}
            </small>
          </div>
        </button>
      `;
    })
    .join("");

  results
    .querySelectorAll(".search-result")
    .forEach(button => {
      button.addEventListener("click", async () => {
        const userId = button.dataset.userId;

        closeSearch();
        await startConversation(userId);
      });
    });
}

async function startConversation(otherUserId) {
  if (!state.user || !otherUserId) return;

  try {
    const conversation = await createConversation(otherUserId);
    const userSnapshot = await getDoc(doc(db, "users", otherUserId));

    if (!userSnapshot.exists()) {
      throw new Error("User profile not found.");
    }

    const otherUser = {
      uid: otherUserId,
      ...userSnapshot.data()
    };

    openConversation({
      id: conversation.id,
      data: {
        participants: [state.user.uid, otherUserId],
        participantData: {
          [state.user.uid]: state.me || {},
          [otherUserId]: otherUser
        }
      }
    });

    showToast("Conversation opened.", "success");
  } catch (error) {
    console.error("Start conversation error:", error);
    showToast(getFirestoreError(error), "error");
  }
}

function setupBrowserNotifications() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    document.addEventListener("click", requestBrowserNotifications, { once: true, capture: true });
  }
}

async function requestBrowserNotifications() {
  if (!("Notification" in window) || Notification.permission !== "default") return;
  try {
    await Notification.requestPermission();
  } catch (error) {
    console.warn("Notification permission request failed:", error);
  }
}

function startIncomingMessageListener() {
  unsubscribeIncomingMessages?.();
  incomingMessageReady = false;

  if (!state.user) return;

  const incomingQuery = query(
    collectionGroup(db, "messages"),
    where("receiver", "==", state.user.uid)
  );

  unsubscribeIncomingMessages = onSnapshot(
    incomingQuery,
    snapshot => {
      lastRealtimeActivity = Date.now();
      updateConnectionUI();

      if (!incomingMessageReady) {
        incomingMessageReady = true;
        return;
      }

      snapshot.docChanges().forEach(change => {
        if (change.type !== "added") return;

        const message = { id: change.doc.id, ...change.doc.data() };
        if (!message.senderId || message.senderId === state.user?.uid) return;

        const conversationId = change.doc.ref.parent.parent?.id;
        const senderName = message.senderName || "New message";
        const preview = String(message.text || "").trim();

        playSound("messageReceived");
        showIncomingMessageNotification(senderName, preview, conversationId);

        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          try {
            new Notification(senderName, {
              body: preview || "Sent you a message",
              tag: conversationId || message.id
            });
          } catch (error) {
            console.warn("Browser notification failed:", error);
          }
        }
      });
    },
    error => {
      console.error("Incoming message listener error:", error);
      showToast("Incoming notifications are unavailable. Publish the latest Firestore rules.", "error");
    }
  );
}

function showIncomingMessageNotification(senderName, preview, conversationId) {
  const container = document.getElementById("incoming-notifications");
  if (!container) return;

  const notification = document.createElement("button");
  notification.type = "button";
  notification.className = "incoming-notification";
  notification.innerHTML = `
    <span class="incoming-notification-avatar">${escapeHTML(getInitial(senderName))}</span>
    <span class="incoming-notification-copy">
      <strong>${escapeHTML(senderName)}</strong>
      <span>${escapeHTML(preview || "Sent you a message")}</span>
    </span>
    <span class="incoming-notification-close" aria-hidden="true">×</span>
  `;

  notification.addEventListener("click", () => {
    notification.remove();
    if (conversationId) openConversationById(conversationId);
  });

  container.prepend(notification);
  while (container.children.length > 4) container.lastElementChild?.remove();

  setTimeout(() => {
    notification.classList.add("is-leaving");
    setTimeout(() => notification.remove(), 220);
  }, 6000);
}

async function openConversationById(conversationId) {
  if (!conversationId || !state.user) return;

  try {
    const snapshot = await getDoc(doc(db, "conversations", conversationId));
    if (snapshot.exists()) openConversation({ id: conversationId, data: snapshot.data() });
  } catch (error) {
    console.error("Open notification conversation error:", error);
  }
}

function startConversationListener() {
  if (!state.user) return;

  unsubscribeConversations?.();

  unsubscribeConversations =
    listenConversations(renderConversations);
}

function renderConversations(docs) {
  const list = document.getElementById("conversation-list");

  if (!list) return;

  if (!docs?.length) {
    list.innerHTML = `
      <div class="chat-empty">
        <div>
          <div class="chat-empty-title">No conversations</div>
          <div>Search for someone to start chatting.</div>
        </div>
      </div>
    `;

    return;
  }

  list.innerHTML = docs
    .map(item => {
      const data =
        typeof item.data === "function"
          ? item.data()
          : item;

      const id = item.id;
      const otherUser = getOtherParticipant(data);

      const name =
        otherUser.username ||
        otherUser.displayName ||
        otherUser.email ||
        "User";

      const preview =
        data.lastMessage ||
        "No messages yet";

      return `
        <button
          class="
            conversation
            ${currentConversationId === id ? "active" : ""}
          "
          type="button"
          data-conversation-id="${escapeHTML(id)}"
        >
          <div class="conversation-avatar">
            ${escapeHTML(getInitial(name))}
          </div>

          <div class="conversation-content">
            <div class="conversation-name">
              ${escapeHTML(name)}
            </div>

            <div class="conversation-preview">
              ${escapeHTML(preview)}
            </div>
          </div>
        </button>
      `;
    })
    .join("");

  list
    .querySelectorAll(".conversation")
    .forEach(button => {
      button.addEventListener("click", () => {
        const id = button.dataset.conversationId;

        const docData = docs.find(
          item => item.id === id
        );

        if (!docData) return;

        openConversation(docData);
      });
    });
}

function getOtherParticipant(conversation) {
  if (conversation.participantData) {
    const entries = Object.entries(
      conversation.participantData
    );

    const other = entries.find(
      ([uid]) => uid !== state.user?.uid
    );

    if (other) {
      return other[1] || {};
    }
  }

  if (conversation.participants) {
    const otherId = conversation.participants.find(
      uid => uid !== state.user?.uid
    );

    if (
      conversation.users &&
      conversation.users[otherId]
    ) {
      return conversation.users[otherId];
    }
  }

  return {};
}

function openConversation(item) {
  const data =
    typeof item.data === "function"
      ? item.data()
      : item;

  const conversationId = item.id;
  const otherUser = getOtherParticipant(data);

  currentConversationId = conversationId;

  state.currentConversation = {
    id: conversationId,
    otherUserId: otherUser.uid || null,
    otherUser
  };

  updateChatHeader(otherUser);
  enableComposer();
  renderConversationActive();
  listenToMessages(conversationId);

  document.body.classList.add("chat-open");

  closeSidebar();
}

async function beginCall(video) {
  const other = state.currentConversation?.otherUser;
  if (!other?.uid) {
    showToast("Open a conversation first.", "error");
    return;
  }

  try {
    await startCall({
      calleeId: other.uid,
      calleeName: other.username || other.displayName || other.email || "User",
      video
    });
  } catch (error) {
    console.error("Start call error:", error);
    showToast(error?.message || "Could not start the call.", "error");
  }
}

function updateChatHeader(user) {
  const name = document.getElementById("chat-name");
  const status = document.getElementById("chat-status");
  const avatar = document.getElementById("chat-avatar");

  const displayName =
    user.username ||
    user.displayName ||
    user.email ||
    "User";

  if (name) {
    name.textContent = displayName;
  }

  if (status) {
    status.textContent =
      user.email ||
      "MissApp user";
  }

  document.getElementById("voice-call-button")?.removeAttribute("disabled");
  document.getElementById("video-call-button")?.removeAttribute("disabled");

  if (avatar) {
    avatar.textContent =
      getInitial(displayName);
  }
}

function renderConversationActive() {
  document
    .querySelectorAll(".conversation")
    .forEach(item => {
      item.classList.toggle(
        "active",
        item.dataset.conversationId ===
          currentConversationId
      );
    });
}

function listenToMessages(conversationId) {
  unsubscribeMessages?.();
  messageListenerReady = false;

  const messagesRef = collection(
    db,
    "conversations",
    conversationId,
    "messages"
  );

  const q = query(
    messagesRef,
    orderBy("createdAt", "asc")
  );

  unsubscribeMessages = onSnapshot(
    q,
    snapshot => {
      lastRealtimeActivity = Date.now();
      updateConnectionUI();

      const messages = snapshot.docs.map(
        item => ({
          id: item.id,
          ...item.data()
        })
      );

      const previousCount = containerMessageCount();
      renderMessages(messages);
      if (messageListenerReady && messages.length > previousCount) {
        const latest = messages[messages.length - 1];
        if (latest?.senderId !== state.user?.uid) playSound("messageReceived");
      }
      messageListenerReady = true;
    },
    error => {
      console.error(
        "Message listener error:",
        error
      );

      showToast(
        "Could not load messages.",
        "error"
      );
    }
  );
}

function renderMessages(messages) {
  const container =
    document.getElementById("messages");

  if (!container) return;

  if (!messages.length) {
    container.innerHTML = `
      <div class="chat-empty">
        <div>
          <div class="chat-empty-title">No messages yet</div>
          <div>Send the first message.</div>
        </div>
      </div>
    `;

    return;
  }

  container.innerHTML = messages
    .map(message => {
      const mine =
        message.senderId ===
        state.user?.uid;

      const time =
        formatMessageTime(
          message.createdAt
        );

      return `
        <div class="message-row ${mine ? "mine" : "theirs"}">
          <div class="message">
            <div class="message-text">
              ${escapeHTML(message.text || "")}
            </div>

            ${
              time
                ? `
                  <div class="message-time">
                    ${escapeHTML(time)}
                  </div>
                `
                : ""
            }
          </div>
        </div>
      `;
    })
    .join("");

  scrollMessagesToBottom();
}

async function handleSendMessage(event) {
  event.preventDefault();

  if (isSending) return;

  const input =
    document.getElementById(
      "message-input"
    );

  if (!input) return;

  const text = input.value.trim();

  if (!text) return;

  if (
    !state.user ||
    !state.currentConversation
  ) {
    showToast(
      "Select a conversation first.",
      "error"
    );

    return;
  }

  const conversationId =
    state.currentConversation.id;

  const sendButton =
    document.getElementById(
      "send-button"
    );

  isSending = true;

  sendButton?.setAttribute(
    "disabled",
    ""
  );

  try {
    await addDoc(
      collection(
        db,
        "conversations",
        conversationId,
        "messages"
      ),
      {
        senderId: state.user.uid,
        sender: state.user.uid,
        receiver: state.currentConversation.otherUserId || "",
        senderName: state.me?.displayName || state.me?.username || state.user.email || "User",
        text,
        createdAt: serverTimestamp()
      }
    );

    await setDoc(
      doc(
        db,
        "conversations",
        conversationId
      ),
      {
        lastMessage:
          text,

        lastMessageAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp()
      },
      {
        merge: true
      }
    );

    input.value = "";

    playSound("messageSent");

    updateMessageCounter();
    resetTextareaHeight();

    requestAnimationFrame(
      scrollMessagesToBottom
    );
  } catch (error) {
    console.error(
      "Send message error:",
      error
    );

    showToast(
      getFirestoreError(error),
      "error"
    );
  } finally {
    isSending = false;

    if (state.currentConversation) {
      sendButton?.removeAttribute(
        "disabled"
      );
    }
  }
}

function handleMessageInput() {
  const input =
    document.getElementById(
      "message-input"
    );

  if (!input) return;

  input.style.height = "auto";

  input.style.height =
    Math.min(
      input.scrollHeight,
      140
    ) + "px";

  updateMessageCounter();
}

function updateMessageCounter() {
  const input =
    document.getElementById(
      "message-input"
    );

  const counter =
    document.getElementById(
      "message-counter"
    );

  if (!input || !counter) return;

  const length =
    input.value.length;

  counter.textContent =
    `${length} / 4000`;

  counter.classList.toggle(
    "near-limit",
    length >= 3600
  );

  counter.classList.toggle(
    "limit",
    length >= 4000
  );
}

function handleMessageKeydown(event) {
  if (
    event.key === "Enter" &&
    !event.shiftKey
  ) {
    event.preventDefault();

    document
      .getElementById("composer-form")
      ?.requestSubmit();
  }
}

function enableComposer() {
  document
    .getElementById("message-input")
    ?.removeAttribute("disabled");

  document
    .getElementById("send-button")
    ?.removeAttribute("disabled");

  document
    .getElementById("message-input")
    ?.focus();
}

function disableComposer() {
  document
    .getElementById("message-input")
    ?.setAttribute("disabled", "");

  document
    .getElementById("send-button")
    ?.setAttribute("disabled", "");
}

function resetTextareaHeight() {
  const input =
    document.getElementById(
      "message-input"
    );

  if (!input) return;

  input.style.height = "auto";
}

function openSidebar() {
  document
    .getElementById("sidebar")
    ?.classList.add("open");
}

function closeSidebar() {
  document
    .getElementById("sidebar")
    ?.classList.remove("open");
}

function handleBack() {
  document.body.classList.remove(
    "chat-open"
  );

  openSidebar();
}

function closeSearch() {
  const results =
    document.getElementById(
      "search-results"
    );

  const input =
    document.getElementById(
      "user-search"
    );

  if (results) {
    results.innerHTML = "";
  }

  if (input) {
    input.value = "";
  }
}

function scrollMessagesToBottom() {
  const container =
    document.getElementById(
      "messages"
    );

  if (!container) return;

  container.scrollTop =
    container.scrollHeight;
}

function formatMessageTime(timestamp) {
  if (!timestamp) return "";

  try {
    const date =
      timestamp.toDate
        ? timestamp.toDate()
        : new Date(timestamp);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "";
    }

    return new Intl.DateTimeFormat(
      undefined,
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    ).format(date);
  } catch {
    return "";
  }
}

function setButtonLoading(
  button,
  loading,
  text
) {
  if (!button) return;

  if (!button.dataset.originalText) {
    button.dataset.originalText =
      button.textContent;
  }

  button.disabled = loading;

  button.textContent =
    loading
      ? text
      : button.dataset.originalText;
}

function cleanup() {
  unsubscribeConversations?.();
  unsubscribeMessages?.();
  unsubscribeIncomingMessages?.();

  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }

  unsubscribeConversations =
    null;

  unsubscribeMessages =
    null;

  state.unsubscribeConversations =
    null;

  state.unsubscribeMessages =
    null;

  currentConversationId =
    null;

  state.currentConversation =
    null;

  disableComposer();
  closeSearch();
  document.getElementById("voice-call-button")?.setAttribute("disabled", "");
  document.getElementById("video-call-button")?.setAttribute("disabled", "");
  endActiveCall(false);
}

function showToast(
  message,
  type = "info"
) {
  const container =
    document.getElementById(
      "toast-container"
    );

  if (!container) return;

  const toast =
    document.createElement(
      "div"
    );

  toast.className =
    `toast ${type}`;

  toast.textContent =
    message;

  container.appendChild(
    toast
  );

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform =
      "translateY(8px)";

    setTimeout(
      () => toast.remove(),
      200
    );
  }, 3500);
}

function containerMessageCount() {
  return document.querySelectorAll("#messages .message-row").length;
}

function settingsRow(icon, label, description, id, enabled) {
  return `<div class="settings-row"><div class="settings-icon">${icon}</div><div class="settings-copy"><div class="settings-label">${label}</div><div class="settings-description">${description}</div></div><button id="${id}" class="settings-switch ${enabled ? "active" : ""}" type="button" role="switch" aria-checked="${enabled}"></button></div>`;
}

function openSettings() {
  closeSettings();
  const s = getSoundSettings();
  const modal = document.createElement("div");
  modal.className = "settings-modal";
  modal.id = "settings-modal";
  modal.innerHTML = `
    <div class="settings-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="settings-header"><div class="settings-title" id="settings-title">Settings</div><button class="settings-close" id="settings-close" type="button" aria-label="Close settings">×</button></div>
      <div class="settings-section">
        <div class="settings-section-title">Sounds & notifications</div>
        <div class="settings-row"><div class="settings-icon">▶</div><div class="settings-copy"><div class="settings-label">Test sound</div><div class="settings-description">Tap to check that MissApp audio is working.</div></div><button id="settings-test-sound" class="settings-reset" type="button">Play</button></div>
        ${settingsRow("🔊", "Sound effects", "Play MissApp sounds.", "sound-enabled", s.enabled)}
        <div class="settings-row"><div class="settings-icon">🔉</div><div class="settings-copy"><div class="settings-label">Volume</div><div class="settings-description">Notification sound volume</div></div><input id="sound-volume" class="settings-range" type="range" min="0" max="100" value="${Math.round(s.volume * 100)}" aria-label="Sound volume"></div>
        ${settingsRow("✉", "Message sent", "Sound after sending.", "sound-messageSent", s.messageSent)}
        ${settingsRow("💬", "Message received", "Sound for incoming messages.", "sound-messageReceived", s.messageReceived)}
        ${settingsRow("☎", "Incoming calls", "Incoming-call alert.", "sound-incomingCall", s.incomingCall)}
        ${settingsRow("✓", "Call connected", "Confirmation when connected.", "sound-callConnected", s.callConnected)}
      </div>
      <div class="settings-section"><div class="settings-section-title">App</div><div class="settings-row"><div class="settings-icon">🌐</div><div class="settings-copy"><div class="settings-label">Language</div><div class="settings-description">Interface language</div></div><select class="settings-select" disabled><option>English</option></select></div><div class="settings-row"><div class="settings-icon">↻</div><div class="settings-copy"><div class="settings-label">Hard refresh</div><div class="settings-description">Clear cached app resources and reload MissApp.</div></div><button id="settings-hard-refresh" class="settings-reset" type="button">Refresh</button></div></div>
      <div class="settings-footer"><button id="settings-reset" class="settings-reset" type="button">Reset sound settings</button></div>
    </div>
  `;
  document.body.appendChild(modal);
  unlockAudio();
  setupSettingsEvents();
}

function setupSettingsEvents() {
  const modal = document.getElementById("settings-modal");
  if (!modal) return;
  modal.querySelector("#settings-close")?.addEventListener("click", closeSettings);
  modal.querySelector("#settings-test-sound")?.addEventListener("click", async () => { await unlockAudio(); playSound("messageReceived"); });
  modal.querySelector("#settings-reset")?.addEventListener("click", () => { resetSoundSettings(); openSettings(); });
  modal.querySelector("#settings-hard-refresh")?.addEventListener("click", hardRefreshApp);
  modal.querySelector("#sound-volume")?.addEventListener("input", event => updateSoundSettings({ volume: Number(event.target.value) / 100 }));
  [["sound-enabled","enabled"],["sound-messageSent","messageSent"],["sound-messageReceived","messageReceived"],["sound-incomingCall","incomingCall"],["sound-callConnected","callConnected"]].forEach(([id,key]) => {
    modal.querySelector("#"+id)?.addEventListener("click", event => { const next = !getSoundSettings()[key]; updateSoundSettings({ [key]: next }); event.currentTarget.classList.toggle("active", next); event.currentTarget.setAttribute("aria-checked", String(next)); if (next && key !== "enabled") playSound(key); });
  });
  modal.addEventListener("click", event => { if (event.target === modal) closeSettings(); });
}

async function hardRefreshApp() {
  const button = document.getElementById("settings-hard-refresh");

  if (button) {
    button.disabled = true;
    button.textContent = "Refreshing...";
  }

  showToast("Refreshing MissApp and clearing cached resources…", "info");

  try {
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(name => caches.delete(name))
      );
    }

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();

      // Keep Firebase Messaging registered so push notifications continue
      // working. Ask it to activate immediately when possible.
      await Promise.all(
        registrations.map(registration => {
          const scriptURL = registration.active?.scriptURL || registration.scope || "";
          if (scriptURL.includes("firebase-messaging-sw.js")) {
            registration.waiting?.postMessage({ type: "SKIP_WAITING" });
            return Promise.resolve();
          }
          return registration.unregister();
        })
      );
    }
  } catch (error) {
    console.warn("MissApp cache cleanup failed:", error);
  }

  const url = new URL(window.location.href);
  url.searchParams.set("missapp_refresh", Date.now().toString());
  window.location.replace(url.toString());
}

function closeSettings() { document.getElementById("settings-modal")?.remove(); }

function getAuthError(error) {
  switch (error?.code) {
    case "auth/invalid-email":
      return "Invalid email address.";

    case "auth/user-not-found":
      return "Account not found.";

    case "auth/wrong-password":
      return "Incorrect email or password.";

    case "auth/invalid-credential":
      return "Incorrect email or password.";

    case "auth/email-already-in-use":
      return "This email is already registered.";

    case "auth/weak-password":
      return "Password is too weak.";

    case "auth/too-many-requests":
      return "Too many login attempts. Try again later.";

    case "auth/network-request-failed":
      return "Network error. Check your connection.";

    case "auth/operation-not-allowed":
      return "Email/password authentication is disabled.";

    default:
      return (
        error?.message ||
        "Authentication failed."
      );
  }
}

function getFirestoreError(error) {
  switch (error?.code) {
    case "permission-denied":
      return "Firebase denied this action. Make sure the latest Firestore rules are published.";

    case "unavailable":
      return "Firestore is temporarily unavailable.";

    case "failed-precondition":
      return "Firestore configuration requires attention.";

    case "unauthenticated":
      return "Please log in again.";


    default:
      return (
        error?.message ||
        "Message could not be sent."
      );
  }
}

function getInitial(value) {
  const text =
    String(value || "?").trim();

  return (
    text.charAt(0).toUpperCase() ||
    "?"
  );
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.MissApp = state;
window.MissApp.showToast = showToast;
window.MissApp.toggleAuth = toggleAuth;
window.MissApp.logout = handleLogout;
window.MissApp.openSidebar = openSidebar;
window.MissApp.closeSidebar = closeSidebar;
window.MissApp.openConversation = openConversation;
window.MissApp.hardRefresh = hardRefreshApp;
