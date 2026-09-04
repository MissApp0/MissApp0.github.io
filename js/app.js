/* =========================================================
   MissApp
   js/app.js

   Main application controller

   Responsibilities:
   - Build UI
   - Authentication UI
   - Firebase auth state
   - User profile creation
   - Connect chat modules
   - Search users
   - Conversation UI
   - Message UI
   - Mobile navigation
   - Global notifications
========================================================= */

import { auth, db } from "./firebase.js";
import { state } from "./state.js";

import { login } from "./auth/login.js";
import { register } from "./auth/register.js";

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

import {
  listenConversations
} from "./chat/conversations.js";

import {
  searchUsers
} from "./chat/search.js";

import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot
} from
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


/* =========================================================
   APPLICATION STATE
========================================================= */

let unsubscribeConversations = null;
let unsubscribeMessages = null;

let searchTimer = null;
let isSending = false;

let currentConversationId = null;


/* =========================================================
   START
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  init
);


function init() {

  createAuthUI();

  createAppUI();

  setupEvents();

  setupAuth();

}


/* =========================================================
   AUTH UI
========================================================= */

function createAuthUI() {

  const container =
    document.getElementById("auth");

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


        <div class="auth-actions">

          <button
            class="btn"
            type="submit"
            id="login-button"
          >
            Login
          </button>

        </div>

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
            minlength="2"
            maxlength="32"
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
            placeholder="At least 6 characters"
            autocomplete="new-password"
            minlength="6"
            required
          >

        </div>


        <div class="auth-actions">

          <button
            class="btn"
            type="submit"
            id="register-button"
          >
            Create Account
          </button>

        </div>

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
      "MissApp: #sidebar or #chat not found."
    );

    return;
  }


  /* =======================================================
     SIDEBAR
  ======================================================= */

  sidebar.innerHTML = `

    <div class="sidebar-header">

      <div class="sidebar-top">

        <div class="sidebar-title">
          MissApp
        </div>

        <button
          id="close-sidebar"
          class="mobile-sidebar-button"
          type="button"
          aria-label="Close conversations"
        >
          ×
        </button>

      </div>


      <div
        id="current-user"
        class="current-user"
      >

        <div
          id="current-user-avatar"
          class="conversation-avatar"
        >
          ?
        </div>

        <div class="current-user-info">

          <div
            id="current-user-name"
            class="current-user-name"
          >
            User
          </div>

          <div
            id="current-user-email"
            class="current-user-email"
          >
            Loading...
          </div>

        </div>

      </div>


      <div class="search-container">

        <input
          id="user-search"
          class="input"
          type="search"
          placeholder="Search users..."
          autocomplete="off"
          aria-label="Search users"
        >

        <div
          id="search-results"
          class="search-results"
        ></div>

      </div>

    </div>


    <div
      id="conversation-list"
      class="conversation-list"
    >

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
        id="open-sidebar"
        class="chat-menu-button"
        type="button"
        aria-label="Open conversations"
      >
        ☰
      </button>


      <button
        id="back-button"
        class="chat-back"
        type="button"
        aria-label="Back to conversations"
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
      class="messages"
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

        <div class="composer-wrapper">

          <textarea
            id="message-input"
            class="composer-input"
            rows="1"
            maxlength="4000"
            placeholder="Write a message..."
            disabled
          ></textarea>

          <div
            id="message-counter"
            class="message-counter"
          >
            0 / 4000
          </div>

        </div>


        <button
          class="composer-send"
          type="submit"
          id="send-button"
          disabled
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

  document
    .getElementById("login-form")
    ?.addEventListener(
      "submit",
      handleLogin
    );


  document
    .getElementById("register-form")
    ?.addEventListener(
      "submit",
      handleRegister
    );


  document
    .getElementById("auth-switch-button")
    ?.addEventListener(
      "click",
      toggleAuth
    );


  document
    .getElementById("logout-button")
    ?.addEventListener(
      "click",
      handleLogout
    );


  document
    .getElementById("user-search")
    ?.addEventListener(
      "input",
      handleSearch
    );


  document
    .getElementById("open-sidebar")
    ?.addEventListener(
      "click",
      openSidebar
    );


  document
    .getElementById("close-sidebar")
    ?.addEventListener(
      "click",
      closeSidebar
    );


  document
    .getElementById("back-button")
    ?.addEventListener(
      "click",
      handleBack
    );


  const composer =
    document.getElementById(
      "composer-form"
    );


  const input =
    document.getElementById(
      "message-input"
    );


  composer?.addEventListener(
    "submit",
    handleSendMessage
  );


  input?.addEventListener(
    "input",
    handleMessageInput
  );


  input?.addEventListener(
    "keydown",
    handleMessageKeydown
  );


  /* Close search when clicking outside */

  document.addEventListener(
    "click",
    event => {

      const container =
        document.querySelector(
          ".search-container"
        );

      if (!container) return;

      if (
        !container.contains(
          event.target
        )
      ) {

        const results =
          document.getElementById(
            "search-results"
          );

        if (results) {
          results.innerHTML = "";
        }
      }

    }
  );

}


/* =========================================================
   FIREBASE AUTH
========================================================= */

function setupAuth() {

  onAuthStateChanged(
    auth,
    async user => {

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

        console.error(
          "Application startup error:",
          error
        );

        showToast(
          "Could not initialize your account.",
          "error"
        );

      }

    }
  );

}


/* =========================================================
   USER PROFILE
========================================================= */

async function ensureUserDocument(user) {

  const userRef =
    doc(
      db,
      "users",
      user.uid
    );


  const snapshot =
    await getDoc(userRef);


  if (!snapshot.exists()) {

    const displayName =
      user.displayName ||
      user.email
        ?.split("@")[0] ||
      "User";


    await setDoc(
      userRef,
      {
        uid: user.uid,

        email:
          user.email || "",

        displayName,

        key:
          displayName
            .trim()
            .toLowerCase(),

        createdAt:
          serverTimestamp()
      }
    );

    return;
  }


  const data =
    snapshot.data();


  /*
     Upgrade old accounts which
     don't have a display name/key.
  */

  const displayName =
    data.displayName ||
    user.displayName ||
    user.email
      ?.split("@")[0] ||
    "User";


  const updates = {};


  if (!data.displayName) {
    updates.displayName =
      displayName;
  }


  if (!data.key) {
    updates.key =
      displayName
        .trim()
        .toLowerCase();
  }


  if (
    !data.email &&
    user.email
  ) {

    updates.email =
      user.email;

  }


  if (
    Object.keys(updates).length
  ) {

    await setDoc(
      userRef,
      updates,
      {
        merge: true
      }
    );

  }

}


/* =========================================================
   LOAD CURRENT USER
========================================================= */

async function loadCurrentUser(user) {

  const snapshot =
    await getDoc(
      doc(
        db,
        "users",
        user.uid
      )
    );


  const data =
    snapshot.exists()
      ? snapshot.data()
      : {};


  state.me = {
    uid: user.uid,

    email:
      data.email ||
      user.email ||
      "",

    displayName:
      data.displayName ||
      user.displayName ||
      user.email
        ?.split("@")[0] ||
      "User",

    key:
      data.key ||
      (
        data.displayName ||
        user.displayName ||
        user.email
          ?.split("@")[0] ||
        "user"
      )
        .toLowerCase()
  };


  updateCurrentUserUI();

}


/* =========================================================
   CURRENT USER UI
========================================================= */

function updateCurrentUserUI() {

  const user =
    state.me;

  if (!user) return;


  const name =
    document.getElementById(
      "current-user-name"
    );


  const email =
    document.getElementById(
      "current-user-email"
    );


  const avatar =
    document.getElementById(
      "current-user-avatar"
    );


  if (name) {

    name.textContent =
      user.displayName ||
      "User";

  }


  if (email) {

    email.textContent =
      user.email || "";

  }


  if (avatar) {

    avatar.textContent =
      getInitial(
        user.displayName ||
        user.email
      );

  }

}


/* =========================================================
   SHOW AUTH
========================================================= */

function showAuth() {

  document
    .getElementById("auth")
    ?.classList.remove(
      "hidden"
    );


  document
    .getElementById("app")
    ?.classList.add(
      "hidden"
    );


  document.body
    .classList.remove(
      "chat-open"
    );

}


/* =========================================================
   SHOW APP
========================================================= */

function showApp() {

  document
    .getElementById("auth")
    ?.classList.add(
      "hidden"
    );


  document
    .getElementById("app")
    ?.classList.remove(
      "hidden"
    );

}


/* =========================================================
   LOGIN
========================================================= */

async function handleLogin(event) {

  event.preventDefault();


  const form =
    event.currentTarget;


  const button =
    document.getElementById(
      "login-button"
    );


  const email =
    form.elements.email.value
      .trim();


  const password =
    form.elements.password.value;


  if (!email || !password) {

    showToast(
      "Enter your email and password.",
      "error"
    );

    return;
  }


  setButtonLoading(
    button,
    true,
    "Logging in..."
  );


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

    setButtonLoading(
      button,
      false,
      "Login"
    );

  }

}


/* =========================================================
   REGISTER
========================================================= */

async function handleRegister(event) {

  event.preventDefault();


  const form =
    event.currentTarget;


  const button =
    document.getElementById(
      "register-button"
    );


  const displayName =
    form.elements.displayName.value
      .trim();


  const email =
    form.elements.email.value
      .trim();


  const password =
    form.elements.password.value;


  if (
    displayName.length < 2
  ) {

    showToast(
      "Display name must be at least 2 characters.",
      "error"
    );

    return;
  }


  if (
    displayName.length > 32
  ) {

    showToast(
      "Display name cannot exceed 32 characters.",
      "error"
    );

    return;
  }


  if (
    password.length < 6
  ) {

    showToast(
      "Password must be at least 6 characters.",
      "error"
    );

    return;
  }


  setButtonLoading(
    button,
    true,
    "Creating..."
  );


  try {

    await register(
      displayName,
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

    setButtonLoading(
      button,
      false,
      "Create Account"
    );

  }

}


/* =========================================================
   AUTH SWITCH
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

    loginForm
      ?.classList.add(
        "hidden"
      );


    registerForm
      ?.classList.remove(
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

    registerForm
      ?.classList.add(
        "hidden"
      );


    loginForm
      ?.classList.remove(
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

    await signOut(auth);

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

function handleSearch(event) {

  const term =
    event.target.value
      .trim()
      .toLowerCase();


  clearTimeout(
    searchTimer
  );


  const results =
    document.getElementById(
      "search-results"
    );


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
   SEARCH RESULTS
========================================================= */

function renderSearchResults(
  users
) {

  const results =
    document.getElementById(
      "search-results"
    );


  if (!results) return;


  const filtered =
    users.filter(
      user =>
        user.uid !==
        state.user?.uid
    );


  if (!filtered.length) {

    results.innerHTML = `
      <div class="search-empty">
        No users found.
      </div>
    `;

    return;
  }


  results.innerHTML =
    filtered
      .slice(0, 8)
      .map(user => `

        <button
          class="search-result"
          type="button"
          data-user-id="${escapeHTML(
            user.uid || user.id
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
                user.email || ""
              )}
            </small>

          </div>

        </button>

      `)
      .join("");


  results
    .querySelectorAll(
      ".search-result"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        async () => {

          const userId =
            button.dataset.userId;


          closeSearch();


          await startConversation(
            userId
          );

        }
      );

    });

}


/* =========================================================
   START CONVERSATION
========================================================= */

async function startConversation(
  otherUserId
) {

  if (!state.user) return;


  /*
     Dispatch event so chat modules can
     optionally handle conversation creation.
  */

  window.dispatchEvent(
    new CustomEvent(
      "missapp:start-conversation",
      {
        detail: {
          otherUserId
        }
      }
    )
  );


  /*
     The modular conversation implementation
     can listen for this event.
  */

  showToast(
    "Opening conversation...",
    "info"
  );

}


/* =========================================================
   CONVERSATION LISTENER
========================================================= */

function startConversationListener() {

  if (!state.user) return;


  unsubscribeConversations?.();


  unsubscribeConversations =
    listenConversations(
      renderConversations
    );


}


/* =========================================================
   RENDER CONVERSATIONS
========================================================= */

function renderConversations(
  docs
) {

  const list =
    document.getElementById(
      "conversation-list"
    );


  if (!list) return;


  if (!docs?.length) {

    list.innerHTML = `

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


  list.innerHTML =
    docs
      .map(item => {

        const data =
          typeof item.data ===
          "function"
            ? item.data()
            : item;


        const id =
          item.id;


        /*
           Support both participantData
           and older conversation structures.
        */

        const otherUser =
          getOtherParticipant(
            data
          );


        const name =
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
              ${
                currentConversationId === id
                  ? "active"
                  : ""
              }
            "
            type="button"
            data-conversation-id="${escapeHTML(id)}"
          >

            <div class="conversation-avatar">
              ${escapeHTML(
                getInitial(name)
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

          </button>

        `;

      })
      .join("");


  list
    .querySelectorAll(
      ".conversation"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const id =
            button.dataset
              .conversationId;


          const docData =
            docs.find(
              item =>
                item.id === id
            );


          if (!docData) return;


          openConversation(
            docData
          );

        }
      );

    });

}


/* =========================================================
   OTHER PARTICIPANT
========================================================= */

function getOtherParticipant(
  conversation
) {

  /*
     New structure
  */

  if (
    conversation.participantData
  ) {

    const entries =
      Object.entries(
        conversation.participantData
      );


    const other =
      entries.find(
        ([uid]) =>
          uid !== state.user?.uid
      );


    if (other) {

      return other[1] || {};

    }

  }


  /*
     Alternative structure
  */

  if (
    conversation.participants
  ) {

    const otherId =
      conversation.participants.find(
        uid =>
          uid !== state.user?.uid
      );


    if (
      conversation.users &&
      conversation.users[otherId]
    ) {

      return conversation.users[
        otherId
      ];

    }

  }


  return {};

}


/* =========================================================
   OPEN CONVERSATION
========================================================= */

function openConversation(
  item
) {

  const data =
    typeof item.data ===
    "function"
      ? item.data()
      : item;


  const conversationId =
    item.id;


  const otherUser =
    getOtherParticipant(
      data
    );


  currentConversationId =
    conversationId;


  state.currentConversation = {

    id:
      conversationId,

    otherUserId:
      otherUser.uid || null,

    otherUser

  };


  updateChatHeader(
    otherUser
  );


  enableComposer();


  renderConversationActive();


  listenToMessages(
    conversationId
  );


  document.body
    .classList.add(
      "chat-open"
    );


  closeSidebar();

}


/* =========================================================
   CHAT HEADER
========================================================= */

function updateChatHeader(
  user
) {

  const name =
    document.getElementById(
      "chat-name"
    );


  const status =
    document.getElementById(
      "chat-status"
    );


  const avatar =
    document.getElementById(
      "chat-avatar"
    );


  const displayName =
    user.displayName ||
    user.email ||
    "User";


  if (name) {

    name.textContent =
      displayName;

  }


  if (status) {

    status.textContent =
      user.email ||
      "MissApp user";

  }


  if (avatar) {

    avatar.textContent =
      getInitial(
        displayName
      );

  }

}


/* =========================================================
   ACTIVE CONVERSATION
========================================================= */

function renderConversationActive() {

  document
    .querySelectorAll(
      ".conversation"
    )
    .forEach(item => {

      item.classList.toggle(
        "active",
        item.dataset
          .conversationId ===
        currentConversationId
      );

    });

}


/* =========================================================
   MESSAGE LISTENER
========================================================= */

function listenToMessages(
  conversationId
) {

  unsubscribeMessages?.();


  const messagesRef =
    collection(
      db,
      "conversations",
      conversationId,
      "messages"
    );


  const q =
    query(
      messagesRef,
      orderBy(
        "createdAt",
        "asc"
      )
    );


  unsubscribeMessages =
    onSnapshot(
      q,
      snapshot => {

        const messages =
          snapshot.docs.map(
            item => ({
              id: item.id,
              ...item.data()
            })
          );


        renderMessages(
          messages
        );

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


/* =========================================================
   RENDER MESSAGES
========================================================= */

function renderMessages(
  messages
) {

  const container =
    document.getElementById(
      "messages"
    );


  if (!container) return;


  if (!messages.length) {

    container.innerHTML = `

      <div class="chat-empty">

        <div>

          <div class="chat-empty-title">
            No messages yet
          </div>

          <div>
            Send the first message.
          </div>

        </div>

      </div>

    `;

    return;
  }


  container.innerHTML =
    messages
      .map(message => {

        const mine =
          message.senderId ===
          state.user?.uid;


        const time =
          formatMessageTime(
            message.createdAt
          );


        return `

          <div
            class="
              message-row
              ${mine ? "mine" : "theirs"}
            "
          >

            <div class="message">

              <div class="message-text">
                ${escapeHTML(
                  message.text || ""
                )}
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


/* =========================================================
   SEND MESSAGE
========================================================= */

async function handleSendMessage(
  event
) {

  event.preventDefault();


  if (isSending) return;


  const input =
    document.getElementById(
      "message-input"
    );


  if (!input) return;


  const text =
    input.value.trim();


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


    /*
       Update conversation preview.

       This requires the current user to have
       permission to update the conversation.
    */

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


    if (
      state.currentConversation
    ) {

      sendButton
        ?.removeAttribute(
          "disabled"
        );

    }

  }

}


/* =========================================================
   MESSAGE INPUT
========================================================= */

function handleMessageInput() {

  const input =
    document.getElementById(
      "message-input"
    );


  if (!input) return;


  input.style.height =
    "auto";


  input.style.height =
    Math.min(
      input.scrollHeight,
      140
    ) + "px";


  updateMessageCounter();

}


/* =========================================================
   MESSAGE COUNTER
========================================================= */

function updateMessageCounter() {

  const input =
    document.getElementById(
      "message-input"
    );


  const counter =
    document.getElementById(
      "message-counter"
    );


  if (!input || !counter) {
    return;
  }


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


/* =========================================================
   MESSAGE KEYBOARD
========================================================= */

function handleMessageKeydown(
  event
) {

  if (
    event.key === "Enter" &&
    !event.shiftKey
  ) {

    event.preventDefault();


    const composer =
      document.getElementById(
        "composer-form"
      );


    composer?.requestSubmit();

  }

}


/* =========================================================
   COMPOSER
========================================================= */

function enableComposer() {

  document
    .getElementById(
      "message-input"
    )
    ?.removeAttribute(
      "disabled"
    );


  document
    .getElementById(
      "send-button"
    )
    ?.removeAttribute(
      "disabled"
    );


  document
    .getElementById(
      "message-input"
    )
    ?.focus();

}


function disableComposer() {

  document
    .getElementById(
      "message-input"
    )
    ?.setAttribute(
      "disabled",
      ""
    );


  document
    .getElementById(
      "send-button"
    )
    ?.setAttribute(
      "disabled",
      ""
    );

}


function resetTextareaHeight() {

  const input =
    document.getElementById(
      "message-input"
    );


  if (!input) return;


  input.style.height =
    "auto";

}


/* =========================================================
   MOBILE SIDEBAR
========================================================= */

function openSidebar() {

  document
    .getElementById(
      "sidebar"
    )
    ?.classList.add(
      "open"
    );

}


function closeSidebar() {

  document
    .getElementById(
      "sidebar"
    )
    ?.classList.remove(
      "open"
    );

}


function handleBack() {

  document.body
    .classList.remove(
      "chat-open"
    );


  openSidebar();

}


/* =========================================================
   CLOSE SEARCH
========================================================= */

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


/* =========================================================
   SCROLL MESSAGES
========================================================= */

function scrollMessagesToBottom() {

  const container =
    document.getElementById(
      "messages"
    );


  if (!container) return;


  container.scrollTop =
    container.scrollHeight;

}


/* =========================================================
   FORMAT MESSAGE TIME
========================================================= */

function formatMessageTime(
  timestamp
) {

  if (!timestamp) {
    return "";
  }


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


/* =========================================================
   BUTTON LOADING
========================================================= */

function setButtonLoading(
  button,
  loading,
  text
) {

  if (!button) return;


  button.disabled =
    loading;


  button.textContent =
    loading
      ? text
      : button.dataset.originalText ||
        text;


  if (!button.dataset.originalText) {

    button.dataset.originalText =
      text;

  }

}


/* =========================================================
   CLEANUP
========================================================= */

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

      toast.style.opacity =
        "0";

      toast.style.transform =
        "translateY(8px)";

      setTimeout(
        () => toast.remove(),
        200
      );

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


/* =========================================================
   FIRESTORE ERRORS
========================================================= */

function getFirestoreError(
  error
) {

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


/* =========================================================
   INITIAL
========================================================= */

function getInitial(
  value
) {

  const text =
    String(
      value || "?"
    )
      .trim();


  return (
    text
      .charAt(0)
      .toUpperCase() ||
    "?"
  );

}


/* =========================================================
   HTML ESCAPING
========================================================= */

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

window.MissApp = state;

window.MissApp.showToast =
  showToast;

window.MissApp.toggleAuth =
  toggleAuth;

window.MissApp.logout =
  handleLogout;

window.MissApp.openSidebar =
  openSidebar;

window.MissApp.closeSidebar =
  closeSidebar;

window.MissApp.openConversation =
  openConversation;
