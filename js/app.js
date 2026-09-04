/* =========================================================
   MissApp
   js/app.js

   App bootstrap
   Authentication UI
   Display-name profile system
   User search
   Conversation UI
========================================================= */

import { auth, db } from "./firebase.js";

import { login } from "./auth/login.js";
import { register } from "./auth/register.js";

import { listenConversations } from "./chat/conversations.js";
import { searchUsers } from "./chat/search.js";

import {
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


/* =========================================================
   STATE
========================================================= */

const state = {
  me: null,
  profile: null,
  currentConversation: null,
  unsubscribeConversations: null
};

window.MissApp = state;


/* =========================================================
   START
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

  const container = document.getElementById("auth");

  if (!container) return;

  container.innerHTML = `

    <div class="auth-card">

      <div class="auth-logo">
        <div class="auth-logo-mark">M</div>

        <div>
          <div class="auth-title">
            MissApp
          </div>

          <div class="auth-subtitle">
            Private real-time messaging
          </div>
        </div>
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
            placeholder="Your password"
            autocomplete="current-password"
            required
          >
        </div>


        <button
          class="btn auth-submit"
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
            Display name
          </label>

          <input
            class="input"
            type="text"
            name="displayName"
            placeholder="Your name"
            autocomplete="name"
            maxlength="40"
            required
          >

        </div>


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
          class="btn auth-submit"
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

  const sidebar = document.getElementById("sidebar");
  const chat = document.getElementById("chat");

  if (!sidebar || !chat) return;


  sidebar.innerHTML = `

    <div class="sidebar-header">

      <div class="sidebar-top">

        <div class="brand">
          <div class="brand-mark">M</div>

          <div>
            <div class="sidebar-title">
              MissApp
            </div>

            <div class="sidebar-subtitle">
              Messages
            </div>
          </div>
        </div>

        <button
          id="logout-button"
          class="icon-button"
          type="button"
          title="Logout"
        >
          ⎋
        </button>

      </div>


      <div class="search-container">

        <span class="search-icon">
          ⌕
        </span>

        <input
          id="user-search"
          class="input search-input"
          type="search"
          placeholder="Search people..."
          autocomplete="off"
        >

        <div
          id="search-results"
          class="search-results"
        ></div>

      </div>

    </div>


    <div class="profile-mini" id="profile-mini">

      <div
        class="profile-avatar"
        id="profile-avatar"
      >
        ?
      </div>

      <div class="profile-info">

        <div
          class="profile-name"
          id="profile-name"
        >
          Loading...
        </div>

        <div
          class="profile-email"
          id="profile-email"
        >
          ...
        </div>

      </div>

    </div>


    <div class="conversation-heading">
      Conversations
    </div>


    <div id="conversation-list">

      <div class="chat-empty sidebar-empty">

        <div>
          No conversations yet.
        </div>

      </div>

    </div>

  `;


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


    <div id="messages">

      <div class="chat-empty">

        <div>

          <div class="chat-empty-icon">
            M
          </div>

          <div class="chat-empty-title">
            Welcome to MissApp
          </div>

          <div>
            Search for someone to start messaging.
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
          disabled
        ></textarea>

        <button
          id="send-button"
          class="composer-send"
          type="submit"
          disabled
          title="Send message"
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

  document
    .getElementById("login-form")
    ?.addEventListener("submit", handleLogin);


  document
    .getElementById("register-form")
    ?.addEventListener("submit", handleRegister);


  document
    .getElementById("auth-switch-button")
    ?.addEventListener("click", toggleAuth);


  document
    .getElementById("logout-button")
    ?.addEventListener("click", handleLogout);


  document
    .getElementById("user-search")
    ?.addEventListener("input", handleSearch);


  document
    .getElementById("back-button")
    ?.addEventListener("click", () => {

      document.body.classList.remove("chat-open");

    });


  const composer =
    document.getElementById("composer-form");

  const input =
    document.getElementById("message-input");


  composer?.addEventListener(
    "submit",
    event => {

      event.preventDefault();

      const text = input.value.trim();

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

      input.value = "";
      input.style.height = "auto";

    }
  );


  input?.addEventListener("input", () => {

    input.style.height = "auto";

    input.style.height =
      Math.min(
        input.scrollHeight,
        140
      ) + "px";

  });


  input?.addEventListener("keydown", event => {

    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {

      event.preventDefault();

      composer.requestSubmit();

    }

  });

}


/* =========================================================
   AUTH STATE
========================================================= */

function setupAuth() {

  onAuthStateChanged(auth, async user => {

    if (!user) {

      state.me = null;
      state.profile = null;

      cleanup();

      showAuth();

      return;
    }


    try {

      const profile =
        await ensureUserProfile(user);

      state.me = {
        uid: user.uid,
        email: user.email || "",
        displayName:
          profile.displayName,
        key:
          profile.key
      };

      state.profile = profile;

      showApp();

      renderMyProfile();

      state.unsubscribeConversations =
        listenConversations(
          renderConversations
        );

    } catch (error) {

      console.error(
        "Startup error:",
        error
      );

      showToast(
        "Could not load your profile.",
        "error"
      );

    }

  });

}


/* =========================================================
   USER PROFILE
========================================================= */

async function ensureUserProfile(user) {

  const userRef =
    doc(db, "users", user.uid);

  const snapshot =
    await getDoc(userRef);


  if (snapshot.exists()) {

    const data =
      snapshot.data();

    const displayName =
      data.displayName ||
      user.displayName ||
      user.email?.split("@")[0] ||
      "User";

    const key =
      normalizeKey(displayName);


    if (
      data.displayName !== displayName ||
      data.key !== key
    ) {

      await setDoc(
        userRef,
        {
          displayName,
          key,
          email: user.email || "",
          uid: user.uid,
          updatedAt: serverTimestamp()
        },
        {
          merge: true
        }
      );

    }


    return {
      ...data,
      displayName,
      key
    };
  }


  const displayName =
    user.displayName ||
    user.email?.split("@")[0] ||
    "User";

  const key =
    normalizeKey(displayName);


  const profile = {

    uid: user.uid,

    email:
      user.email || "",

    displayName,

    key,

    createdAt:
      serverTimestamp(),

    updatedAt:
      serverTimestamp()

  };


  await setDoc(
    userRef,
    profile
  );


  return {
    ...profile,
    displayName,
    key
  };
}


/* =========================================================
   MY PROFILE UI
========================================================= */

function renderMyProfile() {

  const name =
    document.getElementById("profile-name");

  const email =
    document.getElementById("profile-email");

  const avatar =
    document.getElementById("profile-avatar");


  const displayName =
    state.profile?.displayName ||
    "User";


  if (name) {
    name.textContent =
      displayName;
  }


  if (email) {
    email.textContent =
      state.profile?.email || "";
  }


  if (avatar) {
    avatar.textContent =
      getInitial(displayName);
  }

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

  const displayName =
    form.elements.displayName.value.trim();

  const email =
    form.elements.email.value.trim();

  const password =
    form.elements.password.value;


  if (displayName.length < 2) {

    showToast(
      "Display name must be at least 2 characters.",
      "error"
    );

    return;
  }


  if (password.length < 6) {

    showToast(
      "Password must be at least 6 characters.",
      "error"
    );

    return;
  }


  try {

    const credential =
      await register(
        email,
        password
      );


    await updateProfile(
      credential.user,
      {
        displayName
      }
    );


    await setDoc(
      doc(
        db,
        "users",
        credential.user.uid
      ),
      {
        uid:
          credential.user.uid,

        email:
          credential.user.email || "",

        displayName,

        key:
          normalizeKey(displayName),

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp()

      },
      {
        merge: true
      }
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
   AUTH SWITCH
========================================================= */

function toggleAuth() {

  const loginForm =
    document.getElementById("login-form");

  const registerForm =
    document.getElementById("register-form");

  const text =
    document.getElementById(
      "auth-switch-text"
    );

  const button =
    document.getElementById(
      "auth-switch-button"
    );


  const registerVisible =
    !registerForm?.classList.contains("hidden");


  if (registerVisible) {

    registerForm.classList.add("hidden");

    loginForm?.classList.remove("hidden");

    text.textContent =
      "Don't have an account?";

    button.textContent =
      "Register";

  } else {

    loginForm?.classList.add("hidden");

    registerForm?.classList.remove("hidden");

    text.textContent =
      "Already have an account?";

    button.textContent =
      "Login";

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


  if (!results) return;


  if (!term) {

    results.innerHTML = "";

    return;

  }


  searchTimer =
    setTimeout(
      async () => {

        try {

          const users =
            await searchUsers(
              normalizeKey(term)
            );


          const filtered =
            users.filter(
              user =>
                user.uid !==
                state.me?.uid
            );


          if (!filtered.length) {

            results.innerHTML = `
              <div class="search-empty">
                No people found.
              </div>
            `;

            return;
          }


          results.innerHTML =
            filtered.map(user => `

              <button
                class="search-result"
                type="button"
                data-user-id="${escapeHTML(user.uid)}"
              >

                <div class="conversation-avatar">
                  ${escapeHTML(
                    getInitial(
                      user.displayName ||
                      user.email
                    )
                  )}
                </div>

                <div class="search-result-info">

                  <div class="search-result-name">
                    ${escapeHTML(
                      user.displayName ||
                      "User"
                    )}
                  </div>

                  <small>
                    ${escapeHTML(
                      user.email || ""
                    )}
                  </small>

                </div>

              </button>

            `).join("");


          results
            .querySelectorAll(
              ".search-result"
            )
            .forEach(button => {

              button.addEventListener(
                "click",
                () => {

                  const userId =
                    button.dataset.userId;

                  window.dispatchEvent(
                    new CustomEvent(
                      "missapp:start-conversation",
                      {
                        detail: {
                          userId
                        }
                      }
                    )
                  );

                  results.innerHTML = "";

                  const input =
                    document.getElementById(
                      "user-search"
                    );

                  if (input) {
                    input.value = "";
                  }

                }
              );

            });

        } catch (error) {

          console.error(
            "Search error:",
            error
          );

          results.innerHTML = `
            <div class="search-empty">
              Search failed.
            </div>
          `;

        }

      },
      250
    );

}


/* =========================================================
   CONVERSATION UI
========================================================= */

function renderConversations(docs) {

  const list =
    document.getElementById(
      "conversation-list"
    );

  if (!list) return;


  if (!docs.length) {

    list.innerHTML = `
      <div class="chat-empty sidebar-empty">
        No conversations yet.
      </div>
    `;

    return;
  }


  list.innerHTML =
    docs.map(item => {

      const data =
        item.data();

      const other =
        data.otherUser || {};

      return `

        <button
          class="conversation-item"
          type="button"
          data-id="${escapeHTML(item.id)}"
        >

          <div class="conversation-avatar">
            ${escapeHTML(
              getInitial(
                other.displayName ||
                other.email
              )
            )}
          </div>

          <div class="conversation-info">

            <div class="conversation-name">
              ${escapeHTML(
                other.displayName ||
                other.email ||
                "User"
              )}
            </div>

            <div class="conversation-preview">
              ${escapeHTML(
                data.lastMessage ||
                "No messages yet"
              )}
            </div>

          </div>

        </button>

      `;

    }).join("");


  list
    .querySelectorAll(
      ".conversation-item"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          document.body.classList.add(
            "chat-open"
          );

          /*
             Your conversation/message
             module can attach the real
             conversation here.
          */

        }
      );

    });

}


/* =========================================================
   SHOW STATES
========================================================= */

function showAuth() {

  document
    .getElementById("auth")
    ?.classList.remove("hidden");

  document
    .getElementById("app")
    ?.classList.add("hidden");

}


function showApp() {

  document
    .getElementById("auth")
    ?.classList.add("hidden");

  document
    .getElementById("app")
    ?.classList.remove("hidden");

}


/* =========================================================
   CLEANUP
========================================================= */

function cleanup() {

  state.unsubscribeConversations?.();

  state.unsubscribeConversations = null;

  state.currentConversation = null;

}


/* =========================================================
   HELPERS
========================================================= */

function normalizeKey(value) {

  return String(value || "")
    .trim()
    .toLowerCase();

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

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =========================================================
   AUTH ERRORS
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
   GLOBAL API
========================================================= */

window.MissApp.showToast =
  showToast;

window.MissApp.toggleAuth =
  toggleAuth;

window.MissApp.logout =
  handleLogout;


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

  container.appendChild(toast);


  setTimeout(() => {
    toast.remove();
  }, 3500);

}
