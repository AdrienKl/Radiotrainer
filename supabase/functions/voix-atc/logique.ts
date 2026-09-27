/* =============================================================================
   Albatros VFR — voix-atc : LA LOGIQUE, SANS RIEN DE PROPRE À DENO
   -----------------------------------------------------------------------------
   La voix du contrôleur par Google Cloud Text-to-Speech, pour les comptes
   premium. Ce fichier fait tout le travail ; index.ts ne fait que le brancher
   sur Deno.serve().

   ┌─ POURQUOI DEUX FICHIERS ─────────────────────────────────────────────────┐
   │ Ce fichier n'emploie que ce que Node ET Deno connaissent tous deux :      │
   │ Request, Response, fetch, et du TypeScript « effaçable » (des types, pas  │
   │ d'enum ni de propriétés de paramètres). Node 24 le charge donc tel quel,  │
   │ et tests/contrat/voix-atc.test.mjs le fait tourner avec un faux fetch —   │
   │ hors ligne, sans Deno, sans Supabase, sans Google. Le jour où quelqu'un y │
   │ ajoute un `Deno.env` ou un import `npm:`, le test ne se charge plus : il  │
   │ faut le remettre dans index.ts.                                           │
   └───────────────────────────────────────────────────────────────────────────┘

   ┌─ LE SEUL SECRET DE TOUTE LA CHAÎNE : LA CLÉ GOOGLE ──────────────────────┐
   │ Elle vit dans les secrets Supabase (GOOGLE_TTS_API_KEY), restreinte dans  │
   │ la console Google à la seule API Cloud Text-to-Speech. Elle part vers     │
   │ Google dans l'en-tête X-Goog-Api-Key — JAMAIS dans l'URL, où elle         │
   │ finirait dans des journaux — et ne revient JAMAIS au navigateur, pas même │
   │ dans un message d'erreur : les erreurs de Google sont résumées, pas       │
   │ relayées.                                                                 │
   │                                                                           │
   │ Aucune clé Supabase secrète n'est employée. Le plan, le statut et le      │
   │ quota se décident en base, par voix_consommer() (sql/005), appelée AVEC   │
   │ LE JETON DE L'UTILISATEUR. La fonction ne peut donc rien faire que        │
   │ l'utilisateur ne pourrait faire lui-même — sauf parler à Google.          │
   └───────────────────────────────────────────────────────────────────────────┘

   DEUX ACTIONS, en POST JSON :
     { action: 'voix' }
         → 200 { voix: [{ nom, genre }] } — les voix françaises proposées.
           Il suffit d'être connecté : un compte gratuit doit voir ce qu'il
           obtiendrait. voices.list n'est pas facturé par Google.
     { action: 'dire', texte, voix, debit?, hauteur? }
         → 200 audio/mpeg — le message du contrôleur.
           Connecté, premium, actif, et sous le quota du jour.

   TOUTE AUTRE RÉPONSE veut dire « prenez la voix du navigateur ». Le corps est
   toujours { erreur: '<code>' }, et le code dit pourquoi, pour que l'interface
   puisse l'expliquer au lieu de basculer en silence.

   MP3 et pas Opus : decodeAudioData ne lit l'Ogg/Opus sur Safari que depuis
   peu. Un message du contrôleur pèse quelques dizaines de ko, le gain d'Opus
   ne vaut pas un Safari muet.
   ========================================================================== */

export type Env = {
  cleGoogle?: string;         // GOOGLE_TTS_API_KEY
  supabaseUrl?: string;       // SUPABASE_URL, fourni par la plateforme
  supabaseCle?: string;       // clé PUBLIQUE (anon / publiable), fournie par la plateforme
  origines?: string[];        // origines autorisées (CORS)
};

type Fetch = (entree: string, init?: RequestInit) => Promise<Response>;

/* Un message du contrôleur fait ~80 caractères, un ATIS ~400. 1 000 laisse de
   la marge et reste loin de la limite de Google (5 000 octets). Au-delà, ce
   n'est plus un message radio. */
