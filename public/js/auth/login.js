import {
  signInWithEmailAndPassword
} from
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { auth } from "../firebase.js";

export async function login(email, password) {
  return signInWithEmailAndPassword(
    auth,
    email,
    password
  );
}
