-- =============================================================================
-- Albatros VFR — sql/014 : « MISE EN ROUTE + ROULAGE » DEVIENT « CONTACT ET ROULAGE » (03/10/2026)
-- -----------------------------------------------------------------------------
-- Décision du développeur, manuel DSNA en main : en VFR, pas de demande de mise
-- en route. Le seul exemple VFR du manuel (p. 45, « Cas d'un vol VFR ») passe du
-- contact (« bonjour ») à la demande de roulage ; la mise en route (p. 39-40)
-- est rangée sous « clairance initiale – SID », avec des exemples IFR. Le
-- scénario ne fait plus demander de mise en route : son titre en base suit
-- celui du code (tests/verifier-catalogue.mjs compare les deux).
--
-- La CLÉ ne change pas ('roulage') : les séances déjà enregistrées y restent
-- rattachées. Seul le libellé affiché par la console bouge.
--
-- IDEMPOTENT : rejouer ce fichier ne change rien de plus.
-- =============================================================================

update public.exercises set title = 'Contact et roulage'
 where key = 'roulage' and title is distinct from 'Contact et roulage';
