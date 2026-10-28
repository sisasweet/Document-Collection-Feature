import { useEffect, useState } from "react";
import { publicAnonKey } from "../utils/supabase/info";
import { API } from "./auth";
import { useCatalog } from "./catalog";

const KEY = "bet_admin_key";
const CATEGORIES: Record<string, string[]> = {
  "Équipements": ["Scolaire", "Sport", "Santé / Loisir", "Divers"],
  "Habitat": ["Collectif", "Individuel"],
  "Aménagement": [],
};
const FOLDERS = ["Dessin 2D", "Modélisation 3D", "Images 3D", "Rapport écrit"];

const empty = {
  id: 0, title: "", category: "Habitat", subcategory: "Individuel", folder: "Dessin 2D",
  description: "", price: 10, pages: 1, format: "PDF", image: "", tags: "", featured: false,
};

const input: React.CSSProperties = {
  width: "100%", background: "#0e0d0b", border: "1px solid #2e2b25", color: "#f0ead8",
  padding: "10px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
};
const label: React.CSSProperties = {
  display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em",
  color: "#6b6458", marginBottom: 6, marginTop: 14,
};
const btn = (primary = false): React.CSSProperties => ({
  background: primary ? "#c9a84c" : "transparent", color: primary ? "#0e0d0b" : "#a09585",
  border: `1px solid ${primary ? "#c9a84c" : "#2e2b25"}`, padding: "10px 18px", cursor: "pointer",
  fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", fontWeight: 700,
});

