
/* =========================================================
   MissApp
   js/app.js
   UI-first application entry point
========================================================= */

import { auth } from "./firebase.js";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";


/* =========================================================
   STATE
========================================================= */

const state = {
  user: null,
  registerMode: false,
  currentConversation: null
};

window.MissApp = state;


/* =========================================================
   START APP
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

  createAuthUI();
  createAppUI();

  setupEvents();
  setupAuth();

});


/* =========================================================
   AUTH UI
========================================================= */

function createAuthUI() {

  const auth = document.getElementById("auth");

  if (!auth) {
    console.error("MissApp: #auth not found");
    return;
  }

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
            placeholder="Email"
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
            placeholder="Email"
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
   APP UI
========================================================= */

function createAppUI() {

  const sidebar =
    document.getElementById("sidebar");

  const chat =
    document.getElementById("chat");

  if (!sidebar || !chat) {
    console.error(
      "MissApp: #sidebar or #chat not found"
    );
    return;
  }


  /* =========================
     SIDEBAR
  ========================= */

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


    <div id="conversation-list">

      <div class="chat-empty">

        <div>

          <div class="chat-empty-title">
            No conversations
          </div>

          <div>
            Search for someone to start chatting.
          </div>

        </div>

      </div>

    </div>


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


  /* =========================
     CHAT
  ========================= */

  chat.innerHTML = `

    <header class="chat-header">

      <button
        id="back-button"
        class="chat-back"
        type="button"
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


    <!-- ONLY THIS AREA SCROLLS -->

    <div id="messages">

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


    <!-- MESSAGE INPUT -->

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
        ></textarea>


        <button
          class="composer-send"
          type="submit"
          id="send-button"
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
    document.getElementById(
      "logout-button"
    );

  const searchInput =
    document.getElementById(
      "user-search"
    );

  const backButton =
    document.getElementById(
      "back-button"
    );

  const composer =
    document.getElementById(
      "composer-form"
    );

  const messageInput =
    document.getElementById(
      "message-input"
    );


  /* LOGIN */

  loginForm?.addEventListener(
    "submit",
    handleLogin
  );


  /* REGISTER */

  registerForm?.addEventListener(
    "submit",
    handleRegister
  );


  /* SWITCH LOGIN / REGISTER */

  switchButton?.addEventListener(
    "click",
    toggleAuth
  );


  /* LOGOUT */

  logoutButton?.addEventListener(
    "click",
    handleLogout
  );


  /* BACK */

  backButton?.addEventListener(
    "click",
    () => {
      document.body.classList.remove(
        "chat-open"
      );
    }
  );


  /* MESSAGE */

  composer?.addEventListener(
    "submit",
    event => {

      event.preventDefault();

      const text =
        messageInput.value.trim();

      if (!text) return;

      if (!state.currentConversation) {

        showToast(
          "Select a conversation first.",
          "error"
        );

        return;

      }

      window.dispatchEvent(
        new CustomEvent(
          "missapp:send-message",
          {
            detail: {
              text,
              conversation:
                state.currentConversation
            }
          }
        )
      );

      messageInput.value = "";
      messageInput.style.height = "auto";

    }
  );


  /* TEXTAREA */

  messageInput?.addEventListener(
    "input",
    () => {

      messageInput.style.height =
        "auto";

      messageInput.style.height =
        Math.min(
          messageInput.scrollHeight,
          140
        ) + "px";

    }
  );


  /* ENTER TO SEND */

  messageInput?.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        composer.requestSubmit();

      }

    }
  );


  /* SEARCH */

  searchInput?.addEventListener(
    "input",
    handleSearch
  );

}


/* =========================================================
   FIREBASE AUTH
========================================================= */

function setupAuth() {

  onAuthStateChanged(
    auth,
    user => {

      state.user = user;

      if (user) {

        showApp();

      } else {

        showAuth();

      }

    }
  );

}


/* =========================================================
   SHOW AUTH
========================================================= */

function showAuth() {

  document
    .getElementById("auth")
    ?.classList.remove("hidden");

  document
    .getElementById("app")
    ?.classList.add("hidden");

}


/* =========================================================
   SHOW APP
========================================================= */

function showApp() {

  document
    .getElementById("auth")
    ?.classList.add("hidden");

  document
    .getElementById("app")
    ?.classList.remove("hidden");

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

    await signInWithEmailAndPassword(
      auth,
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
      getAuthError(error),
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

    await createUserWithEmailAndPassword(
      auth,
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
      getAuthError(error),
      "error"
    );

  }

}


/* =========================================================
   SWITCH AUTH
========================================================= */

function toggleAuth() {

  state.registerMode =
    !state.registerMode;

  const loginForm =
    document.getElementById(
      "login-form"
    );

  const registerForm =
    document.getElementById(
      "register-form"
    );

  const text =
    document.getElementById(
      "auth-switch-text"
    );

  const button =
    document.getElementById(
      "auth-switch-button"
    );


  if (state.registerMode) {

    loginForm.classList.add("hidden");

    registerForm.classList.remove(
      "hidden"
    );

    text.textContent =
      "Already have an account?";

    button.textContent =
      "Login";

  } else {

    registerForm.classList.add(
      "hidden"
    );

    loginForm.classList.remove(
      "hidden"
    );

    text.textContent =
      "Don't have an account?";

    button.textContent =
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
      "Logged out.",
      "success"
    );

  } catch (error) {

    console.error(error);

    showToast(
      "Logout failed.",
      "error"
    );

  }

}


/* =========================================================
   SEARCH
========================================================= */

let searchTimer = null;

function handleSearch(event) {

  const term =
    event.target.value.trim();

  clearTimeout(searchTimer);

  const results =
    document.getElementById(
      "search-results"
    );

  if (!term) {

    results.innerHTML = "";

    return;

  }

  /*
     UI placeholder for now.
     Firestore user search can be
     connected in js/chat/search.js.
  */

  searchTimer =
    setTimeout(() => {

      results.innerHTML = `
        <div class="search-loading">
          Searching for
          <strong>${escapeHTML(term)}</strong>...
        </div>
      `;

    }, 250);

}


/* =========================================================
   TOAST
========================================================= */

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
    document.createElement("div");

  toast.className =
    `toast ${type}`;

  toast.textContent =
    message;

  container.appendChild(
    toast
  );

  setTimeout(() => {

    toast.remove();

  }, 3500);

}


/* =========================================================
   FIREBASE ERRORS
========================================================= */

function getAuthError(error) {

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
      return "Too many login attempts.";

    case "auth/network-request-failed":
      return "Network error.";

    default:
      return error?.message ||
        "Authentication failed.";

  }

}


/* =========================================================
   HTML ESCAPING
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
   GLOBAL FUNCTIONS
========================================================= */

window.MissApp.showToast =
  showToast;

window.MissApp.toggleAuth =
  toggleAuth;

window.MissApp.logout =
  handleLogout;
  
