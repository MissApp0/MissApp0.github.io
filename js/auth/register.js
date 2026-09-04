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
  displayName,
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


  const cleanName =
    displayName.trim();


  await updateProfile(user, {
    displayName: cleanName
  });


  await setDoc(
    doc(db, "users", user.uid),
    {
      uid: user.uid,
      email: user.email || "",
      displayName: cleanName,
      key: cleanName.toLowerCase(),
      createdAt: serverTimestamp()
    },
    {
      merge: true
    }
  );


  return credential;
}
