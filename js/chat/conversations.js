import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db } from "../firebase.js";
import { state } from "../state.js";


export function conversationId(uid1, uid2) {
  return [uid1, uid2]
    .sort()
    .join("_");
}


/* =========================================================
   LISTEN
========================================================= */

export function listenConversations(render) {

  if (!state.me?.key) {
    console.warn(
      "MissApp: state.me.key is missing"
    );

    return () => {};
  }


  const q = query(
    collection(db, "conversations"),

    where(
      "participantKeys",
      "array-contains",
      state.me.key
    ),

    orderBy(
      "updatedAt",
      "desc"
    ),

    limit(50)
  );


  const unsubscribe =
    onSnapshot(
      q,

      snapshot => {
        render(snapshot.docs);
      },

      error => {
        console.error(
          "Conversation listener:",
          error
        );
      }
    );


  state.unsubscribeConversations =
    unsubscribe;


  return unsubscribe;
}


/* =========================================================
   CREATE / GET CONVERSATION
========================================================= */

export async function getOrCreateConversation(
  otherUser
) {

  if (!state.me) {
    throw new Error(
      "User is not authenticated."
    );
  }


  const id =
    conversationId(
      state.me.uid,
      otherUser.uid
    );


  const conversationRef =
    doc(
      db,
      "conversations",
      id
    );


  const snapshot =
    await getDoc(
      conversationRef
    );


  if (!snapshot.exists()) {

    await setDoc(
      conversationRef,
      {
        participantKeys: [
          state.me.key,
          otherUser.key
        ],

        participants: [
          state.me.uid,
          otherUser.uid
        ],

        participantData: {
          [state.me.uid]: {
            uid: state.me.uid,
            key: state.me.key,
            displayName:
              state.me.displayName,
            email:
              state.me.email
          },

          [otherUser.uid]: {
            uid: otherUser.uid,
            key: otherUser.key,
            displayName:
              otherUser.displayName ||
              otherUser.email ||
              "User",

            email:
              otherUser.email || ""
          }
        },

        lastMessage: "",

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp()
      }
    );
  }


  return {
    id,
    otherUser
  };
}
