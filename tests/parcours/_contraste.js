/* =============================================================================
   Albatros VFR — MESURE DU CONTRASTE, DANS LA PAGE
   -----------------------------------------------------------------------------
   Sert à contraste.spec.js. Le code ci-dessous part s'exécuter DANS le
   navigateur (page.evaluate) : il n'a accès à rien du dossier tests/.

   ┌─ CE QU'ON MESURE, ET CE QU'ON NE MESURE PAS ───────────────────────────┐
   │ On lit les couleurs RÉSOLUES par le navigateur (getComputedStyle), pas  │
   │ les pixels d'une capture. C'est plus fiable pour du texte sur aplat —   │
   │ aucune compression, aucun lissage de police à démêler — et c'est        │
   │ AVEUGLE à trois choses, qu'on déclare « non mesurable » plutôt que de   │
   │ deviner :                                                               │
   │   · une image de fond (le site en a dix-sept) ;                         │
   │   · un dégradé ;                                                        │
   │   · un ancêtre en opacity < 1.                                          │
   │ Deviner reviendrait à annoncer un contraste faux — dans un sens comme   │
   │ dans l'autre. Le compte des « non mesurables » est donc affiché : c'est │
   │ ce qui reste à regarder à l'œil.                                        │
   └─────────────────────────────────────────────────────────────────────────┘

   Le seuil est celui de WCAG 2.1 AA : 4,5:1 pour du texte courant, 3:1 pour
   du « grand texte » (≥ 24 px, ou ≥ 18,66 px en gras).
   ========================================================================== */

export const MESURER = function () {
  /* --- WCAG 2.1 : luminance relative, puis rapport de contraste ----------- */
  function canal(v) {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function luminance(c) {
    return 0.2126 * canal(c[0]) + 0.7152 * canal(c[1]) + 0.0722 * canal(c[2]);
  }
  function rapport(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function lire(s) {
    const m = /rgba?\(([^)]+)\)/.exec(s);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  /* Un premier plan semi-transparent se compose sur son fond. Sans ça, un
     texte en rgba(0,0,0,.55) serait mesuré comme du noir plein — donc annoncé
     bien plus lisible qu'il ne l'est. */
  function composer(dessus, dessous) {
    const a = dessus[3];
    return [
      Math.round(dessus[0] * a + dessous[0] * (1 - a)),
      Math.round(dessus[1] * a + dessous[1] * (1 - a)),
      Math.round(dessus[2] * a + dessous[2] * (1 - a)),
      1
    ];
  }

  /* Un composant INACTIF n'a aucune exigence de contraste — WCAG 2.1, critère
     1.4.3 : « Text or images of text that are part of an inactive user
     interface component […] have no contrast requirement. » Le bouton de
     dézoom de Leaflet, grisé quand la carte est au plus large, tombe ici à
     1,75:1 et c'est normal : il dit justement qu'il ne sert à rien.
     On le SIGNALE quand même, sous un drapeau à part — pour que personne ne
     s'en serve un jour pour faire taire un vrai défaut. */
  function inactif(el) {
    let n = el;
    while (n && n.nodeType === 1) {
      if (n.disabled === true) return true;
      if (n.getAttribute && n.getAttribute('aria-disabled') === 'true') return true;
      if (n.classList && (n.classList.contains('leaflet-disabled')
                       || n.classList.contains('disabled'))) return true;
      n = n.parentElement;
    }
    return false;
  }

  function visible(el) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /* Le fond effectif : on remonte les ancêtres jusqu'au premier aplat opaque,
     en composant les couches semi-transparentes au passage. */
  function fond(el) {
    const couches = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') {
        return { nonMesurable: 'image ou dégradé de fond' };
      }
      if (parseFloat(s.opacity) < 1 && n !== el) {
        return { nonMesurable: 'ancêtre en opacity < 1' };
      }
      const c = lire(s.backgroundColor);
      if (c && c[3] > 0) {
        couches.push(c);
        if (c[3] === 1) {
          let resultat = couches.pop();
          while (couches.length) resultat = composer(couches.pop(), resultat);
          return { couleur: resultat };
        }
      }
      n = n.parentElement;
    }
    /* Rien d'opaque jusqu'à la racine : le fond est celui du canvas. */
    let resultat = lire(getComputedStyle(document.documentElement).backgroundColor);
    if (!resultat || resultat[3] === 0) resultat = [255, 255, 255, 1];
    while (couches.length) resultat = composer(couches.pop(), resultat);
    return { couleur: resultat };
  }

  function chemin(el) {
    const bouts = [];
    let n = el;
    for (let i = 0; n && n.nodeType === 1 && i < 4; i++, n = n.parentElement) {
      let b = n.tagName.toLowerCase();
      if (n.id) { bouts.unshift(b + '#' + n.id); break; }
      if (n.className && typeof n.className === 'string') {
        b += '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.');
      }
      bouts.unshift(b);
    }
    return bouts.join(' > ');
  }

  const releves = [];
  const section = document.querySelector('.page.active') || document.body;

  for (const el of section.querySelectorAll('*')) {
    /* Seulement les éléments qui portent EUX-MÊMES du texte : sinon on mesure
       dix fois la même phrase, une par ancêtre. */
    const texte = Array.from(el.childNodes)
      .filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    if (!texte) continue;
    if (!visible(el)) continue;

    const s = getComputedStyle(el);
    const f = fond(el);
    if (f.nonMesurable) {
      releves.push({ nonMesurable: f.nonMesurable, ou: chemin(el), texte: texte.slice(0, 40) });
      continue;
    }

    let avant = lire(s.color);
    if (!avant) continue;
    if (avant[3] < 1) avant = composer(avant, f.couleur);

    const taille = parseFloat(s.fontSize);
    const gras = parseInt(s.fontWeight, 10) >= 700;
    const grandTexte = taille >= 24 || (gras && taille >= 18.66);
    const seuil = grandTexte ? 3 : 4.5;
    const r = rapport(avant, f.couleur);

    releves.push({
      rapport: Math.round(r * 100) / 100,
      seuil,
      inactif: inactif(el),
      conforme: r >= seuil,
      taille, gras,
      avant: `rgb(${avant.slice(0, 3).join(',')})`,
      arriere: `rgb(${f.couleur.slice(0, 3).join(',')})`,
      ou: chemin(el),
      texte: texte.slice(0, 40)
    });
  }
  return releves;
};
