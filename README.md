# XXQ Chat — Production Messaging Platform (100% No-Cost Architecture)

**XXQ Chat** is a high-performance, multi-platform messaging platform engineered with original branding, a Telegram-inspired ergonomic interaction model, dark charcoal/purple visual design, full Turkish localization, server-enforced whitelist access control, and native clients for Web, Windows Desktop, and Android.

The production deployment runs on a **100% genuine no-cost architecture** designed for small teams (10–12 users) using Render Free services and Firebase Cloud Firestore (Spark Tier).

---

## 🌟 Key Features

- **Turkish Language Interface**: Entire user-facing interface in Turkish across Web, Desktop, and Android (sign-in, chat, admin panel, alerts, modals).
- **Dark Charcoal & Purple Theme**: Modern near-black/charcoal layered surfaces with elegant purple accents and accessible contrast.
- **Fail-Closed Whitelist Access Control**: The backend server is the absolute source of truth. When Whitelist Mode is active, non-whitelisted users are blocked at both REST API and WebSocket handshake layers.
- **Dual Persistence Engine (Firestore & SQLite)**:
  - **Firebase Cloud Firestore**: Used in production on Render Free. Eliminates persistent disk costs while preserving conversations, users, whitelist, and audit logs.
  - **Embedded SQLite (`node:sqlite`)**: Used for zero-credential local development, rapid prototyping, and automated unit testing.
- **Responsive Web Application**: React 19 + Vite single-page application deployed as a Render static site.
- **Windows Desktop Application**: Standalone `.exe` built with Electron, context isolation, sandboxing, and native notification bridges.
- **Native Android Application**: Kotlin & Jetpack Compose native Android client with Material 3 theming, adaptive keyboard handling, and back navigation.
- **Automated CI/CD**: Repeatable GitHub Actions build and test pipelines for backend, web, Windows desktop, and Android APK.

---

## 🏗️ Architecture & Security Trust Boundaries

