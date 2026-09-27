/* =============================================================================
   Albatros VFR — voix-atc : LE BRANCHEMENT SUR DENO
   -----------------------------------------------------------------------------
   Tout le travail est dans logique.ts, testé hors ligne par Node
   (tests/contrat/voix-atc.test.mjs). Ce fichier ne fait que lire
   l'environnement et servir. Il doit rester aussi court : tout ce qui y serait
   ajouté échapperait aux tests.

   SECRETS ET VARIABLES
     GOOGLE_TTS_API_KEY  — à poser soi-même :
                             supabase secrets set GOOGLE_TTS_API_KEY=…
                           Clé restreinte, dans la console Google, à la seule
                           API Cloud Text-to-Speech.
     SUPABASE_URL        — fournie par la plateforme.
     SUPABASE_PUBLISHABLE_KEYS (ou, à défaut, SUPABASE_ANON_KEY)
                         — fournie par la plateforme. C'est une clé PUBLIQUE :
                           elle ne donne que ce que la RLS autorise. Aucune clé
                           secrète Supabase n'est lue ici, volontairement.
     VOIX_ORIGINES       — facultatif : origines autorisées, séparées par des
                           virgules. À défaut, celles de logique.ts.

   DÉPLOIEMENT (voir supabase/functions/voix-atc/README.md)
     supabase functions deploy voix-atc --no-verify-jwt
   `--no-verify-jwt` n'ouvre rien : le projet emploie les nouvelles clés
   (sb_publishable_…), et la vérification automatique de la plateforme ne
   comprend que les anciennes — Supabase demande de la désactiver et de
   vérifier dans le code. Le jeton est vérifié DANS la fonction, par Supabase Auth
   (/auth/v1/user) et par la base (voix_consommer, qui lit auth.uid()).
   ========================================================================== */
import { traiter, clePublique } from './logique.ts';

const env = {
  cleGoogle:   Deno.env.get('GOOGLE_TTS_API_KEY'),
  supabaseUrl: Deno.env.get('SUPABASE_URL'),
  supabaseCle: clePublique(nom => Deno.env.get(nom)),
  origines:    (Deno.env.get('VOIX_ORIGINES') || '').split(',').map(s => s.trim()).filter(Boolean)
};

Deno.serve(req => traiter(req, env));
