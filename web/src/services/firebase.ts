import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.authDomain
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
const googleProvider = new GoogleAuthProvider();

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
  } catch (err) {
    console.warn('Failed to initialize Firebase app:', err);
  }
}

export async function signInWithGoogle(): Promise<{ idToken: string; email: string; displayName: string; photoURL?: string }> {
  if (!auth) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }

  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;
  const idToken = await user.getIdToken();

  return {
    idToken,
    email: user.email || '',
    displayName: user.displayName || user.email?.split('@')[0] || 'User',
    photoURL: user.photoURL || undefined,
  };
}

export async function signOutFirebase(): Promise<void> {
  if (auth) {
    await firebaseSignOut(auth);
  }
}
