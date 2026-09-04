/* =========================================================
   MissApp
   js/chat/search.js
========================================================= */

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


export async function searchUsers(
  term
) {

  const cleanTerm =
    String(
      term || ""
    )
      .trim()
      .toLowerCase();


  if (!cleanTerm) {
    return [];
  }


  const q =
    query(
      collection(
        db,
        "users"
      ),

      where(
        "key",
        ">=",
        cleanTerm
      ),

      where(
        "key",
        "<=",
        cleanTerm + "\uf8ff"
      ),

      orderBy(
        "key"
      ),

      limit(8)
    );


  const snapshot =
    await getDocs(q);


  return snapshot.docs.map(
    item => ({
      id: item.id,
      ...item.data()
    })
  );

}
