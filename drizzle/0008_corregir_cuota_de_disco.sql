-- DevTracker · Corregir contra qué métrica se factura en Supabase
--
-- En 0007 le puse la cuota Pro al DISCO USADO, y está mal. Supabase mide tres
-- cosas distintas y cada plan factura una:
--
--   • Free:  "500 MB database size"        → el TAMAÑO DE LA BASE
--   • Pro:   "8 GB disk size per project"  → el DISCO APROVISIONADO
--   • Y el disco USADO no lo factura ninguno: es el que sirve para saber si te
--     estás quedando sin lugar, y su tope real lo devuelve la propia API en
--     fs_size_bytes, que es mejor que cualquier constante.
--
-- Cobrar por el usado cuando facturan el aprovisionado daría un excedente
-- menor al real, que es la dirección equivocada para equivocarse.
DELETE FROM public."plan_quotas"
WHERE source = 'supabase' AND metric = 'supabase.disk_used_bytes';
--> statement-breakpoint

-- El Free factura tamaño de base; el Pro no. Sacamos la fila Pro de esa
-- métrica para no comparar peras con manzanas.
DELETE FROM public."plan_quotas"
WHERE source = 'supabase'
  AND plan = 'pro'
  AND metric = 'supabase.db_size_bytes';
--> statement-breakpoint

-- Y el Pro sí factura disco aprovisionado: 8 GB incluidos, USD 0,125 por GB.
INSERT INTO public."plan_quotas"
  (source, plan, metric, included, overage_price_usd, overage_block)
VALUES
  ('supabase', 'pro', 'supabase.disk_size_bytes', 8589934592, 0.125, 1073741824)
ON CONFLICT (source, plan, metric) DO NOTHING;
