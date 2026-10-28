import { useEffect, useState } from "react";
import { publicAnonKey } from "../utils/supabase/info";
import { API } from "./auth";

// Catalogue dynamique : chargé depuis Supabase (Edge Function GET /catalog).
let cache: any[] | null = null;

export function useCatalog<T = any>() {
  const [documents, setDocuments] = useState<T[]>((cache as T[]) ?? []);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API}/catalog`, { headers: { Authorization: `Bearer ${publicAnonKey}` } });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `Erreur serveur (${r.status})`);
        cache = d.documents ?? [];
        if (alive) setDocuments(cache as T[]);
      } catch (e: any) {
        if (alive) setError(e?.message || "Impossible de charger le catalogue");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { documents, loading, error };
}
