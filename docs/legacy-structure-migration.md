# Legacy MissApp structure migration

This migration keeps the modular MissApp application as the single active app and brings forward the useful parts of the historical `591d994` structure without reintroducing its separate authentication/data model.

## What is carried forward

- **Legacy visual layer:** `css/legacy-ui.css` remains loaded after the modular styles in both the repository-root and Firebase Hosting entry points. It restores the historical blue/cyan MissApp styling while leaving the current app modules responsible for behavior.
- **Single entry point:** both `index.html` and `public/index.html` load the modular `js/app.js` app, instead of the old standalone username-only page.
- **PWA shell:** both entry points now advertise the existing web manifest and SVG icon, set the MissApp theme color and description, and retain the existing responsive/auth/chat stylesheets.
- **Messaging backend:** the current Firebase Functions message trigger remains the supported notification path. It sends data-only FCM notifications for new conversation messages and cleans up invalid tokens.

## Why the old `public/server.js` is not copied into production

The historical Express server's `/subscribe`, `/send-miss`, `/api/notify`, and `/unsubscribe` routes do not verify Firebase ID tokens or authorize the requested recipient before acting. Reintroducing them as-is would create an unauthenticated notification endpoint and would also couple notifications to the old username-based Firestore schema. The current Firebase Functions flow is the safer compatible replacement; add any new server-side behavior there or behind authenticated, authorized endpoints.

## Compatibility decisions

- Keep Firebase Email/Password authentication and the current UID-based user/conversation records. The old page's username-only/anonymous login is not a drop-in replacement and could split existing accounts.
- Keep the current modular call, group call, settings, themes, sound, and chat code. Do not replace these modules with the older single-file script.
- Keep root and `public/` entry points aligned because GitHub Pages and Firebase Hosting can serve different roots.

## Historical source

The reference snapshot is commit [`591d994`](https://github.com/MissApp0/MissApp0.github.io/tree/591d99424dde742e6f734775c6149616ed4cb869).
