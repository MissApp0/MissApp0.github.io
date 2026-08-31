importScripts(
"https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"
);

importScripts(
"https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js"
);

/* ============================================================
FIREBASE
============================================================ */

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

/* ============================================================
BACKGROUND MESSAGE
============================================================ */

messaging.onBackgroundMessage((payload) => {

```
console.log(
    "[MissApp SW] Background message:",
    payload
);


/*
   Firebase may already display a notification when the
   server sends a notification payload.

   If only a data payload is sent, we create the notification
   ourselves.
*/

const notification =
    payload.notification || {};

const data =
    payload.data || {};


const title =
    notification.title ||
    data.title ||
    "💬 MissApp";


const body =
    notification.body ||
    data.body ||
    "You received a new message.";


const icon =
    notification.icon ||
    data.icon ||
    "./icon-192.png";


const badge =
    notification.badge ||
    data.badge ||
    "./icon-192.png";


/*
   If Firebase supplied a notification payload, the browser
   may already handle displaying it.

   Only explicitly show a notification for data-only messages.
*/

if (!payload.notification) {

    self.registration.showNotification(
        title,
        {
            body,
            icon,
            badge,

            tag:
                data.conversationId ||
                "missapp-message",

            renotify: true,

            data: {
                conversationId:
                    data.conversationId || "",

                sender:
                    data.sender || "",

                url:
                    data.url ||
                    "./"
            }
        }
    );

}
```

});

/* ============================================================
NOTIFICATION CLICK
============================================================ */

self.addEventListener(
"notificationclick",
event => {

```
    event.notification.close();

    const data =
        event.notification.data || {};

    const targetUrl =
        data.url || "./";


    event.waitUntil(

        clients.matchAll({
            type: "window",
            includeUncontrolled: true
        })

        .then(
            clientList => {

                /*
                   If MissApp is already open,
                   focus it instead of opening another tab.
                */

                for (
                    const client of clientList
                ) {

                    if (
                        "focus" in client &&
                        client.url.includes(
                            self.location.origin
                        )
                    ) {

                        return client.focus();

                    }

                }


                /*
                   Otherwise open MissApp.
                */

                if (
                    clients.openWindow
                ) {

                    return clients.openWindow(
                        targetUrl
                    );

                }

            }
        )

    );

}
```

);

/* ============================================================
SERVICE WORKER INSTALL
============================================================ */

self.addEventListener(
"install",
event => {

```
    console.log(
        "[MissApp SW] Installed"
    );

    self.skipWaiting();

}
```

);

/* ============================================================
SERVICE WORKER ACTIVATION
============================================================ */

self.addEventListener(
"activate",
event => {

```
    console.log(
        "[MissApp SW] Activated"
    );

    event.waitUntil(
        self.clients.claim()
    );

}
```

);
