
/* =========================================================
   MissApp - js/app.js
   Main application controller
========================================================= */

import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { login } from "./auth/login.js";
import { register } from "./auth/register.js";

import {
  listenConversations
} from "./chat/conversations.js";

import {
  searchUsers
} from "./chat/search.js";


/* =========================================================
   STATE
========================================================= */

const state = {
  user: null,
  currentConversation: null,
  conversations: [],
  unsubscribeConversations: null
};

window.MissApp = state;


/* =========================================================
   DOM
========================================================= */

const auth = document.getElementById("auth");
const app = document.getElementById("app");
const sidebar = document.getElementById("sidebar");
const chat = document.getElementById("chat");
const toastContainer =
  document.getElementById("toast-container");


/* =========================================================
   START
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

  buildAuthUI();
  buildSidebarUI();
  buildChatUI();

  setupEvents();
  setupAuth();

});


/* =========================================================
   AUTH UI
========================================================= */

function buildAuthUI() {

  auth.innerHTML = `
    <div class="auth-card">

      <div class="auth-title">
        MissApp
      </div>

      <div class="auth-subtitle">
        Secure real-time messaging
      </div>

      <!-- LOGIN -->

      <form id="login-form" class="auth-form">

        <div class="auth-field">

          <label class="auth-label">
            Email
          </label>

          <input
            class="input"
            type="email"
            name="email"
            placeholder="you@example.com"
            autocomplete="email"
            required
          >

        </div>

        <div class="auth-field">

          <label class="auth-label">
            Password
          </label>

          <input
            class="input"
            type="password"
            name="password"
            placeholder="Password"
            autocomplete="current-password"
            required
          >

        </div>

        <button
          class="btn"
          type="submit"
        >
          Login
        </button>

      </form>


      <!-- REGISTER -->

      <form
        id="register-form"
        class="auth-form hidden"
      >

        <div class="auth-field">

          <label class="auth-label">
            Email
          </label>

          <input
            class="input"
            type="email"
            name="email"
            placeholder="you@example.com"
            autocomplete="email"
            required
          >

        </div>

        <div class="auth-field">

          <label class="auth-label">
            Password
          </label>

          <input
            class="input"
            type="password"
            name="password"
            placeholder="At least 6 characters"
            autocomplete="new-password"
            minlength="6"
            required
          >

        </div>

        <button
          class="btn"
          type="submit"
        >
          Create Account
        </button>

      </form>


      <div class="auth-switch">

        <span id="auth-switch-text">
          Don't have an account?
        </span>

        <button
          id="auth-switch-button"
          type="button"
        >
          Register
        </button>

      </div>

    </div>
  `;

}


/* =========================================================
   SIDEBAR UI
========================================================= */

function buildSidebarUI() {

  sidebar.innerHTML = `

    <div class="sidebar-header">

      <div class="sidebar-title">
        MissApp
      </div>

      <div class="search-container">

        <input
          id="user-search"
          class="input"
          type="search"
          placeholder="Search users..."
          autocomplete="off"
        >

        <div
          id="search-results"
          class="search-results"
        ></div>

      </div>

    </div>


    <div
      id="conversation-list"
      aria-label="Conversations"
    ></div>


    <div class="sidebar-footer">

      <button
        id="logout-button"
        class="btn"
        type="button"
      >
        Logout
      </button>

    </div>

  `;

}


/* =========================================================
   CHAT UI
========================================================= */

