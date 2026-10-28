import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

// Le catalogue est stocké dans Supabase (table kv_store_6aac110b, clés "doc:<id>").
// Le serveur reste la source de vérité pour les prix. Prix en EUR.
type Doc = {
  id: number; title: string; category: string; subcategory?: string; folder: string;
  description?: string; price: number; pages?: number; format?: string; image?: string;
  tags?: string[]; featured?: boolean;
};

const getDoc = async (id: number): Promise<Doc | null> => (Number.isFinite(id) ? await kv.get(`doc:${id}`) : null) ?? null;
const listDocs = async (): Promise<Doc[]> =>
  ((await kv.getByPrefix("doc:")) as Doc[]).filter((d) => d && typeof d.id === "number").sort((x, y) => x.id - y.id);


const DZD_RATE = 146;
const MAX_DOWNLOADS = 5;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const PREFIX = "/make-server-6aac110b";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const chargilyKey = () =>
  (Deno.env.get("CHARGILY_SECRET_KEY") ?? "").replace(/[\\"'\s]/g, "").trim();
const chargilyBase = () =>
  chargilyKey().startsWith("test_")
    ? "https://pay.chargily.net/test/api/v2"
    : "https://pay.chargily.net/api/v2";

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmac(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}

const newToken = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");

async function sendEmail(order: any, token: string, appUrl: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!apiKey || !from) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: order.customerEmail,
        subject: `Votre document : ${order.docTitle}`,
        html: `<p>Bonjour ${order.customerName},</p><p>Merci pour votre achat de <strong>${order.docTitle}</strong>.</p>
<p><a href="${appUrl}?order_id=${order.id}&payment=success">Télécharger votre document</a> (valable 24 h, ${MAX_DOWNLOADS} téléchargements maximum).</p>
<p>Code de confirmation : <code>${token}</code></p>`,
      }),
    });
    return r.ok;
  } catch (e) {
    console.log("email error", e);
    return false;
  }
}

async function markPaid(orderId: string) {
  const order = await kv.get(`order:${orderId}`);
  if (!order) return null;
  if (order.status === "paid") return order;
  const token = newToken();
  await kv.set(`dl:${token}`, {
    orderId, docId: order.docId, expiresAt: Date.now() + TOKEN_TTL_MS, count: 0,
  });
  const paid = { ...order, status: "paid", downloadToken: token, paidAt: Date.now() };
  paid.emailSent = await sendEmail(paid, token, order.appUrl);
  await kv.set(`order:${orderId}`, paid);
  if (order.userId) await addToLibrary(order.userId, order.docId);
  console.log("commande payée", orderId);
  return paid;
}

async function markFailed(orderId: string) {
  const order = await kv.get(`order:${orderId}`);
  if (order && order.status === "pending") await kv.set(`order:${orderId}`, { ...order, status: "failed" });
}

