/* =============================================================================
   AVIERO — OUTILLAGE COMMUN DES TESTS DE PARCOURS
   -----------------------------------------------------------------------------
   Deux décisions sont prises ici, et elles valent d'être expliquées.

   ┌─ 1. LES TESTS NE PARLENT JAMAIS À SUPABASE ─────────────────────────────┐
   │ Toute requête vers *.supabase.co est coupée avant de partir. Le projet   │
   │ Supabase visé par assets/supabase-config.js est le projet RÉEL : y       │
   │ écrire depuis une suite de tests reviendrait à polluer les données des   │
   │ vrais comptes, et à faire dépendre les tests d'un réseau et d'un service │
   │ distant. Un test qui tombe parce qu'un serveur est lent n'apprend rien   │
   │ et finit par être ignoré.                                                │
   │                                                                          │
   │ Conséquence assumée : ces tests ne vérifient PAS les politiques RLS ni   │
   │ le parcours d'inscription réel. Ça ne se teste pas depuis un navigateur  │
   │ — ça se vérifie en base. C'est écrit dans tests/README.md, avec ce qui   │
   │ reste à faire à la main.                                                 │
   └──────────────────────────────────────────────────────────────────────────┘

   ┌─ 2. ON ENTRE DANS L'APPLICATION PAR LA PORTE EXISTANTE ─────────────────┐
   │ Le routeur expose déjà rtSessionOuverte() — c'est assets/auth.js qui     │
   │ l'appelle quand Supabase rend une session valide. Les tests appellent la │
   │ même fonction. Aucune porte dérobée n'est ajoutée pour eux : si un jour  │
   │ cette fonction cesse d'ouvrir l'application, les tests le disent, et     │
   │ c'est une vraie information.                                             │
   └──────────────────────────────────────────────────────────────────────────┘
   ========================================================================== */

/* Messages de console qu'on attend, et qui ne signalent rien d'anormal. */
const BRUIT_ATTENDU = [
  /supabase\.co/i,                    // coupé exprès par les tests (voir ci-dessus)
  /Failed to load resource/i,
  /net::ERR_FAILED/i,
  /ERR_BLOCKED_BY_CLIENT/i,
  /Failed to fetch/i,
  /AudioContext/i,                    // Chrome râle tant qu'aucun geste n'a eu lieu
  /speechSynthesis|SpeechRecognition/i,
  /favicon/i
];

export function estDuBruit(texte) {
  return BRUIT_ATTENDU.some(r => r.test(texte));
}

/* Ouvre le site, coupe Supabase, et collecte tout ce que la console dit.
   Renvoie { erreurs } — un tableau vivant, à lire APRÈS les actions du test. */
export async function ouvrir(page, route = '') {
  const erreurs = [];

  await page.route('**://*.supabase.co/**', r => r.abort());

  page.on('console', m => {
    if (m.type() === 'error' && !estDuBruit(m.text())) erreurs.push(m.text());
  });
  page.on('pageerror', e => {
    /* Une exception non rattrapée, elle, n'est jamais du bruit : c'est un bloc
       de script qui vient de mourir, et tout ce qu'il portait avec lui. */
    erreurs.push('EXCEPTION ' + e.message);
  });

  await page.goto('/index.html' + route);
  await page.waitForFunction(() => typeof window.rtSessionOuverte === 'function');
  return { erreurs };
}

/* Entrer dans l'application sans Supabase, par la porte du routeur. */
export async function entrer(page, route = 'tableau') {
  await page.evaluate(r => {
    location.hash = '#' + r;
    window.rtSessionOuverte();
  }, route);
  await page.waitForFunction(() => window.rtConnecte && window.rtConnecte() === true);
}

/* Le stockage local, vu depuis le test. */
export async function lireCle(page, cle) {
  return page.evaluate(k => {
    try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return localStorage.getItem(k); }
  }, cle);
}

export async function ecrireCle(page, cle, valeur) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [cle, valeur]);
}
