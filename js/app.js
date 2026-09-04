```js
/* =========================================================
   MissApp
   js/app.js

   Main application entry point.
========================================================= */

import { auth } from "./firebase.js";

import { login } from "./auth/login.js";
import { register } from "./auth/register.js";

import { listenConversations } from "./chat/conversations.js";
import { searchUsers } from "./chat/search.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";


/* =========================================================
   APP STATE
========================================================= */

const state = {
  user: null,
  currentConversation: null,
  conversations: [],
  unsubscribeConversations: null
};

window.MissApp = {
  state
};


/* =========================================================
   DOM
========================================================= */

const $ = selector => document.querySelector(selector);

const authView = $("#auth");
const appView = $("#app");

const loginForm = $("#login-form");
const registerForm = $("#register-form");

const logoutButton = $("#logout-button");

const conversationList = $("#conversation-list");
const searchInput = $("#user-search");
const searchResults = $("#search-results");


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  initializeUI();
  initializeAuth();
});


/* =========================================================
   AUTH STATE
========================================================= */

function initializeAuth() {

  onAuthStateChanged(auth, async user => {

    state.user = user;

    if (user) {
      await handleSignedIn(user);
    } else {
      handleSignedOut();
    }

  });

}


/* =========================================================
   SIGNED IN
========================================================= */

async function handleSignedIn(user) {

  console.log("MissApp: signed in", user.uid);

  showApp();

  startConversationListener();

}


/* =========================================================
   SIGNED OUT
========================================================= */

function handleSignedOut() {

  console.log("MissApp: signed out");

  state.user = null;
  state.currentConversation = null;
  state.conversations = [];

  stopConversationListener();

  showAuth();

}


/* =========================================================
   AUTH UI
========================================================= */

function showAuth() {

  if (authView) {
    authView.classList.remove("hidden");
  }

  if (appView) {
    appView.classList.add("hidden");
  }

}


function showApp() {

  if (authView) {
    authView.classList.add("hidden");
  }

  if (appView) {
    appView.classList.remove("hidden");
  }

}


/* =========================================================
   LOGIN
========================================================= */

async function handleLogin(event) {

  event.preventDefault();

  const email =
    loginForm?.querySelector('[name="email"]')?.value.trim();

  const password =
    loginForm?.querySelector('[name="password"]')?.value;

  if (!email || !password) {
    showToast("Please enter your email and password.", "error");
    return;
  }

  try {

    await login(email, password);

    showToast("Logged in successfully.", "success");

    loginForm.reset();

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

  const email =
    registerForm?.querySelector('[name="email"]')?.value.trim();

  const password =
    registerForm?.querySelector('[name="password"]')?.value;

  if (!email || !password) {
    showToast("Please complete all fields.", "error");
    return;
  }

  if (password.length < 6) {
    showToast(
      "Password must contain at least 6 characters.",
      "error"
    );
    return;
  }

  try {

    await register(email, password);

    showToast(
      "Account created successfully.",
      "success"
    );

    registerForm.reset();

  } catch (error) {

    console.error(error);

    showToast(
      getAuthError(error),
      "error"
    );

  }

}


/* =========================================================
   LOGOUT
========================================================= */

async function handleLogout() {

  try {

    await signOut(auth);

    showToast(
      "You have been logged out.",
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

function startConversationListener() {

  stopConversationListener();

  if (!state.user) return;

  try {

    state.unsubscribeConversations =
      listenConversations(renderConversations);

  } catch (error) {

    console.error(
      "Conversation listener failed:",
      error
    );

    showToast(
      "Unable to load conversations.",
      "error"
    );

  }

}


function stopConversationListener() {

  if (
    typeof state.unsubscribeConversations === "function"
  ) {

    state.unsubscribeConversations();

  }

  state.unsubscribeConversations = null;

}


/* =========================================================
   RENDER CONVERSATIONS
========================================================= */

function renderConversations(docs) {

  if (!conversationList) return;

  state.conversations = docs;

  conversationList.innerHTML = "";

  if (!docs.length) {

    conversationList.innerHTML = `
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
    `;

    return;
  }


  docs.forEach(doc => {

    const data =
      typeof doc.data === "function"
        ? doc.data()
        : doc;

    const id =
      typeof doc.id !== "undefined"
        ? doc.id
        : data.id;

    const element =
      createConversationElement(id, data);

    conversationList.appendChild(element);

  });

}


/* =========================================================
   CONVERSATION ELEMENT
========================================================= */

function createConversationElement(id, data) {

  const button =
    document.createElement("button");

  button.type = "button";
  button.className = "conversation";

  if (
    state.currentConversation &&
    state.currentConversation.id === id
  ) {

    button.classList.add("active");

  }

  const name =
    data.name ||
    data.username ||
    data.title ||
    "Conversation";

  const preview =
    data.lastMessage ||
    data.preview ||
    "No messages yet";

  const avatar =
    String(name).charAt(0).toUpperCase();

  button.innerHTML = `
    <div class="conversation-avatar">
      ${escapeHTML(avatar)}
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

  button.addEventListener("click", () => {

    openConversation(id, data);

  });

  return button;

}


