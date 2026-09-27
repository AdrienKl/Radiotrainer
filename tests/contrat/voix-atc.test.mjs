/* =============================================================================
   Albatros VFR — LA FONCTION voix-atc, HORS LIGNE
   -----------------------------------------------------------------------------
   supabase/functions/voix-atc/logique.ts tourne ici sous Node, avec un FAUX
   fetch : aucun appel ne part vers Supabase ni vers Google. Le faux fetch joue
   les deux, et note tout ce qu'on lui demande — c'est ce qui permet de
   vérifier ce qui N'EST PAS appelé : une requête refusée ne doit rien coûter,
   ni quota, ni caractère facturé par Google.

   Ce que ces tests surveillent, par ordre de gravité :
     1. la clé Google ne part jamais ailleurs que chez Google, dans un en-tête,
        et ne revient jamais au navigateur ;
     2. Google n'est appelé qu'APRÈS le feu vert de la base (premium, actif,
        sous le quota) ;
     3. une requête malformée ne décompte rien ;
     4. toute panne rend une erreur nette — c'est ce qui fera basculer
        l'interface sur la voix du navigateur.

   Ce qu'ils ne prouvent PAS : que Google accepte vraiment ces requêtes, ni que
   la plateforme Supabase sert la fonction comme prévu. Ça se vérifie une fois,
   à la main, après déploiement (supabase/functions/voix-atc/README.md).
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lire } from './_source.mjs';
import { traiter, clePublique, viderCacheVoix, TEXTE_MAX } from '../../supabase/functions/voix-atc/logique.ts';

const CLE_GOOGLE = 'CLE-GOOGLE-DE-TEST-0123456789';
const ENV = { cleGoogle: CLE_GOOGLE, supabaseUrl: 'https://projet.supabase.co',
              supabaseCle: 'sb_publishable_test', origines: [] };
const JETON = 'jeton-utilisateur';
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]);   // « ID3… »

/* Le faux réseau. `base` dit ce que rend voix_consommer ; `google` ce que rend
   la synthèse. Chaque appel est noté, avec son URL, ses en-têtes et son corps. */
function reseau({ auth = 200, base = { ok: true, restant: 99000 }, baseStatut = 200,
                  google = 'ok', voix = null } = {}) {
  const appels = [];
  const f = async (url, init = {}) => {
    const h = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const corps = init.body ? JSON.parse(init.body) : null;
    appels.push({ url, h, corps });
    if (url.endsWith('/auth/v1/user')) return new Response('{}', { status: auth });
    if (url.endsWith('/rest/v1/rpc/voix_consommer')) return new Response(JSON.stringify(base), { status: baseStatut });
    if (url.includes('texttospeech.googleapis.com/v1/voices')) {
      return new Response(JSON.stringify({ voices: voix || [] }), { status: 200 });
    }
    if (url.includes('texttospeech.googleapis.com/v1/text:synthesize')) {
      if (google === 'delai') { const e = new Error('délai'); e.name = 'TimeoutError'; throw e; }
      if (google === 'panne') return new Response(JSON.stringify({ error: { message: 'API key ' + CLE_GOOGLE + ' invalid' } }), { status: 403 });
      return new Response(JSON.stringify({ audioContent: Buffer.from(MP3).toString('base64') }), { status: 200 });
    }
    throw new Error('appel inattendu : ' + url);
  };
  f.appels = appels;
  f.vers = motif => appels.filter(a => a.url.includes(motif));
  return f;
}

function requete(corps, { jeton = JETON, origine = 'https://albatrosvfr.fr', methode = 'POST', brut } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: origine };
  if (jeton) headers.Authorization = 'Bearer ' + jeton;
  return new Request('https://projet.supabase.co/functions/v1/voix-atc', {
    method: methode, headers, body: methode === 'POST' ? (brut ?? JSON.stringify(corps)) : undefined
  });
}
const dire = (extra = {}) => ({ action: 'dire', texte: 'F-ABCD, roulez point d\'attente piste 27.',
                                voix: 'fr-FR-Neural2-B', ...extra });
const corpsDe = async r => JSON.parse(await r.text());

/* ---- 1. La clé Google -------------------------------------------------------- */

