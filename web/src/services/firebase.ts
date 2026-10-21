import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, Auth } from 'firebase/auth';
import { resolveFirebaseConfig, validateFirebaseConfig, FirebaseClientConfig, isElectronEnvironment } from '../config/appConfig';

const activeConfig: FirebaseClientConfig = resolveFirebaseConfig();
const validation = validateFirebaseConfig(activeConfig);

export const isFirebaseConfigured = validation.valid;
export const firebaseConfigurationError = validation.error;

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
const googleProvider = new GoogleAuthProvider();

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(activeConfig as any) : getApps()[0];
    auth = getAuth(app);
  } catch (err: any) {
    console.warn('Failed to initialize Firebase app:', err);
  }
}

export function getClientFirebaseConfig(): FirebaseClientConfig {
  return activeConfig;
}

export async function signInWithGoogle(): Promise<{ idToken: string; email: string; displayName: string; photoURL?: string }> {
  if (!isFirebaseConfigured || !auth) {
    const errorMsg =
      firebaseConfigurationError ||
      'Firebase istemci yapılandırması eksik (apiKey, authDomain veya projectId tanımlanmamış).';
    throw new Error(errorMsg);
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const idToken = await user.getIdToken();

    return {
      idToken,
      email: user.email || '',
      displayName: user.displayName || user.email?.split('@')[0] || 'User',
      photoURL: user.photoURL || undefined,
    };
  } catch (err: any) {
    if (
      err.code === 'auth/operation-not-supported-in-this-environment' ||
      err.message?.includes('location.protocol') ||
      (isElectronEnvironment() && err.code === 'auth/internal-error')
    ) {
      const desktopMsg =
        'Masaüstü uygulamasında Google ile doğrudan web açılır penceresi bu ortamda desteklenmemektedir. Lütfen aşağıdaki "Test Kimliği Seçici" üzerinden giriş yapın veya web tarayıcısı üzerinden XXQ Chat\'i kullanın.';
      const customErr = new Error(desktopMsg);
      (customErr as any).code = 'ELECTRON_POPUP_UNSUPPORTED';
      throw customErr;
    }
    throw err;
  }
}

export async function signOutFirebase(): Promise<void> {
  if (auth) {
    await firebaseSignOut(auth);
  }
}
