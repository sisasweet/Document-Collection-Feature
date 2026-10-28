import { useEffect, useState } from "react";
import { API, authHeaders, signIn, signOut, useSession } from "./auth";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.12em",
  color: "#6b6458",
  marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#1c1a16",
  border: "1px solid #2e2b25",
  color: "#f0ead8",
  padding: "11px 14px",
  fontSize: 14,
  fontFamily: "var(--font-body)",
  outline: "none",
};
const ctaStyle: React.CSSProperties = {
  width: "100%",
  background: "#c9a84c",
  color: "#0e0d0b",
  border: "none",
  padding: "14px 24px",
  fontFamily: "var(--font-body)",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.08em",
  cursor: "pointer",
};

export function AuthModal({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signIn(email, password);
      onDone?.();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#161410", border: "1px solid #2e2b25", maxWidth: 420, width: "100%", padding: 28, display: "flex", flexDirection: "column", gap: 16 }}
      >
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.15em", color: "#c9a84c", marginBottom: 4 }}>MON COMPTE</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color: "#f0ead8" }}>Connexion</div>
        </div>
        <div>
          <label style={labelStyle}>ADRESSE EMAIL</label>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>MOT DE PASSE</label>
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
        </div>
        {error && (
          <div style={{ background: "rgba(192,57,43,0.12)", border: "1px solid rgba(192,57,43,0.4)", padding: "10px 14px", fontSize: 13, color: "#f87171" }}>{error}</div>
        )}
        <button type="submit" disabled={loading} style={{ ...ctaStyle, opacity: loading ? 0.5 : 1 }}>
          {loading ? "CONNEXION…" : "SE CONNECTER"}
        </button>
        <div style={{ fontSize: 12, color: "#6b6458", lineHeight: 1.6 }}>
          Pas encore de compte ? Il est créé automatiquement lors de votre premier achat.
        </div>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#6b6458", fontSize: 12, cursor: "pointer" }}>
          Fermer
        </button>
      </form>
    </div>
  );
}

interface AccountDoc {
  id: number;
  title: string;
  category: string;
  subcategory?: string;
  folder: string;
  format: string;
  image: string;
}

export default function AccountPage({ documents }: { documents: AccountDoc[] }) {
  const session = useSession();
  const [docIds, setDocIds] = useState<number[] | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) {
      setDocIds(null);
      setShowLogin(true);
      return;
    }
    let live = true;
    (async () => {
      try {
        const r = await fetch(`${API}/my-documents`, { headers: await authHeaders() });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Chargement impossible");
        if (live) setDocIds(d.docIds);
      } catch (e: any) {
        if (live) setError(e.message);
      }
    })();
    return () => {
      live = false;
    };
  }, [session?.access_token]);

  const download = async (id: number) => {
    setBusy(id);
    setError("");
    try {
      const r = await fetch(`${API}/my-download/${id}`, { headers: await authHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Téléchargement impossible");
      (d.files as { name: string; url: string }[]).forEach((f, i) =>
        setTimeout(() => {
          const a = document.createElement("a");
          a.href = f.url;
          a.download = f.name;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }, i * 600),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const owned = documents.filter((d) => docIds?.includes(d.id));
  const home = window.location.pathname;

  return (
    <div style={{ minHeight: "100vh", background: "#0e0d0b", color: "#f0ead8" }}>
      <header style={{ borderBottom: "1px solid #2e2b25", padding: "0 40px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href={home} style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "#f0ead8", textDecoration: "none" }}>
          BET BENAMRAOUI
        </a>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <a href={home} style={{ fontSize: 13, color: "#a09585", textDecoration: "none" }}>← Boutique</a>
          {session && (
            <button onClick={signOut} style={{ background: "none", border: "1px solid #2e2b25", color: "#a09585", padding: "7px 14px", fontSize: 12, cursor: "pointer" }}>
              Déconnexion
            </button>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "56px 24px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.15em", color: "#c9a84c", marginBottom: 8 }}>MON COMPTE</div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600, margin: 0 }}>
          {session?.name ? `Bonjour, ${session.name}` : "Mes documents"}
        </h1>
        {session && <div style={{ color: "#6b6458", fontSize: 13, marginTop: 6 }}>{session.email}</div>}

        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "#a09585", margin: "40px 0 16px" }}>
          DOCUMENTS DÉBLOQUÉS {docIds ? `(${owned.length})` : ""}
        </div>

        {error && (
          <div style={{ background: "rgba(192,57,43,0.12)", border: "1px solid rgba(192,57,43,0.4)", padding: "10px 14px", fontSize: 13, color: "#f87171", marginBottom: 16 }}>{error}</div>
        )}

        {session && docIds === null && !error && <div style={{ color: "#6b6458", fontSize: 14 }}>Chargement…</div>}

        {docIds && owned.length === 0 && (
          <div style={{ border: "1px dashed #2e2b25", padding: 32, color: "#a09585", fontSize: 14, lineHeight: 1.7 }}>
            Aucun document pour le moment. Si vous venez de payer, patientez quelques secondes puis rechargez la page.
            <div style={{ marginTop: 16 }}>
              <a href={home} style={{ color: "#c9a84c" }}>Parcourir la collection →</a>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {owned.map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 16, background: "#161410", border: "1px solid #2e2b25", padding: 12 }}>
              <img src={d.image} alt="" style={{ width: 88, height: 66, objectFit: "cover", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>{d.title}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "#6b6458", marginTop: 4 }}>
                  {[d.category, d.subcategory, d.folder, d.format].filter(Boolean).join(" · ").toUpperCase()}
                </div>
              </div>
              <button
                onClick={() => download(d.id)}
                disabled={busy === d.id}
                style={{ ...ctaStyle, width: "auto", padding: "11px 20px", opacity: busy === d.id ? 0.5 : 1 }}
              >
                {busy === d.id ? "…" : "TÉLÉCHARGER"}
              </button>
            </div>
          ))}
        </div>
      </main>

      {showLogin && !session && (
        <AuthModal onClose={() => setShowLogin(false)} />
      )}
      {!session && !showLogin && (
        <div style={{ textAlign: "center", padding: 24 }}>
          <button onClick={() => setShowLogin(true)} style={{ ...ctaStyle, width: "auto" }}>SE CONNECTER</button>
        </div>
      )}
    </div>
  );
}
