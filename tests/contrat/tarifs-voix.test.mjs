/* =============================================================================
   Albatros VFR — LES TARIFS DE LA VOIX GOOGLE ET LE COÛT ESTIMÉ
   -----------------------------------------------------------------------------
   assets/admin/data/tarifs-voix.js, chargé tel quel dans une machine virtuelle
   Node. Trois choses surveillées :
     1. les tarifs sont ceux relevés sur la page de Google le 27/09/2026, et
        Chirp HD n'en a PAS — aucun tarif inventé ;
     2. le calcul est juste sur des cas écrits à la main : sous la part
        gratuite, au-delà, à cheval ;
     3. aucun prix n'est recopié ailleurs : le jour où Google change ses
        tarifs, un seul fichier à modifier.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { RACINE, lire } from './_source.mjs';

function charger() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(lire('assets/admin/data/tarifs-voix.js'), ctx);
  return ctx.window.RTAdmin.tarifsVoix;
}
const T = charger();

test('les tarifs relevés le 27/09/2026, et Chirp HD sans tarif', () => {
  const m = T.TARIFS.modeles;
  assert.equal(T.TARIFS.devise, 'USD');
  assert.deepEqual({ ...m['Chirp3-HD'] }, { prixParMillion: 30,  gratuitParMois: 1000000 });
  assert.deepEqual({ ...m['Neural2'] },   { prixParMillion: 16,  gratuitParMois: 1000000 });
  assert.deepEqual({ ...m['Studio'] },    { prixParMillion: 160, gratuitParMois: 1000000 });
  assert.deepEqual({ ...m['Wavenet'] },   { prixParMillion: 4,   gratuitParMois: 4000000 });
  assert.equal(m['Chirp-HD'], null, 'un tarif a été inventé pour Chirp HD, absent de la page de Google');
  assert.equal(T.brut('Chirp-HD', 1000), null);
  assert.equal(T.apresGratuite('Chirp-HD', 5e6), null);
});

test('coût brut : 100 000 caractères Chirp 3 HD = 3 $', () => {
  assert.equal(T.brut('Chirp3-HD', 100000), 3);
  assert.equal(T.brut('Studio', 1000), 0.16);
  assert.equal(T.brut('Wavenet', 0), 0);
});

test('après gratuité : rien sous la part gratuite, le dépassement au-delà', () => {
  assert.equal(T.apresGratuite('Neural2', 999999), 0);
  assert.equal(T.apresGratuite('Neural2', 1000000), 0);
  assert.equal(T.apresGratuite('Neural2', 1500000), 8);          // 500 000 × 16 $ / M
  assert.equal(T.apresGratuite('Wavenet', 4000000), 0);          // 4 M gratuits pour WaveNet
  assert.equal(T.apresGratuite('Wavenet', 5000000), 4);
});

test('coût du jour : ce qu\'il AJOUTE au mois, part gratuite entamée', () => {
  assert.equal(T.duJour('Chirp3-HD', 0, 50000), 0, 'sous la gratuité, un jour ne coûte rien');
  assert.equal(T.duJour('Chirp3-HD', 990000, 20000), 0.3, 'le jour qui franchit ne paie que le dépassement (10 000)');
  assert.equal(T.duJour('Chirp3-HD', 2000000, 100000), 3, 'au-delà, tout est payant');
});

test('une somme avec un tarif inconnu le DIT, sans le compter', () => {
  assert.deepEqual({ ...T.somme([1.5, null, 2]) }, { total: 3.5, inconnu: true });
  assert.deepEqual({ ...T.somme([]) }, { total: 0, inconnu: false });
});

test('le jour de Paris, et la fenêtre qui couvre le mois ET les sept jours', () => {
  // 00 h 30 à Paris le 1er octobre en été = 22 h 30 UTC le 30 septembre.
  assert.equal(T.jourParis(new Date('2026-09-30T22:30:00Z')), '2026-10-01');
  assert.equal(T.debutFenetre('2026-10-03'), '2026-09-27', 'le 3, les sept jours remontent au mois d\'avant');
  assert.equal(T.debutFenetre('2026-10-20'), '2026-10-01');
});

test('aucun prix n\'est recopié hors de tarifs-voix.js', () => {
  const trouves = [];
  (function parcourir(dir) {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (/\.(js|html)$/.test(e) && !p.endsWith('tarifs-voix.js')) {
        const s = lire(relative(RACINE, p));
        if (/prixParMillion|gratuitParMois|\b(0\.00003|0\.000016|0\.00016|0\.000004)\b/.test(s)) trouves.push(relative(RACINE, p));
      }
    }
  })(join(RACINE, 'assets'));
  assert.deepEqual(trouves, [], 'un tarif vit ailleurs que dans assets/admin/data/tarifs-voix.js');
});
