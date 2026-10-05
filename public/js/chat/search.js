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
        cleanTerm + ""
      ),

      orderBy(
        "key"
      ),

      limit(8)
    );


  const snapshot =
    await getDocs(q);


  return snapshot.docs.map(
    item => {
      const data = item.data() || {};
      return {
        id: item.id,
        ...data,
        uid: data.uid || item.id
      };
    }
  );

}
