# XXQ Chat — Production Messaging Platform (100% No-Cost Architecture)

**XXQ Chat** is a high-performance, multi-platform messaging platform engineered with original branding, a Telegram-inspired ergonomic interaction model, dark charcoal/purple visual design, full Turkish localization, server-enforced whitelist access control, and native clients for Web, Windows Desktop, and Android.

The production deployment runs on a **100% genuine no-cost architecture** designed for small teams (10–12 users) using Render Free services and Firebase Cloud Firestore (Spark Tier).

---

## 🌟 Key Features

- **Turkish Language Interface**: Entire user-facing interface in Turkish across Web, Desktop, and Android (sign-in, chat, admin panel, alerts, modals).
- **Dark Charcoal & Purple Theme + Light Mode**: Default near-black/charcoal layered surfaces with elegant purple accents and accessible contrast, plus a user-selectable Light Theme with state persistence to database and localStorage.
- **WebRTC Screen Sharing**: In-browser real-time screen sharing with STUN signaling for productive meetings and collaborative problem solving.
- **Scoped Turkish Search (Arama)**: Unified search dialog across conversations, messages, and approved users, strictly scoped to authorized conversation history.
- **Profile Photo & Group Logo Persistence**: Local photo uploads and URL validation with instant preview; protects custom avatars from being overwritten by default OAuth pictures.
- **Problem Reporting ("Sorun Bildir")**: In-app feedback and issue reporting system with sanitized system diagnostics (zero secrets) and administrator review panel.
- **Google Drive Storage & Quota Sync**: OAuth configuration status indicators, automated callback receiver, and manual quota synchronization in Admin Panel.
- **Fail-Closed Whitelist Access Control**: The backend server is the absolute source of truth. When Whitelist Mode is active, non-whitelisted users are blocked at both REST API and WebSocket handshake layers.
- **Dual Persistence Engine (Firestore & SQLite)**:
  - **Firebase Cloud Firestore**: Used in production on Render Free. Eliminates persistent disk costs while preserving conversations, users, whitelist, and audit logs.
  - **Embedded SQLite (`node:sqlite`)**: Used for zero-credential local development, rapid prototyping, and automated unit testing (63 tests).
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

## 📞 Birebir Sesli, Görüntülü ve Ekran Paylaşımlı Aramalar (WebRTC)

XXQ Chat, birebir sohbetlerde katılımcıların doğrudan tarayıcı üzerinden yüksek kaliteli ve kesintisiz iletişim kurabilmesi için üç farklı arama modunu destekler:

1. 📞 **Sesli Arama**: Yalnızca mikrofon üzerinden sesli iletişim. Düşük bant genişliği tüketir.
2. 📹 **Görüntülü Arama**: Ön/arka kamera ve mikrofon ile gerçek zamanlı görüntülü görüşme.
3. 🖥️ **Ekran Paylaşımı**: Doğrudan ekran paylaşılarak başlatılan arama; sunumlar, kod incelemeleri ve teknik destek için idealdir.

### Görüşme Özellikleri ve Kontrolleri
- **Gerçek Zamanlı Çağrı Bildirimi**: Arayan kişinin adı, avatarı ve arama türü (Sesli / Görüntülü / Ekran Paylaşımı) anlık olarak ekranda belirir.
- **Çağrı Yönetimi**: "Yanıtla", "Reddet" ve aranan kişi meşgulken otomatik "Meşgul" bildirimleri.
- **Dinamik Medya Değişimi**: Aktif görüntülü arama esnasında aramayı sonlandırmadan ekran paylaşımına geçilebilir (`replaceTrack`) ve istenildiğinde tekrar kameraya dönülebilir.
- **Aktif Kontroller**: Mikrofon susturma/açma, kamera açma/kapatma, tam ekran modu ve canlı görüşme süresi (MM:SS) sayacı.
- **Otomatik Temizlik**: Taraflardan biri görüşmeyi kapattığında veya bağlantı koptuğunda kamera, mikrofon ve WebRTC bağlantıları (`RTCPeerConnection`) bellek sızıntısı olmadan kapatılır.