test('la clé Google part chez Google, dans un en-tête, et nulle part ailleurs', async () => {
  const f = reseau();
  const r = await traiter(requete(dire()), ENV, f);
  assert.equal(r.status, 200);
  for (const a of f.appels) {
    assert.ok(!a.url.includes(CLE_GOOGLE), `la clé est dans une URL : ${a.url}`);
    const vaChezGoogle = a.url.startsWith('https://texttospeech.googleapis.com/');
    assert.equal(a.h['x-goog-api-key'] === CLE_GOOGLE, vaChezGoogle,
      vaChezGoogle ? 'Google appelé sans la clé' : `la clé est partie vers ${a.url}`);
  }
});

test('une erreur de Google ne renvoie JAMAIS son message au navigateur', async () => {
  /* Google recopie parfois la clé dans son message d'erreur. Le relayer, c'est
     la publier. */
  const r = await traiter(requete(dire()), ENV, reseau({ google: 'panne' }));
  assert.equal(r.status, 502);
  const t = await r.text();
  assert.ok(!t.includes(CLE_GOOGLE), 'la clé Google est revenue au navigateur');
  assert.deepEqual(JSON.parse(t), { erreur: 'google' });
});

test('le jeton de l\'utilisateur ne part JAMAIS chez Google', async () => {
  const f = reseau();
  await traiter(requete(dire()), ENV, f);
  for (const a of f.vers('googleapis.com')) {
    assert.ok(!JSON.stringify(a.h).includes(JETON), 'le jeton Supabase est parti chez Google');
  }
});

/* ---- 2. Google après le feu vert de la base ------------------------------ */

for (const [raison, statut] of [['non_premium', 403], ['compte_inactif', 403], ['quota', 429], ['non_connecte', 401]]) {
  test(`base : « ${raison} » → ${statut}, et Google n'est PAS appelé`, async () => {
    const f = reseau({ base: { ok: false, raison, restant: raison === 'quota' ? 12 : undefined } });
    const r = await traiter(requete(dire()), ENV, f);
    assert.equal(r.status, statut);
    assert.equal((await corpsDe(r)).erreur, raison);
    assert.equal(f.vers('googleapis.com').length, 0, 'Google a été appelé malgré le refus de la base');
  });
}

test('un jeton refusé par la base (401) vaut « non connecté », sans appel à Google', async () => {
  const f = reseau({ base: { message: 'JWT expired' }, baseStatut: 401 });
  const r = await traiter(requete(dire()), ENV, f);
  assert.equal(r.status, 401);
  assert.equal(f.vers('googleapis.com').length, 0);
});

test('la base en panne → 502, sans appel à Google', async () => {
  const f = reseau({ base: {}, baseStatut: 500 });
  const r = await traiter(requete(dire()), ENV, f);
  assert.equal(r.status, 502);
  assert.equal(f.vers('googleapis.com').length, 0);
});

test('la base reçoit le jeton DE L\'UTILISATEUR et la clé publique — aucune clé secrète', async () => {
  const f = reseau();
  await traiter(requete(dire()), ENV, f);
  const [rpc] = f.vers('/rpc/voix_consommer');
  assert.equal(rpc.h.authorization, 'Bearer ' + JETON);
  assert.equal(rpc.h.apikey, 'sb_publishable_test');
});

/* ---- 3. Une requête malformée ne décompte rien ---------------------------- */

const MALFORMEES = [
  ['texte absent',            { action: 'dire', voix: 'fr-FR-Neural2-B' },            'texte_vide'],
  ['texte fait de blancs',    dire({ texte: '   \n  ' }),                             'texte_vide'],
  ['texte trop long',         dire({ texte: 'a'.repeat(TEXTE_MAX + 1) }),             'texte_long'],
  ['voix absente',            { action: 'dire', texte: 'Bonjour.' },                   'voix'],
  ['voix Standard (exclue)',  dire({ voix: 'fr-FR-Standard-A' }),                     'voix'],
  ['voix d\'une autre langue', dire({ voix: 'en-US-Neural2-A' }),                     'voix'],
  ['voix fabriquée',          dire({ voix: 'fr-FR-Neural2-B"}],"x":"' }),             'voix'],
  ['débit non numérique',     dire({ debit: 'vite' }),                                'requete'],
  ['hauteur en tableau',      dire({ hauteur: [2] }),                                 'requete'],
];
for (const [nom, corps, code] of MALFORMEES) {
  test(`malformée (${nom}) → 400 « ${code} », sans décompte ni Google`, async () => {
    const f = reseau();
    const r = await traiter(requete(corps), ENV, f);
    assert.equal(r.status, 400);
    assert.equal((await corpsDe(r)).erreur, code);
    assert.equal(f.appels.length, 0, `appel(s) inattendu(s) : ${f.appels.map(a => a.url).join(', ')}`);
  });
}