async function userFromReq(c: any) {
  const token = (c.req.header("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user;
}

async function addToLibrary(userId: string, docId: number) {
  const ids: number[] = (await kv.get(`lib:${userId}`)) ?? [];
  if (!ids.includes(docId)) await kv.set(`lib:${userId}`, [...ids, docId]);
}

async function signedFiles(docId: number) {
  const doc = await getDoc(docId);
  if (!doc) return [];
  const dirs = [
    [doc.category, doc.subcategory, doc.folder].filter(Boolean).map(slug).join("/"),
    [doc.category, doc.subcategory, doc.folder].filter(Boolean).join("/"),
  ];
  for (const dir of dirs) {
    const { data: list } = await supabase.storage.from("documents").list(dir, { search: `${docId}.` });
    const names = (list ?? []).filter((f) => f.name.startsWith(`${docId}.`)).map((f) => f.name);
    if (!names.length) continue;
    const files = [];
    for (const name of names) {
      const { data } = await supabase.storage.from("documents").createSignedUrl(`${dir}/${name}`, 300, { download: name });
      if (data?.signedUrl) files.push({ name, url: data.signedUrl });
    }
    if (files.length) return files;
  }
  console.log("fichier introuvable pour le doc", docId, dirs);
  return [];
}

const api = new Hono();

api.get("/health", (c) => c.json({ status: "ok", version: "auth-v1", mode: chargilyBase().includes("/test/") ? "test" : "live", keySet: !!chargilyKey() }));

api.get("/diagnostic", async (c) => {
  const k = chargilyKey();
  const raw = Deno.env.get("CHARGILY_SECRET_KEY") ?? "";
  const info = {
    prefix: k.slice(0, 8),
    suffix: k.slice(-3),
    length: k.length,
    rawLength: raw.length,
    isSecretKeyFormat: /^(test|live)_sk_/.test(k),
    base: chargilyBase(),
  };
  try {
    const r = await fetch(`${chargilyBase()}/balance`, { headers: { Authorization: `Bearer ${k}` } });
    const body = await r.text();
    return c.json({ ...info, chargilyStatus: r.status, chargilyBody: body.slice(0, 300) });
  } catch (e: any) {
    return c.json({ ...info, error: e?.message });
  }
});

api.post("/create-order", async (c) => {
  try {
    const body = await c.req.json();
    const doc = await getDoc(Number(body.docId));
    if (!doc) return c.json({ error: "Document introuvable" }, 400);
    const name = String(body.customerName ?? "").trim();
    const email = String(body.customerEmail ?? "").trim();
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return c.json({ error: "Nom ou email invalide" }, 400);
    if (!chargilyKey()) return c.json({ error: "CHARGILY_SECRET_KEY manquante côté serveur" }, 500);

    let user = await userFromReq(c);
    if (!user) {
      const password = String(body.password ?? "");
      if (password.length < 8) return c.json({ error: "Le mot de passe doit contenir au moins 8 caractères" }, 400);
      const { data, error } = await supabase.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { name, phone: String(body.customerPhone ?? "") },
      });
      if (error || !data.user) {
        const exists = /already|registered|exists/i.test(error?.message ?? "");
        return c.json(
          exists
            ? { error: "Un compte existe déjà avec cet email. Connectez-vous pour acheter.", code: "account_exists" }
            : { error: error?.message || "Création du compte impossible" },
          exists ? 409 : 500,
        );
      }
      user = data.user;
    }

    // URL publique (site publié) prioritaire : l'URL de l'aperçu Figma Make exige une connexion Figma ("Unauthorized").
    const appUrl = (Deno.env.get("PUBLIC_APP_URL") || String(body.appUrl ?? "")).split("?")[0];
    if (!/^https?:\/\//.test(appUrl)) return c.json({ error: "appUrl invalide" }, 400);

    const method = body.paymentMethod === "cib" ? "cib" : "edahabia";
    const orderId = crypto.randomUUID();
    const amount = Math.round(doc.price * DZD_RATE);

    const res = await fetch(`${chargilyBase()}/checkouts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${chargilyKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        currency: "dzd",
        payment_method: method,
        description: doc.title,
        locale: "fr",
        success_url: `${appUrl}?order_id=${orderId}&payment=success`,
        failure_url: `${appUrl}?order_id=${orderId}&payment=failure`,
        webhook_endpoint: `${SUPABASE_URL}/functions/v1/server${PREFIX}/webhook`,
        metadata: { orderId, docId: Number(body.docId) },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.checkout_url) {
      console.log("chargily error", res.status, JSON.stringify(data));
      return c.json({ error: data.message || `Chargily a refusé la requête (${res.status})` }, 502);
    }

    await kv.set(`order:${orderId}`, {
      id: orderId, docId: Number(body.docId), docTitle: doc.title, amount,
      customerName: name, customerEmail: email, customerPhone: String(body.customerPhone ?? ""),
      checkoutId: data.id, appUrl, userId: user.id, status: "pending", createdAt: Date.now(),
    });
    console.log("commande créée", orderId, "checkout", data.id, "retour", appUrl);
    return c.json({ checkoutUrl: data.checkout_url, orderId });
  } catch (e: any) {
    console.log("create-order error", e);
    return c.json({ error: e?.message || "Erreur serveur" }, 500);
  }
});

api.post("/webhook", async (c) => {
  const raw = await c.req.text();
  console.log("webhook reçu", raw.slice(0, 300));
  const sig = c.req.header("signature") ?? "";
  const expected = await hmac(chargilyKey(), raw);
  if (!sig || sig !== expected) {
    console.log("webhook: signature invalide");
    return c.json({ error: "signature invalide" }, 403);
  }
  const event = JSON.parse(raw);
  const orderId = event?.data?.metadata?.orderId;
  if (!orderId) return c.json({ received: true });
  if (event.type === "checkout.paid") await markPaid(orderId);
  else if (["checkout.failed", "checkout.canceled", "checkout.expired"].includes(event.type)) await markFailed(orderId);
  return c.json({ received: true });
});

api.get("/order-status/:id", async (c) => {
  const id = c.req.param("id");
  let order = await kv.get(`order:${id}`);
  if (!order) return c.json({ error: "Commande introuvable" }, 404);

  // Filet de sécurité si le webhook tarde : on interroge Chargily directement.
  if (order.status === "pending" && order.checkoutId) {
    try {
      const r = await fetch(`${chargilyBase()}/checkouts/${order.checkoutId}`, {
        headers: { Authorization: `Bearer ${chargilyKey()}` },
      });
      const d = await r.json();
      console.log("order-status: chargily", order.checkoutId, r.status, d.status);
      if (d.status === "paid") order = await markPaid(id);
      else if (["failed", "canceled", "expired"].includes(d.status)) {
        await markFailed(id);
        order = await kv.get(`order:${id}`);
      }
    } catch (e) {
      console.log("status check error", e);
    }
  }
  return c.json({
    status: order.status,
    docTitle: order.docTitle,
    customerName: order.customerName,
    emailSent: !!order.emailSent,
    downloadToken: order.status === "paid" ? order.downloadToken : null,
  });
});

api.get("/download/:token", async (c) => {
  const key = `dl:${c.req.param("token")}`;
  const rec = await kv.get(key);
  if (!rec) return c.json({ error: "Code de téléchargement invalide" }, 404);
  if (Date.now() > rec.expiresAt) return c.json({ error: "Ce lien a expiré (24 h)" }, 410);
  if (rec.count >= MAX_DOWNLOADS) return c.json({ error: `Limite de ${MAX_DOWNLOADS} téléchargements atteinte` }, 429);

  const files = await signedFiles(rec.docId);
  if (!files.length) return c.json({ error: "Fichier introuvable dans le stockage. Contactez le support." }, 404);
  await kv.set(key, { ...rec, count: rec.count + 1 });
  return c.json({ files, remaining: MAX_DOWNLOADS - rec.count - 1 });
});

api.get("/my-documents", async (c) => {
  const user = await userFromReq(c);
  if (!user) return c.json({ error: "Non connecté" }, 401);
  const docIds: number[] = (await kv.get(`lib:${user.id}`)) ?? [];
  return c.json({
    user: { email: user.email, name: user.user_metadata?.name ?? "" },
    docIds,
  });
});

api.get("/my-download/:docId", async (c) => {
  const user = await userFromReq(c);
  if (!user) return c.json({ error: "Non connecté" }, 401);
  const docId = Number(c.req.param("docId"));
  const ids: number[] = (await kv.get(`lib:${user.id}`)) ?? [];
  if (!(await getDoc(docId)) || !ids.includes(docId)) return c.json({ error: "Document non débloqué sur ce compte" }, 403);
  const files = await signedFiles(docId);
  if (!files.length) return c.json({ error: "Fichier introuvable dans le stockage. Contactez le support." }, 404);
  return c.json({ files });
});

// ─── Catalogue dynamique ───────────────────────────────────────────────────────
api.get("/catalog", async (c) => {
  try {
    return c.json({ documents: await listDocs() });
  } catch (e: any) {
    console.log("catalog error", e);
    return c.json({ error: e?.message || "Erreur serveur" }, 500);
  }
});

// Routes d'administration : protégées par le secret ADMIN_KEY (en-tête x-admin-key).
const isAdmin = (c: any) => {
  const k = Deno.env.get("ADMIN_KEY") ?? "";
  return !!k && c.req.header("x-admin-key") === k;
};

const cleanDoc = (b: any, id: number): Doc | string => {
  const title = String(b?.title ?? "").trim();
  const category = String(b?.category ?? "").trim();
  const folder = String(b?.folder ?? "").trim();
  const price = Number(b?.price);
  if (!title || !category || !folder) return "Titre, catégorie et type de dossier obligatoires";
  if (!Number.isFinite(price) || price <= 0) return "Prix invalide";
  return {
    id, title, category, folder, price,
    subcategory: String(b?.subcategory ?? "").trim() || undefined,
    description: String(b?.description ?? ""),
    pages: Number(b?.pages) || 0,
    format: String(b?.format ?? ""),
    image: String(b?.image ?? ""),
    tags: Array.isArray(b?.tags) ? b.tags.map((t: any) => String(t).trim()).filter(Boolean) : [],
    featured: !!b?.featured,
  };
};

const nextId = async () => (await listDocs()).reduce((m, d) => Math.max(m, d.id), 0) + 1;

api.post("/admin/check", (c) => (isAdmin(c) ? c.json({ ok: true }) : c.json({ error: "Clé admin invalide" }, 401)));

api.post("/admin/doc", async (c) => {
  if (!isAdmin(c)) return c.json({ error: "Clé admin invalide" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body?.id) > 0 ? Number(body.id) : await nextId();
  const doc = cleanDoc(body, id);
  if (typeof doc === "string") return c.json({ error: doc }, 400);
  await kv.set(`doc:${id}`, doc);
  return c.json({ document: doc });
});

api.post("/admin/doc/delete", async (c) => {
  if (!isAdmin(c)) return c.json({ error: "Clé admin invalide" }, 401);
  const body = await c.req.json().catch(() => ({}));
  await kv.del(`doc:${Number(body?.id)}`);
  return c.json({ ok: true });
});

// Import en masse (utilisé une fois pour migrer le catalogue initial). Conserve les ID fournis.
api.post("/admin/import", async (c) => {
  if (!isAdmin(c)) return c.json({ error: "Clé admin invalide" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const items: any[] = Array.isArray(body?.documents) ? body.documents : [];
  let count = 0;
  for (const it of items) {
    const id = Number(it?.id);
    if (!(id > 0)) continue;
    const doc = cleanDoc(it, id);
    if (typeof doc === "string") continue;
    await kv.set(`doc:${id}`, doc);
    count++;
  }
  return c.json({ imported: count });
});

const app = new Hono();
app.use("*", logger(console.log));
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization", "apikey", "x-admin-key"],
  allowMethods: ["GET", "POST", "OPTIONS"],
  maxAge: 600,
}));
app.route(`/server${PREFIX}`, api);
app.route(PREFIX, api);

Deno.serve(app.fetch);
