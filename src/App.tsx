import { useState, useEffect, useCallback } from "react";
import { publicAnonKey } from "../utils/supabase/info";
import { API, authHeaders, signIn, signOut, useSession } from "./auth";
import AccountPage, { AuthModal } from "./account";
import AdminPage from "./admin";
import { useCatalog } from "./catalog";

const AUTH = { Authorization: `Bearer ${publicAnonKey}` };

// ─── Types ────────────────────────────────────────────────────────────────────
type CategoryName = "Équipements" | "Habitat" | "Aménagement";
type Category = "Tous" | CategoryName;
type FolderName = "Dessin 2D" | "Modélisation 3D" | "Images 3D" | "Rapport écrit";

interface Document {
  id: number;
  title: string;
  category: CategoryName;
  subcategory?: string;
  folder: FolderName;
  description: string;
  price: number;
  pages: number;
  format: string;
  image: string;
  tags: string[];
  featured?: boolean;
}

type PaymentStep = "details" | "method" | "baridimob" | "bank" | "confirmation";
type PaymentMethod = "baridimob" | "bank" | null;

// ─── Data ─────────────────────────────────────────────────────────────────────
// Le catalogue est chargé dynamiquement depuis Supabase (GET /catalog).


const CATEGORIES: Category[] = ["Tous", "Équipements", "Habitat", "Aménagement"];

const SUBCATEGORIES: Record<CategoryName, string[]> = {
  Équipements: ["Scolaire", "Sport", "Santé / Loisir", "Divers"],
  Habitat: ["Collectif", "Individuel"],
  Aménagement: [],
};

const FOLDERS: FolderName[] = ["Dessin 2D", "Modélisation 3D", "Images 3D", "Rapport écrit"];

const pathLabel = (d: Document) =>
  [d.category, d.subcategory, d.folder].filter(Boolean).join(" › ");

const sizeLabel = (d: Document) =>
  d.folder === "Modélisation 3D" ? "1 fichier" : d.folder === "Images 3D" ? `${d.pages} images` : `${d.pages} pages`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function LockIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function DownloadIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Document Card ─────────────────────────────────────────────────────────────
function DocumentCard({ doc, onClick }: { doc: Document; onClick: () => void }) {
  return (
    <div
      className="doc-card group cursor-pointer"
      onClick={onClick}
      style={{
        background: "#1c1a16",
        border: "1px solid #2e2b25",
        transition: "border-color 0.25s, box-shadow 0.25s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "#c9a84c";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 1px rgba(201,168,76,0.15), 0 8px 32px rgba(0,0,0,0.5)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "#2e2b25";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      {/* Image with lock overlay */}
      <div style={{ position: "relative", overflow: "hidden", height: 200, background: "#111" }}>
        <img
          src={doc.image}
          alt={doc.title}
          className="doc-image"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transition: "transform 0.4s ease",
            filter: "brightness(0.55) saturate(0.6)",
          }}
        />
        {/* Watermark */}
        <div className="watermark-text" />
        {/* Lock overlay */}
        <div
          className="doc-overlay"
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0,
            transition: "opacity 0.25s",
          }}
        >
          <div style={{
            background: "rgba(201,168,76,0.9)",
            color: "#0e0d0b",
            padding: "10px 20px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.05em",
          }}>
            <LockIcon size={15} />
            OBTENIR CE DOCUMENT
          </div>
        </div>
        {/* Category badge */}
        <div style={{
          position: "absolute",
          top: 12,
          right: 12,
          background: "rgba(201,168,76,0.15)",
          border: "1px solid rgba(201,168,76,0.3)",
          color: "#c9a84c",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.1em",
          padding: "3px 8px",
          fontFamily: "var(--font-mono)",
        }}>
          {doc.folder.toUpperCase()}
        </div>
        {/* Lock icon always visible */}
        <div style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          color: "rgba(201,168,76,0.7)",
        }}>
          <LockIcon size={18} />
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 20px 18px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "#a09585", marginBottom: 8 }}>
          {[doc.category, doc.subcategory].filter(Boolean).join(" › ").toUpperCase()}
        </div>
        <h3 style={{
          fontFamily: "var(--font-display)",
          fontSize: 16,
          fontWeight: 600,
          color: "#f0ead8",
          lineHeight: 1.4,
          marginBottom: 10,
        }}>
          {doc.title}
        </h3>
        <p style={{
          fontSize: 13,
          color: "#6b6458",
          lineHeight: 1.65,
          marginBottom: 16,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {doc.description}
        </p>

        {/* Meta row */}
        <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: "#6b6458", fontFamily: "var(--font-mono)" }}>
            {sizeLabel(doc)}
          </span>
          <span style={{ fontSize: 11, color: "#6b6458", fontFamily: "var(--font-mono)" }}>
            {doc.format}
          </span>
        </div>

        {/* Price + CTA */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{
            fontFamily: "var(--font-display)",
            fontSize: 24,
            fontWeight: 700,
            color: "#c9a84c",
          }}>
            {doc.price} €
          </span>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "#6b6458",
            fontSize: 12,
          }}>
            <LockIcon size={12} />
            <span>Accès payant</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Document Modal ────────────────────────────────────────────────────────────