export const TEXTE_MAX = 1000;

/* Google coupe rarement, mais un appel peut traîner. Le navigateur aura son
   propre délai, plus court : c'est lui qui décide de basculer. Celui-ci évite
   seulement qu'une fonction reste pendue jusqu'à la limite de la plateforme. */
export const DELAI_GOOGLE_MS = 8000;

/* Débit et hauteur : les bornes de l'API Google (speakingRate 0,25 à 4 ;
   pitch -20 à 20 demi-tons), resserrées à ce qu'emploie l'application — le
   débit va de 0,8 à 1,35 (urgences comprises), la hauteur reste proche de 0. */
export const DEBIT_MIN = 0.5, DEBIT_MAX = 2;
export const HAUTEUR_MIN = -5, HAUTEUR_MAX = 5;

/* Les voix acceptées. On ne code AUCUN nom de voix en dur : la liste est
   celle que Google renvoie pour fr-FR, filtrée par FAMILLE. Coder des noms,
   c'est garantir qu'un jour l'un d'eux disparaît chez Google et qu'une requête
   échoue sans qu'on sache pourquoi.
   Standard est exclue : c'est la génération la plus ancienne, à peine meilleure
   que la voix du navigateur — ce serait vendre en premium ce qu'on a gratuit. */
export const FAMILLES = ['Chirp3-HD', 'Chirp-HD', 'Neural2', 'Wavenet', 'Studio'];
const RE_VOIX = new RegExp('^fr-FR-(' + FAMILLES.map(f => f.replace(/[-]/g, '\\-')).join('|') + ')-[A-Za-z0-9]+$');
export function voixValide(nom: unknown): boolean {
  return typeof nom === 'string' && RE_VOIX.test(nom);
}

/* Les voix Chirp n'acceptent pas le paramètre `pitch` : Google refuse la
   requête entière s'il est présent. On ne l'envoie donc qu'aux autres familles. */
function accepteHauteur(nom: string): boolean { return !/^fr-FR-Chirp/.test(nom); }

export const ORIGINES_PAR_DEFAUT = [
  'https://albatrosvfr.fr',
  'https://www.albatrosvfr.fr',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
];

/* ---- La clé PUBLIQUE de Supabase, telle que la plateforme la fournit ------
   Le projet emploie les nouvelles clés (sb_publishable_…). La plateforme les
   donne dans SUPABASE_PUBLISHABLE_KEYS, un objet JSON de clés nommées
   ({"default":"sb_publishable_…"}) ; l'ancienne SUPABASE_ANON_KEY reste
   fournie à côté tant que les clés historiques ne sont pas désactivées. On
   prend la nouvelle d'abord : le jour où l'on désactive les anciennes, la
   fonction ne doit pas tomber en panne sans prévenir. */
export function clePublique(lire: (nom: string) => string | undefined): string | undefined {
  const brut = lire('SUPABASE_PUBLISHABLE_KEYS');
  if (brut) {
    try {
      const cles = JSON.parse(brut) as Record<string, string>;
      const cle = cles.default || Object.values(cles)[0];
      if (cle) return cle;
    } catch { /* mal formée : on passe aux suivantes */ }
  }
  return lire('SUPABASE_PUBLISHABLE_KEY') || lire('SUPABASE_ANON_KEY') || undefined;
}

/* ---- CORS -------------------------------------------------------------------
   Ce n'est pas une protection — un script hors navigateur ignore CORS, et c'est
   le jeton qui protège. C'est ce qui empêche un AUTRE site de faire parler la
   voix premium d'un élève connecté depuis son propre onglet. */
function entetesCors(req: Request, env: Env): Record<string, string> {
  const origine = req.headers.get('origin') || '';
  const permises = env.origines && env.origines.length ? env.origines : ORIGINES_PAR_DEFAUT;
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (permises.includes(origine)) h['Access-Control-Allow-Origin'] = origine;
  return h;
}

