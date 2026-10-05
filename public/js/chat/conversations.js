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
export async function createGroupConversation(name, memberIds) {
  const currentUserUid = state.user?.uid;
  if (!currentUserUid) throw new Error("You must be logged in to create a group.");
  const uniqueIds = [...new Set([currentUserUid, ...(memberIds || [])].filter(Boolean))];
  if (uniqueIds.length < 3) throw new Error("Choose at least two other people.");
  if (uniqueIds.length > 25) throw new Error("Groups are limited to 25 people.");

  const snapshots = await Promise.all(uniqueIds.map(uid => getDoc(doc(db, "users", uid))));
  const missing = snapshots.findIndex(snapshot => !snapshot.exists());
  if (missing !== -1) throw new Error("One of the selected users could not be found.");

  const participantData = {};
  snapshots.forEach(snapshot => {
    const data = snapshot.data() || {};
    participantData[snapshot.id] = {
      uid: snapshot.id,
      username: data.username || "",
      displayName: data.displayName || data.username || "",
      email: data.email || ""
    };
  });

  const conversationRef = doc(collection(db, "conversations"));
  await setDoc(conversationRef, {
    type: "group",
    name: String(name || "New group").trim().slice(0, 60) || "New group",
    participants: uniqueIds,
    participantData,
    ownerId: currentUserUid,
    lastMessage: "",
    lastMessageAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return { id: conversationRef.id, created: true };
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

  // Find an existing private chat through the user's allowed conversation query.
  const existingSnapshot = await getDocs(query(
    collection(db, "conversations"),
    where("participants", "array-contains", currentUserUid)
  ));
  const existing = existingSnapshot.docs.find(snapshot => {
    const participants = snapshot.data()?.participants;
    return Array.isArray(participants)
      && participants.length === 2
      && participants.includes(otherUserUid);
  });

  if (existing) {
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