export default function AdminPage() {
  const [key, setKey] = useState(localStorage.getItem(KEY) ?? "");
  const [authed, setAuthed] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<any>(empty);
  const [reload, setReload] = useState(0);
  const { documents } = useCatalog<any>();
  const [docs, setDocs] = useState<any[]>([]);

  const call = async (path: string, body?: object) => {
    const r = await fetch(`${API}${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${publicAnonKey}`, "x-admin-key": key, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
    return d;
  };

  const refresh = async () => {
    const r = await fetch(`${API}/catalog`, { headers: { Authorization: `Bearer ${publicAnonKey}` } });
    const d = await r.json();
    setDocs(d.documents ?? []);
  };
  useEffect(() => { refresh().catch(() => {}); }, [reload]);
  useEffect(() => { if (documents.length && !docs.length) setDocs(documents); }, [documents]);

  const login = async () => {
    try {
      await call("/admin/check", {});
      localStorage.setItem(KEY, key);
      setAuthed(true);
      setMsg("");
    } catch (e: any) { setMsg(e.message); }
  };

  const save = async () => {
    try {
      const payload = {
        ...form,
        id: form.id || undefined,
        subcategory: CATEGORIES[form.category]?.length ? form.subcategory : "",
        tags: String(form.tags).split(",").map((t) => t.trim()).filter(Boolean),
      };
      const d = await call("/admin/doc", payload);
      setMsg(`Document n°${d.document.id} enregistré.`);
      setForm(empty);
      setReload((n) => n + 1);
    } catch (e: any) { setMsg(e.message); }
  };

  const remove = async (id: number) => {
    if (!confirm(`Supprimer le document n°${id} du catalogue ?`)) return;
    try { await call("/admin/doc/delete", { id }); setMsg(`Document n°${id} supprimé.`); setReload((n) => n + 1); }
    catch (e: any) { setMsg(e.message); }
  };

  const importSeed = async () => {
    if (!confirm("Importer les 18 documents initiaux ? Les documents ayant le même numéro seront écrasés.")) return;
    try {
      const seed = (await import("./seed-catalog.json")).default;
      const d = await call("/admin/import", { documents: seed });
      setMsg(`${d.imported} documents importés.`);
      setReload((n) => n + 1);
    } catch (e: any) { setMsg(e.message); }
  };

  const edit = (d: any) => setForm({ ...empty, ...d, subcategory: d.subcategory ?? "", tags: (d.tags ?? []).join(", ") });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const shell: React.CSSProperties = { minHeight: "100vh", background: "#0e0d0b", color: "#f0ead8", padding: 32, fontFamily: "var(--font-body)" };

  if (!authed) {
    return (
      <div style={shell}>
        <div style={{ maxWidth: 380, margin: "80px auto", background: "#1c1a16", border: "1px solid #2e2b25", padding: 32 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "#c9a84c", marginBottom: 16 }}>Administration</div>
          <label style={label}>CLÉ ADMIN</label>
          <input type="password" style={input} value={key} onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()} />
          {msg && <div style={{ color: "#f87171", fontSize: 13, marginTop: 12 }}>{msg}</div>}
          <div style={{ marginTop: 20 }}><button style={btn(true)} onClick={login}>ENTRER</button></div>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "#c9a84c" }}>Catalogue ({docs.length})</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn()} onClick={importSeed}>IMPORTER LE CATALOGUE INITIAL</button>
            <a href={window.location.pathname} style={{ ...btn(), textDecoration: "none" }}>← SITE</a>
          </div>
        </div>
        {msg && <div style={{ background: "#1c1a16", border: "1px solid #c9a84c", padding: 12, marginBottom: 20, fontSize: 14 }}>{msg}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 24 }}>
          <div style={{ background: "#1c1a16", border: "1px solid #2e2b25", padding: 24 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 4 }}>
              {form.id ? `Modifier le document n°${form.id}` : "Nouveau document"}
            </div>
            <label style={label}>TITRE</label>
            <input style={input} value={form.title} onChange={(e) => set("title", e.target.value)} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={label}>CATÉGORIE</label>
                <select style={input} value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value, subcategory: CATEGORIES[e.target.value][0] ?? "" })}>
                  {Object.keys(CATEGORIES).map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>SOUS-CATÉGORIE</label>
                <select style={input} value={form.subcategory} disabled={!CATEGORIES[form.category]?.length}
                  onChange={(e) => set("subcategory", e.target.value)}>
                  {(CATEGORIES[form.category] ?? []).map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>TYPE DE DOSSIER</label>
                <select style={input} value={form.folder} onChange={(e) => set("folder", e.target.value)}>
                  {FOLDERS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>PRIX (EUR)</label>
                <input type="number" min={1} style={input} value={form.price} onChange={(e) => set("price", e.target.value)} />
              </div>
              <div>
                <label style={label}>PAGES</label>
                <input type="number" min={0} style={input} value={form.pages} onChange={(e) => set("pages", e.target.value)} />
              </div>
              <div>
                <label style={label}>FORMAT</label>
                <input style={input} value={form.format} onChange={(e) => set("format", e.target.value)} />
              </div>
            </div>
            <label style={label}>DESCRIPTION</label>
            <textarea style={{ ...input, minHeight: 100 }} value={form.description} onChange={(e) => set("description", e.target.value)} />
            <label style={label}>IMAGE D'APERÇU (URL, ex. bucket « previews »)</label>
            <input style={input} value={form.image} onChange={(e) => set("image", e.target.value)} />
            <label style={label}>MOTS-CLÉS (séparés par des virgules)</label>
            <input style={input} value={form.tags} onChange={(e) => set("tags", e.target.value)} />
            <label style={{ ...label, display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={!!form.featured} onChange={(e) => set("featured", e.target.checked)} /> MIS EN AVANT
            </label>
            <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
              <button style={btn(true)} onClick={save}>{form.id ? "ENREGISTRER" : "AJOUTER"}</button>
              {form.id ? <button style={btn()} onClick={() => setForm(empty)}>ANNULER</button> : null}
            </div>
            <div style={{ fontSize: 12, color: "#6b6458", marginTop: 16, lineHeight: 1.6 }}>
              Fichier à déposer ensuite dans le bucket privé « documents » :<br />
              <code>Catégorie/Sous-catégorie/Dossier/&lt;numéro&gt;.&lt;extension&gt;</code>
            </div>
          </div>

          <div style={{ background: "#1c1a16", border: "1px solid #2e2b25", padding: 8, maxHeight: "80vh", overflow: "auto" }}>
            {docs.length === 0 && (
              <div style={{ padding: 24, color: "#a09585", fontSize: 14 }}>
                Catalogue vide. Cliquez sur « Importer le catalogue initial » pour charger les 18 documents.
              </div>
            )}
            {docs.map((d) => (
              <div key={d.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, borderBottom: "1px solid #2e2b25" }}>
                <div style={{ fontFamily: "var(--font-mono)", color: "#c9a84c", width: 28 }}>{d.id}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title}</div>
                  <div style={{ fontSize: 11, color: "#6b6458" }}>
                    {[d.category, d.subcategory, d.folder].filter(Boolean).join(" / ")} · {d.price} €
                  </div>
                </div>
                <button style={btn()} onClick={() => edit(d)}>MODIFIER</button>
                <button style={{ ...btn(), color: "#f87171" }} onClick={() => remove(d.id)}>SUPPR.</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