function buildChatUI() {

  chat.innerHTML = `

    <header class="chat-header">

      <button
        id="back-button"
        class="chat-back"
        type="button"
        aria-label="Back"
      >
        ←
      </button>

      <div
        id="chat-avatar"
        class="conversation-avatar"
      >
        ?
      </div>

      <div class="chat-header-info">

        <div
          id="chat-name"
          class="chat-header-name"
        >
          Select a conversation
        </div>

        <div
          id="chat-status"
          class="chat-header-status"
        >
          Choose someone to start chatting
        </div>

      </div>

    </header>


    <div
      id="messages"
      aria-live="polite"
    >

      <div class="chat-empty">

        <div>

          <div class="chat-empty-title">
            Welcome to MissApp
          </div>

          <div>
            Select a conversation to start messaging.
          </div>

        </div>

      </div>

    </div>


    <div class="chat-composer">

      <form
        id="composer-form"
        class="composer-form"
      >

        <textarea
          id="message-input"
          class="composer-input"
          rows="1"
          placeholder="Write a message..."
          autocomplete="off"
        ></textarea>

        <button
          id="send-button"
          class="composer-send"
          type="submit"
          aria-label="Send message"
        >
          ➤
        </button>

      </form>

    </div>

  `;

}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  const loginForm =
    document.getElementById("login-form");

  const registerForm =
    document.getElementById("register-form");

  const switchButton =
    document.getElementById(
      "auth-switch-button"
    );

  const logoutButton =
    document.getElementById("logout-button");

  const searchInput =
    document.getElementById("user-search");

  const backButton =
    document.getElementById("back-button");

  loginForm.addEventListener(
    "submit",
    handleLogin
  );

  registerForm.addEventListener(
    "submit",
    handleRegister
  );

  switchButton.addEventListener(
    "click",
    toggleAuthMode
  );

  logoutButton.addEventListener(
    "click",
    handleLogout
  );

  searchInput.addEventListener(
    "input",
    handleSearch
  );

  backButton.addEventListener(
    "click",
    () => {

      document.body.classList.remove(
        "chat-open"
      );

    }
  );


  document
    .getElementById("composer-form")
    .addEventListener(
      "submit",
      handleSendMessage
    );


  /*
     Auto-grow message box.
  */

  const messageInput =
    document.getElementById(
      "message-input"
    );

  messageInput.addEventListener(
    "input",
    () => {

      messageInput.style.height = "auto";

      messageInput.style.height =
        Math.min(
          messageInput.scrollHeight,
          140
        ) + "px";

    }
  );


  /*
     Enter = send
     Shift + Enter = new line
  */

  messageInput.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        document
          .getElementById(
            "composer-form"
          )
          .requestSubmit();

      }

    }
  );

}


/* =========================================================
   FIREBASE AUTH STATE
========================================================= */

function setupAuth() {

  onAuthStateChanged(
    auth,
    async user => {

      state.user = user;

      if (user) {

        await signedIn(user);

      } else {

        signedOut();

      }

    }
  );

}


/* =========================================================
   SIGNED IN
========================================================= */

async function signedIn(user) {

  console.log(
    "MissApp user signed in:",
    user.uid
  );

  auth.classList.add("hidden");
  app.classList.remove("hidden");

  startConversations();

}


/* =========================================================
   SIGNED OUT
========================================================= */

function signedOut() {

  stopConversations();

  state.user = null;
  state.currentConversation = null;
  state.conversations = [];

  app.classList.add("hidden");
  auth.classList.remove("hidden");

}


/* =========================================================
   LOGIN
========================================================= */

async function handleLogin(event) {

  event.preventDefault();

  const form = event.currentTarget;

  const email =
    form.elements.email.value.trim();

  const password =
    form.elements.password.value;

  try {

    await login(
      email,
      password
    );

    form.reset();

    showToast(
      "Welcome back!",
      "success"
    );

  } catch (error) {

    console.error(error);

    showToast(
      authError(error),
      "error"
    );

  }

}


/* =========================================================
   REGISTER
========================================================= */

async function handleRegister(event) {

  event.preventDefault();

  const form = event.currentTarget;

  const email =
    form.elements.email.value.trim();

  const password =
    form.elements.password.value;

  if (password.length < 6) {

    showToast(
      "Password must be at least 6 characters.",
      "error"
    );

    return;

  }

  try {

    await register(
      email,
      password
    );

    form.reset();

    showToast(
      "Account created!",
      "success"
    );

  } catch (error) {

    console.error(error);

    showToast(
      authError(error),
      "error"
    );

  }

}


/* =========================================================
   AUTH MODE
========================================================= */

