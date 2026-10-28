# Aide – Déroulement de l'application (Marketplace de documents architecturaux)

Ce guide décrit tous les parcours possibles, côté client et côté administrateur, ainsi que les erreurs et leurs solutions.

---

## 1. Vue d'ensemble

| Élément | Rôle |
|---|---|
| Front (`src/App.tsx`, `src/account.tsx`, `src/auth.ts`) | Catalogue, formulaire d'achat, page de retour de paiement, espace `?account` |
| Edge Function `server` (`supabase/functions/server/index.ts`) | Création de commande, webhook Chargily, téléchargements, bibliothèque |
| Supabase Auth | Comptes clients (email + mot de passe) |
| Table `kv_store_6aac110b` | Commandes (`order:`), jetons (`dl:`), bibliothèques (`lib:`) |
| Bucket public `previews` | Aperçus visibles dans le catalogue |
| Bucket privé `documents` | Fichiers réels, servis via liens signés (300 s) |
| Chargily Pay | Paiement EDAHABIA / CIB |

Catalogue : 18 documents. Catégories **Équipements** (Scolaire, Sport, Santé/Loisir, Divers), **Habitat** (Collectif, Individuel), **Aménagement**. Types de dossiers : Dessin 2D, Modélisation 3D, Images 3D, Rapport écrit.

---

## 2. Parcours client

### Cas A – Nouveau client qui achète (le plus courant)
1. Il parcourt le catalogue et ouvre un document (aperçu depuis `previews`).
2. Il clique sur **Acheter** et remplit : nom, email, téléphone, **mot de passe (8 caractères minimum)**, moyen de paiement (EDAHABIA ou CIB).
3. Le front appelle `POST /create-order`. Le serveur :
   - vérifie le document, le nom et l'email ;
   - **crée le compte Supabase Auth** (email déjà confirmé) ;
   - crée un checkout Chargily (montant = prix × taux DZD) ;
   - enregistre la commande avec le statut `pending`.
4. Le front connecte automatiquement l'utilisateur, puis redirige via `window.location.href = checkoutUrl` vers la page Chargily Pay.
5. Le client paie sur Chargily.
6. Chargily appelle le **webhook** (`checkout.paid`). Le serveur passe la commande à `paid`, génère un jeton de téléchargement, **ajoute le document à la bibliothèque** et envoie un email.
7. Chargily redirige le client vers `?order_id=…&payment=success`. La page interroge `/order-status/:id` jusqu'à obtenir `paid`.
8. Le client est dirigé vers `?account` où le document apparaît avec un bouton **Télécharger**.

### Cas B – Client déjà inscrit et connecté
- Le formulaire n'a pas besoin de mot de passe : la session (jeton `Authorization`) identifie l'utilisateur.
- Le reste du parcours est identique au cas A. Le document s'ajoute à sa bibliothèque existante.

### Cas C – Client déjà inscrit mais non connecté
- Le serveur répond `409 account_exists` : « Un compte existe déjà avec cet email. Connectez-vous pour acheter. »
- Le front affiche le bloc de connexion. Le client se connecte via **Mon compte / Connexion** (`AuthModal`), puis relance l'achat (cas B).

### Cas D – Paiement réussi mais webhook en retard
- La page de retour appelle `/order-status/:id`. Tant que la commande est `pending`, le serveur **interroge directement Chargily** (filet de sécurité).
- Si Chargily répond `paid`, la commande est validée immédiatement, sans attendre le webhook.
- La page affiche « vérification en cours » (`polling`) puis passe à `paid`.

### Cas E – Paiement échoué, annulé ou expiré
- Redirection vers `?order_id=…&payment=failure`, ou événement webhook `checkout.failed`, `checkout.canceled` ou `checkout.expired`.
- La commande passe à `failed`. La page affiche l'échec. Le client peut relancer l'achat : une nouvelle commande est créée.
- Aucun document n'est ajouté à la bibliothèque.

### Cas F – Le client ferme l'onglet pendant ou après le paiement
- Si le paiement a abouti, le webhook ajoute quand même le document à sa bibliothèque.
- Il se connecte plus tard sur `?account` avec son email et son mot de passe : le document y est.
- L'email envoyé contient aussi un lien `?order_id=…&payment=success` et un code de confirmation.

