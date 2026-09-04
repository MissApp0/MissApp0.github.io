/* =========================================================
   MissApp
   js/chat/conversations.js
========================================================= */

import {
  collection,
  query,
  where,
  onSnapshot
} from
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db } from "../firebase.js";
import { state } from "../state.js";


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
