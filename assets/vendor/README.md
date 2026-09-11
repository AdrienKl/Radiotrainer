# Dépendances vendues

Copies **locales** des bibliothèques tierces. Aucun CDN n'est appelé à
l'exécution : `index.html` doit rester ouvrable par double-clic (`file://`),
et le site doit continuer de fonctionner si un CDN tombe ou vous piste.

| Fichier | Version | Origine | Licence |
|---|---|---|---|
| `supabase.js` | **2.116.0** | `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.js` | MIT |

SHA-256 de `supabase.js` au moment de la copie :

    84ee9bf45695c1dd3ba1595b6bcfb0f09672434631351ffc8ebe9140545d5ff6

C'est la version **UMD**, pas le module ES : elle pose `window.supabase` et se
charge par un simple `<script src>`. Le build ESM imposerait `type="module"`,
que `file://` refuse (CORS).

## Mettre à jour

1. Télécharger la nouvelle version en épinglant le numéro exact (jamais `@2`,
   qui bouge sous vos pieds).
2. Remplacer le fichier, relever le SHA-256, mettre ce tableau à jour.
3. Rejouer la suite de tests : l'authentification et l'écriture des séances
   passent toutes les deux par ce fichier.