```
┌────────────────────────────────────────────────────────────────────────┐
│                              CLIENT TIER                               │
│                                                                        │
│   ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────┐   │
│   │   Web Application   │  │   Windows Desktop   │  │ Android App  │   │
│   │  (React 19 + Vite)  │  │ (Electron + Sandbox)│  │ (Compose MVVM│   │
│   └──────────┬──────────┘  └──────────┬──────────┘  └──────┬───────┘   │
└──────────────┼────────────────────────┼────────────────────┼───────────┘
               │                        │                    │
               ▼                        ▼                    ▼
     HTTPS / WSS (CORS Filtered, Rate-Limited, Token Authenticated)
┌────────────────────────────────────────────────────────────────────────┐
│                              SERVER TIER                               │
│                  (Render Web Service - Plan: Free)                     │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │             Node.js 24 + Express + Socket.IO Server            │   │
│   ├───────────────────────────────┬────────────────────────────────┤   │
│   │   Authentication Middleware   │   Whitelist Enforcement Engine │   │
│   │ (Firebase Token Verification) │       (Fail-Closed Policy)     │   │
│   ├───────────────────────────────┴────────────────────────────────┤   │
│   │           Audit Logger & Admin Authorization Guard             │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
└───────────────────────────────────┼────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                            PERSISTENCE TIER                            │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │  PRODUCTION: Firebase Cloud Firestore (No-Cost Spark Plan)    │   │
│   │  - system_settings (whitelist_mode with 30s cache)             │   │
│   │  - users (profiles & verified admin flags)                     │   │
│   │  - whitelist (approved emails directory)                       │   │
│   │  - conversations & messages (direct chats, history, receipts)  │   │
│   │  - audit_logs (immutable administrative action records)        │   │
│   ├────────────────────────────────────────────────────────────────┤   │
│   │  LOCAL DEV & TESTS: Embedded SQLite (`node:sqlite`)            │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 💰 100% Free-Tier Operating Model (10–12 Users)

This deployment uses strictly zero-cost tiers:

| Component | Platform & Tier | Quota & Limits | Cost |
| :--- | :--- | :--- | :--- |
| **Backend API & Sockets** | **Render Web Service** (`plan: free`) | 512 MB RAM, 0.1 CPU, spun down after 15m idle | **$0.00 / month** |
| **Database** | **Firebase Cloud Firestore** (Spark Plan) | 50,000 reads/day, 20,000 writes/day, 1 GB storage | **$0.00 / month** |
| **Web Frontend** | **Render Static Site** | 100 GB bandwidth/month, global CDN | **$0.00 / month** |
| **Authentication** | **Firebase Authentication** (Spark Plan) | Unlimited Google Sign-In, 50,000 MAU | **$0.00 / month** |
| **Total Monthly Cost** | | | **$0.00 / month** |

### Free-Tier Behavior & Quota Monitoring

1. **Firestore Spark Quota Protection**:
   - Firestore Spark free tier provides **50,000 document reads** and **20,000 document writes** per day.
   - For a team of 10–12 users, daily message activity easily fits within this limit (thousands of messages daily).
   - **In-Memory Caching**: Whitelist state and system settings are cached in server memory with a 30-second TTL (and invalidated on admin updates), preventing thousands of redundant reads per hour.
   - **Quota Exhaustion Safeguard**: If daily free quota is exceeded, Firestore returns `RESOURCE_EXHAUSTED` until the daily reset (00:00 US Pacific Time / 08:00 UTC). Do **NOT** enable Blaze billing to avoid accidental charges.
2. **Render Free Sleep & Cold-Start Latency**:
   - Render spins down free Web Services after 15 minutes of inactivity.
   - The first request to a sleeping server takes **~50 seconds** to wake up.
   - The web, desktop, and Android applications handle this gracefully: Socket.IO clients automatically reconnect with exponential backoff and resume chat delivery once the instance awakens.

---

## ⚙️ Initial Configuration & Deployment

### Step 1: Firebase Project Setup (Spark Plan)

1. Navigate to the [Firebase Console](https://console.firebase.google.com/) and create a project (e.g., `xxq-chat-prod`).
2. **Stay on the Spark Plan** (do not attach a credit card or upgrade to Blaze).
3. **Enable Authentication**:
   - Go to **Build > Authentication > Sign-in method**.
   - Enable **Google** sign-in provider.
   - Under **Authorized domains**, add `localhost` and your Render domains (`xxq-chat-frontend.onrender.com`, `xxq-chat-backend.onrender.com`).
4. **Enable Firestore**:
   - Go to **Build > Firestore Database**.
   - Click **Create Database**.
   - Select **Production mode** (or Native mode) and select your preferred region (e.g. `nam5` or `eur3`).
5. **Generate Backend Service Account**:
   - Go to **Project Settings (gear icon) > Service accounts**.
   - Click **Generate new private key** and download the JSON file securely.
   - Extract `project_id`, `client_email`, and `private_key` (keep these secret; do not commit).
6. **Register Web App**:
   - Go to **Project Settings > General > Your apps > Add app (Web)**.
   - Copy `apiKey`, `authDomain`, and `projectId`.

---

### Step 2: Deploy to Render via Blueprint & Configure Frontend

1. Fork or push this repository to your GitHub account (`CodingM-eng/XXQ-Chat`).
2. Log in to [Render.com](https://render.com).
3. Click **New > Blueprint**.
4. Select the `XXQ-Chat` repository.
5. Render detects `render.yaml` with two free services:
   - `xxq-chat-backend`: Node Web Service (`plan: free`)
   - `xxq-chat-frontend`: Static Site
6. **Configure `xxq-chat-frontend` Environment Variables**:
   In the Render Dashboard (either during Blueprint setup or under **Dashboard > xxq-chat-frontend > Environment**):
   - `VITE_FIREBASE_API_KEY`: `AIzaSyCCk8A6picstXW0qSMCXB75tAuj47BfJps`
   - `VITE_FIREBASE_AUTH_DOMAIN`: `xxq-chat.firebaseapp.com`
   - `VITE_FIREBASE_PROJECT_ID`: `xxq-chat`
   *(Optional additional client properties: `VITE_FIREBASE_STORAGE_BUCKET=xxq-chat.firebasestorage.app`, `VITE_FIREBASE_MESSAGING_SENDER_ID=361932070636`, `VITE_FIREBASE_APP_ID=1:361932070636:web:086c009ce9f7fb68998fc9`, `VITE_FIREBASE_MEASUREMENT_ID=G-CXJNKZYRLG`)*

   > [!NOTE]
   > The Firebase Web API Key is client configuration used by browser SDKs to identify your Firebase project. It is **not** a secret and does not grant administrative privileges (unlike the backend Firebase Admin private key).

7. **Configure `xxq-chat-backend` Environment Variables**:
   Under **Dashboard > xxq-chat-backend > Environment**:
   - `FIREBASE_PROJECT_ID`: `xxq-chat`
   - `FIREBASE_CLIENT_EMAIL`: Your service account client email (from Firebase Console > Service Accounts)
   - `FIREBASE_PRIVATE_KEY`: Your service account private key (from downloaded JSON, kept private and never committed)
   - `INITIAL_ADMIN_EMAIL`: `codingdevelopia@gmail.com`

8. **CRITICAL: Authorize Render Domain in Firebase Authentication**:
   In [Firebase Console](https://console.firebase.google.com/project/xxq-chat/authentication/settings):
   - Go to **Build > Authentication > Settings tab > Authorized domains**.
   - Click **Add domain**.
   - Add your actual Render frontend domain: `xxq-chat-frontend.onrender.com` (or your custom domain if configured).
   - If this domain is not authorized, Google Sign-In popups will fail with `auth/unauthorized-domain`.

9. Click **Apply** or **Manual Deploy > Deploy latest commit**.
10. Once deployed, verify backend health:
   ```bash
   curl https://xxq-chat-backend.onrender.com/health
   ```
   Expected response:
   ```json
   {
     "status": "ok",
     "service": "xxq-chat-server",
     "database": "connected",
     "storageDriver": "firestore",
     "whitelistActive": true
   }
   ```

---

## 💻 Local Development

Local development requires **zero credentials** and runs out-of-the-box using the embedded SQLite engine.

### Prerequisites

- **Node.js**: v22+ or v24+
- **pnpm**: `corepack enable && corepack prepare pnpm@latest --activate`

### 1. Install & Configure

```bash
git clone https://github.com/CodingM-eng/XXQ-Chat.git
cd XXQ-Chat
pnpm install
```

Copy example configs:
```bash
cp server/.env.example server/.env
cp web/.env.example web/.env
```

### 2. Run Development Servers

```bash
# Start backend (port 4000)
pnpm dev:server

