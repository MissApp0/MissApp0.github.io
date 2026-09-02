# MissApp

A polished, static GitHub Pages real-time messenger backed by **Firebase Authentication, Cloud Firestore, Cloud Messaging, and Cloud Functions**. There is no Express application, API server, or localhost dependency. The deployable web app is [`index.html`](./index.html).

## Architecture and security

- **Identity:** Firebase Email/Password Authentication creates a real UID. A one-time visible username is reserved in `users/{username}` and bound to that UID.
- **Chat data:** `conversations/{sorted_username_pair}`, its `messages` subcollection, and its `typing` subcollection are synchronized with Firestore listeners.
- **Notifications:** the browser obtains an FCM registration token only after the user explicitly enables notifications. A Firestore-triggered Cloud Function sends *data-only* FCM messages. The service worker renders the notification, preventing browser/Firebase duplicate notification behavior.
- **No secrets:** the Firebase web config and VAPID public key are intentionally public. Admin credentials are never committed: Cloud Functions use the deployment environment’s default service account.

> **Username limitation:** A username is a display identifier, not authentication. The rules enforce ownership with Firebase Auth UIDs, so a client cannot claim somebody else’s existing profile. Accounts are recovered by signing in with the same email and password. Configure a password-reset flow or an additional verified provider before a public launch.

## Firebase console setup

1. Open the existing `missapp-c099e` project in the Firebase Console.
2. **Authentication → Sign-in method:** enable **Email/Password** (email and password).
3. **Firestore Database:** create a database in production mode. Deploy the included rules and indexes (steps below).
4. **Cloud Messaging:** in Project settings → Cloud Messaging → Web configuration, add each production GitHub Pages origin (for example `https://your-name.github.io`). The supplied public VAPID key is already embedded in the app.
5. Ensure GitHub Pages is served over HTTPS. FCM and service workers do not work on plain HTTP (except browser localhost development exemptions).

## Deploy Firestore and Cloud Functions

Install the Firebase CLI, authenticate, and select this Firebase project:

```bash
npm install -g firebase-tools
firebase login
firebase use missapp-c099e
firebase deploy --only firestore:rules,firestore:indexes
cd functions && npm install && cd ..
firebase deploy --only functions
```

`functions/index.js` uses Cloud Functions for Firebase v2 and Node.js 20. Firebase provisions its runtime service account automatically; **do not** add a service-account JSON, an Admin private key, or environment secrets to this repository.

## Deploy GitHub Pages

1. Commit all root files to the branch configured for Pages.
2. In GitHub: **Settings → Pages**, select **Deploy from a branch**, then choose the branch and `/ (root)` folder.
3. Visit `https://<owner>.github.io/<repository>/`.
4. The app registers `./firebase-messaging-sw.js` rather than an absolute path, so it works under a repository subpath as well as a custom domain.

The static site includes `manifest.webmanifest` and the text-based `icon.svg`; keep both alongside `index.html` and the service worker.

## Firestore data model

```text
users/{username}
conversations/{lowercaseUserA__lowercaseUserB}
conversations/{conversationId}/messages/{messageId}
conversations/{conversationId}/typing/{username}
```

User profiles include `uid`, visible `username`, normalized `key`, presence (`online`, `lastSeen`), language, creation time, notification preference, and (after opt-in) FCM token. Conversations contain participant username keys and Auth UIDs for access control. Messages contain sender/receiver identifiers and display names, text, server timestamp, and read state.

## Presence and notifications

Presence updates on entry and every minute, and attempts an offline update in `pagehide`. Browser unload events are not guaranteed, so online state is best-effort—not a perfect presence guarantee.

If notification permission is denied, messages still arrive immediately through Firestore live sync and MissApp shows in-app toasts for messages outside the active conversation. To troubleshoot push notifications:

- Verify the site is HTTPS and the page scope includes `firebase-messaging-sw.js`.
- Check browser notification permission and OS-level notification settings.
- Confirm the GitHub Pages origin is allowed in Firebase Cloud Messaging settings.
- Re-enable notifications from the bell button to refresh a token.
- Review Firebase Functions logs with `firebase functions:log`.
- Invalid/expired registration tokens are automatically removed by the function.

## Local static preview (optional)

A local backend is not required. If you need to inspect the page before Pages deploy, use any static-file preview tool; push notifications require a valid configured origin and service-worker support. Production is GitHub Pages + Firebase.
