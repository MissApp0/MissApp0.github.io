const express = require("express");
const admin = require("firebase-admin");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 5000;

/* ============================================================
MIDDLEWARE
============================================================ */

app.use(express.json({ limit: "100kb" }));

app.use(
express.static(
path.join(__dirname, "public")
)
);

/* ============================================================
FIREBASE ADMIN INITIALIZATION
============================================================ */

let serviceAccount;

try {

```
/*
   Recommended:
   Store the complete Firebase service-account JSON in:

   FIREBASE_SERVICE_ACCOUNT

   Example:
   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
*/

if (process.env.FIREBASE_SERVICE_ACCOUNT) {

    serviceAccount =
        JSON.parse(
            process.env.FIREBASE_SERVICE_ACCOUNT
        );

}

/*
   Optional compatibility with the old variable name.
*/

else if (process.env.FIREBASE_ADMIN_KEY) {

    serviceAccount =
        JSON.parse(
            process.env.FIREBASE_ADMIN_KEY
        );

}

/*
   Local development.
*/

else {

    serviceAccount =
        require(
            "./serviceAccountKey.json"
        );

}
```

} catch (error) {

```
console.error(
    "Failed to load Firebase credentials:"
);

console.error(error);

process.exit(1);
```

}

admin.initializeApp({
credential:
admin.credential.cert(
serviceAccount
)
});

const db =
admin.firestore();

const messaging =
admin.messaging();

/* ============================================================
HEALTH CHECK
============================================================ */

