/* =========================================================
   MissApp
   js/app.js

   Authentication + Firestore chat
========================================================= */

import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


/* =========================================================
   STATE
========================================================= */

const state = {
  user: null,
  registerMode: false,
  currentConversation: null,
  unsubscribeMessages: null,
  unsubscribeConversations: null
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
  const authContainer = document.getElementById("auth");

  if (!authContainer) {
    console.error("MissApp: #auth not found");
    return;
  }

  authContainer.innerHTML = `
    <div class="auth-card">

      <div class="auth-title">
        MissApp
      </div>

      <div class="auth-subtitle">
        Secure real-time messaging
      </div>

      <form id="login-form" class="auth-form">

        <div class="auth-field">
          <label class="auth-label">Email</label>

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
          <label class="auth-label">Password</label>

          <input
            class="input"
            type="password"
            name="password"
            placeholder="Password"
            autocomplete="current-password"
            required
          >
        </div>

        <button class="btn" type="submit">
          Login
        </button>

      </form>


      <form id="register-form" class="auth-form hidden">

        <div class="auth-field">
          <label class="auth-label">Email</label>

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
          <label class="auth-label">Password</label>

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

        <button class="btn" type="submit">
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

  if (!sidebar || !chat) {
    console.error("MissApp: #sidebar or #chat not found");
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
          class="composer-send"
          type="submit"
          id="send-button"
          disabled
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

  const messageInput =
    document.getElementById("message-input");


  composer?.addEventListener("submit", async event => {

    event.preventDefault();

    const text = messageInput.value.trim();

    if (!text) return;

    if (!state.currentConversation) {
      showToast(
        "Select a conversation first.",
        "error"
      );
      return;
    }

    await sendMessage(text);

    messageInput.value = "";
    messageInput.style.height = "auto";
  });


  messageInput?.addEventListener("input", () => {

    messageInput.style.height = "auto";

    messageInput.style.height =
      Math.min(
        messageInput.scrollHeight,
        140
      ) + "px";
  });


  messageInput?.addEventListener("keydown", event => {

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

    state.user = user;

    if (user) {

      showApp();

      await ensureUserDocument(user);

      listenToConversations();

    } else {

      cleanupListeners();

      state.currentConversation = null;

      showAuth();
    }
  });
}


/* =========================================================
   USER DOCUMENT
========================================================= */

async function ensureUserDocument(user) {

  const userRef =
    doc(db, "users", user.uid);

  const snapshot =
    await getDoc(userRef);

  if (!snapshot.exists()) {

    await setDoc(userRef, {
      uid: user.uid,
      email: user.email || "",
      displayName:
        user.displayName ||
        user.email?.split("@")[0] ||
        "User",
      createdAt: serverTimestamp()
    });
  }
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
   AUTH SWITCH
========================================================= */

function toggleAuth() {

  state.registerMode =
    !state.registerMode;

  const loginForm =
    document.getElementById("login-form");

  const registerForm =
    document.getElementById("register-form");

  const text =
    document.getElementById("auth-switch-text");

  const button =
    document.getElementById("auth-switch-button");


  if (state.registerMode) {

    loginForm?.classList.add("hidden");

    registerForm?.classList.remove("hidden");

    if (text) {
      text.textContent =
        "Already have an account?";
    }

    if (button) {
      button.textContent = "Login";
    }

  } else {

    registerForm?.classList.add("hidden");

    loginForm?.classList.remove("hidden");

    if (text) {
      text.textContent =
        "Don't have an account?";
    }

    if (button) {
      button.textContent = "Register";
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

    console.error(error);

    showToast(
      "Logout failed.",
      "error"
    );
  }
}


/* =========================================================
   USER SEARCH
========================================================= */

let searchTimer = null;

function handleSearch(event) {

  const term =
    event.target.value.trim().toLowerCase();

  clearTimeout(searchTimer);

  const results =
    document.getElementById("search-results");

  if (!results) return;

  if (!term) {

    results.innerHTML = "";

    return;
  }


  searchTimer =
    setTimeout(
      () => searchUsers(term),
      250
    );
}


/* =========================================================
   SEARCH USERS
========================================================= */

async function searchUsers(term) {

  const results =
    document.getElementById("search-results");

  if (!results || !state.user) return;


  results.innerHTML = `
    <div class="search-loading">
      Searching...
    </div>
  `;


  try {

    /*
      Firestore does not provide arbitrary
      substring search natively.

      This implementation loads users and
      filters locally. For a large app,
      use a dedicated search service/index.
    */

    const snapshot =
      await getDocs(
        collection(db, "users")
      );


    const users = [];

    snapshot.forEach(userDoc => {

      const user =
        userDoc.data();

      if (
        user.uid === state.user.uid
      ) {
        return;
      }

      const email =
        String(user.email || "")
          .toLowerCase();

      const name =
        String(user.displayName || "")
          .toLowerCase();

      if (
        email.includes(term) ||
        name.includes(term)
      ) {
        users.push({
          id: userDoc.id,
          ...user
        });
      }
    });


    if (!users.length) {

      results.innerHTML = `
        <div class="search-empty">
          No users found.
        </div>
      `;

      return;
    }


    results.innerHTML =
      users.slice(0, 10).map(user => `

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

      `).join("");


    results
      .querySelectorAll(".search-result")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            const userId =
              button.dataset.userId;

            startConversation(userId);

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

    console.error(error);

    results.innerHTML = `
      <div class="search-empty">
        Search failed.
      </div>
    `;
  }
}


/* =========================================================
   CONVERSATIONS
========================================================= */

function getConversationId(uid1, uid2) {

  return [uid1, uid2]
    .sort()
    .join("_");
}


async function startConversation(otherUserId) {

  if (!state.user) return;

  if (otherUserId === state.user.uid) {
    return;
  }


  const otherUserRef =
    doc(db, "users", otherUserId);

  const otherSnapshot =
    await getDoc(otherUserRef);

  if (!otherSnapshot.exists()) {

    showToast(
      "User no longer exists.",
      "error"
    );

    return;
  }


  const otherUser =
    otherSnapshot.data();


  const conversationId =
    getConversationId(
      state.user.uid,
      otherUserId
    );


  const conversationRef =
    doc(
      db,
      "conversations",
      conversationId
    );


  const existing =
    await getDoc(conversationRef);


  if (!existing.exists()) {

    await setDoc(conversationRef, {
      participants: [
        state.user.uid,
        otherUserId
      ],
      participantData: {
        [state.user.uid]: {
          uid: state.user.uid,
          email: state.user.email || ""
        },
        [otherUserId]: {
          uid: otherUserId,
          email: otherUser.email || "",
          displayName:
            otherUser.displayName ||
            otherUser.email ||
            "User"
        }
      },
      lastMessage: "",
      lastMessageAt: null,
      createdAt: serverTimestamp()
    });
  }


  openConversation({
    id: conversationId,
    otherUserId,
    otherUser
  });
}


/* =========================================================
   CONVERSATION LIST
========================================================= */

function listenToConversations() {

  if (!state.user) return;

  state.unsubscribeConversations?.();


  const q =
    query(
      collection(db, "conversations"),
      where(
        "participants",
        "array-contains",
        state.user.uid
      )
    );


  state.unsubscribeConversations =
    onSnapshot(
      q,
      snapshot => {

        const conversations =
          snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
          }));

        renderConversationList(
          conversations
        );
      },
      error => {

        console.error(
          "Conversation listener:",
          error
        );

        showToast(
          "Could not load conversations.",
          "error"
        );
      }
    );
}


/* =========================================================
   RENDER CONVERSATIONS
========================================================= */

function renderConversationList(
  conversations
) {

  const list =
    document.getElementById(
      "conversation-list"
    );

  if (!list) return;


  if (!conversations.length) {

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
    conversations.map(conversation => {

      const otherUserId =
        conversation.participants
          ?.find(
            uid =>
              uid !== state.user.uid
          );


      const other =
        conversation
          .participantData
          ?.[otherUserId] || {};


      return `

        <button
          class="conversation-item"
          type="button"
          data-conversation-id="${escapeHTML(conversation.id)}"
          data-user-id="${escapeHTML(otherUserId || "")}"
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
                conversation.lastMessage ||
                "No messages yet"
              )}
            </div>

          </div>

        </button>
      `;
    }).join("");


  list
    .querySelectorAll(".conversation-item")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const conversationId =
            button.dataset.conversationId;

          const otherUserId =
            button.dataset.userId;

          const conversation =
            conversations.find(
              item =>
                item.id === conversationId
            );

          const otherUser =
            conversation
              ?.participantData
              ?.[otherUserId] || {};


          openConversation({
            id: conversationId,
            otherUserId,
            otherUser
          });
        }
      );
    });
}


/* =========================================================
   OPEN CONVERSATION
========================================================= */

function openConversation(conversation) {

  state.currentConversation =
    conversation;


  const name =
    document.getElementById("chat-name");

  const status =
    document.getElementById("chat-status");

  const avatar =
    document.getElementById("chat-avatar");

  const input =
    document.getElementById("message-input");

  const send =
    document.getElementById("send-button");


  if (name) {

    name.textContent =
      conversation.otherUser
        ?.displayName ||
      conversation.otherUser
        ?.email ||
      "User";
  }


  if (status) {

    status.textContent =
      conversation.otherUser
        ?.email || "";
  }


  if (avatar) {

    avatar.textContent =
      getInitial(
        conversation.otherUser
          ?.displayName ||
        conversation.otherUser
          ?.email
      );
  }


  input?.removeAttribute("disabled");

  send?.removeAttribute("disabled");


  document.body.classList.add(
    "chat-open"
  );


  listenToMessages(
    conversation.id
  );
}


/* =========================================================
   MESSAGES
========================================================= */

function listenToMessages(conversationId) {

  state.unsubscribeMessages?.();


  const q =
    query(
      collection(
        db,
        "conversations",
        conversationId,
        "messages"
      ),
      orderBy("createdAt", "asc")
    );


  state.unsubscribeMessages =
    onSnapshot(
      q,
      snapshot => {

        const messages =
          snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
          }));

        renderMessages(messages);
      },
      error => {

        console.error(
          "Message listener:",
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
   SEND MESSAGE
========================================================= */

async function sendMessage(text) {

  if (
    !state.user ||
    !state.currentConversation
  ) {
    return;
  }


  const conversationId =
    state.currentConversation.id;


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
        lastMessage: text,
        lastMessageAt: serverTimestamp()
      },
      {
        merge: true
      }
    );


  } catch (error) {

    console.error(error);

    showToast(
      "Message could not be sent.",
      "error"
    );
  }
}


/* =========================================================
   RENDER MESSAGES
========================================================= */

function renderMessages(messages) {

  const container =
    document.getElementById("messages");

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
    messages.map(message => {

      const mine =
        message.senderId ===
        state.user?.uid;


      return `

        <div
          class="message-row ${mine ? "message-mine" : "message-theirs"}"
        >

          <div class="message-bubble">
            ${escapeHTML(message.text || "")}
          </div>

        </div>

      `;

    }).join("");


  requestAnimationFrame(() => {

    container.scrollTop =
      container.scrollHeight;
  });
}


/* =========================================================
   CLEANUP
========================================================= */

function cleanupListeners() {

  state.unsubscribeMessages?.();
  state.unsubscribeConversations?.();

  state.unsubscribeMessages = null;
  state.unsubscribeConversations = null;
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

  container.appendChild(toast);


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
   HELPERS
========================================================= */

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
   GLOBAL API
========================================================= */

window.MissApp.showToast =
  showToast;

window.MissApp.toggleAuth =
  toggleAuth;

window.MissApp.logout =
  handleLogout;

window.MissApp.openConversation =
  openConversation;

  
