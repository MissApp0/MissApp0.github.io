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
import { state } from "../state.js";


export async function searchUsers(term) {

  const key =
    String(term || "")
      .trim()
      .toLowerCase();


  if (!key) {
    return [];
  }


  const q = query(
    collection(db, "users"),
    where("key", ">=", key),
    where("key", "<=", key + "\uf8ff"),
    orderBy("key"),
    limit(8)
  );


  const snapshot =
    await getDocs(q);


  return snapshot.docs.map(userDoc => {

    const data =
      userDoc.data();

    return {
      id: userDoc.id,
      uid: data.uid || userDoc.id,
      email: data.email || "",
      displayName:
        data.displayName ||
        data.email?.split("@")[0] ||
        "User",
      key: data.key || ""
    };

  });

}