test('JSON illisible → 400, sans appel', async () => {
  const f = reseau();
  const r = await traiter(requete(null, { brut: '{pas du json' }), ENV, f);
  assert.equal(r.status, 400);
  assert.equal(f.appels.length, 0);
});

test('action inconnue → 400', async () => {
  const r = await traiter(requete({ action: 'effacer' }), ENV, reseau());
  assert.equal(r.status, 400);
});

test('sans jeton → 401, sans aucun appel', async () => {
  const f = reseau();
  const r = await traiter(requete(dire(), { jeton: null }), ENV, f);
  assert.equal(r.status, 401);
  assert.equal(f.appels.length, 0);
});

test('configuration incomplète → 500 « configuration », sans dire ce qui manque', async () => {
  const f = reseau();
  const r = await traiter(requete(dire()), { ...ENV, cleGoogle: undefined }, f);
  assert.equal(r.status, 500);
  assert.deepEqual(await corpsDe(r), { erreur: 'configuration' });
  assert.equal(f.appels.length, 0);
});

test('seule la méthode POST est servie (OPTIONS pour CORS mis à part)', async () => {
  const r = await traiter(requete(null, { methode: 'GET' }), ENV, reseau());
  assert.equal(r.status, 405);
});

/* ---- 4. Le chemin nominal --------------------------------------------------- */

test('« dire » rend du MP3, décompte le texte NORMALISÉ, transmet voix et débit', async () => {
  const f = reseau({ base: { ok: true, restant: 4321 } });
  const texte = '  F-ABCD,   rappelez   vent arrière.  ';
  const r = await traiter(requete(dire({ texte, debit: 1.12 })), ENV, f);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'audio/mpeg');
  assert.equal(r.headers.get('x-voix-restant'), '4321');
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), MP3);

  const normalise = 'F-ABCD, rappelez vent arrière.';
  assert.deepEqual(f.vers('/rpc/voix_consommer')[0].corps, { n: normalise.length });
  const g = f.vers('text:synthesize')[0].corps;
  assert.equal(g.input.text, normalise);
  assert.deepEqual(g.voice, { languageCode: 'fr-FR', name: 'fr-FR-Neural2-B' });
  assert.equal(g.audioConfig.audioEncoding, 'MP3');
  assert.equal(g.audioConfig.speakingRate, 1.12);
});

test('le débit est borné, et la hauteur n\'est PAS envoyée aux voix Chirp', async () => {
  /* Les voix Chirp 3 HD n'acceptent pas `pitch` : l'envoyer ferait refuser la
     requête entière — donc toute urgence (hauteur relevée) muette en premium. */
  let f = reseau();
  await traiter(requete(dire({ voix: 'fr-FR-Chirp3-HD-Charon', debit: 9, hauteur: 2 })), ENV, f);
  let g = f.vers('text:synthesize')[0].corps;
  assert.equal(g.audioConfig.speakingRate, 2);
  assert.ok(!('pitch' in g.audioConfig), 'pitch envoyé à une voix Chirp');

  f = reseau();
  await traiter(requete(dire({ voix: 'fr-FR-Wavenet-D', hauteur: 2 })), ENV, f);
  g = f.vers('text:synthesize')[0].corps;
  assert.equal(g.audioConfig.pitch, 2);
});

test('Google trop lent → 504 « delai »', async () => {
  const r = await traiter(requete(dire()), ENV, reseau({ google: 'delai' }));
  assert.equal(r.status, 504);
  assert.deepEqual(await corpsDe(r), { erreur: 'delai' });
});

/* ---- La liste des voix ------------------------------------------------------ */

