import { useEffect, useState } from "react";
import { projectId, publicAnonKey } from "../utils/supabase/info";

export const API = `https://${projectId}.supabase.co/functions/v1/server/make-server-6aac110b`;
const GOTRUE = `https://${projectId}.supabase.co/auth/v1`;
const KEY = "bet_session";
const EVENT = "bet-auth";

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  name: string;
  email: string;
}

export const readSession = (): Session | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
};

const writeSession = (s: Session | null) => {
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
};

const toSession = (d: any): Session => ({
  access_token: d.access_token,
  refresh_token: d.refresh_token,
  expires_at: d.expires_at ?? Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600),
  name: d.user?.user_metadata?.name ?? "",
  email: d.user?.email ?? "",
});

const grant = async (type: "password" | "refresh_token", body: object) => {
  const r = await fetch(`${GOTRUE}/token?grant_type=${type}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: publicAnonKey },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_code === "invalid_credentials" ? "Email ou mot de passe incorrect" : d.msg || d.error_description || "Connexion impossible");
  return toSession(d);
};

export async function signIn(email: string, password: string) {
  const s = await grant("password", { email: email.trim(), password });
  writeSession(s);
  return s;
}

export const signOut = () => writeSession(null);

export async function getAccessToken(): Promise<string | null> {
  const s = readSession();
  if (!s) return null;
  if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
  try {
    const fresh = await grant("refresh_token", { refresh_token: s.refresh_token });
    writeSession(fresh);
    return fresh.access_token;
  } catch {
    writeSession(null);
    return null;
  }
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return { Authorization: `Bearer ${token ?? publicAnonKey}`, apikey: publicAnonKey };
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(readSession);
  useEffect(() => {
    const sync = () => setSession(readSession());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return session;
}
