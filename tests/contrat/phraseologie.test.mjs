/* =============================================================================
   AVIERO — LA RÈGLE QUI PASSE AVANT LA TECHNIQUE
   -----------------------------------------------------------------------------
   AVIERO enseigne la radiotéléphonie à de vrais pilotes. Une formulation
   inventée est une erreur qui sera apprise, répétée en vol, et entendue par un
   contrôleur. C'est la règle n° 1 du projet (CLAUDE.md § 2), et elle passe
   avant toute considération d'architecture.

   CE QU'UN TEST AUTOMATIQUE PEUT VÉRIFIER — ET CE QU'IL NE PEUT PAS
   Il ne peut pas lire le manuel et juger qu'une phrase est juste. Seul un œil
   humain le peut, le manuel ouvert à côté.

   Ce qu'il peut faire, c'est empêcher les trois appauvrissements silencieux :

     · un scénario DISPARAÎT du catalogue (ou change d'identifiant, ce qui
       revient au même pour la base : les séances déjà enregistrées ne se
       rattachent plus à rien) ;
     · un scénario PERD des échanges — on croit avoir déplacé des données, il
       en manque la moitié, et l'exercice devient plus court sans que rien ne
       le signale ;
     · un scénario PERD ses renvois au manuel. Là, la phraséologie reste à
       l'écran mais plus rien ne dit d'où elle vient : la prochaine personne
       qui la modifiera n'aura plus la page à vérifier, et c'est exactement
       comme ça qu'une formulation finit par être inventée.

   Le troisième point est le plus important, et le moins intuitif : le
   commentaire « Manuel DSNA p.39 » n'est pas de la décoration. C'est ce qui
   rend la phrase vérifiable.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE, lire, toutLeCode, elementsDuTableau, inventaire } from './_source.mjs';

const inv = inventaire();
const scn = elementsDuTableau(toutLeCode(), 'SCENARIOS') || [];
const lus = scn.map(p => ({
  source: p,
  id: (/id\s*:\s*"([a-z]+)"/.exec(p) || [])[1],
  titre: (/titre\s*:\s*"([^"]+)"/.exec(p) || [])[1],
  attendus: (p.match(/\battendu\s*:/g) || []).length,
  refs_manuel: (p.match(/[Mm]anuel DSNA p\./g) || []).length
}));

test('les treize scénarios sont là, avec leurs identifiants', () => {
  assert.deepEqual(lus.map(s => s.id), inv.scenarios.map(s => s.id),
    `Le catalogue a changé. Un identifiant qui change coupe le lien avec les ` +
    `séances déjà enregistrées en base (table exercises, colonne key).`);
});

test('les titres n\'ont pas bougé', () => {
  assert.deepEqual(lus.map(s => s.titre), inv.scenarios.map(s => s.titre));
});

test('aucun scénario n\'a perdu d\'échange', () => {
  const perdus = lus
    .map((s, i) => ({ s, avant: inv.scenarios[i] }))
    .filter(({ s, avant }) => avant && s.attendus < avant.attendus)
    .map(({ s, avant }) => `${s.id} : ${avant.attendus} collationnements attendus avant, ${s.attendus} maintenant`);
  assert.deepEqual(perdus, [],
    `Des échanges ont disparu d'un scénario. L'exercice se termine plus tôt, et ` +
    `rien à l'écran ne dit qu'il manque quelque chose.`);
});

test('aucun scénario n\'a perdu ses renvois au manuel', () => {
  const perdus = lus
    .map((s, i) => ({ s, avant: inv.scenarios[i] }))
    .filter(({ s, avant }) => avant && s.refs_manuel < avant.refs_manuel)
    .map(({ s, avant }) => `${s.id} : ${avant.refs_manuel} renvois avant, ${s.refs_manuel} maintenant`);
  assert.deepEqual(perdus, [],
    `La phraséologie est toujours là, mais on ne sait plus d'où elle vient. ` +
    `Chaque phrase doit citer sa page (« // Manuel DSNA p.39 ») : c'est ce qui ` +
    `permet de la vérifier avant de la modifier.`);
});

test('tout scénario qui attend un collationnement cite le manuel', () => {
  /* « tourdepiste » est la seule exception, et elle est légitime : ses échanges
     sont construits à l'exécution par buildQueue(), donc son entrée du catalogue
     ne contient aucune phrase. Le test l'exempte de lui-même puisqu'elle ne
     déclare aucun `attendu`. */
  const muets = lus.filter(s => s.attendus > 0 && s.refs_manuel === 0).map(s => s.id);
  assert.deepEqual(muets, [],
    `Ce scénario contient de la phraséologie sans aucun renvoi au manuel. ` +
    `Si le manuel ne couvre pas le cas, il ne faut pas combler le trou : ` +
    `il faut le signaler (CLAUDE.md § 2).`);
});

test('les sources de vérité de la phraséologie sont toujours dans le dépôt', () => {
  for (const f of ['Manuel_Phraseologie.pdf', 'PHRASEOLOGIE-MANUEL.md']) {
    assert.ok(existsSync(join(RACINE, f)), `${f} a quitté le dépôt.`);
    assert.ok(statSync(join(RACINE, f)).size > 1000, `${f} est vide ou tronqué.`);
  }
});

test('le catalogue de l\'application et la table exercises disent la même chose', () => {
  /* La migration sql/002 insère les exercices en base, avec leur clé et leur
     titre. Si les deux listes divergent, la progression se rattache à des
     exercices qui n'existent pas d'un côté ou de l'autre — et ce sont les
     statistiques de l'élève qui deviennent fausses, sans erreur nulle part. */
  const sql = lire('sql/002-progression.sql');
  const bloc = /insert into public\.exercises[\s\S]*?on conflict/.exec(sql);
  assert.ok(bloc, 'Le bloc d\'insertion des exercices est introuvable dans sql/002.');
  const enBase = [...bloc[0].matchAll(/\(\s*'([a-z]+)'\s*,\s*'((?:[^']|'')*)'/g)]
    .map(m => ({ key: m[1], titre: m[2].replace(/''/g, "'") }));

  const manquants = lus.filter(s => !enBase.some(e => e.key === s.id)).map(s => s.id);
  assert.deepEqual(manquants, [],
    `Ces scénarios existent dans l'application mais pas dans la table exercises : ` +
    `les séances qu'ils produisent n'auront aucun exercice auquel se rattacher.`);

  const orphelins = enBase.filter(e => !lus.some(s => s.id === e.key)).map(e => e.key);
  assert.deepEqual(orphelins, [],
    `Ces exercices existent en base mais plus dans l'application.`);

  const titresDivergents = enBase
    .filter(e => { const s = lus.find(x => x.id === e.key); return s && s.titre !== e.titre; })
    .map(e => `${e.key} : « ${e.titre} » en base, « ${lus.find(x => x.id === e.key).titre} » dans l'application`);
  assert.deepEqual(titresDivergents, [],
    `Le même exercice porte deux noms. La console d'administration affiche celui ` +
    `de la base, l'élève voit celui de l'application.`);
});