### STUN / TURN Ağ Mimarisi ve NAT Bilgilendirmesi
- **Sıfır Maliyetli STUN Altyapısı**: Aramalar varsayılan olarak Google'ın genel STUN sunucuları (`stun:stun.l.google.com:19302`) üzerinden çalışır. İlave hiçbir ücretli sunucu gerektirmez.
- **Doğrudan P2P Akışı**: Ev, mobil (4G/5G) ve standart NAT ağlarında ses ve görüntü doğrudan kullanıcılar arasında (Peer-to-Peer) aktarılır, sunucuya yük bindirmez.
- **Simetrik NAT Sınırlaması**: Katı kurumsal güvenlik duvarlarında (Symmetric NAT) doğrudan UDP delme engellenebilir. Bu tür kısıtlı ağlarda röle gerekirse, isteğe bağlı olarak `VITE_TURN_CONFIG` ortam değişkeni ile harici bir TURN sunucusu tanımlanabilir.

---

## 🚀 Canlı Mesajlaşma ve Anlık Teslimat Garantisi

Mesaj teslimatının kesintisiz ve güvenli gerçekleşmesi için uygulanan çekirdek mimari ilkeler:
1. **İndeks Bağımsız Çift Mesaj Doğrulaması**: `clientMessageId` tekilleştirmesi sohbet düzeyinde (`conversations/{id}/messages`) doğrudan tek alanlı dizinle sorgulanır. Firestore konsolunda manuel bileşik dizin açma zorunluluğu ortadan kaldırılmıştır.
2. **Önce Veritabanı, Sonra Yayın**: Mesajlar Socket.IO üzerinden yayınlanmadan önce Firestore/SQLite veritabanına yazılır; veritabanı kaydı onaylanmadan odaya yayın yapılmaz.
3. **Yeniden Bağlantı ve Uyku Kurtarma**: Render Free sunucusu uykudan uyandığında veya internet kesilip geri geldiğinde istemci otomatik olarak `conversation:join` yayını yapar ve okunmamış/yeni mesajları senkronize eder.
4. **Akıllı Backend Tespiti**: Render statik sitesi üzerinde `VITE_API_URL` build zamanında tanımlanmamış olsa dahi `xxq-chat-backend.onrender.com` otomatik olarak hedeflenir.

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

## 🤖 Telegram Bot Entegrasyonu ve Yönetimi

XXQ Chat, yöneticilerin tek tıkla Telegram botu bağlamasını, durumunu yönetmesini ve komut yanıtlarını özelleştirmesini sağlar.

