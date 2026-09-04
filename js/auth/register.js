import {
  createUserWithEmailAndPassword,
  updateProfile
} from
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { auth, db } from "../firebase.js";


export async function register(
  username,
  email,
  password
) {

  const credential =
    await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

  const user =
    credential.user;


  const cleanUsername =
    username.trim();


  /*
    Keep Firebase Authentication's
    displayName synchronized with
    the application's username.
  */

  await updateProfile(user, {
    displayName: cleanUsername
  });


  /*
    Create the application user document.
  */

  await setDoc(
    doc(
      db,
      "users",
      user.uid
    ),
    {
      uid:
        user.uid,

      email:
        user.email || "",

      username:
        cleanUsername,

      key:
        cleanUsername
          .trim()
          .toLowerCase(),

      language:
        "en",

      lastSeen:
        serverTimestamp(),

      notificationMode:
        "all",

      online:
        true,

      createdAt:
        serverTimestamp()
    },
    {
      merge: true
    }
  );


  return credential;
}