function DocumentModal({
  doc,
  onClose,
  onPay,
}: {
  doc: Document;
  onClose: () => void;
  onPay: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1c1a16",
          border: "1px solid #2e2b25",
          maxWidth: 760,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header image */}
        <div style={{ position: "relative", height: 260 }}>
          <img
            src={doc.image}
            alt={doc.title}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "brightness(0.45) saturate(0.5)",
            }}
          />
          {/* Watermark overlay */}
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{
                position: "absolute",
                color: "rgba(201,168,76,0.2)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.15em",
                transform: `rotate(-30deg) translateY(${(i - 3) * 50}px)`,
                whiteSpace: "nowrap",
                userSelect: "none",
              }}>
                BetBenAmraoui © DOCUMENT CONFIDENTIEL — ACCÈS RESTREINT
              </div>
            ))}
          </div>

          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <div style={{
              background: "rgba(14,13,11,0.75)",
              border: "1px solid rgba(201,168,76,0.3)",
              padding: "16px 32px",
              textAlign: "center",
            }}>
              <div style={{ color: "#c9a84c", marginBottom: 6 }}><LockIcon size={28} /></div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#c9a84c", letterSpacing: "0.15em" }}>
                APERÇU VERROUILLÉ
              </div>
            </div>
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              background: "rgba(14,13,11,0.8)",
              border: "1px solid #2e2b25",
              color: "#f0ead8",
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 32 }}>
          {/* Badges */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.1em",
              color: "#c9a84c",
              border: "1px solid rgba(201,168,76,0.3)",
              padding: "3px 8px",
            }}>
              {pathLabel(doc).toUpperCase()}
            </span>
          </div>

          <h2 style={{
            fontFamily: "var(--font-display)",
            fontSize: 26,
            fontWeight: 700,
            color: "#f0ead8",
            lineHeight: 1.3,
            marginBottom: 16,
          }}>
            {doc.title}
          </h2>

          <p style={{
            fontSize: 15,
            color: "#a09585",
            lineHeight: 1.75,
            marginBottom: 28,
          }}>
            {doc.description}
          </p>

          {/* Specs grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 1,
            background: "#2e2b25",
            marginBottom: 28,
          }}>
            {[
              { label: "PAGES", value: sizeLabel(doc) },
              { label: "FORMAT", value: doc.format },
            ].map((item) => (
              <div key={item.label} style={{ background: "#1c1a16", padding: "16px 20px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#6b6458", letterSpacing: "0.12em", marginBottom: 6 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 14, color: "#f0ead8", fontWeight: 500 }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* Tags */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 32 }}>
            {doc.tags.map((tag) => (
              <span key={tag} style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "#6b6458",
                border: "1px solid #2e2b25",
                padding: "3px 10px",
                letterSpacing: "0.08em",
              }}>
                #{tag}
              </span>
            ))}
          </div>

          {/* CTA */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid #2e2b25",
            paddingTop: 24,
          }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#6b6458", letterSpacing: "0.1em", marginBottom: 4 }}>
                PRIX D'ACCÈS
              </div>
              <div style={{
                fontFamily: "var(--font-display)",
                fontSize: 36,
                fontWeight: 700,
                color: "#c9a84c",
              }}>
                {doc.price} €
              </div>
            </div>
            <button
              onClick={onPay}
              style={{
                background: "#c9a84c",
                color: "#0e0d0b",
                border: "none",
                padding: "14px 32px",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.08em",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#e2c47a")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#c9a84c")}
            >
              <DownloadIcon />
              ACHETER ET TÉLÉCHARGER
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Payment Modal ─────────────────────────────────────────────────────────────
const DZD_RATE = 146; // 1 EUR ≈ 146 DZD (indicatif)

function PaymentModal({ doc, onClose }: { doc: Document; onClose: () => void }) {
  const [step, setStep] = useState<PaymentStep>("details");
  const [method, setMethod] = useState<PaymentMethod>(null);
  const session = useSession();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [accountExists, setAccountExists] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (session) setForm((f) => ({ ...f, name: session.name || f.name, email: session.email, password: "" }));
  }, [session?.email]);

  const detailsValid =
    !!form.name.trim() &&
    /^\S+@\S+\.\S+$/.test(form.email.trim()) &&
    !!form.phone.trim() &&
    (!!session || form.password.length >= 8);

  const priceDZD = Math.round(doc.price * DZD_RATE);
  const handleField = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const [checkoutUrl, setCheckoutUrl] = useState("");

  const goToCheckout = (url: string) => {
    if (window.self === window.top) {
      window.location.href = url;
    } else if (!window.open(url, "_blank", "noopener")) {
      setApiError("Le navigateur a bloqué l'ouverture. Utilisez le lien « Ouvrir la page de paiement ».");
    }
  };

  const handleChargilyPay = async () => {
    if (!method) return;
    setLoading(true);
    setApiError("");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(`${API}/create-order`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          password: session ? undefined : form.password,
          docId: doc.id,
          customerName: form.name,
          customerEmail: form.email,
          customerPhone: form.phone,
          paymentMethod: method === "baridimob" ? "edahabia" : "cib",
          appUrl: window.location.href.split("?")[0],
        }),
      });
      const raw = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(`Le serveur de paiement ne répond pas correctement (${res.status}). Fonction non déployée ?`);
      }
      if (res.status === 409 && data.code === "account_exists") {
        setAccountExists(true);
        setStep("details");
      }
      if (!res.ok) throw new Error(data.error || data.message || `Erreur serveur (${res.status})`);
      if (!data.checkoutUrl) throw new Error("Lien de paiement indisponible");
      if (!session) await signIn(form.email, form.password).catch(() => {});
      setCheckoutUrl(data.checkoutUrl);
      goToCheckout(data.checkoutUrl);
    } catch (e: any) {
      setApiError(
        e?.name === "AbortError"
          ? "Le serveur ne répond pas (délai dépassé). Vérifiez que la fonction « server » est déployée."
          : e instanceof TypeError
            ? "Impossible de joindre le serveur (réseau ou CORS). Vérifiez le déploiement de la fonction."
            : e.message || "Une erreur est survenue. Veuillez réessayer.",
      );
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  const stepLabel: Record<PaymentStep, string> = {
    details: "ÉTAPE 1/2 — INFORMATIONS",
    method: "ÉTAPE 2/2 — MODE DE PAIEMENT",
    baridimob: "ÉTAPE 2/2 — MODE DE PAIEMENT",
    bank: "ÉTAPE 2/2 — MODE DE PAIEMENT",
    confirmation: "PAIEMENT REÇU",
  };

  const stepTitle: Record<PaymentStep, string> = {
    details: "Procédure d'achat",
    method: "Choisir le paiement",
    baridimob: "Choisir le paiement",
    bank: "Choisir le paiement",
    confirmation: "Téléchargement prêt",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={step !== "confirmation" ? onClose : undefined}
    >
      <div
        style={{
          background: "#161410",
          border: "1px solid #2e2b25",
          maxWidth: 520,
          width: "100%",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{
          borderBottom: "1px solid #2e2b25",
          padding: "20px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.15em", color: "#c9a84c", marginBottom: 4 }}>
              {stepLabel[step]}
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "#f0ead8" }}>
              {stepTitle[step]}
            </div>
          </div>
          {step !== "confirmation" && (
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#6b6458", cursor: "pointer" }}>
              <CloseIcon />
            </button>
          )}
        </div>

        {/* Document + price summary */}
        <div style={{
          background: "#1c1a16",
          borderBottom: "1px solid #2e2b25",
          padding: "14px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <div style={{ fontSize: 13, color: "#a09585", flex: 1, minWidth: 0 }}>
            {doc.title.length > 48 ? doc.title.slice(0, 48) + "…" : doc.title}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "#c9a84c" }}>
              {priceDZD.toLocaleString("fr-DZ")} DA
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#6b6458", letterSpacing: "0.1em" }}>
              ≈ {doc.price} EUR
            </div>
          </div>
        </div>

        <div style={{ padding: 28 }}>

          {/* ── STEP 1: Personal info ── */}
          {step === "details" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {session && (
                <div style={{ fontSize: 12, color: "#4ade80", background: "#1c1a16", border: "1px solid #2e2b25", padding: "10px 14px" }}>
                  Connecté : {session.email}.{" "}
                  <button onClick={signOut} style={{ background: "none", border: "none", color: "#a09585", textDecoration: "underline", cursor: "pointer", fontSize: 12 }}>
                    Changer de compte
                  </button>
                </div>
              )}
              <div>
                <label style={labelStyle}>NOM COMPLET</label>
                <input type="text" placeholder="Mohamed Ben Amraoui" value={form.name}
                  onChange={(e) => handleField("name", e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>ADRESSE EMAIL</label>
                <input type="email" placeholder="exemple@email.com" value={form.email} readOnly={!!session}
                  onChange={(e) => handleField("email", e.target.value)} style={{ ...inputStyle, opacity: session ? 0.6 : 1 }} />
              </div>
              <div>
                <label style={labelStyle}>NUMÉRO DE TÉLÉPHONE</label>
                <input type="tel" placeholder="0XXX XXX XXX" value={form.phone}
                  onChange={(e) => handleField("phone", e.target.value)} style={inputStyle} />
              </div>
              {!session && (
                <div>
                  <label style={labelStyle}>MOT DE PASSE (8 CARACTÈRES MIN.)</label>
                  <input type="password" autoComplete="new-password" value={form.password}
                    onChange={(e) => handleField("password", e.target.value)} style={inputStyle} />
                </div>
              )}
              {accountExists && (
                <div style={{ background: "rgba(192,57,43,0.12)", border: "1px solid rgba(192,57,43,0.4)", padding: "10px 14px", fontSize: 13, color: "#f87171" }}>
                  Un compte existe déjà avec cet email.{" "}
                  <button onClick={() => setShowLogin(true)} style={{ background: "none", border: "none", color: "#c9a84c", textDecoration: "underline", cursor: "pointer", fontSize: 13 }}>
                    Se connecter
                  </button>
                </div>
              )}
              <div style={{ fontSize: 12, color: "#6b6458", lineHeight: 1.65 }}>
                {session
                  ? "Le document sera débloqué dans votre compte après confirmation du paiement."
                  : "Un compte sera créé avec ces informations. Après le paiement, vous retrouverez votre document débloqué dans votre espace."}
              </div>
              {!session && (
                <button onClick={() => setShowLogin(true)} style={{ background: "none", border: "none", color: "#a09585", fontSize: 12, textDecoration: "underline", cursor: "pointer", textAlign: "left", padding: 0 }}>
                  J'ai déjà un compte — me connecter
                </button>
              )}
              <button
                onClick={() => { if (detailsValid) { setAccountExists(false); setApiError(""); setStep("method"); } }}
                style={{ ...ctaStyle, opacity: detailsValid ? 1 : 0.4, cursor: detailsValid ? "pointer" : "not-allowed" }}
              >
                CHOISIR LE MODE DE PAIEMENT →
              </button>
            </div>
          )}

          {/* ── STEP 2: Choose payment method ── */}
          {(step === "method" || step === "baridimob" || step === "bank") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 13, color: "#a09585", marginBottom: 4 }}>
                Choisissez votre mode de règlement en dinars algériens (DA) :
              </div>

              {/* EDAHABIA (Algérie Poste) */}
              <button
                onClick={() => { setMethod("baridimob"); }}
                style={{
                  background: method === "baridimob" ? "rgba(201,168,76,0.08)" : "#1c1a16",
                  border: method === "baridimob" ? "1px solid #c9a84c" : "1px solid #2e2b25",
                  padding: "18px 20px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  textAlign: "left",
                  width: "100%",
                  transition: "background 0.2s, border-color 0.2s",
                }}
              >
                <div style={{ width: 44, height: 44, background: "#006633", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                    <rect x="5" y="2" width="14" height="20" rx="2" />
                    <line x1="12" y1="18" x2="12" y2="18" strokeWidth="3" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#f0ead8", marginBottom: 3 }}>Carte EDAHABIA</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#6b6458", letterSpacing: "0.08em" }}>CARTE ALGÉRIE POSTE (EDAHABIA)</div>
                </div>
                {method === "baridimob" && <div style={{ marginLeft: "auto", color: "#c9a84c", fontWeight: 700 }}>✓</div>}
              </button>

              {/* CIB (carte bancaire algérienne) */}
              <button
                onClick={() => { setMethod("bank"); }}
                style={{
                  background: method === "bank" ? "rgba(201,168,76,0.08)" : "#1c1a16",
                  border: method === "bank" ? "1px solid #c9a84c" : "1px solid #2e2b25",
                  padding: "18px 20px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  textAlign: "left",
                  width: "100%",
                  transition: "background 0.2s, border-color 0.2s",
                }}
              >
                <div style={{ width: 44, height: 44, background: "#1a2e4a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5b9bd5" strokeWidth="2">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#f0ead8", marginBottom: 3 }}>Carte CIB</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#6b6458", letterSpacing: "0.08em" }}>TOUT COMPTE BANCAIRE ALGÉRIEN (DA)</div>
                </div>
                {method === "bank" && <div style={{ marginLeft: "auto", color: "#c9a84c", fontWeight: 700 }}>✓</div>}
              </button>

              <div style={{ fontSize: 12, color: "#a09585", lineHeight: 1.6 }}>
                Vous serez redirigé vers la page sécurisée de Chargily Pay pour saisir les informations de votre carte (numéro, date d'expiration, CVV et code OTP). Aucune donnée bancaire ne transite par ce site.
              </div>

              {/* Chargily security badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#1c1a16", border: "1px solid #2e2b25", marginTop: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#4ade80", letterSpacing: "0.1em" }}>PAIEMENT SÉCURISÉ VIA CHARGILY PAY — SSL/TLS</span>
              </div>

              {checkoutUrl && (
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...ctaStyle, textAlign: "center", textDecoration: "none", display: "block" }}
                >
                  OUVRIR LA PAGE DE PAIEMENT CHARGILY ↗
                </a>
              )}

              {apiError && (
                <div style={{ background: "rgba(192,57,43,0.12)", border: "1px solid rgba(192,57,43,0.4)", padding: "10px 14px", fontSize: 13, color: "#f87171" }}>
                  {apiError}
                </div>
              )}

              <button
                onClick={handleChargilyPay}
                disabled={!method || loading}
                style={{
                  ...ctaStyle,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  opacity: method && !loading ? 1 : 0.4,
                  cursor: method && !loading ? "pointer" : "not-allowed",
                  marginTop: 4,
                }}
              >
                {loading ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    REDIRECTION EN COURS…
                  </>
                ) : (
                  <>PROCÉDER AU PAIEMENT {priceDZD.toLocaleString("fr-DZ")} DA →</>
                )}
              </button>

              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

              <button onClick={() => setStep("details")} style={{ background: "none", border: "none", color: "#6b6458", fontSize: 12, cursor: "pointer" }}>
                ← Retour
              </button>
            </div>
          )}
        </div>
      </div>
      {showLogin && <AuthModal onClose={() => setShowLogin(false)} onDone={() => setAccountExists(false)} />}
    </div>
  );
}

// Shared styles
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

// ─── Success Page (after Chargily redirect) ────────────────────────────────────
function SuccessPage({ orderId, failed }: { orderId: string; failed: boolean }) {
  const [status, setStatus] = useState<"polling" | "paid" | "failed">(failed ? "failed" : "polling");
  const [order, setOrder] = useState<any>(null);
  const [downloadToken, setDownloadToken] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [dlError, setDlError] = useState("");
  const [copied, setCopied] = useState(false);
  const session = useSession();
  const [showLogin, setShowLogin] = useState(false);
  const goAccount = () => { window.location.href = `${window.location.pathname}?account`; };

  useEffect(() => {
    if (status !== "paid" || !session) return;
    const t = setTimeout(goAccount, 4000);
    return () => clearTimeout(t);
  }, [status, session?.email]);

  const handleDownload = async () => {
    setDownloading(true);
    setDlError("");
    try {
      const r = await fetch(`${API}/download/${downloadToken}`, { headers: AUTH });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Téléchargement impossible");
      const files: { name: string; url: string }[] = d.files ?? [];
      if (!files.length) throw new Error("Aucun fichier disponible");
      files.forEach((f, i) =>
        setTimeout(() => {
          const a = document.createElement("a");
          a.href = f.url;
          a.download = f.name;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }, i * 600),
      );
    } catch (err: any) {
      setDlError(err.message || "Téléchargement impossible");
    } finally {
      setDownloading(false);
    }
  };

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${API}/order-status/${orderId}`, { headers: AUTH });
      const data = await res.json();
      setOrder(data);
      if (data.status === "paid") {
        setStatus("paid");
        setDownloadToken(data.downloadToken);
      } else if (data.status === "failed") {
        setStatus("failed");
      }
    } catch {
      // network error — retry
    }
  }, [orderId]);

  useEffect(() => {
    if (failed) return;
    poll();
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [poll, failed]);

  return (
    <div style={{ minHeight: "100vh", background: "#0e0d0b", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      {/* Header */}
      <div style={{ marginBottom: 48, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "#c9a84c", marginBottom: 4 }}>BetBenAmraoui</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#6b6458", letterSpacing: "0.15em" }}>ARCHITECTE D.E.</div>
      </div>

      <div style={{ background: "#1c1a16", border: "1px solid #2e2b25", maxWidth: 500, width: "100%", padding: 40 }}>

        {/* Polling / waiting */}
        {status === "polling" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 64, height: 64, border: "3px solid #2e2b25", borderTop: "3px solid #c9a84c", borderRadius: "50%", margin: "0 auto 24px", animation: "spin 1s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "#f0ead8", marginBottom: 12 }}>
              Vérification du paiement…
            </div>
            <div style={{ fontSize: 14, color: "#6b6458", lineHeight: 1.7 }}>
              Chargily confirme votre transaction. Cela prend généralement quelques secondes.
              <br />Ne fermez pas cette page.
            </div>
          </div>
        )}

        {/* Payment confirmed */}
        {status === "paid" && (
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "rgba(74,222,128,0.1)", border: "2px solid #4ade80",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 24px", color: "#4ade80",
            }}>
              <CheckIcon />
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#4ade80", letterSpacing: "0.15em", marginBottom: 12 }}>PAIEMENT CONFIRMÉ</div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: "#f0ead8", marginBottom: 10 }}>
              Téléchargement prêt !
            </h2>
            <p style={{ fontSize: 14, color: "#a09585", lineHeight: 1.7, marginBottom: 28 }}>
              Bienvenue <strong style={{ color: "#f0ead8" }}>{order?.customerName?.split(" ")[0]}</strong>. Votre paiement a été validé automatiquement par Chargily. Le lien est actif pendant <strong style={{ color: "#c9a84c" }}>24 heures</strong>.
            </p>

            {/* Document info */}
            <div style={{ background: "#161410", border: "1px solid #2e2b25", padding: "14px 18px", marginBottom: 24, textAlign: "left" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#6b6458", letterSpacing: "0.1em", marginBottom: 6 }}>DOCUMENT</div>
              <div style={{ fontSize: 14, color: "#f0ead8" }}>{order?.docTitle}</div>
            </div>

            {/* Confirmation token */}
            <div style={{ background: "#161410", border: "1px dashed #c9a84c", padding: "14px 18px", marginBottom: 20, textAlign: "left" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#6b6458", letterSpacing: "0.1em", marginBottom: 6 }}>CODE DE CONFIRMATION</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#c9a84c", wordBreak: "break-all", marginBottom: 10 }}>{downloadToken}</div>
              <button
                onClick={() => { navigator.clipboard?.writeText(downloadToken || ""); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                style={{ background: "none", border: "1px solid #2e2b25", color: "#a09585", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", padding: "6px 10px", cursor: "pointer" }}
              >
                {copied ? "COPIÉ ✓" : "COPIER LE CODE"}
              </button>
              <div style={{ fontSize: 12, color: "#6b6458", marginTop: 10, lineHeight: 1.6 }}>
                {order?.emailSent
                  ? "Ce code vous a aussi été envoyé par email."
                  : "Conservez ce code : il permet de retélécharger le document pendant 24 h."}
              </div>
            </div>

            <button
              onClick={session ? goAccount : () => setShowLogin(true)}
              style={{ ...ctaStyle, marginBottom: 12 }}
            >
              {session ? "ACCÉDER À MON COMPTE →" : "SE CONNECTER À MON COMPTE →"}
            </button>
            {session && (
              <div style={{ fontSize: 12, color: "#6b6458", marginBottom: 12 }}>
                Redirection automatique vers votre espace…
              </div>
            )}

            <button
              onClick={handleDownload}
              disabled={downloading}
              style={{
                ...ctaStyle,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                width: "100%",
                background: "transparent",
                color: "#c9a84c",
                border: "1px solid #c9a84c",
                opacity: downloading ? 0.6 : 1,
              }}
            >
              <DownloadIcon size={18} />
              {downloading ? "PRÉPARATION…" : "TÉLÉCHARGER LE DOCUMENT"}
            </button>
            {dlError && <div style={{ color: "#f87171", fontSize: 13, marginTop: 12, lineHeight: 1.6 }}>{dlError}</div>}

            <button
              onClick={() => { window.location.href = window.location.pathname; }}
              style={{ marginTop: 14, background: "none", border: "none", color: "#6b6458", fontSize: 12, cursor: "pointer" }}
            >
              ← Retour à la collection
            </button>
          </div>
        )}

        {showLogin && <AuthModal onClose={() => setShowLogin(false)} onDone={goAccount} />}

        {/* Payment failed */}
        {status === "failed" && (
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "rgba(248,113,113,0.1)", border: "2px solid #f87171",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 24px", color: "#f87171",
            }}>
              <CloseIcon />
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#f87171", letterSpacing: "0.15em", marginBottom: 12 }}>PAIEMENT ÉCHOUÉ</div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "#f0ead8", marginBottom: 10 }}>
              Transaction annulée
            </h2>
            <p style={{ fontSize: 14, color: "#a09585", lineHeight: 1.7, marginBottom: 28 }}>
              Le paiement n'a pas été complété. Aucun montant n'a été débité. Vous pouvez réessayer.
            </p>
            <button
              onClick={() => { window.location.href = window.location.pathname; }}
              style={ctaStyle}
            >
              ← RETOUR À LA COLLECTION
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  // Detect Chargily redirect: ?order_id=xxx&payment=success|failure
  const params = new URLSearchParams(window.location.search);
  if (params.get("admin") !== null) return <AdminPage />;
  if (params.get("account") !== null) return <AccountWithCatalog />;
  const redirectOrderId = params.get("order_id");
  if (redirectOrderId) {
    return <SuccessPage orderId={redirectOrderId} failed={params.get("payment") === "failure"} />;
  }
  return <Storefront />;
}

function AccountWithCatalog() {
  const { documents } = useCatalog<Document>();
  return <AccountPage documents={documents} />;
}

function Storefront() {
  const { documents: DOCUMENTS, loading: catalogLoading, error: catalogError } = useCatalog<Document>();
  const [activeCategory, setActiveCategory] = useState<Category>("Tous");
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [payingDoc, setPayingDoc] = useState<Document | null>(null);
  const session = useSession();
  const [showLogin, setShowLogin] = useState(false);

  const [activeSub, setActiveSub] = useState("Tous");
  const [activeFolder, setActiveFolder] = useState<FolderName | "Tous">("Tous");

  const subs = activeCategory === "Tous" ? [] : SUBCATEGORIES[activeCategory];
  const inScope = (d: Document) =>
    (activeCategory === "Tous" || d.category === activeCategory) &&
    (activeSub === "Tous" || d.subcategory === activeSub);
  const filtered = DOCUMENTS.filter(
    (d) => inScope(d) && (activeFolder === "Tous" || d.folder === activeFolder),
  );

  const chipStyle = (active: boolean): React.CSSProperties => ({
    background: active ? "rgba(201,168,76,0.15)" : "transparent",
    border: `1px solid ${active ? "#c9a84c" : "#2e2b25"}`,
    color: active ? "#c9a84c" : "#a09585",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.08em",
    padding: "7px 14px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0e0d0b" }}>
      {/* ── Header ── */}
      <header style={{
        borderBottom: "1px solid #2e2b25",
        padding: "0 40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 64,
        position: "sticky",
        top: 0,
        background: "rgba(14,13,11,0.95)",
        backdropFilter: "blur(8px)",
        zIndex: 40,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32,
            height: 32,
            border: "2px solid #c9a84c",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <span style={{
              fontFamily: "var(--font-display)",
              fontSize: 14,
              fontWeight: 700,
              color: "#c9a84c",
            }}>B</span>
          </div>
          <div>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: 16,
              fontWeight: 700,
              color: "#f0ead8",
              letterSpacing: "0.02em",
            }}>
              BetBenAmraoui
            </div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "#6b6458",
              letterSpacing: "0.15em",
              marginTop: -2,
            }}>
              ARCHITECTE D.E.
            </div>
          </div>
        </div>

        <nav style={{ display: "flex", gap: 32 }}>
          {["Accueil", "Documents", "À propos", "Contact"].map((item) => (
            <a key={item} href="#" style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: item === "Documents" ? "#c9a84c" : "#6b6458",
              textDecoration: "none",
              letterSpacing: "0.05em",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#f0ead8")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = item === "Documents" ? "#c9a84c" : "#6b6458")}
            >
              {item}
            </a>
          ))}
          {session ? (
            <a href="?account" style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#c9a84c", textDecoration: "none", letterSpacing: "0.05em" }}>
              Mon compte
            </a>
          ) : (
            <button onClick={() => setShowLogin(true)} style={{ background: "none", border: "none", padding: 0, fontFamily: "var(--font-body)", fontSize: 13, color: "#c9a84c", cursor: "pointer", letterSpacing: "0.05em" }}>
              Connexion
            </button>
          )}
        </nav>
      </header>
      {showLogin && <AuthModal onClose={() => setShowLogin(false)} onDone={() => { window.location.href = "?account"; }} />}

      {/* ── Hero ── */}
      <section style={{
        borderBottom: "1px solid #2e2b25",
        padding: "72px 40px 56px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Background grid pattern */}
        <div style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "linear-gradient(rgba(201,168,76,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", maxWidth: 800 }}>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.2em",
            color: "#c9a84c",
            marginBottom: 20,
          }}>
            — COLLECTION NUMÉRIQUE
          </div>
          <h1 style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(36px, 5vw, 60px)",
            fontWeight: 700,
            color: "#f0ead8",
            lineHeight: 1.15,
            marginBottom: 24,
          }}>
            Documents Architecturaux
            <br />
            <em style={{ color: "#c9a84c" }}>de Haute Qualité</em>
          </h1>
          <p style={{
            fontSize: 16,
            color: "#a09585",
            lineHeight: 1.8,
            maxWidth: 560,
            marginBottom: 36,
          }}>
            Explorez ma collection complète de documents architecturaux numériques — dessins 2D,
            modélisations 3D, images 3D et rapports écrits — conçus pour accompagner les étudiants et
            jeunes architectes dans leur apprentissage.
          </p>

          {/* Stats */}
          <div style={{ display: "flex", gap: 48 }}>
            {[
              { value: `${DOCUMENTS.length}+`, label: "Documents disponibles" },
              { value: "4", label: "Types de dossiers" },
              { value: "DWG/PDF", label: "Formats professionnels" },
            ].map((stat) => (
              <div key={stat.label}>
                <div style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 28,
                  fontWeight: 700,
                  color: "#c9a84c",
                }}>
                  {stat.value}
                </div>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "#6b6458",
                  letterSpacing: "0.1em",
                  marginTop: 2,
                }}>
                  {stat.label.toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Category filter ── */}
      <section style={{
        borderBottom: "1px solid #2e2b25",
        padding: "0 40px",
        display: "flex",
        alignItems: "center",
        gap: 4,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}>
        {CATEGORIES.map((cat) => {
          const active = cat === activeCategory;
          return (
            <button
              key={cat}
              onClick={() => {
                setActiveCategory(cat);
                setActiveSub("Tous");
              }}
              style={{
                background: "none",
                border: "none",
                borderBottom: active ? "2px solid #c9a84c" : "2px solid transparent",
                color: active ? "#c9a84c" : "#6b6458",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.12em",
                padding: "18px 20px",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "color 0.2s, border-color 0.2s",
              }}
            >
              {cat.toUpperCase()}
              <span style={{
                marginLeft: 6,
                background: active ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.05)",
                color: active ? "#c9a84c" : "#4a4540",
                fontSize: 10,
                padding: "1px 6px",
              }}>
                {cat === "Tous" ? DOCUMENTS.length : DOCUMENTS.filter((d) => d.category === cat).length}
              </span>
            </button>
          );
        })}
      </section>

      {/* ── Sub-category & folder filters ── */}
      <section style={{ borderBottom: "1px solid #2e2b25", padding: "20px 40px", display: "flex", flexDirection: "column", gap: 14 }}>
        {subs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.15em", color: "#6b6458", width: 90 }}>
              {activeCategory === "Habitat" ? "TYPE D'HABITAT" : "ÉQUIPEMENT"}
            </span>
            {["Tous", ...subs].map((sub) => (
              <button key={sub} onClick={() => setActiveSub(sub)} style={chipStyle(sub === activeSub)}>
                {sub.toUpperCase()}
                <span style={{ marginLeft: 6, opacity: 0.6 }}>
                  {DOCUMENTS.filter((d) => d.category === activeCategory && (sub === "Tous" || d.subcategory === sub)).length}
                </span>
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.15em", color: "#6b6458", width: 90 }}>
            DOSSIER
          </span>
          {(["Tous", ...FOLDERS] as const).map((f) => (
            <button key={f} onClick={() => setActiveFolder(f)} style={chipStyle(f === activeFolder)}>
              {f.toUpperCase()}
              <span style={{ marginLeft: 6, opacity: 0.6 }}>
                {DOCUMENTS.filter((d) => inScope(d) && (f === "Tous" || d.folder === f)).length}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Document grid ── */}
      <main style={{ padding: "40px 40px 80px" }}>
        {(catalogLoading || catalogError || (!filtered.length && !DOCUMENTS.length)) && (
          <div style={{ textAlign: "center", color: catalogError ? "#f87171" : "#a09585", fontSize: 14, padding: "40px 0" }}>
            {catalogLoading ? "Chargement du catalogue…" : catalogError || "Le catalogue est vide pour le moment."}
          </div>
        )}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 20,
        }}>
          {filtered.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onClick={() => setSelectedDoc(doc)}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#6b6458" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginBottom: 8 }}>Aucun document</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.1em" }}>
              DANS CETTE CATÉGORIE
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: "1px solid #2e2b25",
        padding: "32px 40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#4a4540", letterSpacing: "0.12em" }}>
          © 2026 BETBENAMRAOUI — TOUS DROITS RÉSERVÉS
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#4a4540", letterSpacing: "0.12em" }}>
          DOCUMENTS PROTÉGÉS PAR LE DROIT D'AUTEUR
        </div>
      </footer>

      {/* ── Modals ── */}
      {selectedDoc && !payingDoc && (
        <DocumentModal
          doc={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          onPay={() => setPayingDoc(selectedDoc)}
        />
      )}
      {payingDoc && (
        <PaymentModal
          doc={payingDoc}
          onClose={() => {
            setPayingDoc(null);
            setSelectedDoc(null);
          }}
        />
      )}
    </div>
  );
}
