/* =============================================================================
   RadioTrainer — Admin · KIT D'INTERFACE
   -----------------------------------------------------------------------------
   Les primitives partagées par les huit pages : tuiles de statistique, tableau
   (recherche, filtres, tri, pagination), graphiques SVG, états vides / en
   chargement / en erreur, badges, tiroir latéral.

   Deux règles :
     · Aucune dépendance. Les graphiques sont du SVG écrit à la main ; ajouter
       une bibliothèque de courbes pour six graphes serait payer 200 Ko pour
       du dessin qu'on maîtrise mieux à la main.
     · Aucune donnée. Le kit reçoit ce qu'il affiche ; il n'appelle jamais
       RTAdmin.data lui-même.
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin = window.RTAdmin || {};
  var U = RT.util;

  /* ---------- Fabrique d'éléments ---------------------------------------------- */
  function el(tag, cls, html){
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function vide(n){ while (n && n.firstChild) n.removeChild(n.firstChild); return n; }

  /* ---------- Icônes (même convention que le site : trait, viewBox 24) ---------- */
  var I = {
    dashboard:'<svg class="ic-svg" viewBox="0 0 24 24"><rect x="3" y="3" width="7.5" height="9" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5"/><rect x="3" y="15" width="7.5" height="6" rx="1.5"/><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.5"/></svg>',
    users:'<svg class="ic-svg" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.6"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.2a3.6 3.6 0 0 1 0 6.9M18 14.4a6.5 6.5 0 0 1 3.5 5.6"/></svg>',
    plane:'<svg class="ic-svg" viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16z"/></svg>',
    chart:'<svg class="ic-svg" viewBox="0 0 24 24"><path d="M4 19V5M4 19h16"/><path d="M8 15l3-4 3 2 4-6"/></svg>',
    book:'<svg class="ic-svg" viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></svg>',
    bug:'<svg class="ic-svg" viewBox="0 0 24 24"><rect x="8" y="8" width="8" height="11" rx="4"/><path d="M9.5 8a2.5 2.5 0 0 1 5 0M4 11h4M16 11h4M4.5 17H8M16 17h3.5M5.5 6l2.2 2M18.5 6l-2.2 2"/></svg>',
    flask:'<svg class="ic-svg" viewBox="0 0 24 24"><path d="M9 3h6M10 3v6.2L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.2V3"/><path d="M7.2 15h9.6"/></svg>',
    warn:'<svg class="ic-svg" viewBox="0 0 24 24"><path d="M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4.5M12 17h.01"/></svg>',
    info:'<svg class="ic-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    error:'<svg class="ic-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    back:'<svg class="ic-svg" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
    chev:'<svg class="ic-svg" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    search:'<svg class="ic-svg" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
    close:'<svg class="ic-svg" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    eye:'<svg class="ic-svg" viewBox="0 0 24 24"><path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>',
    clock:'<svg class="ic-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 2"/></svg>',
    target:'<svg class="ic-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none"/></svg>',
    mic:'<svg class="ic-svg" viewBox="0 0 24 24"><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3.5"/></svg>',
    spark:'<svg class="ic-svg" viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
    lock:'<svg class="ic-svg" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    db:'<svg class="ic-svg" viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="8" ry="3.2"/><path d="M4 6v12c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2V6"/><path d="M4 12c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2"/></svg>',
    refresh:'<svg class="ic-svg" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-.6 4"/><path d="M20 5v6h-6"/></svg>',
    exit:'<svg class="ic-svg" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
    down:'<svg class="ic-svg" viewBox="0 0 24 24"><path d="M12 4v13M6 12l6 6 6-6"/></svg>',
    play:'<svg class="ic-svg" viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>'
  };

  /* ---------- Formatage ---------------------------------------------------------- */
  var F = {
    nb:function(n){
      if (n == null || (typeof n === 'number' && !isFinite(n))) return '—';
      return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');   // espace fine insécable
    },
    pct:function(n){ return n == null ? '—' : n + ' %'; },
    date:function(iso){
      if (!iso) return '—';
      try {
        var d = new Date(iso);
        return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit' });
      } catch(e){ return '—'; }
    },
    dateHeure:function(iso){
      if (!iso) return '—';
      try {
        var d = new Date(iso);
        return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }) + ' '
             + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
      } catch(e){ return '—'; }
    },
    /* « il y a 3 jours » plutôt qu'une date brute : dans une console qu'on
       consulte tous les jours, c'est la fraîcheur qui compte. */
    depuis:function(iso){
      if (!iso) return 'jamais';
      var ms = Date.now() - new Date(iso).getTime();
      if (ms < 0) return "à l'instant";
      var mn = Math.floor(ms / 60000);
      if (mn < 1) return "à l'instant";
      if (mn < 60) return 'il y a ' + mn + ' min';
      var h = Math.floor(mn / 60);
      if (h < 24) return 'il y a ' + h + ' h';
      var j = Math.floor(h / 24);
      if (j < 31) return 'il y a ' + j + ' j';
      var m = Math.floor(j / 30);
      if (m < 12) return 'il y a ' + m + ' mois';
      return 'il y a ' + Math.floor(m / 12) + ' an' + (m >= 24 ? 's' : '');
    },
    duree:function(s){ return U.duree(s); },
    /* Une classe de couleur unique pour tous les pourcentages de la console :
       vert ≥ 80, ambre ≥ 50, rouge en dessous — les mêmes seuils que le site. */
    classePct:function(p){ return p == null ? 'nul' : (p >= 80 ? 'bon' : (p >= 50 ? 'moy' : 'bas')); }
  };

  /* ---------- Blocs -------------------------------------------------------------- */
  function carte(titre, options){
    options = options || {};
    var c = el('section', 'adm-card' + (options.wide ? ' adm-card--wide' : '')
                        + (options.plain ? ' adm-card--plain' : ''));
    if (titre || options.action){
      var h = el('header', 'adm-card__head');
      var g = el('div', 'adm-card__titles');
      g.appendChild(el('h3', null, esc(titre || '')));
      if (options.sub) g.appendChild(el('p', 'adm-card__sub', esc(options.sub)));
      h.appendChild(g);
      if (options.action) h.appendChild(options.action);
      c.appendChild(h);
    }
    var b = el('div', 'adm-card__body');
    c.appendChild(b);
    c.body = b;
    return c;
  }

  function tuile(o){
    /* o = {icon, value, label, delta, hint, tone} */
    var t = el('div', 'adm-stat' + (o.tone ? ' adm-stat--' + o.tone : ''));
    t.innerHTML =
      '<span class="adm-stat__ic">' + (o.icon || I.chart) + '</span>' +
      '<b class="adm-stat__val">' + (o.value == null ? '—' : o.value) + '</b>' +
      '<span class="adm-stat__lab">' + esc(o.label || '') + '</span>' +
      (o.delta != null && o.delta !== ''
        ? '<span class="adm-delta ' + (o.delta > 0 ? 'up' : (o.delta < 0 ? 'down' : 'flat')) + '">'
          + (o.delta > 0 ? '▲ +' : (o.delta < 0 ? '▼ ' : '= ')) + o.delta + ' %'
          + '<i>vs période précédente</i></span>'
        : '') +
      (o.hint ? '<span class="adm-stat__hint">' + esc(o.hint) + '</span>' : '');
    return t;
  }

  function badge(texte, ton){
    return '<span class="adm-badge' + (ton ? ' adm-badge--' + ton : '') + '">' + esc(texte) + '</span>';
  }
  function pastillePct(p){
    return '<span class="adm-pct ' + F.classePct(p) + '">' + (p == null ? '—' : p + ' %') + '</span>';
  }

  /* ---------- États -------------------------------------------------------------- */
  function etatVide(titre, detail, icone){
    var e = el('div', 'adm-empty');
    e.innerHTML = '<span class="adm-empty__ic">' + (icone || I.info) + '</span>'
                + '<b>' + esc(titre) + '</b>'
                + (detail ? '<p>' + esc(detail) + '</p>' : '');
    return e;
  }
  function etatChargement(texte){
    var e = el('div', 'adm-loading');
    e.innerHTML = '<span class="adm-spin" aria-hidden="true"></span><span>'
                + esc(texte || 'Chargement…') + '</span>';
    return e;
  }
  /* Une erreur de source n'est pas un plantage : c'est une information. On
     distingue « la source ne peut pas répondre » (attendu, ex. Supabase non
     connecté) d'une vraie erreur inattendue. */
  function etatErreur(err){
    var attendu = err && err.rtUnavailable;
    var e = el('div', 'adm-empty adm-empty--' + (attendu ? 'muted' : 'error'));
    e.innerHTML = '<span class="adm-empty__ic">' + (attendu ? I.db : I.error) + '</span>'
      + '<b>' + esc(attendu ? 'Source non disponible' : 'Erreur inattendue') + '</b>'
      + '<p>' + esc((err && err.message) || String(err)) + '</p>';
    return e;
  }

  /* Enveloppe standard : on montre « chargement », puis le rendu, puis l'erreur.
     Évite de répéter la même plomberie dans chaque page. */
  function charger(hote, promesse, rendre, texteChargement){
    vide(hote).appendChild(etatChargement(texteChargement));
    return Promise.resolve(promesse).then(function(res){
      vide(hote);
      var n = rendre(res);
      if (n) hote.appendChild(n);
      return res;
    }, function(err){
      vide(hote).appendChild(etatErreur(err));
      if (!err || !err.rtUnavailable) { try { console.error('[Admin]', err); } catch(e){} }
      throw err;
    }).catch(function(){ /* déjà affichée */ });
  }

  /* ---------- Tableau ------------------------------------------------------------
     API : table({columns, rows, sort, dir, onSort, onRow, empty, dense})
     Une colonne : {key, label, sortable, align, width, cell(row) → HTML, cls}
     ------------------------------------------------------------------------------ */
  function table(o){
    var wrap = el('div', 'adm-tablewrap');
    var t = el('table', 'adm-table' + (o.dense ? ' adm-table--dense' : ''));
    var thead = el('thead'), tr = el('tr');
    o.columns.forEach(function(c){
      var th = el('th', (c.align ? 'ta-' + c.align : '') + (c.sortable ? ' sortable' : '')
                        + (c.hideSm ? ' hide-sm' : ''));
      if (c.width) th.style.width = c.width;
      if (c.sortable){
        var b = el('button', 'adm-sort', esc(c.label)
          + '<span class="adm-sort__ar">' + (o.sort === c.key ? (o.dir === 'asc' ? '▲' : '▼') : '') + '</span>');
        b.type = 'button';
        b.addEventListener('click', function(){
          var dir = (o.sort === c.key && o.dir === 'asc') ? 'desc' : 'asc';
          /* Les colonnes numériques et de date sont plus utiles en décroissant
             au premier clic : on veut voir le haut du classement, pas le bas. */
          if (o.sort !== c.key && c.descFirst) dir = 'desc';
          if (o.onSort) o.onSort(c.key, dir);
        });
        th.appendChild(b);
      } else th.textContent = c.label;
      tr.appendChild(th);
    });
    thead.appendChild(tr); t.appendChild(thead);

    var tbody = el('tbody');
    if (!o.rows.length){
      var td = el('td'); td.colSpan = o.columns.length;
      td.appendChild(o.empty || etatVide('Aucun résultat', 'Ajustez la recherche ou les filtres.', I.search));
      var trv = el('tr', 'adm-table__empty'); trv.appendChild(td); tbody.appendChild(trv);
    } else {
      o.rows.forEach(function(row, i){
        var r = el('tr');
        if (o.onRow){
          r.className = 'clickable';
          r.tabIndex = 0;
          r.setAttribute('role', 'link');
          r.addEventListener('click', function(){ o.onRow(row, i); });
          r.addEventListener('keydown', function(ev){
            if (ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); o.onRow(row, i); }
          });
        }
        o.columns.forEach(function(c){
          var td2 = el('td', (c.align ? 'ta-' + c.align : '') + (c.cls ? ' ' + c.cls : '')
                             + (c.hideSm ? ' hide-sm' : ''));
          td2.innerHTML = c.cell ? c.cell(row, i) : esc(row[c.key]);
          if (c.label) td2.setAttribute('data-th', c.label);
          r.appendChild(td2);
        });
        tbody.appendChild(r);
      });
    }
    t.appendChild(tbody);
    wrap.appendChild(t);
    return wrap;
  }

  /* ---------- Barre d'outils : recherche + filtres -------------------------------- */
  function barreOutils(o){
    /* o = {search:{value,placeholder,onInput}, filters:[{key,label,value,options:[{v,l}],onChange}],
           actions:[Node], count:'…'} */
    var b = el('div', 'adm-toolbar');
    if (o.search){
      var box = el('div', 'adm-search');
      box.innerHTML = '<span class="adm-search__ic">' + I.search + '</span>';
      var inp = el('input');
      inp.type = 'search';
      inp.placeholder = o.search.placeholder || 'Rechercher…';
      inp.value = o.search.value || '';
      inp.setAttribute('aria-label', o.search.placeholder || 'Rechercher');
      /* Anti-rebond : sans lui, chaque frappe relance un rendu complet. */
      var minuteur = null;
      inp.addEventListener('input', function(){
        clearTimeout(minuteur);
        var v = inp.value;
        minuteur = setTimeout(function(){ o.search.onInput(v); }, 180);
      });
      box.appendChild(inp);
      b.appendChild(box);
    }
    (o.filters || []).forEach(function(f){
      var g = el('label', 'adm-filter');
      g.appendChild(el('span', 'adm-filter__lab', esc(f.label)));
      var s = el('select');
      f.options.forEach(function(op){
        var opt = el('option', null, esc(op.l));
        opt.value = op.v;
        if (String(op.v) === String(f.value)) opt.selected = true;
        s.appendChild(opt);
      });
      s.addEventListener('change', function(){ f.onChange(s.value); });
      g.appendChild(s);
      b.appendChild(g);
    });
    if (o.count != null) b.appendChild(el('span', 'adm-toolbar__count', esc(o.count)));
    (o.actions || []).forEach(function(a){ b.appendChild(a); });
    return b;
  }

  function bouton(texte, opts){
    opts = opts || {};
    var b = el('button', 'btn small' + (opts.cls ? ' ' + opts.cls : ''),
               (opts.icon || '') + '<span>' + esc(texte) + '</span>');
    b.type = 'button';
    if (opts.title) b.title = opts.title;
    if (opts.disabled) b.disabled = true;
    if (opts.onClick) b.addEventListener('click', opts.onClick);
    return b;
  }

  function pagination(o){
    /* o = {page, pages, total, perPage, onPage} */
    if (o.pages <= 1) return el('div', 'adm-pager adm-pager--single',
      '<span>' + F.nb(o.total) + ' résultat' + (o.total > 1 ? 's' : '') + '</span>');
    var p = el('div', 'adm-pager');
    var info = el('span', null,
      F.nb((o.page - 1) * o.perPage + 1) + '–' + F.nb(Math.min(o.page * o.perPage, o.total))
      + ' sur ' + F.nb(o.total));
    var prec = bouton('Précédent', { disabled:o.page <= 1, onClick:function(){ o.onPage(o.page - 1); } });
    var suiv = bouton('Suivant',   { disabled:o.page >= o.pages, onClick:function(){ o.onPage(o.page + 1); } });
    p.appendChild(prec);
    p.appendChild(info);
    p.appendChild(suiv);
    return p;
  }

  /* ---------- Graphiques SVG ------------------------------------------------------
     Tous partagent le même parti : pas de grille bruyante, un axe implicite, la
     valeur au survol (title natif — accessible et sans code de tooltip).
     ------------------------------------------------------------------------------ */
  var svgNS = 'http://www.w3.org/2000/svg';
  function svg(w, h, cls){
    var s = document.createElementNS(svgNS, 'svg');
    s.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    s.setAttribute('preserveAspectRatio', 'none');
    s.setAttribute('class', 'adm-svg ' + (cls || ''));
    s.setAttribute('role', 'img');
    return s;
  }
  function n(tag, attrs){
    var e = document.createElementNS(svgNS, tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* Aire empilée / courbe : séries = [{key,label,color}] sur points = [{d, …}] */
  function graphAire(points, series, opts){
    opts = opts || {};
    var W = 720, H = opts.height || 180, PAD = 6;
    var box = el('div', 'adm-chart');
    if (!points || !points.length){
      box.appendChild(etatVide('Pas de données sur la période', null, I.chart));
      return box;
    }
    var max = 0;
    points.forEach(function(p){
      var t = 0; series.forEach(function(s){ t += (p[s.key] || 0); });
      if (t > max) max = t;
    });
    if (!max) max = 1;
    var s = svg(W, H);
    var pas = points.length > 1 ? (W - PAD * 2) / (points.length - 1) : 0;
    var y0 = H - 18;
    var bas = points.map(function(){ return 0; });

    series.forEach(function(serie){
      var haut = points.map(function(p, i){ return bas[i] + (p[serie.key] || 0); });
      var d = '';
      points.forEach(function(p, i){
        var x = PAD + i * pas, y = y0 - haut[i] / max * (y0 - PAD);
        d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      });
      for (var i = points.length - 1; i >= 0; i--){
        var x2 = PAD + i * pas, y2 = y0 - bas[i] / max * (y0 - PAD);
        d += 'L' + x2.toFixed(1) + ' ' + y2.toFixed(1);
      }
      d += 'Z';
      s.appendChild(n('path', { d:d, fill:serie.color, 'fill-opacity':opts.fillOpacity || '.55',
                                stroke:'none' }));
      bas = haut;
    });

    /* Ligne de total, pour lire la tendance quand les aires se ressemblent. */
    var dl = '';
    points.forEach(function(p, i){
      var t = 0; series.forEach(function(se){ t += (p[se.key] || 0); });
      var x = PAD + i * pas, y = y0 - t / max * (y0 - PAD);
      dl += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    });
    s.appendChild(n('path', { d:dl, fill:'none', stroke:'currentColor', 'stroke-width':'1.6',
                              'stroke-opacity':'.55', 'vector-effect':'non-scaling-stroke' }));
    s.appendChild(n('line', { x1:PAD, y1:y0, x2:W - PAD, y2:y0, stroke:'currentColor',
                              'stroke-opacity':'.18', 'vector-effect':'non-scaling-stroke' }));
    box.appendChild(s);

    /* Repères d'axe : premier, milieu, dernier. Trois suffisent à situer. */
    var ax = el('div', 'adm-chart__x');
    [0, Math.floor(points.length / 2), points.length - 1].forEach(function(i, k){
      var sp = el('span', null, esc(F.date(points[i].d)));
      if (k === 1) sp.className = 'mid';
      ax.appendChild(sp);
    });
    box.appendChild(ax);

    var lg = el('div', 'adm-legend');
    series.forEach(function(se){
      var tot = points.reduce(function(a, p){ return a + (p[se.key] || 0); }, 0);
      lg.appendChild(el('span', 'adm-legend__i',
        '<i style="background:' + se.color + '"></i>' + esc(se.label) + ' <b>' + F.nb(tot) + '</b>'));
    });
    box.appendChild(lg);
    box.appendChild(el('span', 'adm-chart__max', 'max ' + F.nb(max) + '/j'));
    return box;
  }

  /* Barres horizontales — le classement se lit mieux ainsi que debout, et les
     libellés (« Mise en route + roulage ») tiennent sans être tronqués. */
  function graphBarres(items, opts){
    opts = opts || {};
    var box = el('div', 'adm-bars');
    if (!items || !items.length){
      box.appendChild(etatVide(opts.emptyTitle || 'Pas encore de données', opts.emptyDetail, I.chart));
      return box;
    }
    var max = Math.max.apply(null, items.map(function(x){ return x.n || 0; })) || 1;
    items.forEach(function(x){
      var r = el('div', 'adm-bar' + (opts.clickable ? ' clickable' : ''));
      r.innerHTML =
        '<span class="adm-bar__lab" title="' + esc(x.label) + '">' + esc(x.label) + '</span>' +
        '<span class="adm-bar__track"><i style="width:' + Math.max(2, (x.n / max) * 100) + '%"'
          + (x.tone ? ' class="' + x.tone + '"' : '') + '></i></span>' +
        '<span class="adm-bar__val">' + (x.valueText != null ? esc(x.valueText) : F.nb(x.n)) + '</span>';
      if (opts.onClick){
        r.tabIndex = 0;
        r.addEventListener('click', function(){ opts.onClick(x); });
        r.addEventListener('keydown', function(e){
          if (e.key === 'Enter'){ e.preventDefault(); opts.onClick(x); } });
      }
      box.appendChild(r);
    });
    return box;
  }

  /* Anneau de progression — un seul chiffre, lisible d'un coup d'œil. */
  function anneau(pct, libelle, taille){
    var T = taille || 116, R = T / 2 - 9, C = 2 * Math.PI * R;
    var box = el('div', 'adm-ring');
    var s = svg(T, T, 'adm-ring__svg');
    s.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    s.style.width = T + 'px'; s.style.height = T + 'px';
    s.appendChild(n('circle', { cx:T/2, cy:T/2, r:R, fill:'none', stroke:'currentColor',
                                'stroke-opacity':'.14', 'stroke-width':'9' }));
    if (pct != null){
      s.appendChild(n('circle', { cx:T/2, cy:T/2, r:R, fill:'none',
        stroke:'currentColor', 'stroke-width':'9', 'stroke-linecap':'round',
        'stroke-dasharray':C, 'stroke-dashoffset':C * (1 - Math.max(0, Math.min(100, pct)) / 100),
        transform:'rotate(-90 ' + T/2 + ' ' + T/2 + ')', class:'adm-ring__arc ' + F.classePct(pct) }));
    }
    box.appendChild(s);
    box.appendChild(el('div', 'adm-ring__mid',
      '<b>' + (pct == null ? '—' : pct + '<small>%</small>') + '</b>'
      + '<span>' + esc(libelle || '') + '</span>'));
    return box;
  }

  /* Jauge horizontale, pour les axes de compétence. */
  function jauge(pct, libelle, detail){
    var g = el('div', 'adm-gauge');
    g.innerHTML =
      '<div class="adm-gauge__head"><b>' + esc(libelle) + '</b>'
        + '<span class="adm-pct ' + F.classePct(pct) + '">' + (pct == null ? '—' : pct + ' %') + '</span></div>'
      + '<div class="adm-gauge__track"><i class="' + F.classePct(pct) + '" style="width:'
        + (pct == null ? 0 : Math.max(1.5, pct)) + '%"></i></div>'
      + (detail ? '<span class="adm-gauge__sub">' + esc(detail) + '</span>' : '');
    return g;
  }

  /* Entonnoir : où l'on s'arrête. Les barres décroissent, la perte est chiffrée. */
  function entonnoir(etapes, opts){
    opts = opts || {};
    var box = el('div', 'adm-funnel');
    if (!etapes || !etapes.length){
      box.appendChild(etatVide(opts.emptyTitle || 'Abandons non mesurés',
        opts.emptyDetail, I.chart));
      return box;
    }
    var max = Math.max.apply(null, etapes.map(function(e){ return e.started || 0; })) || 1;
    etapes.forEach(function(e, i){
      var perdu = (e.started || 0) - (e.completed || 0);
      var tauxPerte = e.started ? Math.round(perdu / e.started * 100) : 0;
      var r = el('div', 'adm-funnel__row');
      r.innerHTML =
        '<span class="adm-funnel__n">' + (i + 1) + '</span>' +
        '<span class="adm-funnel__lab">' + esc(e.phase) + '</span>' +
        '<span class="adm-funnel__track"><i style="width:'
          + Math.max(2, (e.started / max) * 100) + '%"></i></span>' +
        '<span class="adm-funnel__val">' + F.nb(e.started) + '</span>' +
        '<span class="adm-funnel__loss' + (tauxPerte >= 8 ? ' hot' : '') + '">'
          + (perdu > 0 ? '−' + F.nb(perdu) : '—') + '</span>';
      box.appendChild(r);
    });
    return box;
  }

  /* ---------- Tiroir latéral (détails sans quitter la liste) ---------------------- */
  var tiroirOuvert = null;
  function tiroir(titre, contenu, opts){
    opts = opts || {};
    fermerTiroir();
    var back = el('div', 'adm-drawer__back');
    var d = el('aside', 'adm-drawer');
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-label', titre);
    var h = el('header', 'adm-drawer__head');
    var g = el('div', 'adm-drawer__titles');
    g.appendChild(el('h3', null, esc(titre)));
    if (opts.sub) g.appendChild(el('p', null, esc(opts.sub)));
    h.appendChild(g);
    var x = el('button', 'adm-iconbtn', I.close);
    x.type = 'button'; x.setAttribute('aria-label', 'Fermer');
    x.addEventListener('click', fermerTiroir);
    h.appendChild(x);
    d.appendChild(h);
    var b = el('div', 'adm-drawer__body');
    if (contenu) b.appendChild(contenu);
    d.appendChild(b);
    if (opts.footer) d.appendChild(opts.footer);

    back.addEventListener('click', fermerTiroir);
    function onKey(e){ if (e.key === 'Escape') fermerTiroir(); }
    document.addEventListener('keydown', onKey);

    document.body.appendChild(back);
    document.body.appendChild(d);
    /* Le décalage d'une image force le navigateur à repartir de l'état fermé,
       sans quoi la transition d'ouverture ne joue pas. */
    requestAnimationFrame(function(){ back.classList.add('in'); d.classList.add('in'); });
    tiroirOuvert = { back:back, d:d, onKey:onKey, prev:document.activeElement };
    setTimeout(function(){ try { x.focus(); } catch(e){} }, 30);
    return { body:b, close:fermerTiroir };
  }
  function fermerTiroir(){
    if (!tiroirOuvert) return;
    var t = tiroirOuvert; tiroirOuvert = null;
    document.removeEventListener('keydown', t.onKey);
    t.back.classList.remove('in'); t.d.classList.remove('in');
    setTimeout(function(){
      if (t.back.parentNode) t.back.parentNode.removeChild(t.back);
      if (t.d.parentNode) t.d.parentNode.removeChild(t.d);
    }, 220);
    if (t.prev && t.prev.focus) try { t.prev.focus(); } catch(e){}
  }

  /* ---------- Liste de définitions (fiches) --------------------------------------- */
  function fiche(paires, opts){
    var dl = el('dl', 'adm-dl' + (opts && opts.cols ? ' adm-dl--' + opts.cols : ''));
    paires.forEach(function(p){
      if (!p) return;
      dl.appendChild(el('dt', null, esc(p[0])));
      dl.appendChild(el('dd', null, p[2] === 'html' ? p[1] : esc(p[1] == null ? '—' : p[1])));
    });
    return dl;
  }

  /* ---------- Notice (encadré explicatif, jamais décoratif) ----------------------- */
  function notice(texte, ton, titre){
    var d = el('div', 'adm-note adm-note--' + (ton || 'info'));
    d.innerHTML = '<span class="adm-note__ic">'
      + (ton === 'warn' ? I.warn : (ton === 'danger' ? I.error : I.info)) + '</span>'
      + '<div>' + (titre ? '<b>' + esc(titre) + '</b>' : '')
      + '<span>' + esc(texte) + '</span></div>';
    return d;
  }

  RT.ui = {
    el:el, esc:esc, vide:vide, I:I, F:F,
    carte:carte, tuile:tuile, badge:badge, pastillePct:pastillePct,
    etatVide:etatVide, etatChargement:etatChargement, etatErreur:etatErreur, charger:charger,
    table:table, barreOutils:barreOutils, bouton:bouton, pagination:pagination,
    graphAire:graphAire, graphBarres:graphBarres, anneau:anneau, jauge:jauge, entonnoir:entonnoir,
    tiroir:tiroir, fermerTiroir:fermerTiroir, fiche:fiche, notice:notice,
    /* Palette des séries : reprise des jetons du site pour rester cohérent. */
    couleurs:{ scenario:'#5b4bce', flight:'#e08a4a', spelling:'#2fa36b',
               neutre:'#8a90a6', ok:'#2fa36b', warn:'#e0912a', bad:'#d9534f' }
  };
})();
