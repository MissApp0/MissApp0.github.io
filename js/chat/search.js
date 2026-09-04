import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db } from "../firebase.js";

export async function searchUsers(term) {
  if (!term) return [];

  const q = query(
    collection(db, "users"),
    where("key", ">=", term),
    where("key", "<=", term + "\uf8ff"),
    orderBy("key"),
    limit(8)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}