function json(corps: unknown, statut: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
const erreur = (code: string, statut: number, cors: Record<string, string>) => json({ erreur: code }, statut, cors);

function jetonDe(req: Request): string | null {
  const a = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(\S+)$/i.exec(a);
  return m ? m[1] : null;
}

/* ---- Supabase : QUI appelle -------------------------------------------------
   /auth/v1/user valide le jeton côté Supabase (signature, expiration,
   révocation). Le décoder ici sans le vérifier ne prouverait rien. */
async function utilisateur(jeton: string, env: Env, f: Fetch): Promise<boolean> {
  const r = await f(env.supabaseUrl + '/auth/v1/user', {
    headers: { apikey: env.supabaseCle || '', Authorization: 'Bearer ' + jeton }
  });
  return r.ok;
}

/* ---- Supabase : a-t-il DROIT à ce message ? ---------------------------------
   Tout se décide en base, en une transaction : premium, actif, quota. */
type Decompte = { ok: boolean; raison?: string; restant?: number };
async function consommer(jeton: string, n: number, env: Env, f: Fetch): Promise<Decompte | null> {
  const r = await f(env.supabaseUrl + '/rest/v1/rpc/voix_consommer', {
    method: 'POST',
    headers: { apikey: env.supabaseCle || '', Authorization: 'Bearer ' + jeton,
               'Content-Type': 'application/json' },
    body: JSON.stringify({ n })
  });
  // 401/403 : le jeton est refusé par la base elle-même (expiré, falsifié).
  if (r.status === 401 || r.status === 403) return { ok: false, raison: 'non_connecte' };
  if (!r.ok) return null;
  try { return await r.json() as Decompte; } catch { return null; }
}

/* ---- Google ---------------------------------------------------------------- */
let voixEnCache: { quand: number; voix: { nom: string; genre: string }[] } | null = null;
const CACHE_VOIX_MS = 3600_000;
export function viderCacheVoix() { voixEnCache = null; }

async function listerVoix(env: Env, f: Fetch): Promise<{ nom: string; genre: string }[] | null> {
  if (voixEnCache && Date.now() - voixEnCache.quand < CACHE_VOIX_MS) return voixEnCache.voix;
  const r = await f('https://texttospeech.googleapis.com/v1/voices?languageCode=fr-FR', {
    headers: { 'X-Goog-Api-Key': env.cleGoogle || '' },
    signal: AbortSignal.timeout(DELAI_GOOGLE_MS)
  });
  if (!r.ok) return null;
  const d = await r.json() as { voices?: { name: string; ssmlGender?: string; languageCodes?: string[] }[] };
  const voix = (d.voices || [])
    .filter(v => voixValide(v.name))
    .map(v => ({ nom: v.name, genre: v.ssmlGender === 'FEMALE' ? 'F' : v.ssmlGender === 'MALE' ? 'M' : '?' }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
  voixEnCache = { quand: Date.now(), voix };
  return voix;
}

async function synthetiser(texte: string, voix: string, debit: number, hauteur: number,
                           env: Env, f: Fetch): Promise<Uint8Array | 'delai' | null> {
  const audioConfig: Record<string, unknown> = { audioEncoding: 'MP3', speakingRate: debit };
  if (hauteur !== 0 && accepteHauteur(voix)) audioConfig.pitch = hauteur;
  let r: Response;
  try {
    r = await f('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { 'X-Goog-Api-Key': env.cleGoogle || '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { text: texte }, voice: { languageCode: 'fr-FR', name: voix }, audioConfig }),
      signal: AbortSignal.timeout(DELAI_GOOGLE_MS)
    });
  } catch (e) {
    const nom = (e as { name?: string })?.name;
    return nom === 'TimeoutError' || nom === 'AbortError' ? 'delai' : null;
  }
  if (!r.ok) return null;
  const d = await r.json() as { audioContent?: string };
  if (!d.audioContent) return null;
  const bin = atob(d.audioContent);
  const octets = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
  return octets;
}

