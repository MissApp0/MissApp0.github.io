import { auth, db } from "./firebase.js";
import { state } from "./state.js";

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
  addDoc,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
  listenConversations
} from "./chat/conversations.js";

import {
  searchUsers
} from "./chat/search.js";

let unsubscribeConversations = null;
let unsubscribeMessages = null;
let searchTimer = null;
let isSending = false;
let currentConversationId = null;

document.addEventListener("DOMContentLoaded", init);

function init() {
  createAuthUI();
  createAppUI();
  setupEvents();
  setupAuth();
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
  const sidebar = document.getElementById("sidebar");
  const chat = document.getElementById("chat");

  if (!sidebar || !chat) {
    console.error("MissApp: #sidebar or #chat not found.");
    return;
  }

  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-top">
        <div class="sidebar-title">MissApp</div>

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
        <input id="user-search" class="input" type="search" placeholder="Search users..." autocomplete="off" aria-label="Search users">
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
      <button id="logout-button" class="btn" type="button">Logout</button>
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
          <textarea id="message-input" class="composer-input" rows="1" maxlength="4000" placeholder="Write a message..." disabled></textarea>
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
  document.getElementById("user-search")?.addEventListener("input", handleSearch);
  document.getElementById("open-sidebar")?.addEventListener("click", openSidebar);
  document.getElementById("close-sidebar")?.addEventListener("click", closeSidebar);
  document.getElementById("back-button")?.addEventListener("click", handleBack);

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

function setupAuth() {
  onAuthStateChanged(auth, async user => {
    state.user = user;
    state.me = user;

    if (!user) {
      cleanup();
      state.currentConversation = null;
      showAuth();
      return;
    }

    try {
      showApp();
      await ensureUserDocument(user);
      await loadCurrentUser(user);
      startConversationListener();
    } catch (error) {
      console.error("Application startup error:", error);
      showToast("Could not initialize your account.", "error");
    }
  });
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

  window.dispatchEvent(
    new CustomEvent("missapp:start-conversation", {
      detail: {
        otherUserId
      }
    })
  );

  showToast("Opening conversation...", "info");
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
      const messages = snapshot.docs.map(
        item => ({
          id: item.id,
          ...item.data()
        })
      );

      renderMessages(messages);
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
        senderId:
          state.user.uid,

        text,

        createdAt:
          serverTimestamp()
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
      return "You don't have permission to send messages.";

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