/* =========================================================
   OPEN CONVERSATION
========================================================= */

function openConversation(id, data) {

  state.currentConversation = {
    id,
    ...data
  };

  document.body.classList.add("chat-open");

  document
    .querySelectorAll(".conversation.active")
    .forEach(element => {
      element.classList.remove("active");
    });

  const conversations =
    document.querySelectorAll(".conversation");

  conversations.forEach(element => {

    /*
      The active state can be handled by the
      conversation rendering system if needed.
    */

  });

  console.log(
    "Opening conversation:",
    state.currentConversation
  );

  window.dispatchEvent(
    new CustomEvent("missapp:conversation-open", {
      detail: state.currentConversation
    })
  );

}


/* =========================================================
   USER SEARCH
========================================================= */

let searchTimer = null;

function initializeSearch() {

  if (!searchInput) return;

  searchInput.addEventListener(
    "input",
    () => {

      clearTimeout(searchTimer);

      const value =
        searchInput.value.trim();

      if (!value) {

        clearSearchResults();
        return;

      }

      searchTimer =
        setTimeout(
          () => performUserSearch(value),
          250
        );

    }
  );

}


/* =========================================================
   SEARCH USERS
========================================================= */

async function performUserSearch(term) {

  if (!searchResults) return;

  searchResults.innerHTML = `
    <div class="search-loading">
      Searching...
    </div>
  `;

  try {

    const users =
      await searchUsers(term);

    renderSearchResults(users);

  } catch (error) {

    console.error(
      "Search failed:",
      error
    );

    searchResults.innerHTML = `
      <div class="search-loading">
        Search failed.
      </div>
    `;

  }

}


/* =========================================================
   RENDER SEARCH RESULTS
========================================================= */

function renderSearchResults(users) {

  if (!searchResults) return;

  searchResults.innerHTML = "";

  if (!users.length) {

    searchResults.innerHTML = `
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
          String(name).charAt(0).toUpperCase()
        )}
      </div>

      <div class="conversation-content">

        <div class="conversation-name">
          ${escapeHTML(name)}
        </div>

        <div class="conversation-preview">
          Start a conversation
        </div>

      </div>
    `;

    item.addEventListener("click", () => {

      window.dispatchEvent(
        new CustomEvent(
          "missapp:user-selected",
          {
            detail: user
          }
        )
      );

      clearSearchResults();

      if (searchInput) {
        searchInput.value = "";
      }

    });

    searchResults.appendChild(item);

  });

}


/* =========================================================
   CLEAR SEARCH
========================================================= */

function clearSearchResults() {

  if (searchResults) {
    searchResults.innerHTML = "";
  }

}


/* =========================================================
   UI INITIALIZATION
========================================================= */

function initializeUI() {

  if (loginForm) {
    loginForm.addEventListener(
      "submit",
      handleLogin
    );
  }

  if (registerForm) {
    registerForm.addEventListener(
      "submit",
      handleRegister
    );
  }

  if (logoutButton) {
    logoutButton.addEventListener(
      "click",
      handleLogout
    );
  }

  initializeSearch();

}


/* =========================================================
   TOAST
========================================================= */

function showToast(message, type = "info") {

  const container =
    document.getElementById(
      "toast-container"
    );

  if (!container) return;

  const toast =
    document.createElement("div");

  toast.className =
    `toast ${type}`;

  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {

    toast.remove();

  }, 3500);

}


/* =========================================================
   FIREBASE ERROR MESSAGES
========================================================= */

function getAuthError(error) {

  switch (error?.code) {

    case "auth/invalid-email":
      return "Invalid email address.";

    case "auth/user-not-found":
      return "No account exists with this email.";

    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";

    case "auth/email-already-in-use":
      return "An account with this email already exists.";

    case "auth/weak-password":
      return "The password is too weak.";

    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";

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
   GLOBAL API
========================================================= */

window.MissApp.login = handleLogin;
window.MissApp.register = handleRegister;
window.MissApp.logout = handleLogout;
window.MissApp.openConversation = openConversation;
window.MissApp.searchUsers = performUserSearch;
window.MissApp.showToast = showToast;
```
