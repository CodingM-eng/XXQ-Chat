# XXQ Chat — Production Messaging Platform

**XXQ Chat** is a high-performance, multi-platform messaging platform engineered with original branding, a Telegram-inspired ergonomic interaction model, server-enforced whitelist access control, and native clients for Web, Windows Desktop, and Android.

---

## 🌟 Key Features

- **Responsive Web Application**: Sleek dark-mode interface with instant Socket.IO real-time delivery, message state tracking, unread counters, and typing indicators.
- **Secure Admin Web Panel**: Dedicated administrative portal to toggle Whitelist Mode (ON/OFF), approve or revoke user access with confirmation modals, and inspect immutable system audit history.
- **Fail-Closed Whitelist Access Control**: The backend server is the absolute source of truth. When Whitelist Mode is active, non-whitelisted users are blocked at both the REST API and WebSocket handshake layers.
- **Windows Desktop Application**: Packaged standalone Windows `.exe` built on Electron with secure sandboxed renderers, context isolation, single-instance locking, native notification bridges, and window state persistence.
- **Native Android Application**: Kotlin & Jetpack Compose native Android client with edge-to-edge Material 3 theming, adaptive keyboard handling, and back navigation.
- **Backend on Node 24**: Built using native `node:sqlite` (zero node-gyp or C++ compilation issues), Socket.IO, Helmet, rate limiting, and structured logging.
- **CI/CD Pipeline**: GitHub Actions workflows for automated testing, matrix builds, and release packaging for Windows and Android.

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
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │             Node.js 24 + Express + Socket.IO Server            │   │
│   ├───────────────────────────────┬────────────────────────────────┤   │
│   │   Authentication Middleware   │   Whitelist Enforcement Engine │   │
│   │  (Firebase Admin / Dev JWT)   │       (Fail-Closed Policy)     │   │
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
│   │           Embedded SQLite Database (PRAGMA WAL Mode)           │   │
│   │  - System Settings (whitelist_mode)    - Whitelist Directory   │   │
│   │  - User Profiles                       - Audit Logs            │   │
│   │  - Conversations & Participants        - Messages              │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

### Security Decisions

1. **Server-Side Whitelist Enforcement**: A hidden UI is not security. Whitelist mode and membership are verified on every single REST call and WebSocket handshake. If whitelist mode is ON and the user's email is not in the whitelist, the connection is terminated with `403 ACCESS_DENIED_NOT_WHITELISTED`.
2. **Fail-Closed Design**: If the database query or whitelist setting cannot be read, the server defaults to blocking unapproved traffic.
3. **Admin Privilege Isolation**: Only users flagged with `is_admin = 1` in the database can access `/api/admin/*`. Admin actions require confirmation and generate an immutable audit log record.
4. **Initial Administrator Bootstrap**: Designated securely via the `INITIAL_ADMIN_EMAIL` server environment variable on first start. The initial admin account cannot be deleted or revoked via API calls.
5. **Safe Message Rendering**: All message strings are safely escaped and rendered as text/markdown primitives—never evaluated as executable HTML (`dangerouslySetInnerHTML` is prohibited).
6. **Electron Sandbox**: Desktop application runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.

---

## 🚀 Local Development & Quick Start

### Prerequisites

- **Node.js**: Version 22+ or 24+
- **pnpm**: `corepack enable && corepack prepare pnpm@latest --activate`
- **Java**: JDK 17+ or 21+ (for Android builds)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/<your-username>/XXQ-Chat.git
cd XXQ-Chat
pnpm install
```

### 2. Configure Server Environment

Copy `server/.env.example` to `server/.env`:

```env
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173,http://localhost:4000
INITIAL_ADMIN_EMAIL=admin@xxqchat.com
WHITELIST_MODE_DEFAULT=true
DB_PATH=./data/xxq-chat.db
JWT_DEV_SECRET=your-secure-development-secret-key-32-chars
```

### 3. Run Development Servers

```bash
# Start backend server (listening on http://localhost:4000)
pnpm dev:server

# In a second terminal, start the responsive web app (http://localhost:5173)
pnpm dev:web

# Optional: Run desktop app pointing to local dev server
pnpm dev:desktop
```

### 4. Running Automated Tests

```bash
# Run backend verification suite (16 tests covering auth, whitelist, admin, messages)
pnpm test:server

# Run web component test suite
pnpm test:web

# Run Android unit test suite
cd android && ./gradlew testDebugUnitTest
```

---

## 📦 Building Platform Artifacts

### 1. Windows Desktop Application (`.exe`)

```bash
# 1. Build web production bundle
pnpm --filter xxq-chat-web build

# 2. Package desktop executable
pnpm --filter xxq-chat-desktop build
```
- Standalone Executable: `desktop/release/win-unpacked/XXQ Chat.exe`
- Distribution Archive: `release/XXQ-Chat-Windows-x64.zip`

### 2. Android Application (`.apk`)

```bash
cd android
./gradlew assembleDebug
```
- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Ready-to-install artifact: `release/XXQ-Chat-debug.apk`

---

## 🔥 Firebase Setup Guide

XXQ Chat supports Firebase Authentication with Google Sign-In out of the box.

### Web Setup

1. Open the [Firebase Console](https://console.firebase.google.com/) and create a project.
2. In **Authentication > Sign-in method**, enable the **Google** provider.
3. In **Authorized domains**, add your web application domain (e.g., `localhost` for dev, your Render or custom domain for production).
4. Register a Web app in project settings and copy the config to `web/.env`:
   ```env
   VITE_FIREBASE_API_KEY=AIzaSy...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
   VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef
   ```

### Backend Setup (Firebase Admin Token Verification)

To verify Google ID tokens directly against Google servers:
1. In Firebase Console, go to **Project Settings > Service accounts**.
2. Click **Generate new private key** (save securely outside the repository).
3. Set the following environment variables in `server/.env` or Render Dashboard:
   ```env
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

---

## ☁️ Deploying to Render.com

The repository includes a production-ready `render.yaml` Blueprint.

### Step-by-Step Deployment:

1. Push your code to GitHub.
2. Log in to [Render.com](https://render.com).
3. Click **New > Blueprint**.
4. Select your `XXQ-Chat` repository.
5. Render will automatically parse `render.yaml`, set up the Web Service, and attach the persistent disk `/var/data` for SQLite.
6. Verify the service health endpoint: `https://<your-service-name>.onrender.com/health`.

---

## 🛠️ Built-in Testing Personas

When running without live Firebase OAuth keys configured, use the built-in Persona Switcher to test access control instantly:

| Persona | Email | Role | Expected Whitelist Behavior |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@xxqchat.com` | Administrator | Full access to chat and Admin Panel |
| **Alice** | `alice@xxqchat.com` | Whitelisted Member | Allowed into chat when Whitelist is ON |
| **Eve** | `eve@outsider.com` | Unapproved User | **Blocked** with Access Restricted screen when Whitelist is ON; Allowed when Whitelist is OFF |
