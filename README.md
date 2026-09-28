# MissApp 💬

A modern WhatsApp-style real-time messaging app built as a static web app with **Firebase** and **GitHub Pages**.

MissApp provides real-time chat, user profiles, status updates, notifications, sound effects, and WebRTC voice/video calling without requiring a traditional backend server.

## ✨ Features

- 🔐 Firebase Email/Password authentication
- 👤 User profiles and searchable users
- 💬 Real-time one-to-one messaging
- ⚡ Live Firestore message synchronization
- 🔔 In-app incoming-message notifications
- 🔊 Message, status, and call sounds
- 🌐 Browser notifications when permission is granted
- 🟢 Online/offline presence and last-seen information
- ✍️ Real-time typing indicators
- 🟣 WhatsApp-style status updates
- 👀 Status viewer tracking
- 📞 WebRTC voice and video calls
- 🧊 Firestore-based WebRTC signaling and ICE candidates
- 📱 Responsive mobile and desktop interface
- 🎨 Modern chat, settings, profile, and status UI
- 📦 Installable web-app structure with manifest/service worker support
- 🚀 Static deployment through GitHub Pages

## 🏗️ Architecture

MissApp is intentionally lightweight:

~~~text
GitHub Pages
    │
    ├── index.html
    ├── css/
    └── js/
         │
         ├── Firebase Authentication
         ├── Cloud Firestore
         ├── WebRTC
         └── Browser APIs
                    │
                    ▼
              Firebase Project
~~~

There is no Express server or traditional API server.

### Main technologies

| Technology | Purpose |
|---|---|
| HTML | Application structure |
| CSS | Responsive UI |
| JavaScript | Application logic |
| Firebase Auth | Authentication |
| Cloud Firestore | Users, chats, messages, statuses, signaling |
| WebRTC | Voice/video calls |
| GitHub Pages | Static hosting |

## 📁 Project structure

~~~text
MissApp0.github.io/
│
├── index.html
├── manifest.webmanifest
├── firestore.rules
├── firestore.indexes.json
│
├── css/
│   ├── main.css
│   ├── auth.css
│   ├── chat.css
│   ├── status.css
│   └── settings.css
│
├── js/
│   ├── app.js
│   ├── firebase.js
│   ├── state.js
│   ├── call.js
│   ├── status.js
│   ├── sounds.js
│   └── config.js
│
├── firebase-messaging-sw.js
│
└── functions/
    ├── index.js
    └── package.json
~~~

## 🔥 Firebase setup

### 1. Configure Firebase

Create or open your Firebase project and enable:

- **Authentication**
- **Cloud Firestore**
- **Cloud Messaging** if browser push notifications are required

For authentication:

**Firebase Console → Authentication → Sign-in method → Email/Password**

### 2. Firestore rules

The repository contains the production Firestore rules in:

~~~text
firestore.rules
~~~

Deploy them with:

~~~bash
firebase deploy --only firestore:rules
~~~

You can also paste the contents into:

**Firebase Console → Firestore Database → Rules**

> Changing firestore.rules on GitHub does not automatically change the live Firebase rules unless you deploy them.

### 3. Firestore indexes

Deploy indexes with:

~~~bash
firebase deploy --only firestore:indexes
~~~

### 4. Firebase configuration

The client-side Firebase configuration belongs in the frontend because Firebase web configuration is not a secret.

Do **not** put any of the following into the public repository:

- Firebase Admin private keys
- Service-account JSON files
- Private API credentials
- TURN passwords
- Other server-side secrets

## 🗄️ Firestore data model

~~~text
users/{uid}

statuses/{statusId}
statuses/{statusId}/viewers/{viewerId}

conversations/{conversationId}
    ├── messages/{messageId}
    └── typing/{uid}

calls/{callId}
    ├── callerCandidates/{candidateId}
    └── calleeCandidates/{candidateId}
~~~

### Messages

Messages contain fields such as:

~~~text
senderId
receiver
senderName
text
createdAt
read
~~~

The receiver field is important for MissApp's global incoming-message listener.

## 🔔 Notifications

MissApp has two notification layers.

### In-app notifications

When a new message arrives outside the currently active conversation, MissApp can display a notification at the top of the application and play the incoming-message sound.

### Browser notifications

