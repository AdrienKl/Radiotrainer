/* =============================================================================
   RadioTrainer — Admin · SOURCE « SUPABASE » (adaptateur, NON CONNECTÉ)
   -----------------------------------------------------------------------------
   Cette source est délibérément inerte. Elle existe pour deux raisons :
     · réserver la place, de sorte que brancher Supabase soit un travail de
       remplissage et non de réarchitecture ;
     · rendre l'absence de branchement VISIBLE dans l'interface — le sélecteur
       de source la montre, et toute page qui l'interroge affiche « Supabase
       n'est pas connecté », jamais un tableau vide qui laisserait croire à une
       base sans données.

   ┌─ SÉCURITÉ ──────────────────────────────────────────────────────────────┐
   │ Ne placez JAMAIS ici :                                                  │
   │   · la clé `service_role` (elle contourne RLS — usage serveur seulement)│
   │   · un mot de passe, un jeton d'administration, un secret quelconque    │
   │ Seule la clé publique `anon` a sa place dans un client, et elle n'ouvre │
   │ que ce que les politiques RLS autorisent. C'est la BASE qui décide qui  │
   │ voit quoi — jamais ce fichier.                                          │
   └─────────────────────────────────────────────────────────────────────────┘

   COMMENT BRANCHER (voir assets/admin/README.md pour le SQL complet)
   -----------------------------------------------------------------------------
   1. Charger le client officiel avant ce fichier :
        <script src="assets/vendor/supabase.js"></script>
      (à vendre en local comme leaflet.js : l'application doit rester ouvrable
       en file:// et fonctionner hors-ligne pour tout le reste.)

   2. Renseigner CONFIG ci-dessous — URL du projet et clé `anon` uniquement.
      Ces deux valeurs sont publiques par conception ; elles ne sont pas un
      secret et ne donnent aucun droit par elles-mêmes.

   3. Créer les tables et les politiques (README.md § SQL).

   4. Remplacer chaque `throw nonConnecte()` par la requête indiquée en
      commentaire au-dessus. Les formes de retour sont déjà écrites : elles
      doivent correspondre exactement au contrat de contract.js.

   5. Passer la source par défaut sur 'supabase' dans admin.js (DEFAUT_SOURCE).

   Aucune page de l'Admin n'est à modifier.
   ========================================================================== */
