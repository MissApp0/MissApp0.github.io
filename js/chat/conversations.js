/* =========================================================
   MissApp
   js/chat/conversations.js
========================================================= */

import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  getDoc,
  setDoc,
  doc,
  serverTimestamp
} from
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db } from "../firebase.js";
import { state } from "../state.js";


/*
  Listen to the current user's conversations
*/
export function listenConversations(render) {

  if (!state.user?.uid) {
    return null;
  }


  const q =
    query(
      collection(
        db,
        "conversations"
      ),

      where(
        "participants",
        "array-contains",
        state.user.uid
      )
    );


  return onSnapshot(
    q,

    snapshot => {

      const docs =
        [...snapshot.docs];


      /*
        Sort client-side.

        This avoids requiring a composite
        Firestore index immediately.
      */

      docs.sort(
        (a, b) => {

          const aData =
            a.data();

          const bData =
            b.data();


          const aTime =
            aData.lastMessageAt
              ?.toMillis?.() || 0;


          const bTime =
            bData.lastMessageAt
              ?.toMillis?.() || 0;


          return bTime - aTime;

        }
      );


      render(docs);

    },

    error => {

      console.error(
        "Conversation listener error:",
        error
      );

      window.MissApp?.showToast(
        "Could not load conversations.",
        "error"
      );

    }
  );

}


/*
  Create or retrieve a 1-to-1 conversation.

  Returns:
    {
      id: string,
      created: boolean
    }
*/
export async function createConversation(otherUserUid) {
  const currentUserUid = state.user?.uid;

  if (!currentUserUid) {
    throw new Error("You must be logged in to create a conversation.");
  }

  if (!otherUserUid || currentUserUid === otherUserUid) {
    throw new Error("Invalid conversation participant.");
  }

  const conversationId = [currentUserUid, otherUserUid].sort().join("__");
  const conversationRef = doc(db, "conversations", conversationId);
  const existing = await getDoc(conversationRef);

  if (existing.exists()) {
    return { id: existing.id, created: false };
  }

  const [meSnapshot, otherSnapshot] = await Promise.all([
    getDoc(doc(db, "users", currentUserUid)),
    getDoc(doc(db, "users", otherUserUid))
  ]);

  if (!otherSnapshot.exists()) {
    throw new Error("User profile not found.");
  }

  const profile = snapshot => {
    const data = snapshot.data() || {};
    return {
      uid: snapshot.id,
      username: data.username || "",
      displayName: data.displayName || data.username || "",
      email: data.email || ""
    };
  };

  const me = meSnapshot.exists() ? profile(meSnapshot) : { uid: currentUserUid };
  const other = profile(otherSnapshot);

  await setDoc(conversationRef, {
    participants: [currentUserUid, otherUserUid],
    participantData: {
      [currentUserUid]: me,
      [otherUserUid]: other
    },
    lastMessage: "",
    lastMessageAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return { id: conversationId, created: true };
}