If the user grants browser notification permission, MissApp can also display a native browser notification while the page is in the background.

Browser notifications depend on:

- HTTPS
- Browser notification permission
- Supported browser APIs
- The page/service worker remaining correctly registered

If notifications are denied, the application can still receive messages through Firestore while the app is running.

## 🔊 Sounds

MissApp includes configurable sounds for:

- Sent messages
- Received messages
- Incoming calls
- Connected calls
- Status activity

Browser autoplay restrictions mean that the user may need to interact with the page once before audio can play.

Sound preferences are stored locally in the browser.

## 📞 Voice and video calls

Calls use:

- RTCPeerConnection
- Firestore signaling
- Caller/callee ICE candidate collections
- STUN servers
- Optional TURN configuration

The current project does **not** include private TURN credentials.

For reliable calling across restrictive NAT/firewall environments, configure a TURN provider through the project's runtime configuration. Never commit long-lived TURN credentials to a public repository.

## 🔐 Security model

Firestore rules enforce authenticated access and ownership.

Examples:

- Users can modify only their own profile.
- Users can publish/delete only their own statuses.
- Conversation participants can access their conversations.
- Messages must be sent by the authenticated sender.
- Call participants can access their own calls.
- Typing indicators are limited to conversation participants.
- Client-side message editing/deletion is disabled by the current rules.

Authentication is based on Firebase Auth UIDs rather than display names.

## 🚀 Deploy to GitHub Pages

### 1. Push the repository

~~~bash
git add .
git commit -m "Update MissApp"
git push
~~~

### 2. Enable GitHub Pages

Open:

**GitHub → Repository → Settings → Pages**

Select:

**Deploy from a branch**

Choose the branch containing the application and the root folder:

~~~text
/(root)
~~~

### 3. Open MissApp

GitHub Pages will provide a URL similar to:

~~~text
https://<username>.github.io/<repository>/
~~~

## 🧪 Local development

MissApp does not require a local Node/Express backend.

For a basic static preview, use any local static server.

For example:

~~~bash
python3 -m http.server 8000
~~~

Then open:

~~~text
http://localhost:8000
~~~

Some browser features, especially service workers and push notifications, behave differently locally. Test production notification behavior on the HTTPS GitHub Pages deployment.

## 🛠️ Firebase CLI

Install the Firebase CLI:

~~~bash
npm install -g firebase-tools
~~~

Authenticate:

~~~bash
firebase login
~~~

Select the Firebase project:

~~~bash
firebase use <your-project-id>
~~~

Deploy Firestore configuration:

~~~bash
firebase deploy --only firestore:rules,firestore:indexes
~~~

If Cloud Functions are configured:

~~~bash
cd functions
npm install
cd ..
firebase deploy --only functions
~~~

## 🐛 Troubleshooting

### Messages work but notifications do not

Check:

1. Browser notification permission.
2. Firebase Authentication state.
3. Firestore rules are actually published.
4. Message documents contain receiver.
5. The page is served over HTTPS for browser push.
6. Browser/OS notification settings are enabled.

### Incoming sound does not play

Check:

1. MissApp sound settings are enabled.
2. Volume is above zero.
3. Browser audio is not muted.
4. Interact with the page once to unlock Web Audio.
5. Check the browser console for audio errors.

### Calls fail

Check:

1. Camera/microphone permissions.
2. HTTPS deployment.
3. Firebase signaling rules.
4. STUN connectivity.
5. TURN configuration if users are behind restrictive NAT/firewalls.

STUN alone cannot guarantee connectivity for every network.

## ⚠️ Important production notes

### Browser background limitations

A normal web page cannot guarantee that JavaScript will continue running forever in a background tab or after the page is closed.

For reliable notifications when the application is not actively open, use a properly configured **Firebase Cloud Messaging service worker/backend flow**.

### TURN credentials

Do not commit TURN usernames/passwords into this public repository.

Use a secure provider or short-lived credentials generated by a protected backend.

### Firestore rules

Always deploy and verify the rules in the actual Firebase project. The GitHub copy is source configuration; it does not automatically update Firebase.

## 📜 License

Add your preferred license before distributing MissApp publicly.

---

## 💙 MissApp

A lightweight real-time messaging experience built with web technologies, Firebase, and WebRTC.