(function(){
  'use strict';
  var RT = window.RTAdmin; if (!RT || !RT.data) return;

  var CONFIG = {
    url:'',        // ex. 'https://xxxxxxxxxxxx.supabase.co'
    anonKey:''     // clé PUBLIQUE `anon` — jamais `service_role`
  };

  var client = null;
  function connecte(){
    if (client) return client;
    if (!CONFIG.url || !CONFIG.anonKey) return null;
    if (!window.supabase || !window.supabase.createClient) return null;
    client = window.supabase.createClient(CONFIG.url, CONFIG.anonKey);
    return client;
  }

  function nonConnecte(){
    var e = new Error(
      "Supabase n'est pas connecté. Renseignez l'URL et la clé publique dans "
      + "assets/admin/data/source-supabase.js, puis remplissez les requêtes "
      + "(voir assets/admin/README.md).");
    e.rtUnavailable = true;
    e.rtSource = 'supabase';
    return e;
  }

  /* ---------------------------------------------------------------------------
     Le squelette. Chaque méthode porte, en commentaire, la requête exacte à
     écrire et la forme attendue en retour.
     ------------------------------------------------------------------------ */
  var src = {
    id:'supabase',
    label:'Supabase',
    fictional:false,

    available:function(){ return !!connecte(); },
    unavailableReason:function(){
      if (!CONFIG.url || !CONFIG.anonKey)
        return "Supabase n'est pas configuré : l'URL du projet et la clé publique "
             + "`anon` ne sont pas renseignées dans "
             + "assets/admin/data/source-supabase.js.";
      if (!window.supabase)
        return "Le client Supabase n'est pas chargé. Ajoutez la balise <script> du "
             + "client avant assets/admin/data/source-supabase.js.";
      return '';
    },

    capabilities:function(){
      return { read:false, write:false, realtime:false, users:false, errors:false,
               analytics:false,
               note:"Adaptateur en place, base non connectée. Voir assets/admin/README.md." };
    },

    /* select count(*) from profiles;
       select count(*) from profiles where created_at >= :from;
       select count(distinct user_id) from sessions where started_at between :from and :to;
       select count(*), avg(duration_s), avg(score_pct) from sessions where …
       → {users:{total,new,active}, sessions:{…}, exercises:{…}, score:{avgPct}, deltas:{…}} */
    overview:function(){ throw nonConnecte(); },

    /* select s.id, s.started_at, s.user_id, p.display_name, s.kind, …
         from sessions s join profiles p on p.id = s.user_id
        order by s.started_at desc limit :limit;
       → [{id,at,userId,userName,kind,label,detail,scorePct,status}] */
    activity:function(){ throw nonConnecte(); },

    /* Trois requêtes réunies :
         a) select … from app_errors where resolved_at is null and occurred_at > now()-'7 days'
         b) select exercise_key, avg(score_pct), count(*) from sessions
              where kind='scenario' group by 1 having count(*) >= 12 and avg(score_pct) < 58
         c) select count(*) filter (where status='abandoned')::float/count(*) from sessions
              where started_at > now()-'14 days'
       → [{id,at,level,kind,title,detail,route}] */
    alerts:function(){ throw nonConnecte(); },

    /* select p.*, v.sessions, v.flights, v.avg_pct, v.training_s
         from profiles p left join v_user_progress v on v.user_id = p.id
        where (:q = '' or p.display_name ilike '%'||:q||'%' or p.email ilike '%'||:q||'%')
          and (:status = 'all' or p.status = :status)
          and (:role   = 'all' or p.role   = :role)
        order by … limit :perPage offset :offset;
       → {rows:[UserRow], total} — pensez à `{count:'exact'}` pour `total`. */
    users:function(){ throw nonConnecte(); },

    /* select p.*, v.* from profiles p left join v_user_progress v on v.user_id=p.id
        where p.id = :id;  → UserDetail | null */
    user:function(){ throw nonConnecte(); },

    /* select * from sessions where user_id = :id order by started_at desc limit :limit;
       → [SessionRow] */
    userSessions:function(){ throw nonConnecte(); },

    /* select axis, count(*) filter (where missed) as missed, count(*) as attempts
         from v_missed_items where user_id = :id group by axis;
       (l'axe est calculé par RTAdmin.taxonomy côté client si la vue ne le fait pas)
       → [{axis,label,attempts,missed,pct}] */
    userWeaknesses:function(){ throw nonConnecte(); },

    /* select s.*, p.display_name from sessions s join profiles p on p.id=s.user_id
        where s.kind='flight' and … order by … limit … offset …;
       → {rows:[FlightRow], total} */
    flights:function(){ throw nonConnecte(); },

    /* select * from sessions where id = :id;
       select * from session_steps where session_id = :id order by idx;
       → FlightDetail (steps[]) | null */
    flight:function(){ throw nonConnecte(); },

    /* Agrégats sur `sessions` groupés par jour, par exercice, par avion, par
       terrain, par aléa, plus `v_missed_items` pour les éléments manqués.
       À faire en une fonction SQL (`rpc('admin_analytics', {from,to})`) plutôt
       qu'en huit allers-retours depuis le navigateur.
       → voir § ANALYTICS de contract.js */
    analytics:function(){ throw nonConnecte(); },

    /* select e.*, coalesce(s.runs,0), s.avg_pct from exercises e
         left join (select exercise_key key, count(*) runs, avg(score_pct) avg_pct
                      from sessions group by 1) s on s.key = e.key
        order by e.sort_order;
       → [ExerciseRow]  (le DÉROULÉ des scénarios reste dans le code : voir ADMIN.md §10) */
    exercises:function(){ throw nonConnecte(); },

    /* select e.*, p.display_name from app_errors e
         left join profiles p on p.id = e.user_id
        where … order by occurred_at desc limit … offset …;
       → {rows:[ErrorRow], total} */
    errors:function(){ throw nonConnecte(); },

    /* select * from app_errors where id = :id;  → ErrorDetail | null */
    error:function(){ throw nonConnecte(); }
  };

  RT.data.register(src);
})();
