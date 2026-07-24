import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "./firebase";

/** Firestore document id for the signed-in Firebase user (matches security rules). */
export function activeFirestoreUid(): string | null {
  return getFirebaseAuth()?.currentUser?.uid ?? null;
}

/** Wait until Firebase Auth restores (or establishes) a session, up to maxMs. */
export function waitForFirebaseAuth(maxMs = 5000): Promise<boolean> {
  const auth = getFirebaseAuth();
  if (!auth) return Promise.resolve(false);
  if (auth.currentUser) return Promise.resolve(true);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      unsub();
      resolve(!!auth.currentUser);
    }, maxMs);
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        clearTimeout(timeout);
        unsub();
        resolve(true);
      }
    });
  });
}
