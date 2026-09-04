/* =========================================================
   MissApp
   js/app.js

   Main application entry point.

   Responsibilities:
   - Build application UI
   - Handle authentication state
   - Create/load current user profile
   - Connect auth modules
   - Connect search module
   - Connect conversation module
   - Connect chat/message module
========================================================= */


/* =========================================================
   FIREBASE
========================================================= */

import {
  auth,
  db
} from "./firebase.js";


import {
  onAuthStateChanged,
  signOut
} from
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";


import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


/* =========================================================
   AUTH MODULES
========================================================= */

import {
  login
} from "./auth/login.js";


import {
  register
} from "./auth/register.js";


/* =========================================================
   STATE
========================================================= */

import {
  state
} from "./state.js";


/* =========================================================
   CHAT MODULES
========================================================= */

import {
  searchUsers
} from "./chat/search.js";


import {
  listenConversations,
  getOrCreateConversation
} from "./chat/conversations.js";


import {
  openChat,
  sendMessage
} from "./chat/app.js";


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initialize
);


function initialize() {

  console.log(
    "MissApp: initializing..."
  );


  createAuthUI();

  createAppUI();

  setupAuthEvents();

  setupChatEvents();

  setupAuthState();


  console.log(
    "MissApp: initialized."
  );
}


/* =========================================================
   AUTH UI
========================================================= */

function createAuthUI() {

  const container =
    document.getElementById(
      "auth"
    );


  if (!container) {

    console.error(
      "MissApp: #auth not found."
    );

    return;
  }


  container.innerHTML = `

    <div class="auth-card">

      <div class="auth-title">
        MissApp
      </div>

      <div class="auth-subtitle">
        Secure real-time messaging
      </div>


      <!-- LOGIN -->

      <form
        id="login-form"
        class="auth-form"
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


      <!-- SWITCH -->

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
    document.getElementById(
      "sidebar"
    );


  const chat =
    document.getElementById(
      "chat"
    );


  if (!sidebar || !chat) {

    console.error(
      "MissApp: #sidebar or #chat not found."
    );

    return;
  }


  /* =======================================================
     SIDEBAR
  ======================================================= */

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


  /* =======================================================
     CHAT
  ======================================================= */

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


    <!-- MESSAGE AREA -->

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


    <!-- COMPOSER -->

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
        >
          ➤
        </button>

      </form>

    </div>

  `;
}


/* =========================================================
   AUTH EVENTS
========================================================= */

function setupAuthEvents() {

  const loginForm =
    document.getElementById(
      "login-form"
    );


  const registerForm =
    document.getElementById(
      "register-form"
    );


  const switchButton =
    document.getElementById(
      "auth-switch-button"
    );


  const logoutButton =
    document.getElementById(
      "logout-button"
    );


  loginForm?.addEventListener(
    "submit",
    handleLogin
  );


  registerForm?.addEventListener(
    "submit",
    handleRegister
  );


  switchButton?.addEventListener(
    "click",
    toggleAuth
  );


  logoutButton?.addEventListener(
    "click",
    handleLogout
  );
}


/* =========================================================
   CHAT EVENTS
========================================================= */

