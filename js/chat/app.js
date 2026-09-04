import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp
} from
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db } from "../firebase.js";
import { state } from "../state.js";


/* =========================================================
   OPEN CHAT
========================================================= */

export function openChat(conversation) {

  state.currentConversation =
    conversation;


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

  const input =
    document.getElementById(
      "message-input"
    );

  const send =
    document.getElementById(
      "send-button"
    );


  const user =
    conversation.otherUser;


  if (name) {
    name.textContent =
      user.displayName ||
      user.email ||
      "User";
  }


  if (status) {
    status.textContent =
      user.email || "";
  }


  if (avatar) {
    avatar.textContent =
      getInitial(
        user.displayName ||
        user.email
      );
  }


  input?.removeAttribute(
    "disabled"
  );

  send?.removeAttribute(
    "disabled"
  );


  document.body.classList.add(
    "chat-open"
  );


  listenMessages(
    conversation.id
  );
}


/* =========================================================
   MESSAGES
========================================================= */

export function listenMessages(
  conversationId
) {

  state.unsubscribeMessages?.();


  const q = query(
    collection(
      db,
      "conversations",
      conversationId,
      "messages"
    ),

    orderBy(
      "createdAt",
      "asc"
    )
  );


  state.unsubscribeMessages =
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
          "Message listener:",
          error
        );
      }
    );
}


/* =========================================================
   SEND MESSAGE
========================================================= */

export async function sendMessage(
  text
) {

  if (
    !state.me ||
    !state.currentConversation
  ) {
    return;
  }


  const conversationId =
    state.currentConversation.id;


  const messageText =
    text.trim();


  if (!messageText) {
    return;
  }


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
          state.me.uid,

        senderKey:
          state.me.key,

        text:
          messageText,

        createdAt:
          serverTimestamp()
      }
    );


    await updateDoc(
      doc(
        db,
        "conversations",
        conversationId
      ),

      {
        lastMessage:
          messageText,

        updatedAt:
          serverTimestamp()
      }
    );


  } catch (error) {

    console.error(
      "Send message failed:",
      error
    );

    window.MissApp?.showToast?.(
      "Message could not be sent.",
      "error"
    );
  }
}


/* =========================================================
   RENDER
========================================================= */

function renderMessages(
  messages
) {

  const container =
    document.getElementById(
      "messages"
    );

  if (!container) {
    return;
  }


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
    messages.map(
      message => {

        const mine =
          message.senderId ===
          state.me?.uid;


        return `
          <div
            class="message-row ${
              mine
                ? "message-mine"
                : "message-theirs"
            }"
          >

            <div class="message-bubble">
              ${escapeHTML(
                message.text || ""
              )}
            </div>

          </div>
        `;
      }
    ).join("");


  requestAnimationFrame(
    () => {
      container.scrollTop =
        container.scrollHeight;
    }
  );
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

  return String(value)
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
