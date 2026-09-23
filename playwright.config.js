/* =============================================================================
   Albatros VFR — CONFIGURATION DES TESTS DE PARCOURS
   -----------------------------------------------------------------------------
   Les tests de contrat (tests/contrat/) lisent le code. Ceux-ci OUVRENT le site
   dans un vrai navigateur et s'en servent : ils sont les seuls à pouvoir dire
   qu'un scénario se joue jusqu'au bout et qu'un vol s'enregistre.

   Le site est servi en http(s) et jamais par double-clic : l'authentification
   Supabase ne fonctionne pas en file:// (CLAUDE.md § 6.1). D'où le petit
   serveur Python ci-dessous — le même que celui du § 17.1, pour que les tests
   voient exactement ce que le développeur voit.
   ========================================================================== */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/parcours',
  fullyParallel: false,        // un seul serveur, et des tests qui écrivent dans le stockage local
  workers: 1,
  reporter: [['list']],
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:8000',
    trace: 'retain-on-failure',
    /* Chrome demande le micro dès qu'un scénario démarre. On l'accorde une fois
       pour toutes : sans cela une invite bloque la page, et le test attend un
       clic qui ne viendra jamais. Aucun son n'est capté — les tests tapent leur
       réponse, comme le fait un utilisateur sans micro. */
    permissions: ['microphone'],
    locale: 'fr-FR'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    /* Largeur téléphone : le § 17.2 la demande à chaque modification touchant
       une page. Elle rejoue le même parcours de démarrage et de navigation.
       « contact » l'a rejointe le 22/09/2026 : la modale y change de forme
       sous 560 px (elle se colle en bas, ses boutons passent en colonne et
       l'ordre s'inverse pour mettre « Envoyer » sous le pouce). Une règle
       responsive qu'aucun test ne traverse n'est pas une règle vérifiée. */
    { name: 'telephone', use: { ...devices['Pixel 7'] }, testMatch: /demarrage|routeur|contact/ }
  ],
  webServer: {
    command: 'python3 -m http.server 8000',
    url: 'http://localhost:8000/index.html',
    reuseExistingServer: true,
    timeout: 20000
  }
});