function setupChatEvents() {

  const searchInput =
    document.getElementById(
      "user-search"
    );


  const composer =
    document.getElementById(
      "composer-form"
    );


  const messageInput =
    document.getElementById(
      "message-input"
    );


  const backButton =
    document.getElementById(
      "back-button"
    );


  /* =======================================================
     SEARCH
  ======================================================= */

  searchInput?.addEventListener(
    "input",
    handleSearch
  );


  /* =======================================================
     COMPOSER
  ======================================================= */

  composer?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      if (!messageInput) {
        return;
      }


      const text =
        messageInput.value.trim();


      if (!text) {
        return;
      }


      if (!state.currentConversation) {

        showToast(
          "Select a conversation first.",
          "error"
        );

        return;
      }


      const sendButton =
        document.getElementById(
          "send-button"
        );


      if (sendButton) {
        sendButton.disabled = true;
      }


      try {

        await sendMessage(text);

        messageInput.value = "";

        messageInput.style.height =
          "auto";

      } finally {

        if (sendButton) {
          sendButton.disabled = false;
        }
      }
    }
  );


  /* =======================================================
     TEXTAREA RESIZE
  ======================================================= */

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


  /* =======================================================
     ENTER TO SEND
  ======================================================= */

  messageInput?.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        composer?.requestSubmit();
      }
    }
  );


  /* =======================================================
     BACK
  ======================================================= */

  backButton?.addEventListener(
    "click",
    () => {

      document.body.classList.remove(
        "chat-open"
      );

      state.currentConversation =
        null;


      const input =
        document.getElementById(
          "message-input"
        );


      const send =
        document.getElementById(
          "send-button"
        );


      input?.setAttribute(
        "disabled",
        ""
      );


      send?.setAttribute(
        "disabled",
        ""
      );
    }
  );
}


/* =========================================================
   FIREBASE AUTH STATE
========================================================= */

function setupAuthState() {

  onAuthStateChanged(
    auth,
    async user => {

      state.user =
        user || null;


      if (!user) {

        cleanup();

        showAuth();

        return;
      }


      try {

        state.me =
          await loadCurrentUser(
            user
          );


        showApp();


        listenConversations(
          renderConversations
        );


      } catch (error) {

        console.error(
          "MissApp startup error:",
          error
        );


        showToast(
          "Could not start the app.",
          "error"
        );
      }
    }
  );
}


/* =========================================================
   LOAD CURRENT USER
========================================================= */

async function loadCurrentUser(
  user
) {

  const userRef =
    doc(
      db,
      "users",
      user.uid
    );


  const snapshot =
    await getDoc(
      userRef
    );


  if (snapshot.exists()) {

    const data =
      snapshot.data();


    /*
      Make sure older accounts also
      receive a usable search key.
    */

    const displayName =
      data.displayName ||
      user.displayName ||
      user.email?.split("@")[0] ||
      "User";


    const key =
      data.key ||
      createUserKey(
        displayName,
        user.email
      );


    if (
      !data.key ||
      !data.displayName
    ) {

      await setDoc(
        userRef,
        {
          uid: user.uid,

          email:
            user.email || "",

          displayName,

          key,

          updatedAt:
            serverTimestamp()
        },
        {
          merge: true
        }
      );
    }


    return {
      uid: user.uid,

      email:
        data.email ||
        user.email ||
        "",

      displayName,

      key
    };
  }


  /*
    New user
  */

  const displayName =
    user.displayName ||
    user.email?.split("@")[0] ||
    "User";


  const key =
    createUserKey(
      displayName,
      user.email
    );


  const profile = {

    uid: user.uid,

    email:
      user.email || "",

    displayName,

    key,

    createdAt:
      serverTimestamp()
  };


  await setDoc(
    userRef,
    profile
  );


  return {
    uid: user.uid,

    email:
      user.email || "",

    displayName,

    key
  };
}


/* =========================================================
   CREATE USER SEARCH KEY
========================================================= */

function createUserKey(
  displayName,
  email
) {

  const name =
    String(
      displayName || ""
    )
      .trim()
      .toLowerCase();


  const mail =
    String(
      email || ""
    )
      .trim()
      .toLowerCase();


  /*
    Search uses prefix matching.

    Prefer display name. If unavailable,
    fall back to email.
  */

  return (
    name ||
    mail ||
    "user"
  );
}


/* =========================================================
   SHOW AUTH
========================================================= */

function showAuth() {

  const authContainer =
    document.getElementById(
      "auth"
    );


  const app =
    document.getElementById(
      "app"
    );


  authContainer?.classList.remove(
    "hidden"
  );


  app?.classList.add(
    "hidden"
  );
}


/* =========================================================
   SHOW APP
========================================================= */

function showApp() {

  const authContainer =
    document.getElementById(
      "auth"
    );


  const app =
    document.getElementById(
      "app"
    );


  authContainer?.classList.add(
    "hidden"
  );


  app?.classList.remove(
    "hidden"
  );
}


