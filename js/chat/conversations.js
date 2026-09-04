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
  addDoc,
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

  const currentUserUid =
    state.user?.uid;


  if (!currentUserUid) {
    throw new Error(
      "You must be logged in to create a conversation."
    );
  }


  if (!otherUserUid) {
    throw new Error(
      "A user UID is required."
    );
  }


  if (currentUserUid === otherUserUid) {
    throw new Error(
      "You cannot create a conversation with yourself."
    );
  }


  /*
    Look for an existing conversation
    containing the current user.
  */
  const q =
    query(
      collection(
        db,
        "conversations"
      ),

      where(
        "participants",
        "array-contains",
        currentUserUid
      )
    );


  const snapshot =
    await getDocs(q);


  /*
    Check client-side that the conversation
    contains exactly these two users.
  */
  const existing =
    snapshot.docs.find(
      doc => {

        const participants =
          doc.data().participants || [];


        return (
          participants.length === 2 &&
          participants.includes(otherUserUid)
        );

      }
    );


  if (existing) {

    return {
      id: existing.id,
      created: false
    };

  }


  /*
    Create a new conversation.
  */
  const conversationRef =
    await addDoc(
      collection(
        db,
        "conversations"
      ),

      {
        participants: [
          currentUserUid,
          otherUserUid
        ],

        createdAt:
          serverTimestamp(),

        lastMessageAt:
          serverTimestamp()
      }
    );


  return {
    id: conversationRef.id,
    created: true
  };

}