### 1. Bot Oluşturma ve Ekleme
1. Telegram uygulamasında resmi `@BotFather` botunu açın ve `/newbot` komutunu gönderin.
2. Botunuza bir isim ve benzersiz bir `@kullaniciadi` (sonu `bot` ile biten) belirleyin.
3. `@BotFather` tarafından verilen API belirtecini (token) kopyalayın (örn: `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).
4. XXQ Chat Yönetim Paneline gidin: **Yönetim Paneli > Telegram Botları** sekmesine tıklayın.
5. **"+ Telegram Botu Ekle"** butonuna tıklayarak belirteci yapıştırın.
6. Sunucu, Telegram API'sinin `getMe` metodunu çağırarak belirteci anında doğrular, bot adını ve `@kullaniciadi` bilgisini kaydeder.
7. Belirteç, sunucu tarafında **AES-256-GCM** ile şifrelenerek saklanır. Belirteç asla ön yüze döndürülmez, günlüklere (log) yazılmaz veya GitHub'a gönderilmez.

### 2. Önemli Telegram API Kısıtlaması (Uyarı)
> [!IMPORTANT]
> **Telegram Botları Kendiliğinden İletişim Başlatamaz:**
> Telegram platformunun gizlilik ve spam koruma kuralları gereği, bir bot hiçbir zaman bir Telegram kullanıcısına ya da başka bir bota kendiliğinden ilk mesajı gönderemez.
> Bir botun komutları yanıtlayabilmesi veya mesaj gönderebilmesi için, gerçek bir Telegram kullanıcısının ilgili botu açıp (`https://t.me/<bot_kullanici_adi>`) bota ilk olarak **`/start`** komutunu göndermiş olması **zorunludur**.

### 3. Yerleşik ve Özel Komutlar
- **`/start`**: Kullanıcıyı karşılar, botun XXQ Chat sistemine bağlı olduğunu doğrular ve yardım menüsünü sunar.
- **`/yardim`**: Kullanılabilir tüm yerleşik ve yönetici tanımlı komutları listeler.
- **`/stat`**: Güvenli, toplanmış (aggregated) sistem metriklerini döndürür (kayıtlı kullanıcı sayısı, onaylı kullanıcılar, toplam mesaj sayısı, whitelist modu durumu).
  - *Gizlilik Güvencesi:* `/stat` çıktısında hiçbir zaman telefon numarası, şifreli anahtarlar, belirteçler veya kişisel sohbet içerikleri yer almaz.
- **Özel Komutlar (Custom Commands)**: Yönetici paneli üzerinden bota özel metin tabanlı komutlar ve yanıtlar eklenebilir. Güvenlik gereği kesinlikle harici kod (eval/script) çalıştırılmaz; yalnızca güvenli metin yanıtları döndürülür.

### 4. Yönetim ve Yaşam Döngüsü Kontrolleri
- **Test Et**: Bot kimlik bilgilerini (`getMe`) ve Render üzerindeki canlı HTTPS webhook durumunu (`getWebhookInfo`, bekleyen güncelleme sayısı, son hata kaydı) anlık olarak sorgular.
- **Durdur / Başlat**: Bot durdurulduğunda Telegram API `deleteWebhook` metodu çağrılarak Render üzerindeki webhook kaydı temizlenir ve gereksiz istek trafiği önlenir. Başlatıldığında webhook gizli belirteçle (`X-Telegram-Bot-Api-Secret-Token`) yeniden kurulur.
- **Komutlar**: Botun komut listesini ve açıklamalarını düzenleme imkanı sunar.
- **Belirteci Yenile (Token Rotation)**: `@BotFather` üzerinden belirteç sıfırlandığında, eski belirteci silip yenisini doğrulayarak sistemi kesintisiz günceller.
- **Sil**: Bot kaydını ve Telegram API webhookunu tamamen kaldırır.

### 5. Render Ortam Değişkenleri
Telegram webhookunun çalışabilmesi için Render backend servisinizde aşağıdaki değişkenler tanımlıdır:
- `SERVER_BASE_URL`: `https://xxq-chat-backend.onrender.com` (Telegram'a bildirilecek HTTPS webhook URL'si için kullanılır).
- `ENCRYPTION_KEY`: Bot belirteçlerini AES-256-GCM ile şifrelemek için kullanılan 32 karakterlik anahtar (Render tarafından otomatik üretilir).

---

## 📁 Google Drive OAuth 2.0 Entegrasyonu ve Kurulum Kılavuzu

XXQ Chat, sohbetlerde paylaşılan dosya eklerini (belgeler, görseller, ses ve videolar) güvenli bir şekilde saklamak için Google Drive entegrasyonunu destekler. Dosyalar, yöneticinin Google Drive hesabında otomatik oluşturulan özel bir **XXQ Chat** klasöründe saklanır.

### 1. Google Cloud Console Yapılandırması

Google Drive entegrasyonunu etkinleştirmek için Google Cloud Console üzerinde aşağıdaki adımları tamamlayın:

1. **Google Cloud Console'a Giriş Yapın**: [console.cloud.google.com](https://console.cloud.google.com/) adresine gidin ve projenizi seçin (veya yeni bir proje oluşturun).
2. **Google Drive API'yi Etkinleştirin**:
   - Sol menüden **APIs & Services (API'ler ve Hizmetler) > Library (Kitaplık)** sekmesine gidin.
   - Arama kutusuna `Google Drive API` yazın ve **Enable (Etkinleştir)** butonuna tıklayın.
3. **OAuth Onay Ekranını (Consent Screen) Yapılandırın**:
   - **APIs & Services > OAuth consent screen** sekmesine gidin.
   - User Type olarak **External (Harici)** seçin (veya Google Workspace kullanıyorsanız Internal).
   - Uygulama adını (örn: `XXQ Chat`), kullanıcı destek e-postasını ve geliştirici iletişim bilgilerini girin.
   - **Scopes (Kapsamlar)** adımında `https://www.googleapis.com/auth/drive.file` kapsamını ekleyin.
   - Uygulamanız Test modundaysa, **Test Users (Test Kullanıcıları)** listesine Drive hesabını bağlayacak yönetici e-posta adresini (`codingdevelopia@gmail.com`) ekleyin.
4. **OAuth 2.0 İstemci Kimliği (Client ID) Oluşturun**:
   - **APIs & Services > Credentials (Kimlik Bilgileri)** sekmesine gidin.
   - **+ CREATE CREDENTIALS (+ KİMLİK BİLGİSİ OLUŞTUR)** butonuna tıklayın ve **OAuth client ID** seçeneğini seçin.
   - **Application type (Uygulama türü)**: `Web application` (Web uygulaması).
   - **Name (Ad)**: `XXQ Chat Web Client`.
   - **Authorized redirect URIs (Yetkili yönlendirme URI'leri)** alanına **BİREBİR** şu adresi ekleyin:
     ```text
     https://xxq-chat-backend.onrender.com/api/drive/callback
     ```
     *(Yerel geliştirme yapıyorsanız ek olarak `http://localhost:4000/api/drive/callback` ekleyebilirsiniz).*
   - **CREATE (OLUŞTUR)** butonuna tıklayın. Açılan pencereden **Client ID** ve **Client Secret** değerlerini kopyalayın.

### 2. Render Ortam Değişkenleri (Environment Variables)

Render Dashboard üzerinde **xxq-chat-backend** servisinizin **Environment** sekmesine gidin ve aşağıdaki değişkenleri tanımlayın:

| Değişken Adı | Zorunlu? | Açıklama ve Değer |
| :--- | :--- | :--- |
| `GOOGLE_DRIVE_CLIENT_ID` | **Evet** | Google Cloud Console'dan alınan istemci kimliği (örn. `xxxx.apps.googleusercontent.com`). |
| `GOOGLE_DRIVE_CLIENT_SECRET` | **Evet** | Google Cloud Console'dan alınan gizli anahtar (örn. `GOCSPX-xxxx`). |
| `GOOGLE_DRIVE_REDIRECT_URI` | **Evet** | `https://xxq-chat-backend.onrender.com/api/drive/callback` |
| `ENCRYPTION_KEY` | **Evet** | Refresh token'larını AES-256-GCM ile şifrelemek için kullanılan 32 karakterlik anahtar (Render otomatik üretir). |

> [!WARNING]
> Gerçek kimlik bilgilerini (`CLIENT_SECRET`, `ENCRYPTION_KEY`, `REFRESH_TOKEN`) ASLA Git deposuna commit etmeyin, günlüklere (log) basmayın veya istemci koduna dahil etmeyin.

### 3. Yönetici Onayı ve Bağlantının Tamamlanması

Ortam değişkenleri tanımlandıktan sonra bağlantı süreci şu şekilde tamamlanır:
1. Bir sistem yöneticisi olarak XXQ Chat uygulamasına giriş yapın (`codingdevelopia@gmail.com`).
2. Sol alt menüden **Yönetim Paneli**'ni açın ve **Google Drive** sekmesine geçin.
3. Eğer ortam değişkenleri eksikse panel, eksik anahtarları kırmızı/sarı uyarı kutusunda net bir şekilde listeler ve yönlendirme URI'sini gösterir.
4. Değişkenler eksiksiz tanımlandığında **"Drive Ekle"** butonuna tıklayın.
5. **"Google ile Yetkilendir"** bağlantısına tıklayarak Google oturum açma ve izin ekranında `XXQ Chat` klasörü erişimine onay verin.
6. Google yönlendirme penceresinden dönen yetkilendirme kodunu (`code`) modal pencereye yapıştırıp **"Bağlantıyı Tamamla"** butonuna basın (veya otomatik yönlendirme akışını kullanın).
7. Bağlantı başarıyla kurulduğunda Google Drive hesabı, e-posta adresi ve depolama alanı kotası yönetim panelinde listelenir.

### 4. Güvenlik ve Gizlilik Mimarisi

- **En Az Ayrıcalık Kuralı (`drive.file`)**: XXQ Chat, kullanıcının veya yöneticinin kişisel Drive dosyalarına kesinlikle erişemez. Yalnızca uygulamanın kendisi tarafından oluşturulan `XXQ Chat` klasörünü ve bu klasör altındaki sohbet eklerini okuyabilir ve yönetebilir.
- **CSRF Korumalı OAuth Akışı**: Yetkilendirme isteği başlatılırken 24 baytlık kriptografik ve süreli `state` parametresi oluşturulur ve callback sırasında doğrulanır.
- **AES-256-GCM Şifreleme**: Alınan OAuth yenileme belirteçleri (refresh token), veritabanına yazılmadan önce sunucu tarafında AES-256-GCM ile şifrelenir (`encryptSecret`).
- **Yetkili İndirme Akışı**: Yüklenen dosyalara ait genel/halka açık (public) bağlantı oluşturulmaz. Dosyalar, yalnızca ilgili sohbette yer alan kullanıcılar tarafından `GET /api/conversations/:id/attachments/:attachmentId` rotası üzerinden üyelik doğrulanarak indirilebilir.

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

### Test 5: Scoped Search & Privacy Verification
1. User A sends a private message with specific keyword ("ProjeXXQ2026") in a direct chat with User B.
2. User A opens the Search dialog (**Arama**) and searches for "ProjeXXQ2026". The message is found.
3. Outsider User C logs in and searches for "ProjeXXQ2026".
4. **Expected Result**: User C receives zero matching messages because search is strictly isolated to authorized conversations.

### Test 6: In-App Problem Reporting ("Sorun Bildir")
1. Any logged-in user clicks the **Sorun Bildir** button in the header.
2. Fills in the Turkish issue title, description, and reviews the auto-collected client diagnostics.
3. Submits the report.
4. As Administrator, navigate to **Yönetim Paneli > Sorun Bildirimleri**.
5. **Expected Result**: The report is listed with timestamp, user email, and diagnostics. Admin can update status to "İnceleniyor" or "Çözüldü".

### Test 7: Dark / Light Theme Toggle & Persistence
1. Click the Sun/Moon theme button in the header to switch to Light Theme.
2. Observe all UI surfaces adapt with high contrast and readable typography.
3. Refresh the browser page or log out and log back in.
4. **Expected Result**: Theme preference remains preserved across page reloads and device switches.

### Test 8: WebRTC Screen Sharing
1. In an active conversation between User A and User B, User A clicks **Ekran Paylaş**.
2. Browser prompts for window/screen selection.
3. **Expected Result**: Live video track is transmitted through WebRTC signaling and displayed with full control in the modal.