# Start web frontend (port 5173)
pnpm dev:web

# Run Windows desktop app locally
pnpm dev:desktop
```

### 3. Run Automated Tests

```bash
# Backend unit & integration tests (23 tests: SQLite, Firestore, Auth, Whitelist, Messaging)
pnpm test:server

# Frontend web component tests
pnpm test:web

# Android unit tests
cd android && ./gradlew testDebugUnitTest
```

---

## 📦 Building Platform Release Artifacts

### 1. Windows Standalone Executable (`.exe`)

```bash
pnpm --filter xxq-chat-web build
pnpm --filter xxq-chat-desktop build
```
- Output directory: `desktop/release/win-unpacked/XXQ Chat.exe`

### 2. Android Standalone APK (`.apk`)

```bash
cd android
./gradlew assembleDebug
```
- Output APK: `android/app/build/outputs/apk/debug/app-debug.apk`

---

---

## 🔒 Security Architecture & Access Control

1. **Server-Enforced Whitelist (Fail-Closed)**: Client-supplied roles or identity claims are never trusted. All access is verified server-side against Firebase Auth and Firestore/SQLite whitelist records. Unapproved users are blocked before active user profiles are created.
2. **Initial Administrator**: `codingdevelopia@gmail.com` is bootstrapped securely on first startup as the primary system administrator and cannot be removed via API calls.
3. **Least-Privilege Google Drive Storage**:
   - Scope is restricted to `https://www.googleapis.com/auth/drive.file`. The app can ONLY access and read files that it created itself; it has zero access to any other files or folders in the administrator's Google Drive.
   - All OAuth refresh tokens are encrypted at rest using AES-256-GCM (`encryptSecret`).
   - File downloads are proxied through authenticated server routes (`GET /api/conversations/:id/attachments/:attachmentId`) verifying conversation membership. No public links are generated.
