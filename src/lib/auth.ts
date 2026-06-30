import type { User } from "./types";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { getAppConfig } from "./appConfig";
import { cloudConfigured, getFirebaseAuth } from "./firebase";

export const googleConfigured = (): boolean => {
  const id = getAppConfig().googleClientId;
  return !!id && id.length > 10;
};

function getGoogleClientId(): string | undefined {
  return getAppConfig().googleClientId;
}

interface GoogleCredentialPayload {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

function decodeJwt(token: string): GoogleCredentialPayload {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join(""),
  );
  return JSON.parse(json);
}

// Minimal typing for the Google Identity Services global.
interface GsiButtonOptions {
  type?: string;
  theme?: string;
  size?: string;
  shape?: string;
  text?: string;
  width?: number;
}
interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (resp: { credential: string }) => void;
    auto_select?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: GsiButtonOptions): void;
  disableAutoSelect(): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Sign-In"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** Render the official Google button into a container; resolve with the User. */
export async function renderGoogleButton(
  container: HTMLElement,
  onUser: (user: User) => void,
): Promise<void> {
  const clientId = getGoogleClientId();
  if (!clientId) return;
  await loadGsi();
  const id = window.google!.accounts.id;
  id.initialize({
    client_id: clientId,
    callback: async (resp) => {
      const payload = decodeJwt(resp.credential);
      const user: User = {
        id: `google:${payload.sub}`,
        name: payload.name ?? "Friend",
        email: payload.email,
        picture: payload.picture,
        provider: "google",
      };

      if (cloudConfigured()) {
        try {
          const auth = getFirebaseAuth();
          if (auth) {
            await signInWithCredential(auth, GoogleAuthProvider.credential(resp.credential));
          }
        } catch (e) {
          console.warn("Firebase sign-in failed; using local storage only", e);
        }
      }

      onUser(user);
    },
    auto_select: false,
  });
  id.renderButton(container, {
    type: "standard",
    theme: "outline",
    size: "large",
    shape: "pill",
    text: "continue_with",
    width: 300,
  });
}

export function signOutGoogle() {
  try {
    window.google?.accounts.id.disableAutoSelect();
  } catch {
    /* noop */
  }
}

/** A locally-stored guest identity (stable per device). */
export function makeGuest(name = "Guest"): User {
  let id = localStorage.getItem("upscale:guestId");
  if (!id) {
    id = `guest:${crypto.randomUUID()}`;
    localStorage.setItem("upscale:guestId", id);
  }
  return { id, name, provider: "guest" };
}