const VOIX_GOOGLE = [
  { name: 'fr-FR-Standard-A', ssmlGender: 'FEMALE' },
  { name: 'fr-FR-Neural2-B', ssmlGender: 'MALE' },
  { name: 'fr-FR-Chirp3-HD-Charon', ssmlGender: 'MALE' },
  { name: 'fr-FR-Wavenet-A', ssmlGender: 'FEMALE' },
  { name: 'fr-CA-Neural2-A', ssmlGender: 'FEMALE' },
  { name: 'fr-FR-Polyglot-1', ssmlGender: 'MALE' }
];

test('« voix » : un compte connecté reçoit les voix françaises, sans Standard', async () => {
  viderCacheVoix();
  const f = reseau({ voix: VOIX_GOOGLE });
  const r = await traiter(requete({ action: 'voix' }), ENV, f);
  assert.equal(r.status, 200);
  assert.deepEqual((await corpsDe(r)).voix, [
    { nom: 'fr-FR-Chirp3-HD-Charon', genre: 'M' },
    { nom: 'fr-FR-Neural2-B', genre: 'M' },
    { nom: 'fr-FR-Wavenet-A', genre: 'F' }
  ]);
  assert.equal(f.vers('/rpc/').length, 0, 'lister les voix ne doit rien décompter');
});

test('« voix » : un jeton refusé par Supabase Auth → 401, Google pas appelé', async () => {
  viderCacheVoix();
  const f = reseau({ auth: 401, voix: VOIX_GOOGLE });
  const r = await traiter(requete({ action: 'voix' }), ENV, f);
  assert.equal(r.status, 401);
  assert.equal(f.vers('googleapis.com').length, 0);
});

/* ---- CORS ------------------------------------------------------------------- */

test('CORS : le site est autorisé, un autre site non', async () => {
  let r = await traiter(requete(null, { methode: 'OPTIONS' }), ENV, reseau());
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://albatrosvfr.fr');

  r = await traiter(requete(null, { methode: 'OPTIONS', origine: 'https://ailleurs.example' }), ENV, reseau());
  assert.equal(r.headers.get('access-control-allow-origin'), null);

  r = await traiter(requete(null, { methode: 'OPTIONS', origine: 'https://ailleurs.example' }),
                    { ...ENV, origines: ['https://ailleurs.example'] }, reseau());
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://ailleurs.example');
});

/* ---- La clé publique fournie par la plateforme ------------------------------ */

test('la clé publique : la nouvelle d\'abord, l\'ancienne en repli', () => {
  const env = o => nom => o[nom];
  assert.equal(clePublique(env({ SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_a","web":"sb_publishable_b"}',
                                 SUPABASE_ANON_KEY: 'ancienne' })), 'sb_publishable_a');
  assert.equal(clePublique(env({ SUPABASE_PUBLISHABLE_KEYS: '{"web":"sb_publishable_b"}' })), 'sb_publishable_b');
  assert.equal(clePublique(env({ SUPABASE_PUBLISHABLE_KEYS: 'pas du json', SUPABASE_ANON_KEY: 'ancienne' })), 'ancienne');
  assert.equal(clePublique(env({})), undefined);
});

/* ---- Ce que le code doit continuer à respecter ------------------------------ */

test('logique.ts reste chargeable par Node : ni Deno, ni import npm:', () => {
  /* S'il l'était plus, CE fichier ne se chargerait plus — mais l'erreur serait
     obscure. Celle-ci dit quoi faire. */
  const s = lire('supabase/functions/voix-atc/logique.ts').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\bDeno\./.test(s), 'logique.ts emploie Deno : le mettre dans index.ts');
  assert.ok(!/from\s+['"](npm|jsr|https?):/.test(s), 'logique.ts importe un module distant : le mettre dans index.ts');
});

test('index.ts ne lit aucune clé Supabase SECRÈTE', () => {
  const s = lire('supabase/functions/voix-atc/index.ts');
  assert.ok(!/SERVICE_ROLE|SECRET_KEYS/.test(s.replace(/\/\*[\s\S]*?\*\//g, '')),
    'la fonction lit une clé secrète Supabase : tout doit passer par le jeton de l\'utilisateur');
});

test('le navigateur ne parle JAMAIS à Google directement', () => {
  /* Une requête directe du navigateur exigerait la clé dans la page. */
  const s = lire('index.html') + lire('assets/noyau/5-voix.js');
  assert.ok(!/texttospeech\.googleapis\.com/.test(s), 'le front appelle Google en direct');
});
