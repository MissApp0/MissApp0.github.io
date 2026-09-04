import { auth } from "./firebase.js";

import { login } from "./auth/login.js";
import { register } from "./auth/register.js";

import { listenConversations } from "./chat/conversations.js";
import { searchUsers } from "./chat/search.js";

import {
  onAuthStateChanged
} from
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

onAuthStateChanged(auth, user => {

  if (user) {
    startApp(user);
  } else {
    showAuth();
  }

});

function startApp(user) {
  document
    .getElementById("auth")
    .classList.add("hidden");

  document
    .getElementById("app")
    .classList.remove("hidden");

  listenConversations(
    renderConversations
  );
}

function showAuth() {
  document
    .getElementById("auth")
    .classList.remove("hidden");

  document
    .getElementById("app")
    .classList.add("hidden");
}

function renderConversations(docs) {
  // UI rendering
}