### Cas G – Connexion ultérieure (retour d'un ancien client)
1. Clic sur **Mon compte** (lien `?account` dans l'en-tête).
2. Connexion par email et mot de passe.
3. La page appelle `/my-documents` et affiche tous les documents débloqués.
4. Le bouton **Télécharger** appelle `/my-download/:docId`, qui renvoie des liens signés (valables 5 minutes).

### Cas H – Téléchargement via le lien de l'email ou de la page de succès
- Route `/download/:token` : jeton valable **24 h**, avec un **nombre maximum de téléchargements** (`MAX_DOWNLOADS`).
- Erreurs possibles :
  - `404` : code invalide ;
  - `410` : lien expiré ;
  - `429` : limite atteinte ;
  - `404` « Fichier introuvable » : le fichier n'est pas dans le bucket `documents`.
- Via `?account`, il n'y a pas de limite de compteur : le droit d'accès est permanent tant que le compte existe.

### Cas I – Déconnexion
- Bouton de déconnexion dans l'espace compte (`signOut`). Les documents restent associés au compte.

### Cas J – Mot de passe oublié
- Non géré actuellement par l'application. Le mot de passe peut être réinitialisé manuellement dans Supabase → Authentication → Users. Un flux « mot de passe oublié » reste à ajouter si besoin.

### Cas K – Document déjà acheté
- Aucun blocage côté serveur : le client peut repayer. L'ajout à la bibliothèque est dédoublonné (`addToLibrary`), mais le paiement sera bien débité. Il est préférable de masquer le bouton Acheter pour les documents déjà possédés.

---

## 3. Messages d'erreur et solutions

| Message | Cause | Solution |
|---|---|---|
| « Document introuvable » | `docId` absent du catalogue | Vérifier l'ID (1 à 18) dans `CATALOG` |
| « Nom ou email invalide » | Champ vide ou email mal formé | Corriger le formulaire |
| « Le mot de passe doit contenir au moins 8 caractères » | Mot de passe trop court | En saisir un plus long |
| « Un compte existe déjà… » (409) | Email déjà inscrit | Se connecter, puis acheter |
| « CHARGILY_SECRET_KEY manquante » | Secret absent | Ajouter le secret dans Supabase Secrets |
| « Chargily a refusé la requête » (502) | Clé invalide ou mélange test/live | Ouvrir `/diagnostic` et vérifier `isSecretKeyFormat` et `base` |
| « Le serveur de paiement ne répond pas correctement » | Fonction non déployée ou ancienne version | Redéployer et vérifier `/health` |
| « Non connecté » (401) | Session expirée | Se reconnecter |
| « Document non débloqué sur ce compte » (403) | Le document n'est pas dans la bibliothèque | Vérifier le statut de la commande |
| « Fichier introuvable dans le stockage » | Fichier absent ou mal nommé dans `documents` | Voir section 5 |
| `signature invalide` (403, webhook) | Mauvaise clé ou corps modifié | Vérifier que `CHARGILY_SECRET_KEY` est la bonne clé |

---

## 4. Guide administrateur

### 4.1 Déployer la fonction
```bash
supabase functions deploy server --project-ref vhjmuqcpadejgrymzumi --no-verify-jwt
```
- `--no-verify-jwt` est obligatoire (Verify JWT désactivé).
- Les fichiers `index.ts` **et** `index.tsx` doivent contenir la version complète (`auth-v1`). Figma Make peut réécrire `index.tsx` avec le modèle de 26 lignes : restaurez-le depuis le commit `3a8a870` avant de déployer.

### 4.2 Vérifier le déploiement
- `GET https://vhjmuqcpadejgrymzumi.supabase.co/functions/v1/server/health` doit renvoyer :
  ```json
  {"status":"ok","version":"auth-v1","mode":"test|live","keySet":true}
  ```
- `mode: test` signifie que la clé est une clé de test : aucun vrai paiement.
- `GET /diagnostic` teste la clé Chargily (préfixe, longueur, appel `/balance`).

### 4.3 Checklist avant la mise en production
- [ ] Secret `CHARGILY_SECRET_KEY` défini (clé `live_sk_…` pour la production).
- [ ] Table `kv_store_6aac110b` créée.
- [ ] Bucket public `previews` avec les aperçus.
- [ ] Bucket privé `documents` avec les fichiers.
- [ ] Verify JWT désactivé sur `server`.
- [ ] `/health` affiche `auth-v1`.
- [ ] Un achat test complet réussi : compte créé, paiement, document dans `?account`, téléchargement.
- [ ] Webhook configuré chez Chargily vers `https://vhjmuqcpadejgrymzumi.supabase.co/functions/v1/server/webhook`. Il est aussi envoyé automatiquement dans chaque checkout.
- [ ] Email : un service d'envoi est configuré (sinon `emailSent` reste `false`, ce qui n'est pas bloquant car le document est disponible dans `?account`).