let registerMode = false;

function toggleAuthMode() {

  registerMode = !registerMode;

  const loginForm =
    document.getElementById(
      "login-form"
    );

  const registerForm =
    document.getElementById(
      "register-form"
    );

  const switchText =
    document.getElementById(
      "auth-switch-text"
    );

  const switchButton =
    document.getElementById(
      "auth-switch-button"
    );

  if (registerMode) {

    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");

    switchText.textContent =
      "Already have an account?";

    switchButton.textContent =
      "Login";

  } else {

    registerForm.classList.add("hidden");
    loginForm.classList.remove("hidden");

    switchText.textContent =
      "Don't have an account?";

    switchButton.textContent =
      "Register";

  }

}


/* =========================================================
   LOGOUT
========================================================= */

async function handleLogout() {

  try {

    await signOut(auth);

    showToast(
      "Logged out successfully.",
      "success"
    );

  } catch (error) {

    console.error(error);

    showToast(
      "Unable to log out.",
      "error"
    );

  }

}


/* =========================================================
   CONVERSATIONS
========================================================= */

function startConversations() {

  stopConversations();

  try {

    state.unsubscribeConversations =
      listenConversations(
        renderConversations
      );

  } catch (error) {

    console.error(error);

    showToast(
      "Unable to load conversations.",
      "error"
    );

  }

}


function stopConversations() {

  if (
    typeof state.unsubscribeConversations ===
    "function"
  ) {

    state.unsubscribeConversations();

  }

  state.unsubscribeConversations = null;

}


/* =========================================================
   RENDER CONVERSATIONS
========================================================= */

function renderConversations(snapshot) {

  const list =
    document.getElementById(
      "conversation-list"
    );

  if (!list) return;

  /*
     Support both Firestore snapshots
     and arrays.
  */

  const docs =
    Array.isArray(snapshot)
      ? snapshot
      : snapshot?.docs || [];

  state.conversations = docs;

  list.innerHTML = "";

  if (!docs.length) {

    list.innerHTML = `
      <div class="chat-empty">
        <div>
          <div class="chat-empty-title">
            No conversations
          </div>

          <div>
            Search for a user above.
          </div>
        </div>
      </div>
    `;

    return;

  }


  docs.forEach(doc => {

    const data =
      typeof doc.data === "function"
        ? doc.data()
        : doc;

    const id =
      doc.id ||
      data.id ||
      data.key;

    const button =
      document.createElement("button");

    button.type = "button";
    button.className = "conversation";

    const name =
      data.name ||
      data.username ||
      data.otherUsername ||
      data.title ||
      "Conversation";

    const preview =
      data.lastMessage ||
      data.preview ||
      "No messages yet";

    button.innerHTML = `

      <div class="conversation-avatar">
        ${escapeHTML(
          name.charAt(0).toUpperCase()
        )}
      </div>

      <div class="conversation-content">

        <div class="conversation-name">
          ${escapeHTML(name)}
        </div>

        <div class="conversation-preview">
          ${escapeHTML(preview)}
        </div>

      </div>

    `;

    button.addEventListener(
      "click",
      () => {

        openConversation(
          id,
          data
        );

      }
    );

    list.appendChild(button);

  });

}


/* =========================================================
   OPEN CONVERSATION
========================================================= */

function openConversation(id, data) {

  state.currentConversation = {
    id,
    ...data
  };

  const name =
    data.name ||
    data.username ||
    data.otherUsername ||
    data.title ||
    "Conversation";

  const avatar =
    document.getElementById(
      "chat-avatar"
    );

  const chatName =
    document.getElementById(
      "chat-name"
    );

  const chatStatus =
    document.getElementById(
      "chat-status"
    );

  avatar.textContent =
    name.charAt(0).toUpperCase();

  chatName.textContent =
    name;

  chatStatus.textContent =
    "Conversation";

  document.body.classList.add(
    "chat-open"
  );

  /*
     Tell the message system that
     a conversation was opened.
  */

  window.dispatchEvent(
    new CustomEvent(
      "missapp:conversation-open",
      {
        detail: state.currentConversation
      }
    )
  );

}


