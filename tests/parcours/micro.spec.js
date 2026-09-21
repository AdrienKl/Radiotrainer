/* =============================================================================
   Albatros VFR — LE CHEMIN DU MICRO, AVEC UNE FAUSSE RECONNAISSANCE VOCALE
   -----------------------------------------------------------------------------
   C'était le trou de la suite, et il était grand : les autres tests TAPENT leur
   réponse dans le champ de transcription. Ils vérifient donc la notation, mais
   pas un mètre du chemin qui y mène.

   Or ce chemin est long, et il est partagé :

       appui sur l'alternat  →  bindPushToTalk
         →  startListening   →  recognition.start()
           →  onresult       →  la transcription arrive
             →  soit el.transText (Exercices), soit recoSink (Vol en direct)
               →  relâchement, onend
                 →  « Valider »  →  evaluate  →  notation

   Une seule instance de reconnaissance sert les DEUX écrans : les Exercices
   l'utilisent directement, le Vol en direct l'« emprunte » en posant un sink.
   C'est ce branchement-là qui casserait sans bruit — le micro semblerait
   simplement mort dans l'un des deux.

   ┌─ CE QUE CE TEST NE FAIT PAS ────────────────────────────────────────────┐
   │ Il ne teste PAS votre micro, ni la reconnaissance vocale de Chrome. Ça   │
   │ ne se teste pas ici : il faut de l'air, une carte son et un service      │
   │ distant. Un scénario et un vol au micro, à la main, restent nécessaires. │
   │                                                                          │
   │ Ce qu'il teste, c'est tout le reste — c'est-à-dire exactement ce que     │
   │ l'étape 2.2 déplace vers assets/noyau/4-micro.js.                        │
   └──────────────────────────────────────────────────────────────────────────┘

   Écrit AVANT l'extraction, pour constater l'état actuel d'abord.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { ouvrir, entrer } from './_aide.js';

/* ---------------------------------------------------------------------------
   La fausse SpeechRecognition.

   Posée AVANT que le moindre script de la page ne s'exécute, parce que le
   moteur fait `const SR = window.SpeechRecognition || window.webkitSpeechRecognition`
   à la lecture du fichier : après, il serait trop tard, l'instance serait déjà
   créée depuis la vraie.

   Elle imite juste ce dont le code se sert : start(), stop(), et les rappels
   onstart / onresult / onend. On ne cherche pas à reproduire l'API complète —
   on cherche à faire arriver une transcription par la porte normale.
   ------------------------------------------------------------------------- */
async function poserLeFauxMicro(page) {
  await page.addInitScript(() => {
    class FausseReconnaissance {
      constructor() {
        this.lang = ''; this.interimResults = false; this.continuous = false;
        this.maxAlternatives = 1; this.grammars = null;
        this.onstart = null; this.onresult = null; this.onend = null; this.onerror = null;
        this._ouverte = false;
        window.__micro.toutes.push(this);
        window.__micro.creees++;
      }
      start() {
        if (this._ouverte) {                       // comme la vraie : InvalidStateError
          const e = new Error('déjà démarrée'); e.name = 'InvalidStateError'; throw e;
        }
        this._ouverte = true;
        window.__micro.demarrages++;
        if (this.onstart) this.onstart({});
      }
      stop() {
        if (!this._ouverte) return;
        this._ouverte = false;
        window.__micro.arrets++;
        if (this.onend) this.onend({});
      }
      abort() { this.stop(); }
    }

    window.__micro = {
      creees: 0, demarrages: 0, arrets: 0, toutes: [],

      /* CELLE QUI ÉCOUTE, pas la dernière créée.
         Il y a DEUX instances dans l'application : celle du moteur, partagée
         entre les Exercices et le Vol en direct, et celle de l'Épellation,
         volontairement indépendante. La seconde est créée en dernier — parler
         à « la dernière » revenait donc à parler à l'Épellation depuis la page
         Exercices, et le premier jet de ce test échouait pour cette raison,
         sans que rien ne soit cassé dans l'application.
         Celle qui a été démarrée est la bonne, et il ne peut y en avoir qu'une. */
      active() { return window.__micro.toutes.filter(r => r._ouverte)[0] || null; },

      /* Faire arriver une transcription, exactement comme le ferait le service
         de reconnaissance : un résultat final, à l'index 0. */
      dire(texte) {
        const r = window.__micro.active();
        if (!r || !r.onresult) return false;
        const resultats = [{ isFinal: true, length: 1, 0: { transcript: texte, confidence: 0.9 } }];
        resultats.length = 1;
        r.onresult({ resultIndex: 0, results: resultats });
        return true;
      },
      ouverte() { return !!window.__micro.active(); }
    };

    window.SpeechRecognition = FausseReconnaissance;
    window.webkitSpeechRecognition = FausseReconnaissance;
  });
}

