import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Deliberately the default in-memory cache, not persistentLocalCache().
//
// IndexedDB persistence was measured at +20.7 kB gzip on the main bundle, and it
// does not reduce reads for how this app queries: getDocs() still goes to the
// server unless the client is offline. Repeat reads are cut by the TTL cache in
// utils/firestore.js instead, which costs nothing to ship.
//
// Worth revisiting only for offline support — if staff need to mark attendance
// on an unreliable connection, swap this for initializeFirestore() with
// persistentLocalCache({ tabManager: persistentMultipleTabManager() }) and
// accept the bundle cost.
export const db = getFirestore(app);

export default app;
