importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Must initialize inside service worker using identical credentials
firebase.initializeApp({
    apiKey: "AIzaSyBYzm3FmCClZ4LBKHVknfK3qLxwyjIfzAA",
  authDomain: "missapp-c099e.firebaseapp.com",
  projectId: "missapp-c099e",
  storageBucket: "missapp-c099e.firebasestorage.app",
  messagingSenderId: "736804728072",
  appId: "1:736804728072:web:f9dbab5560df3ab33590bd",
  measurementId: "G-CFYP2LKMW9"
});

const messaging = firebase.messaging();

// Native browser engine handles rendering when message contains notification payload object
messaging.onBackgroundMessage((payload) => {
    console.log('Received background message ', payload);
});