/* Appui puis relâchement de l'alternat, avec la transcription au milieu.
   TRAINE_MS vaut 500 ms : le micro continue de tourner un demi-seconde après
   le relâchement, exprès (on coupait la fin des phrases). D'où l'attente. */
async function parler(page, idBouton, texte) {
  await page.locator(idBouton).dispatchEvent('mousedown');
  await page.waitForTimeout(120);
  const arrivee = await page.evaluate(t => window.__micro.dire(t), texte);
  expect(arrivee, 'La fausse reconnaissance n\'a trouvé personne à qui parler : onresult n\'est pas branché.').toBe(true);
  await page.locator(idBouton).dispatchEvent('mouseup');
  await page.waitForTimeout(900);          // 500 ms de traîne + la marge
}

test('le nombre d\'instances de reconnaissance ne grandit pas avec les appuis', async ({ page }) => {
  /* Recréer l'instance à chaque appui fait redemander la permission micro à
     chaque fois : c'est la panne que le code évite explicitement.

     Il y a DEUX instances, et c'est voulu : celle du moteur, partagée entre les
     Exercices et le Vol en direct, et celle de l'Épellation, écrite comme un
     module 100 % indépendant. Ce qui compte n'est donc pas « une seule » mais
     « toujours les mêmes ». */
  await poserLeFauxMicro(page);
  await ouvrir(page);
  await entrer(page, 'exercices');
  await page.evaluate(() => window.rtRelancerScenario(0, 'LFBD'));
  await page.waitForTimeout(300);

  const auDepart = await page.evaluate(() => window.__micro.creees);
  expect(auDepart, 'Nombre d\'instances inattendu au chargement (moteur + épellation).').toBe(2);

  for (let i = 0; i < 3; i++) {
    await page.locator('#pttBtn').dispatchEvent('mousedown');
    await page.waitForTimeout(100);
    await page.locator('#pttBtn').dispatchEvent('mouseup');
    await page.waitForTimeout(700);
  }

  expect(await page.evaluate(() => window.__micro.creees),
    'Une instance de plus a été créée pendant les appuis : la permission micro sera redemandée à chaque fois.')
    .toBe(auDepart);
  expect(await page.evaluate(() => window.__micro.demarrages),
    'Les appuis n\'ont pas démarré la reconnaissance.').toBeGreaterThanOrEqual(3);
});

