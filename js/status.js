import { auth, db } from "./firebase.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;
let unsubscribeStatuses = null;

export function initStatus() {
  if (!auth.currentUser) return;
  renderStatusShell();
  listenToStatuses();
}

function renderStatusShell() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar || document.getElementById("status-section")) return;

  const section = document.createElement("section");
  section.id = "status-section";
  section.className = "status-section";
  section.innerHTML = `
    <div class="status-heading">
      <span>Status</span>
      <button id="add-status-button" class="status-add" type="button" aria-label="Add status">＋</button>
    </div>
    <button id="my-status" class="status-item my-status" type="button">
      <div class="status-avatar status-add-avatar">＋</div>
      <div class="status-copy">
        <strong>My status</strong>
        <span>Tap to add a status</span>
      </div>
    </button>
    <div id="status-list" class="status-list"></div>
  `;

  const conversationList = document.getElementById("conversation-list");
  sidebar.querySelector(".sidebar-header")?.after(section);

  document.getElementById("add-status-button")?.addEventListener("click", createStatus);
  document.getElementById("my-status")?.addEventListener("click", createStatus);

  if (!conversationList) return;
}

function listenToStatuses() {
  unsubscribeStatuses?.();

  const q = query(
    collection(db, "statuses"),
    where("expiresAt", ">", Timestamp.now()),
    orderBy("expiresAt", "asc")
  );

  unsubscribeStatuses = onSnapshot(q, snapshot => {
    const statuses = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(status => status.authorId !== auth.currentUser?.uid);

    renderStatuses(statuses);
    updateMyStatus(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, error => {
    console.error("Status listener error:", error);
  });
}

function updateMyStatus(statuses) {
  const mine = statuses
    .filter(status => status.authorId === auth.currentUser?.uid)
    .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt))[0];

  const button = document.getElementById("my-status");
  if (!button) return;

  const copy = button.querySelector(".status-copy");
  const avatar = button.querySelector(".status-avatar");

  if (mine) {
    button.classList.add("has-status");
    if (avatar) avatar.textContent = "✓";
    if (copy) copy.innerHTML = "<strong>My status</strong><span>Your status is live</span>";
  } else {
    button.classList.remove("has-status");
    if (avatar) avatar.textContent = "＋";
    if (copy) copy.innerHTML = "<strong>My status</strong><span>Tap to add a status</span>";
  }
}

function renderStatuses(statuses) {
  const list = document.getElementById("status-list");
  if (!list) return;

  const grouped = new Map();

  for (const status of statuses) {
    const existing = grouped.get(status.authorId);
    if (!existing || getMillis(status.createdAt) > getMillis(existing.createdAt)) {
      grouped.set(status.authorId, status);
    }
  }

  const items = [...grouped.values()];

  list.innerHTML = items.map(status => `
    <button class="status-item" type="button" data-status-id="${escapeHtml(status.id)}">
      <div class="status-avatar status-ring">${escapeHtml(getInitial(status.authorName))}</div>
      <div class="status-copy">
        <strong>${escapeHtml(status.authorName || "User")}</strong>
        <span>${escapeHtml(formatAge(status.createdAt))}</span>
      </div>
    </button>
  `).join("");

  list.querySelectorAll("[data-status-id]").forEach(button => {
    button.addEventListener("click", () => {
      const status = items.find(item => item.id === button.dataset.statusId);
      if (status) viewStatus(status);
    });
  });
}

async function createStatus() {
  if (!auth.currentUser) return;

  const text = window.prompt("Write a status (max 500 characters):");
  if (text === null) return;

  const clean = text.trim();
  if (!clean) return;
  if (clean.length > 500) {
    alert("Status is limited to 500 characters.");
    return;
  }

  const name =
    auth.currentUser.displayName ||
    auth.currentUser.email?.split("@")[0] ||
    "User";

  try {
    await addDoc(collection(db, "statuses"), {
      authorId: auth.currentUser.uid,
      authorName: name,
      text: clean,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + STATUS_LIFETIME_MS)
    });

    window.MissApp?.showToast?.("Status posted.", "success");
  } catch (error) {
    console.error("Create status error:", error);
    window.MissApp?.showToast?.("Could not post status.", "error");
  }
}

async function viewStatus(status) {
  const viewer = auth.currentUser?.uid;
  if (!viewer) return;

  const modal = document.createElement("div");
  modal.className = "status-viewer";
  modal.innerHTML = `
    <div class="status-progress"><span></span></div>
    <div class="status-viewer-header">
      <div class="status-avatar">${escapeHtml(getInitial(status.authorName))}</div>
      <div>
        <strong>${escapeHtml(status.authorName || "User")}</strong>
        <small>${escapeHtml(formatAge(status.createdAt))}</small>
      </div>
      <button type="button" aria-label="Close">×</button>
    </div>
    <div class="status-viewer-content">
      <div class="status-text">${escapeHtml(status.text)}</div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector("button").addEventListener("click", () => modal.remove());

  try {
    await addDoc(collection(db, "statuses", status.id, "viewers"), {
      uid: viewer,
      viewedAt: serverTimestamp()
    });
  } catch (error) {
    console.debug("Status viewer tracking unavailable:", error);
  }

  const progress = modal.querySelector(".status-progress span");
  requestAnimationFrame(() => { if (progress) progress.style.width = "100%"; });

  setTimeout(() => modal.remove(), 6000);
}

function getMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatAge(value) {
  const diff = Math.max(0, Date.now() - getMillis(value));
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function getInitial(value) {
  return String(value || "?").trim().charAt(0).toUpperCase() || "?";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