/* =========================================================
   LOGIN
========================================================= */

async function handleLogin(
  event
) {

  event.preventDefault();


  const form =
    event.currentTarget;


  const email =
    form.elements.email.value
      .trim();


  const password =
    form.elements.password.value;


  if (!email || !password) {
    return;
  }


  const button =
    form.querySelector(
      "button[type='submit']"
    );


  if (button) {
    button.disabled = true;
  }


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

    console.error(
      "Login error:",
      error
    );


    showToast(
      getAuthError(error),
      "error"
    );


  } finally {

    if (button) {
      button.disabled = false;
    }
  }
}


/* =========================================================
   REGISTER
========================================================= */

async function handleRegister(
  event
) {

  event.preventDefault();


  const form =
    event.currentTarget;


  const email =
    form.elements.email.value
      .trim();


  const password =
    form.elements.password.value;


  if (password.length < 6) {

    showToast(
      "Password must be at least 6 characters.",
      "error"
    );

    return;
  }


  const button =
    form.querySelector(
      "button[type='submit']"
    );


  if (button) {
    button.disabled = true;
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

    console.error(
      "Registration error:",
      error
    );


    showToast(
      getAuthError(error),
      "error"
    );


  } finally {

    if (button) {
      button.disabled = false;
    }
  }
}


/* =========================================================
   TOGGLE LOGIN / REGISTER
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


  if (
    state.registerMode
  ) {

    loginForm?.classList.add(
      "hidden"
    );


    registerForm?.classList.remove(
      "hidden"
    );


    if (text) {

      text.textContent =
        "Already have an account?";
    }


    if (button) {

      button.textContent =
        "Login";
    }


  } else {

    registerForm?.classList.add(
      "hidden"
    );


    loginForm?.classList.remove(
      "hidden"
    );


    if (text) {

      text.textContent =
        "Don't have an account?";
    }


    if (button) {

      button.textContent =
        "Register";
    }
  }
}


/* =========================================================
   LOGOUT
========================================================= */

async function handleLogout() {

  try {

    await signOut(
      auth
    );


    showToast(
      "Logged out.",
      "success"
    );


  } catch (error) {

    console.error(
      "Logout error:",
      error
    );


    showToast(
      "Logout failed.",
      "error"
    );
  }
}


/* =========================================================
   SEARCH
========================================================= */

let searchTimer =
  null;