/* =========================================================
   SEARCH
========================================================= */

let searchTimeout = null;

function handleSearch(event) {

  const term =
    event.target.value.trim();

  clearTimeout(searchTimeout);

  if (!term) {

    clearSearch();

    return;

  }

  searchTimeout =
    setTimeout(
      () => performSearch(term),
      300
    );

}


async function performSearch(term) {

  const results =
    document.getElementById(
      "search-results"
    );

  if (!results) return;

  results.innerHTML = `
    <div class="search-loading">
      Searching...
    </div>
  `;

  try {

    const users =
      await searchUsers(term);

    results.innerHTML = "";

    if (!users.length) {

      results.innerHTML = `
        <div class="search-loading">
          No users found.
        </div>
      `;

      return;

    }

    users.forEach(user => {

      const item =
        document.createElement("button");

      item.type = "button";
      item.className = "conversation";

      const name =
        user.username ||
        user.name ||
        user.key ||
        "User";

      item.innerHTML = `

        <div class="conversation-avatar">
          ${escapeHTML(
            name.charAt(0).toUpperCase()
          )}
        </div>

        <div class="conversation-content">

          <div class="conversation-name">
            ${escapeHTML(name)}
          </div>

          <div class="conversation-preview">
            Start conversation
          </div>

        </div>

      `;

      item.addEventListener(
        "click",
        () => {

          clearSearch();

          document.getElementById(
            "user-search"
          ).value = "";

          window.dispatchEvent(
            new CustomEvent(
              "missapp:user-selected",
              {
                detail: user
              }
            )
          );

        }
      );

      results.appendChild(item);

    });

  } catch (error) {

    console.error(error);

    results.innerHTML = `
      <div class="search-loading">
        Search failed.
      </div>
    `;

  }

}


function clearSearch() {

  const results =
    document.getElementById(
      "search-results"
    );

  if (results) {
    results.innerHTML = "";
  }

}


/* =========================================================
   SEND MESSAGE
========================================================= */

function handleSendMessage(event) {

  event.preventDefault();

  const input =
    document.getElementById(
      "message-input"
    );

  const text =
    input.value.trim();

  if (!text) return;

  if (!state.currentConversation) {

    showToast(
      "Select a conversation first.",
      "error"
    );

    return;

  }

  /*
     The actual Firestore message
     implementation belongs in messages.js.
  */

  window.dispatchEvent(
    new CustomEvent(
      "missapp:send-message",
      {
        detail: {
          conversation:
            state.currentConversation,

          text
        }
      }
    )
  );

  input.value = "";
  input.style.height = "auto";

}


/* =========================================================
   TOAST
========================================================= */

function showToast(
  message,
  type = "info"
) {

  if (!toastContainer) return;

  const toast =
    document.createElement("div");

  toast.className =
    `toast ${type}`;

  toast.textContent =
    message;

  toastContainer.appendChild(
    toast
  );

  setTimeout(() => {

    toast.remove();

  }, 3500);

}


/* =========================================================
   FIREBASE ERROR HANDLER
========================================================= */

function authError(error) {

  switch (error?.code) {

    case "auth/invalid-email":
      return "Invalid email address.";

    case "auth/user-not-found":
      return "Account not found.";

    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";

    case "auth/email-already-in-use":
      return "This email is already registered.";

    case "auth/weak-password":
      return "Password is too weak.";

    case "auth/too-many-requests":
      return "Too many attempts. Try again later.";

    case "auth/network-request-failed":
      return "Network error. Check your connection.";

    default:
      return (
        error?.message ||
        "Something went wrong."
      );

  }

}


/* =========================================================
   SECURITY
========================================================= */

function escapeHTML(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =========================================================
   PUBLIC API
========================================================= */

window.MissApp = {

  state,

  login: handleLogin,

  register: handleRegister,

  logout: handleLogout,

  search: performSearch,

  openConversation,

  showToast

};
