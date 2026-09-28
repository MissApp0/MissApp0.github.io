import { auth, db } from "./firebase.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;
const VIEW_MS = 6000;
let unsubscribeStatuses = null;
let statusCache = [];

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
    <button id="my-status" class="status-item" type="button">
      <div class="status-avatar status-add-avatar">＋</div>
      <div class="status-copy"><strong>My status</strong><span>Tap to add a status</span></div>
    </button>
    <div class="status-subheading">Recent updates</div>
    <div id="status-list" class="status-list"></div>
  `;

  sidebar.querySelector(".sidebar-header")?.after(section);
  document.getElementById("add-status-button")?.addEventListener("click", openComposer);
  document.getElementById("my-status")?.addEventListener("click", openComposer);
}

function listenToStatuses() {
  unsubscribeStatuses?.();

  const q = query(
    collection(db, "statuses"),
    where("expiresAt", ">", Timestamp.now())
  );

  unsubscribeStatuses = onSnapshot(q, snapshot => {
    statusCache = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(status => getMillis(status.expiresAt) > Date.now())
      .sort((a, b) => getMillis(a.createdAt) - getMillis(b.createdAt));

    renderStatusList();
    updateMyStatus();
  }, error => {
    console.error("Status listener error:", error);
    window.MissApp?.showToast?.("Status could not be loaded.", "error");
  });
}

function updateMyStatus() {
  const mine = getMyStatuses();
  const button = document.getElementById("my-status");
  if (!button) return;

  const avatar = button.querySelector(".status-avatar");
  const copy = button.querySelector(".status-copy");

  if (mine.length) {
    button.classList.add("has-status");
    if (avatar) avatar.textContent = "✓";
    if (copy) copy.innerHTML = `<strong>My status</strong><span>${mine.length} update${mine.length === 1 ? "" : "s"} · View yours</span>`;
  } else {
    button.classList.remove("has-status");
    if (avatar) avatar.textContent = "＋";
    if (copy) copy.innerHTML = "<strong>My status</strong><span>Tap to add a status</span>";
  }

  button.onclick = () => mine.length ? openViewer(mine, 0, true) : openComposer();
}

function renderStatusList() {
  const list = document.getElementById("status-list");
  if (!list) return;

  const others = statusCache.filter(status => status.authorId !== auth.currentUser?.uid);
  const grouped = new Map();

  for (const status of others) {
    const existing = grouped.get(status.authorId);
    if (!existing || getMillis(status.createdAt) > getMillis(existing.createdAt)) {
      grouped.set(status.authorId, status);
    }
  }

  const items = [...grouped.values()].sort(
    (a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)
  );

  list.innerHTML = items.length ? items.map(status => `
    <button class="status-item" type="button" data-author-id="${escapeHtml(status.authorId)}">
      <div class="status-avatar status-ring">${escapeHtml(getInitial(status.authorName))}<span class="status-count">${countFor(status.authorId)}</span></div>
      <div class="status-copy">
        <strong>${escapeHtml(status.authorName || "User")}</strong>
        <span>${escapeHtml(formatAge(status.createdAt))}</span>
      </div>
    </button>
  `).join("") : `<div class="status-empty">No new status updates</div>`;

  list.querySelectorAll("[data-author-id]").forEach(button => {
    button.addEventListener("click", () => {
      const statuses = others
        .filter(item => item.authorId === button.dataset.authorId)
        .sort((a, b) => getMillis(a.createdAt) - getMillis(b.createdAt));
      if (statuses.length) openViewer(statuses, 0, false);
    });
  });
}

function getMyStatuses() {
  return statusCache
    .filter(status => status.authorId === auth.currentUser?.uid)
    .sort((a, b) => getMillis(a.createdAt) - getMillis(b.createdAt));
}

function countFor(authorId) {
  return statusCache.filter(item => item.authorId === authorId).length;
}

function openComposer() {
  if (!auth.currentUser) return;

  const modal = document.createElement("div");
  modal.className = "status-composer";
  modal.innerHTML = `
    <div class="status-composer-card">
      <div class="status-composer-header">
        <strong>Create status</strong>
        <button type="button" data-close aria-label="Close">×</button>
      </div>
      <textarea maxlength="500" placeholder="What's on your mind?" autofocus></textarea>
      <div class="status-compose-meta"><span data-counter>0 / 500</span><span>Visible for 24 hours</span></div>
      <div class="status-colors" aria-label="Status background">
        <button type="button" class="active" data-bg="#075e54"></button>
        <button type="button" data-bg="#6b21a8"></button>
        <button type="button" data-bg="#1d4ed8"></button>
        <button type="button" data-bg="#b45309"></button>
        <button type="button" data-bg="#be123c"></button>
      </div>
      <div class="status-composer-actions">
        <button type="button" class="status-secondary" data-close>Cancel</button>
        <button type="button" class="status-primary" data-post>Post status</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  const textarea = modal.querySelector("textarea");
  const counter = modal.querySelector("[data-counter]");
  let background = "#075e54";

  textarea.addEventListener("input", () => {
    counter.textContent = `${textarea.value.length} / 500`;
  });

  modal.querySelectorAll("[data-bg]").forEach(button => {
    button.addEventListener("click", () => {
      background = button.dataset.bg;
      modal.querySelectorAll("[data-bg]").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
    });
  });

  modal.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => modal.remove()));
  modal.querySelector("[data-post]").addEventListener("click", async () => {
    const text = textarea.value.trim();
    if (!text) {
      textarea.focus();
      return;
    }

    const name = auth.currentUser.displayName || auth.currentUser.email?.split("@")[0] || "User";

    try {
      await addDoc(collection(db, "statuses"), {
        authorId: auth.currentUser.uid,
        authorName: name,
        text,
        background,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + STATUS_LIFETIME_MS)
      });
      modal.remove();
      window.MissApp?.showToast?.("Status posted.", "success");
    } catch (error) {
      console.error("Create status error:", error);
      window.MissApp?.showToast?.("Could not post status.", "error");
    }
  });
}

