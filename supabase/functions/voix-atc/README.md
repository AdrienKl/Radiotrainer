# voix-atc — la voix Google du contrôleur (premium)

Fonction Edge Supabase qui fait parler le contrôleur avec Google Cloud
Text-to-Speech, pour les comptes `plan = 'premium'`. La voix du navigateur
reste l'option gratuite, et le repli automatique si cette fonction répond
autre chose que 200.

| Fichier | Rôle |
|---|---|
| `logique.ts` | tout le travail — testé hors ligne par `tests/contrat/voix-atc.test.mjs` |
| `index.ts` | lit l'environnement et sert. Doit rester minuscule : ce qui y est ajouté échappe aux tests |
| `sql/005-voix-premium.sql` | le compteur par jour, le plafond (100 000 caractères), la vérification premium/actif |

## Le contrat

`POST` JSON, en-tête `Authorization: Bearer <jeton de session Supabase>`.

| Corps | Réponse |
|---|---|
| `{ "action": "voix" }` | `200 { voix: [{ nom, genre }] }` — voix fr-FR des familles Chirp3-HD, Chirp-HD, Neural2, Wavenet, Studio. Connecté suffit |
| `{ "action": "dire", "texte", "voix", "debit"?, "hauteur"? }` | `200 audio/mpeg`, en-tête `X-Voix-Restant`. Premium, actif, sous le quota |

Toute autre réponse : `{ erreur: code }` — `non_connecte` (401), `non_premium` /
`compte_inactif` / `voix_desactivee` (403 — une voix retirée par
l'administration, sql/007), `quota` (429, avec `restant`), `texte_vide` /
`texte_long` / `voix` / `requete` / `action` (400), `google` / `base` (502),
`delai` (504), `configuration` / `interne` (500). **Pour l'interface, tout
code ≠ 200 veut dire : voix du navigateur.**

## Mise en service — dans cet ordre

Rien de tout ceci n'est encore fait (27/09/2026).

1. **La clé Google.** Console Google Cloud › API et services › Identifiants ›
   Créer une clé API, puis *Modifier* :
   - **Restrictions d'API** : *Restreindre la clé* → **Cloud Text-to-Speech API** seule ;
   - **Restrictions d'application** : *Aucune*. Les appels partent des serveurs
     de Supabase, dont les adresses ne sont pas fixes — une restriction par IP
     ou par site web bloquerait la fonction elle-même. C'est pourquoi la clé ne
     doit exister QUE dans les secrets Supabase.
   - Poser une **alerte de budget** sur le projet Google (Facturation › Budgets).

   Le compte de service `albatros-vfr-tts` n'est pas employé : ne lui créez pas
   de clé JSON. Il peut être supprimé ou laissé tel quel, sans clé il n'ouvre rien.

2. **La migration**, par l'API et jamais par le presse-papier (CLAUDE.md § 21.2) :
   ```sh
   SUPABASE_ACCESS_TOKEN='sbp_…' sh supabase/poser-sql.sh sql/005-voix-premium.sql
   ```

3. **Le secret et la fonction** (CLI Supabase, `npx supabase` suffit) :
   ```sh
   npx supabase login
   npx supabase secrets set GOOGLE_TTS_API_KEY='…' --project-ref vbziwjeuzcbvrbrihhrg
   npx supabase functions deploy voix-atc --no-verify-jwt --project-ref vbziwjeuzcbvrbrihhrg
   ```
   `--no-verify-jwt` : la vérification automatique de la plateforme ne comprend
   que les anciennes clés, le projet emploie les nouvelles (`sb_publishable_…`).
   Le jeton est vérifié DANS la fonction (Supabase Auth, puis la base).
   **Tapez la clé dans le terminal, ne la collez dans aucun fichier du dépôt** :
   `tests/contrat/secrets.test.mjs` la cherche (`AIza…`), mais un secret publié
   une fois est un secret brûlé.

4. **Un compte premium de test**, depuis l'éditeur SQL :
   ```sql
   update public.profiles set plan = 'premium' where email = '…';
   ```

5. **Vérification réelle, une fois** — ce que les tests hors ligne ne peuvent
   pas prouver : que Google accepte ces requêtes et que la plateforme sert la
   fonction. Avec le jeton de session d'un compte premium (onglet Réseau du
   navigateur, en-tête `Authorization` d'une requête vers Supabase) :
   ```sh
   URL=https://vbziwjeuzcbvrbrihhrg.supabase.co/functions/v1/voix-atc
   curl -s -X POST $URL -H "Authorization: Bearer $JETON" \
        -H 'Content-Type: application/json' -d '{"action":"voix"}'
   curl -s -X POST $URL -H "Authorization: Bearer $JETON" \
        -H 'Content-Type: application/json' \
        -d '{"action":"dire","texte":"F-ABCD, rappelez vent arrière.","voix":"<une voix de la liste>"}' \
        -o essai.mp3 -D - && open essai.mp3
   ```
   Puis refaire l'appel `dire` avec le jeton d'un compte GRATUIT : attendu
   `403 {"erreur":"non_premium"}`. Et vérifier la ligne écrite dans
   `voix_consommation`.
