import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App with dynamic fallbacks for custom deployment contexts (like Vercel)
const config = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string) || firebaseConfig.apiKey,
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || firebaseConfig.authDomain,
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || firebaseConfig.projectId,
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string) || firebaseConfig.storageBucket,
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || firebaseConfig.messagingSenderId,
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string) || firebaseConfig.appId,
};

const app = initializeApp(config);
const auth = getAuth(app);

// Configure Google OAuth provider with scopes
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/userinfo.email');
provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
provider.addScope('https://www.googleapis.com/auth/gmail.modify');
provider.addScope('https://www.googleapis.com/auth/drive.file');

// Forces account selection prompting
provider.setCustomParameters({
  prompt: 'select_account'
});

// Cache variables
let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize Authentication Listener
export const initAuth = (
  onAuthSuccess: (user: User, token: string) => void,
  onAuthFailure: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      // In Firebase Auth, we may need to obtain the provider's token.
      // However, the popup gives us the token on sign-in, which we cache.
      // If we reload, we can retrieve a fresh access token from our cached state, 
      // or from Google. To keep things robust, if cachedAccessToken is not available 
      // upon page reload, we can ask the user to re-sign-in, or we can prompt them.
      if (cachedAccessToken) {
        onAuthSuccess(user, cachedAccessToken);
      } else {
        // If there's no cached token, fallback to failure so they can click connect
        onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure();
    }
  });
};

// Login Trigger
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google access token from sign-in context.');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Firebase PopUp Google Sign-In error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Logout Trigger
export const googleSignOut = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// Token Getter
export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};
