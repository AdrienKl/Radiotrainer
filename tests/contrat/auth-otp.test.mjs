/* =============================================================================
   AVIERO — L'AUTHENTIFICATION PASSE PAR SUPABASE, ET PAR RIEN D'AUTRE
   -----------------------------------------------------------------------------
   Ce fichier surveille une contrainte d'ARCHITECTURE, pas un comportement :

       aucun code à usage unique n'est fabriqué, stocké ni comparé ici.

   C'est la contrainte la plus facile à violer sans le vouloir. Un jour où
   l'e-mail ne part pas, engendrer un code « juste pour tester » et le garder
   dans le stockage local prend quatre lignes, marche tout de suite, et
   n'enlève aucun test au vert. On aurait alors un système d'authentification
   maison — avec des secrets dans un navigateur, c'est-à-dire sur une page qui
   appartient à l'utilisateur (CLAUDE.md § 8).

   Ces vérifications ne prouvent pas que l'authentification FONCTIONNE : ça se
   vérifie avec une vraie adresse e-mail, et c'est écrit dans INSCRIPTION.md.
   Elles prouvent qu'on n'a pas quitté Supabase.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lire } from './_source.mjs';

const AUTH = lire('assets/auth.js');

test('le code est demandé à Supabase, jamais fabriqué ici', () => {
  assert.match(AUTH, /auth\.signInWithOtp\(/,
    'signInWithOtp est la primitive qui envoie le code de connexion');
  assert.match(AUTH, /auth\.resetPasswordForEmail\(/,
    'resetPasswordForEmail est la primitive qui envoie le code de récupération');

  /* Un code à six chiffres tiré au sort dans le navigateur. C'est la forme
     exacte qu'aurait la version maison, et elle est très reconnaissable. */
  const tirage = /Math\.random\(\)[^;\n]{0,80}(1000000|999999|100000)/;
  assert.ok(!tirage.test(AUTH),
    'un code à six chiffres est tiré au sort dans le navigateur : ce serait un OTP maison');
});

test('le code vérifié est celui de Supabase, et le type est le bon', () => {
  assert.match(AUTH, /auth\.verifyOtp\(/, 'verifyOtp est la seule vérification légitime');

  /* Le parcours de récupération DOIT employer 'recovery', et lui seul.
     otpVerifier() essaie trois types parce qu'un code de connexion arrive sous
     'signup' ou 'magiclink' selon que l'adresse est neuve ou connue. Le
     réutiliser ici ouvrirait une session de CONNEXION là où on attend une
     session de RÉCUPÉRATION — et laisserait entrer quelqu'un qui a un code de
     connexion en cours dans un parcours qui va changer le mot de passe. */
  const bloc = AUTH.slice(AUTH.indexOf('recuperationVerifier'),
                          AUTH.indexOf('recuperationVerifier') + 700);
  assert.match(bloc, /type:\s*'recovery'/,
    "recuperationVerifier doit vérifier le code sous le type 'recovery'");
  assert.ok(!/TYPES\s*=/.test(bloc),
    'recuperationVerifier ne doit PAS essayer plusieurs types : il n\'y a aucune ambiguïté ici');
});

test('le nouveau mot de passe part à Supabase sans passer par nous', () => {
  assert.match(AUTH, /auth\.updateUser\(\s*\{\s*password/,
    'updateUser est la seule façon de poser un mot de passe');

  /* Ni hachage, ni comparaison, ni conservation : tout cela appartient à
     GoTrue. En trouver ici voudrait dire qu'on a commencé à refaire ce que
     Supabase fait déjà, et mieux. */
  for (const interdit of [/bcrypt/i, /\bsha256\b/i, /hashPassword/i, /motDePasseHache/i]) {
    assert.ok(!interdit.test(AUTH), `${interdit} n'a rien à faire dans un client`);
  }
});

test('aucun code ni mot de passe ne se range dans le stockage local', () => {
  /* Le stockage local est lisible par n'importe quelle extension et survit à
     la fermeture. `rt-auth` y met la session Supabase — c'est la seule chose
     qui a le droit d'y être, et c'est Supabase qui l'y met. */
  const ecritures = AUTH.match(/(localStorage|sessionStorage)\.setItem\(([^)]*)\)/g) || [];
  for (const e of ecritures) {
    assert.ok(!/code|token|otp|password|mdp/i.test(e),
      `écriture suspecte dans le stockage local : ${e}`);
  }
});

test('les deux portes ont un délai entre deux envois', () => {
  /* Ce n'est PAS une protection — un compteur dans le navigateur se contourne
     depuis la console, et CLAUDE.md § 8 le dit. Ce qui protège est chez
     Supabase : limite par IP, plafond d'envoi, et « you can only request this
     after N seconds ». Ce délai-ci évite qu'on consomme son propre plafond en
     cliquant cinq fois, et fait attendre une heure à tout le monde. */
  assert.match(AUTH, /attenteRestante/, 'le délai entre deux envois doit exister');
  assert.match(AUTH, /marquerEnvoi\('otp'\)/,   'la porte « inscription interrompue » doit le marquer');
  assert.match(AUTH, /marquerEnvoi\('recuperation'\)/, 'la porte « mot de passe oublié » doit le marquer');
});

test('les trois gabarits portent le code, et aucun ne porte de lien magique', () => {
  const code  = lire('supabase/gabarit-magic-link.html');
  const recup = lire('supabase/gabarit-recuperation.html');

  for (const [nom, g] of [['connexion', code], ['récupération', recup]]) {
    /* {{ .Token }} EST le code. Sans lui dans le gabarit, le message part
       sans code et l'étape de saisie devient infranchissable — c'est la panne
       exacte décrite dans INSCRIPTION.md § 1.2, et elle ne produit aucune
       erreur : on reçoit un message, il est simplement inutilisable. */
    assert.ok(g.includes('{{ .Token }}'), `le gabarit de ${nom} doit porter {{ .Token }}`);

    /* Décision du 20/09/2026 : le parcours est un parcours par CODE. Un lien
       ouvre un nouvel onglet et le formulaire de l'ancien reprend à zéro —
       exactement ce que le code évite. */
    assert.ok(!g.includes('{{ .ConfirmationURL }}'),
      `le gabarit de ${nom} ne doit pas proposer de lien magique`);
  }

  /* Les deux messages ne doivent pas se ressembler : celui de récupération
     part aussi quand quelqu'un d'AUTRE déclare avoir perdu votre mot de passe.
     Le destinataire qui n'a rien demandé doit le reconnaître comme anormal. */
  assert.match(recup, /Récupération de votre compte/,
    "l'e-mail de récupération doit se nommer pour ce qu'il est");
  assert.match(recup, /Vous n'avez rien demandé/,
    "l'e-mail de récupération doit dire quoi faire quand on n'a rien demandé");
  assert.match(code, /Votre code de connexion/,
    "l'e-mail de connexion doit se nommer pour ce qu'il est");
});

test('le script de pose ne touche pas aux URL de production sans qu\'on le demande', () => {
  /* CLAUDE.md § 9.1 gèle la configuration de production liée au domaine tant
     qu'il n'est pas acheté. Ce script posait les gabarits ET le Site URL d'un
     même bloc : travailler sur les e-mails entraînait les URL avec soi. */
  const sh = lire('supabase/poser-reglages.sh');
  assert.match(sh, /AVEC_URLS='non'/, 'les URL ne doivent pas partir par défaut');
  assert.match(sh, /mailer_templates_recovery_content/,
    'le gabarit de récupération doit être posé, sinon Supabase emploie le sien');
});
