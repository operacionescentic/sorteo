-- Las inscripciones del día del sorteo cuentan para ese sorteo durante todo el día (hasta medianoche, hora Colombia),
-- no solo hasta las 16:00.
create or replace function public.sorteo_fecha_actual()
returns date
language sql
stable
set search_path = ''
as $$
  select f
  from unnest(array['2026-11-20','2026-11-27','2026-12-04','2026-12-11']::date[]) as f
  where (now() at time zone 'America/Bogota')::date <= f
  order by f
  limit 1;
$$;
notify pgrst, 'reload schema';