app.get(
"/api/health",
(req, res) => {

```
    res.json({
        ok: true,
        service: "MissApp",
        firebase: true,
        time: new Date().toISOString()
    });

}
```

);

/* ============================================================
REGISTER FCM TOKEN
============================================================ */

app.post(
"/subscribe",
async (req, res) => {

```
    try {

        const {
            username,
            token,
            language
        } = req.body;


        if (
            typeof username !== "string" ||
            typeof token !== "string"
        ) {

            return res.status(400).json({
                ok: false,
                error:
                    "username and token are required"
            });

        }


        const cleanUsername =
            username
                .trim()
                .toLowerCase();


        if (
            !cleanUsername ||
            !token.trim()
        ) {

            return res.status(400).json({
                ok: false,
                error:
                    "Invalid username or token"
            });

        }


        /*
           Store the token in Firestore instead of RAM.

           This means:
           - tokens survive server restarts
           - multiple server instances work
           - tokens can be managed from Firebase
        */

        await db
            .collection("users")
            .doc(cleanUsername)
            .set(
                {
                    username:
                        username.trim(),

                    token:
                        token.trim(),

                    language:
                        language || "en",

                    notificationMode:
                        "native-push",

                    tokenUpdatedAt:
                        admin.firestore.FieldValue
                            .serverTimestamp()
                },
                {
                    merge: true
                }
            );


        res.json({
            ok: true,
            message:
                "Device registered"
        });

    } catch (error) {

        console.error(
            "Subscribe error:",
            error
        );

        res.status(500).json({
            ok: false,
            error:
                "Could not register device"
        });

    }

}
```

);

/* ============================================================
SEND MISSAPP NOTIFICATION
============================================================ */

app.post(
"/send-miss",
async (req, res) => {

```
    try {

        const {
            sender,
            target,
            body
        } = req.body;


        if (
            typeof sender !== "string" ||
            typeof target !== "string"
        ) {

            return res.status(400).json({
                ok: false,
                error:
                    "sender and target are required"
            });

        }


        const senderName =
            sender.trim();

        const targetKey =
            target
                .trim()
                .toLowerCase();


        if (
            !senderName ||
            !targetKey
        ) {

            return res.status(400).json({
                ok: false,
                error:
                    "Invalid sender or target"
            });

        }


        /*
           Find target user.
        */

        const userSnapshot =
            await db
                .collection("users")
                .doc(targetKey)
                .get();


        if (!userSnapshot.exists) {

            return res.status(404).json({
                ok: false,
                error:
                    "User not found"
            });

        }


        const user =
            userSnapshot.data();


        const token =
            user.token;


        if (
            !token ||
            token === "polling-active"
        ) {

            return res.status(404).json({
                ok: false,
                error:
                    "User has no active push token"
            });

        }


        const notificationBody =
            typeof body === "string" &&
            body.trim()
                ? body.trim()
                : `${senderName} is thinking about you right now! ❤️`;


        /*
           Notification payload.

           Data is also included so the service worker
           can identify the sender/conversation.
        */

        const message = {

            notification: {

                title:
                    `📩 Message from ${senderName}`,

                body:
                    notificationBody

            },

            data: {

                sender:
                    senderName,

                target:
                    targetKey,

                title:
                    `📩 Message from ${senderName}`,

                body:
                    notificationBody,

                url:
                    "/"

            },

            token

        };


        const response =
            await messaging.send(
                message
            );


        res.json({
            ok: true,
            messageId:
                response
        });


    } catch (error) {

        console.error(
            "FCM send error:",
            error
        );


        /*
           FCM token is no longer valid.
           Remove it so future requests don't repeatedly fail.
        */

        if (
            error.code ===
                "messaging/registration-token-not-registered" ||
            error.code ===
                "messaging/invalid-registration-token"
        ) {

            try {

                const target =
                    req.body.target
                        ?.trim()
                        .toLowerCase();

                if (target) {

                    await db
                        .collection("users")
                        .doc(target)
                        .update({
                            token:
                                admin.firestore
                                    .FieldValue
                                    .delete(),

                            notificationMode:
                                "in-app-sync"
                        });

                }

            } catch (cleanupError) {

                console.error(
                    "Token cleanup error:",
                    cleanupError
                );

            }

        }


        res.status(500).json({
            ok: false,
            error:
                "Notification delivery failed"
        });

    }

}
```

);

/* ============================================================
SEND CUSTOM NOTIFICATION
============================================================ */

app.post(
"/api/notify",
async (req, res) => {

```
    try {

        const {
            target,
            title,
            body,
            url
        } = req.body;


        if (
            typeof target !== "string" ||
            typeof title !== "string" ||
            typeof body !== "string"
        ) {

            return res.status(400).json({
                ok: false,
                error:
                    "target, title and body are required"
            });

        }


        const targetKey =
            target
                .trim()
                .toLowerCase();


        const snapshot =
            await db
                .collection("users")
                .doc(targetKey)
                .get();


        if (!snapshot.exists) {

            return res.status(404).json({
                ok: false,
                error:
                    "Target user not found"
            });

        }


        const user =
            snapshot.data();


        if (!user.token) {

            return res.status(404).json({
                ok: false,
                error:
                    "Target has no push token"
            });

        }


        const response =
            await messaging.send({

                notification: {
                    title:
                        title.trim(),

                    body:
                        body.trim()
                },

                data: {

                    title:
                        title.trim(),

                    body:
                        body.trim(),

                    url:
                        url || "/"

                },

                token:
                    user.token

            });


        res.json({
            ok: true,
            messageId:
                response
        });


    } catch (error) {

        console.error(
            "Custom notification error:",
            error
        );

        res.status(500).json({
            ok: false,
            error:
                "Notification failed"
        });

    }

}
```

);

/* ============================================================
REMOVE DEVICE TOKEN
============================================================ */

app.post(
"/unsubscribe",
async (req, res) => {

```
    try {

        const {
            username
        } = req.body;


        if (
            typeof username !== "string"
        ) {

            return res.status(400).json({
                ok: false
            });

        }


        const key =
            username
                .trim()
                .toLowerCase();


        await db
            .collection("users")
            .doc(key)
            .update({

                token:
                    admin.firestore
                        .FieldValue
                        .delete(),

                notificationMode:
                    "in-app-sync",

                tokenRemovedAt:
                    admin.firestore
                        .FieldValue
                        .serverTimestamp()

            });


        res.json({
            ok: true
        });


    } catch (error) {

        console.error(
            "Unsubscribe error:",
            error
        );

        res.status(500).json({
            ok: false
        });

    }

}
```

);

/* ============================================================
404 API HANDLER
============================================================ */

app.use(
"/api",
(req, res) => {

```
    res.status(404).json({
        ok: false,
        error:
            "API endpoint not found"
    });

}
```

);

/* ============================================================
START SERVER
============================================================ */

app.listen(
PORT,
() => {

```
    console.log(
        `🚀 MissApp server running on port ${PORT}`
    );

    console.log(
        `📁 Static files: ${path.join(
            __dirname,
            "public"
        )}`
    );

}
```

);