4. **Telegram Bot Integration & Webhook Security**:
   - Bot tokens are verified with Telegram's `getMe` API and stored encrypted with AES-256-GCM.
   - Webhooks are protected with `X-Telegram-Bot-Api-Secret-Token` verification.
   - Built-in `/stat` command returns strictly safe aggregated metrics (total users, message count, server uptime) and explicitly forbids disclosing phone numbers, tokens, or chat logs.
5. **Role-Based Access Control (RBAC)**:
   - **Administrators**: Can toggle whitelist mode, manage whitelist entries, manage Google Drive connections, add/remove Telegram bots, and assign/revoke moderators.
   - **Moderators**: Can moderate (delete) messages in conversations, but CANNOT toggle whitelist mode, manage Drive tokens, or manage Telegram bots.
   - Actions generate structured, immutable audit logs (`USER_WHITELIST_APPROVED`, `USER_WHITELIST_REVOKED`, `MODERATOR_GRANTED`, `MODERATOR_REVOKED`, `DRIVE_ACCOUNT_CONNECTED`, `TELEGRAM_BOT_ADDED`, etc.).

---

## 🧪 Comprehensive Two-User & Multi-User Verification Guide

To verify end-to-end functionality across authenticated accounts:

### Test 1: Real-Time Messaging & Deduplication (User A & User B)
1. Open two separate browser profiles (or an Incognito window).
2. Log in as **User A** (e.g. `codingdevelopia@gmail.com` or any whitelisted user) and **User B** (another whitelisted user).
3. Start a direct conversation between User A and User B.
4. User A types a message and sends it.
5. **Expected Result**:
   - Message appears immediately on User A's screen (optimistic UI).
   - Message appears on User B's screen in real time without refreshing.
   - Delivery checkmark updates when delivered and read receipts update upon view.
   - Sending duplicate `clientMessageId` returns deduplicated message without double-posting.

### Test 2: Google Drive Attachment Upload & Streaming (User A, User B & Outsider C)
1. As Admin, navigate to **Yönetim Paneli > Google Drive** and connect a Drive account via OAuth authorization code flow.
2. Verify dedicated folder `XXQ Chat` is located/created.
3. In a conversation between User A and User B, click the attachment paperclip icon.
4. Select an image or document (< 25 MB).
5. Send the message with attachment.
6. **Expected Result**:
   - User A and User B can view the thumbnail preview and download the file.
   - Streaming endpoint `GET /api/conversations/:id/attachments/:attachmentId` verifies conversation membership.
   - Outsider User C attempting to fetch the attachment URL receives `403 FORBIDDEN`.

### Test 3: Moderator Role Assignment & Message Moderation
1. As Admin in **Yönetim Paneli > Moderatörler**, assign User B as a Moderator.
2. Audit log records `MODERATOR_GRANTED` targeting User B.
3. In a shared group chat, User A sends a message.
4. User B (as Moderator) hovers over User A's message and clicks the delete trash icon.
5. **Expected Result**:
   - Message is removed for all participants via real-time WebSocket broadcast (`message:deleted`).
   - User B attempts to access `POST /api/admin/whitelist/toggle` and receives `403 FORBIDDEN` (moderators cannot alter whitelist).

### Test 4: Telegram Bot Integration & Safe `/stat`
1. As Admin in **Yönetim Paneli > Telegram Botları**, add a Telegram bot token created via `@BotFather`.
2. Open Telegram and send `/start`, `/yardim`, and `/stat` to the bot.
3. **Expected Result**:
   - Bot responds in Turkish with safe aggregated system metrics.
   - No private phone numbers, private keys, or chat contents are disclosed.
   - Duplicate webhook requests are discarded idempotently.

