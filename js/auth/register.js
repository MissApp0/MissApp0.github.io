import {
  createUserWithEmailAndPassword
} from
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { auth } from "../firebase.js";

export async function register(email, password) {
  return createUserWithEmailAndPassword(
    auth,
    email,
    password
  );
}