function openViewer(statuses, index, mine) {
  if (!statuses.length) return;

  let current = index;
  const modal = document.createElement("div");
  modal.className = "status-viewer";
  modal.innerHTML = `
    <div class="status-bars"></div>
    <div class="status-viewer-header">
      <div class="status-avatar" data-avatar></div>
      <div class="status-author"><strong data-author></strong><small data-age></small></div>
      <button type="button" data-close aria-label="Close">×</button>
    </div>
    <button class="status-nav status-prev" type="button" data-prev aria-label="Previous status">‹</button>
    <div class="status-viewer-content" data-content>
      <div class="status-text" data-text></div>
    </div>
    <button class="status-nav status-next" type="button" data-next aria-label="Next status">›</button>
    <div class="status-viewer-footer">
      ${mine ? '<button type="button" class="status-delete" data-delete>Delete this status</button>' : '<span>Tap the arrows or wait for the next update</span>'}
    </div>
  `;
  document.body.appendChild(modal);

  let timer = null;
  const bars = modal.querySelector(".status-bars");

  const close = () => {
    clearTimeout(timer);
    modal.remove();
  };

  function render() {
    clearTimeout(timer);
    const status = statuses[current];
    if (!status) return close();

    bars.innerHTML = statuses.map((_, i) => `<span class="${i < current ? "done" : i === current ? "active" : ""}"><i></i></span>`).join("");
    modal.querySelector("[data-author]").textContent = status.authorName || "User";
    modal.querySelector("[data-age]").textContent = formatAge(status.createdAt);
    modal.querySelector("[data-avatar]").textContent = getInitial(status.authorName);
    modal.querySelector("[data-text]").textContent = status.text || "";
    modal.querySelector("[data-content]").style.background = status.background || "#075e54";

    if (!mine) recordView(status);

    const active = modal.querySelector(".status-bars .active i");
    requestAnimationFrame(() => { if (active) active.style.width = "100%"; });
    timer = setTimeout(() => current < statuses.length - 1 ? (current++, render()) : close(), VIEW_MS);
  }

  modal.querySelector("[data-close]").addEventListener("click", close);
  modal.querySelector("[data-prev]").addEventListener("click", () => {
    if (current > 0) { current--; render(); }
  });
  modal.querySelector("[data-next]").addEventListener("click", () => {
    if (current < statuses.length - 1) { current++; render(); }
    else close();
  });

  modal.querySelector("[data-delete]")?.addEventListener("click", async () => {
    const status = statuses[current];
    try {
      await deleteDoc(doc(db, "statuses", status.id));
      statuses.splice(current, 1);
      if (!statuses.length) return close();
      current = Math.min(current, statuses.length - 1);
      render();
      window.MissApp?.showToast?.("Status deleted.", "success");
    } catch (error) {
      console.error("Delete status error:", error);
      window.MissApp?.showToast?.("Could not delete status.", "error");
    }
  });

  render();
}

async function recordView(status) {
  const viewer = auth.currentUser?.uid;
  if (!viewer || viewer === status.authorId) return;
  try {
    await addDoc(collection(db, "statuses", status.id, "viewers"), {
      uid: viewer,
      viewedAt: serverTimestamp()
    });
  } catch (error) {
    console.debug("Status view tracking unavailable:", error);
  }
}

function getMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatAge(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - getMillis(value)) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return "1d ago";
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