### 4.4 Ajouter ou remplacer un fichier de document
Chemin dans `documents` : `Catégorie/Sous-catégorie/Dossier/<id>.<extension>`
- Le serveur essaie d'abord la version « slugifiée » du chemin, puis la version brute.
- Le nom du fichier doit commencer par l'ID du document (ex. `7.zip`, `7.pdf`).
- Plusieurs fichiers avec le même ID sont tous proposés au téléchargement.

### 4.5 Suivre une commande
- Supabase → Table `kv_store_6aac110b`, clés `order:<uuid>`. Les statuts sont `pending`, `paid` et `failed`.
- Bibliothèque d'un client : clé `lib:<userId>` (liste d'IDs). Pour débloquer un document manuellement, ajoutez l'ID dans cette liste.
- Logs : Supabase → Edge Functions → `server` → Logs (« commande créée », « webhook reçu », « commande payée »).

### 4.6 Cas particuliers de support
| Situation | Action |
|---|---|
| Client payé mais document absent | Vérifier `order:<id>`. Si `pending`, ouvrir `/order-status/<id>` : cela force la vérification chez Chargily. Sinon ajouter l'ID dans `lib:<userId>` |
| Client ne retrouve pas son compte | L'email utilisé à l'achat est l'identifiant ; vérifier dans Authentication → Users |
| Mot de passe perdu | Réinitialiser depuis Authentication → Users |
| Lien de téléchargement expiré | Le client utilise `?account` (accès permanent) |
| Aperçu qui ne s'affiche pas | Vérifier que le bucket `previews` est public |

---

## 5. Dépannage technique

1. **`/health` n'affiche pas `auth-v1`** : l'ancienne version est active. Restaurer `index.ts` et `index.tsx` (15 054 octets) depuis `3a8a870`, puis redéployer en CLI avec `--no-verify-jwt`.
2. **Erreur CORS ou 401 sur les appels** : Verify JWT est encore actif sur la fonction.
3. **Erreur 500 sur le KV** : la table `kv_store_6aac110b` n'existe pas.
4. **Webhook jamais reçu** : l'URL est injoignable ou la fonction n'est pas déployée. Le filet de sécurité `/order-status` compense tant que le client revient sur le site.
5. **Fichier introuvable** : vérifier le chemin et le nom (section 4.4).

---

## 6. Schéma résumé

```
Catalogue → Acheter → [connecté ?]
   non → création du compte (409 si email existant → connexion)
   oui → utilise la session
        ↓
POST /create-order → commande "pending" → Chargily Pay
        ↓
   payé ──► webhook checkout.paid ─┐
        └─► retour ?payment=success ─► /order-status (vérifie Chargily si besoin)
                                     ↓
                       commande "paid" + document ajouté à lib:<user> + email
                                     ↓
                     ?account → Télécharger (/my-download/:docId)

   échec/annulation/expiration ─► commande "failed" ─► nouvel essai possible
```

---

## 7. Catalogue dynamique (Supabase)

Le catalogue n'est plus dans le code : il est stocké dans `kv_store_6aac110b` (clés `doc:<id>`) et lu via `GET /catalog`.

- **Administration** : ouvrir `https://VOTRE-SITE/?admin`, saisir la clé `ADMIN_KEY`.
- **Première mise en service** : cliquer sur « Importer le catalogue initial » (charge les 18 documents d'origine).
- **Ajouter / modifier / supprimer** un document depuis le même écran. Le prix saisi (EUR) est celui utilisé par le serveur pour Chargily.
- **Fichier** : déposer le fichier dans le bucket `documents` sous `Catégorie/Sous-catégorie/Dossier/<numéro>.<extension>`.
- Secret requis : `supabase secrets set ADMIN_KEY="<mot de passe long>" --project-ref vhjmuqcpadejgrymzumi`, puis redéployer `server`.
