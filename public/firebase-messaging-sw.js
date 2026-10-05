importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');
firebase.initializeApp({apiKey:'AIzaSyBYzm3FmCClZ4LBKHVknfK3qLxwyjIfzAA',authDomain:'missapp-c099e.firebaseapp.com',projectId:'missapp-c099e',storageBucket:'missapp-c099e.firebasestorage.app',messagingSenderId:'736804728072',appId:'1:736804728072:web:f9dbab5560df3ab33590bd',measurementId:'G-CFYP2LKMW9'});
const messaging=firebase.messaging();
self.addEventListener('install',()=>self.skipWaiting()); self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
messaging.onBackgroundMessage(payload=>{ if(payload.notification)return; const data=payload.data||{}; self.registration.showNotification(data.title||'💬 MissApp',{body:data.body||'You received a new message.',icon:'./icon.svg',badge:'./icon.svg',tag:data.conversationId||'missapp-message',renotify:true,data:{url:data.url||'./',conversationId:data.conversationId||''}}); });
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const client of list){if(client.url.startsWith(self.location.origin)&&'focus'in client)return client.focus()}return clients.openWindow(event.notification.data?.url||'./')}));});
