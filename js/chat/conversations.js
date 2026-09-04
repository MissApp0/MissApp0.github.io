import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
} from
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db } from "../firebase.js";
import { state } from "../state.js";

export function listenConversations(render) {
  if (!state.me) return;

  const q = query(
    collection(db, "conversations"),
    where(
      "participantKeys",
      "array-contains",
      state.me.key
    ),
    orderBy("updatedAt", "desc"),
    limit(50)
  );

  return onSnapshot(q, snapshot => {
    render(snapshot.docs);
  });
}