function nombreBorne(v: unknown, defaut: number, min: number, max: number): number | null {
  if (v === undefined || v === null) return defaut;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(max, Math.max(min, v));
}

/* ---- LE POINT D'ENTRÉE ------------------------------------------------------ */
export async function traiter(req: Request, env: Env, f: Fetch = fetch): Promise<Response> {
  const cors = entetesCors(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return erreur('methode', 405, cors);

  /* Mal configurée, la fonction le dit — sans dire QUOI manque : ce détail
     irait au navigateur. Il est dans les journaux de la plateforme. */
  if (!env.cleGoogle || !env.supabaseUrl || !env.supabaseCle) {
    console.error('[voix-atc] configuration incomplète :',
      !env.cleGoogle ? 'GOOGLE_TTS_API_KEY' : '', !env.supabaseUrl ? 'SUPABASE_URL' : '',
      !env.supabaseCle ? 'clé publique Supabase' : '');
    return erreur('configuration', 500, cors);
  }

  const jeton = jetonDe(req);
  if (!jeton) return erreur('non_connecte', 401, cors);

  let corps: Record<string, unknown>;
  try { corps = await req.json(); } catch { return erreur('requete', 400, cors); }
  if (!corps || typeof corps !== 'object') return erreur('requete', 400, cors);

  try {
    if (corps.action === 'voix') {
      if (!(await utilisateur(jeton, env, f))) return erreur('non_connecte', 401, cors);
      const voix = await listerVoix(env, f);
      if (!voix) return erreur('google', 502, cors);
      return json({ voix }, 200, cors);
    }

    if (corps.action === 'dire') {
      /* Tout se valide AVANT de décompter quoi que ce soit : une requête
         malformée ne doit pas coûter de quota. */
      const texte = typeof corps.texte === 'string' ? corps.texte.replace(/\s+/g, ' ').trim() : '';
      if (!texte) return erreur('texte_vide', 400, cors);
      if (texte.length > TEXTE_MAX) return erreur('texte_long', 400, cors);
      /* La voix est OBLIGATOIRE : une voix « par défaut » codée ici serait un
         nom en dur, exactement ce que FAMILLES évite. L'interface prend la
         sienne dans la liste que renvoie l'action 'voix'. */
      const voix = corps.voix;
      if (!voixValide(voix)) return erreur('voix', 400, cors);
      const debit = nombreBorne(corps.debit, 1, DEBIT_MIN, DEBIT_MAX);
      const hauteur = nombreBorne(corps.hauteur, 0, HAUTEUR_MIN, HAUTEUR_MAX);
      if (debit === null || hauteur === null) return erreur('requete', 400, cors);

      /* On décompte les caractères de `texte` NORMALISÉ, pas du corps reçu :
         c'est ce qui part chez Google, donc ce qui est facturé. */
      const d = await consommer(jeton, texte.length, env, f);
      if (!d) return erreur('base', 502, cors);
      if (!d.ok) {
        const statut = d.raison === 'non_connecte' ? 401 : d.raison === 'quota' ? 429 : 403;
        return json({ erreur: d.raison || 'refuse', restant: d.restant }, statut, cors);
      }

      const audio = await synthetiser(texte, voix as string, debit, hauteur, env, f);
      if (audio === 'delai') return erreur('delai', 504, cors);
      if (!audio) return erreur('google', 502, cors);
      return new Response(audio, {
        status: 200,
        headers: { ...cors, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store',
                   'X-Voix-Restant': String(d.restant ?? '') ,
                   'Access-Control-Expose-Headers': 'X-Voix-Restant' }
      });
    }

    return erreur('action', 400, cors);
  } catch (e) {
    /* Journalisé côté serveur, résumé côté navigateur. Le message d'une
       exception pourrait contenir une URL, un en-tête — on ne le relaie pas. */
    console.error('[voix-atc] erreur inattendue :', e);
    return erreur('interne', 500, cors);
  }
}