function handleSearch(
  event
) {

  const term =
    event.target.value
      .trim()
      .toLowerCase();


  const results =
    document.getElementById(
      "search-results"
    );


  clearTimeout(
    searchTimer
  );


  if (!results) {
    return;
  }


  if (!term) {

    results.innerHTML = "";

    return;
  }


  results.innerHTML = `
    <div class="search-loading">
      Searching...
    </div>
  `;


  searchTimer =
    setTimeout(
      async () => {

        try {

          const users =
            await searchUsers(
              term
            );


          renderSearchResults(
            users
          );


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
   RENDER SEARCH RESULTS
========================================================= */

function renderSearchResults(
  users
) {

  const results =
    document.getElementById(
      "search-results"
    );


  if (!results) {
    return;
  }


  if (!users.length) {

    results.innerHTML = `
      <div class="search-empty">
        No users found.
      </div>
    `;

    return;
  }


  results.innerHTML =
    users
      .filter(
        user =>
          user.uid !==
          state.user?.uid
      )
      .slice(0, 8)
      .map(
        user => `

          <button
            type="button"
            class="search-result"
            data-user-id="${escapeHTML(
              user.uid ||
              user.id
            )}"
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

              <div>
                ${escapeHTML(
                  user.displayName ||
                  "User"
                )}
              </div>

              <small>
                ${escapeHTML(
                  user.email ||
                  ""
                )}
              </small>

            </div>

          </button>
        `
      )
      .join("");


  results
    .querySelectorAll(
      ".search-result"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            handleUserSelected(
              button.dataset.userId,
              users
            )
        );
      }
    );
}


/* =========================================================
   SELECT USER
========================================================= */

async function handleUserSelected(
  userId,
  users
) {

  const user =
    users.find(
      item =>
        item.uid === userId ||
        item.id === userId
    );


  if (!user) {
    return;
  }


  try {

    const conversation =
      await getOrCreateConversation(
        {
          uid:
            user.uid ||
            user.id,

          email:
            user.email ||
            "",

          displayName:
            user.displayName ||
            user.email ||
            "User",

          key:
            user.key ||
            createUserKey(
              user.displayName,
              user.email
            )
        }
      );


    clearSearch();


    openChat(
      conversation
    );


  } catch (error) {

    console.error(
      "Conversation error:",
      error
    );


    showToast(
      "Could not open conversation.",
      "error"
    );
  }
}


/* =========================================================
   CONVERSATION RENDERING
========================================================= */

function renderConversations(
  docs
) {

  const container =
    document.getElementById(
      "conversation-list"
    );


  if (!container) {
    return;
  }


  if (!docs.length) {

    container.innerHTML = `
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


  container.innerHTML =
    docs
      .map(
        conversationDoc => {

          const data =
            conversationDoc.data();


          const otherUid =
            data.participants?.find(
              uid =>
                uid !==
                state.user?.uid
            );


          const other =
            data.participantData?.[
              otherUid
            ] || {};


          return `

            <button
              type="button"
              class="conversation-item"
              data-conversation-id="${escapeHTML(
                conversationDoc.id
              )}"
              data-user-id="${escapeHTML(
                otherUid || ""
              )}"
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
        }
      )
      .join("");


  container
    .querySelectorAll(
      ".conversation-item"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            handleConversationSelected(
              button.dataset.conversationId,
              button.dataset.userId,
              docs
            )
        );
      }
    );
}


/* =========================================================
   SELECT CONVERSATION
========================================================= */

async function handleConversationSelected(
  conversationId,
  otherUserId,
  docs
) {

  const selected =
    docs.find(
      doc =>
        doc.id ===
        conversationId
    );


  if (!selected) {
    return;
  }


  const data =
    selected.data();


  const other =
    data.participantData?.[
      otherUserId
    ];


  if (!other) {

    showToast(
      "Conversation data is incomplete.",
      "error"
    );

    return;
  }


  openChat({

    id:
      conversationId,

    otherUserId,

    otherUser: other
  });
}


/* =========================================================
   CLEAR SEARCH
========================================================= */

function clearSearch() {

  const input =
    document.getElementById(
      "user-search"
    );


  const results =
    document.getElementById(
      "search-results"
    );


  if (input) {
    input.value = "";
  }


  if (results) {
    results.innerHTML = "";
  }
}


/* =========================================================
   CLEANUP
========================================================= */

function cleanup() {

  state.unsubscribeMessages?.();

  state.unsubscribeConversations?.();


  state.unsubscribeMessages =
    null;


  state.unsubscribeConversations =
    null;


  state.currentConversation =
    null;


  state.me =
    null;


  document.body.classList.remove(
    "chat-open"
  );
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


  if (!container) {
    return;
  }


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


  setTimeout(
    () => {
      toast.remove();
    },
    3500
  );
}


/* =========================================================
   FIREBASE AUTH ERRORS
========================================================= */

function getAuthError(
  error
) {

  switch (
    error?.code
  ) {

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
      return (
        error?.message ||
        "Authentication failed."
      );
  }
}


/* =========================================================
   HELPERS
========================================================= */

function getInitial(
  value
) {

  const text =
    String(
      value || "?"
    ).trim();


  return (
    text.charAt(0)
      .toUpperCase() ||
    "?"
  );
}


function escapeHTML(
  value
) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}


/* =========================================================
   GLOBAL API
========================================================= */

window.MissApp = {

  ...window.MissApp,

  state,

  showToast,

  toggleAuth,

  logout:
    handleLogout,

  openChat,

  sendMessage,

  clearSearch
};