test('Exercices : la parole arrive dans la transcription et se note', async ({ page }) => {
  await poserLeFauxMicro(page);
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'exercices');
  await page.evaluate(() => window.rtRelancerScenario(0, 'LFBD'));
  await page.waitForTimeout(300);

  // se placer sur une étape qui attend un collationnement
  for (let i = 0; i < 8 && !(await page.evaluate(() => window.RT_TEST_SCN.aRepondre())); i++) {
    await page.evaluate(() => window.RT_TEST_SCN.suivant());
    await page.waitForTimeout(200);
  }
  const attendu = await page.evaluate(() => window.RT_TEST_SCN.attendu());
  expect(attendu.length, 'Aucun collationnement attendu à cette étape').toBeGreaterThan(0);

  await parler(page, '#pttBtn', attendu);

  // 1. la transcription a bien atterri dans le champ
  expect(await page.locator('#transText').inputValue(),
    'La parole n\'est pas arrivée dans le champ de transcription.').toBe(attendu);

  // 2. le micro s'est arrêté tout seul, et « Valider » est redevenu cliquable
  expect(await page.evaluate(() => window.__micro.ouverte()), 'Le micro tourne encore après le relâchement.').toBe(false);
  expect(await page.locator('#validerBtn').isDisabled(), 'Le bouton Valider est resté bloqué.').toBe(false);

  // 3. et la notation reconnaît la réponse
  await page.locator('#validerBtn').click();
  await page.waitForTimeout(300);
  const manquants = await page.locator('#feedback .fb-item.ko').count();
  const trouves = await page.locator('#feedback .fb-item.ok').count();
  expect(trouves, 'Aucun mot-clé reconnu : la chaîne s\'est interrompue avant la notation.').toBeGreaterThan(0);
  expect(manquants,
    `Le collationnement dicté au micro est celui que le moteur attendait, et il le compte faux.\n` +
    `Dit : « ${attendu} »\n${await page.locator('#feedback').innerText()}`).toBe(0);

  expect(erreurs, 'Erreurs de console pendant le passage au micro').toEqual([]);
});

test('Vol en direct : la même instance est empruntée par le sink', async ({ page }) => {
  /* Le module Vol ne peut pas avoir sa propre instance — la créer redemanderait
     la permission micro. Il pose donc un « sink » et emprunte celle des
     Exercices. Si ce branchement casse, le micro semble mort en Navigation
     alors qu'il marche dans les Exercices : un symptôme qui envoie chercher
     très loin de la cause. */
  await poserLeFauxMicro(page);
  const { erreurs } = await ouvrir(page);
  await entrer(page, 'navigation');
  await page.waitForTimeout(500);

  const avions = await page.evaluate(() => window.RT_TEST.avions());
  const err = await page.evaluate(a => window.RT_TEST.lancerVol({
    dep: 'LFBD', arr: 'LFBH', avion: a, mode: 'voyage', level: 'debutant'
  }), avions[0]);
  expect(err, 'Le vol n\'a pas démarré').toBeNull();
  await page.waitForTimeout(600);

  await parler(page, '#vfPtt', 'Mérignac Tour, F-GBQA, bonjour');

  expect(await page.evaluate(() => window.__micro.creees),
    'Le module Vol a créé sa propre instance au lieu d\'emprunter celle du moteur : la permission micro sera redemandée.')
    .toBe(2);
  expect(await page.locator('#vfTransText').inputValue(),
    'La parole n\'est pas arrivée dans la zone de transcription du vol : le sink n\'est pas branché.')
    .toContain('rignac Tour');
  expect(erreurs, 'Erreurs de console pendant le passage au micro en vol').toEqual([]);
});

test('une erreur du micro est dite à l\'utilisateur, et ne note rien', async ({ page }) => {
  /* Sans ce garde, un micro refusé se soldait par un score de 0/3 — laissant
     croire à une faute de phraséologie alors que rien n'avait été capté. */
  await poserLeFauxMicro(page);
  await ouvrir(page);
  await entrer(page, 'exercices');
  await page.evaluate(() => window.rtRelancerScenario(0, 'LFBD'));
  await page.waitForTimeout(300);

  await page.locator('#pttBtn').dispatchEvent('mousedown');
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const r = window.__micro.active();
    if (r && r.onerror) r.onerror({ error: 'no-speech' });
    if (r) r.stop();
  });
  await page.waitForTimeout(400);

  const journal = await page.locator('#log').innerText().catch(() => '');
  expect(/aucune parole|micro/i.test(journal),
    `L'erreur du micro n'est dite nulle part. L'utilisateur voit un exercice qui ne réagit pas.\n${journal.slice(0, 200)}`).toBe(true);
  expect(await page.locator('#feedback .fb-item').count(),
    'Une réponse a été notée alors que le micro n\'a rien capté.').toBe(0);
});
