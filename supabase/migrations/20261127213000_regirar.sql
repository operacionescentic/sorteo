-- Re-girar un premio: si el ganador no está conectado, el admin anula su premio y la ruleta vuelve a girar.
-- La persona anulada queda fuera de los sorteos de esa fecha.

create table if not exists public.sorteo_anulados (
  id uuid primary key default gen_random_uuid(),
  sorteo_fecha date not null,
  premio smallint not null,
  inscripcion_id uuid not null references public.sorteo_inscripciones(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint anulado_unico unique (sorteo_fecha, inscripcion_id)
);
alter table public.sorteo_anulados enable row level security;
revoke all on public.sorteo_anulados from anon, authenticated;

create or replace function public.sorteo_elegibles(p_fecha date)
returns table (id uuid, nombre text, documento text, motivo text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.nombre, i.documento,
         case when i.sorteo_fecha = p_fecha then 'inscripcion' else 'referido' end
  from public.sorteo_inscripciones i
  where (
      i.sorteo_fecha = p_fecha
      or exists (
        select 1 from public.sorteo_inscripciones r
        where r.referido_documento = i.documento
          and r.sorteo_fecha = p_fecha
          and r.abono_validado
      )
    )
    and not exists (
      select 1 from public.sorteo_ganadores g
      where g.sorteo_fecha = p_fecha and g.inscripcion_id = i.id
    )
    and not exists (
      select 1 from public.sorteo_anulados a
      where a.sorteo_fecha = p_fecha and a.inscripcion_id = i.id
    );
$$;

create or replace function public.sorteo_regirar(p_fecha date, p_premio smallint)
returns table (inscripcion_id uuid, nombre text, documento text, premio smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ganador uuid;
begin
  if not public.sorteo_es_admin() then
    raise exception 'NO_AUTORIZADO' using errcode = '42501';
  end if;

  select g.inscripcion_id into v_ganador
  from public.sorteo_ganadores g
  where g.sorteo_fecha = p_fecha and g.premio = p_premio
  for update;

  if v_ganador is null then
    raise exception 'SIN_GANADOR' using errcode = 'P0001';
  end if;

  insert into public.sorteo_anulados (sorteo_fecha, premio, inscripcion_id)
  values (p_fecha, p_premio, v_ganador)
  on conflict do nothing;
  delete from public.sorteo_transmision t where t.sorteo_fecha = p_fecha and t.premio = p_premio;
  delete from public.sorteo_ganadores g where g.sorteo_fecha = p_fecha and g.premio = p_premio;

  -- Nuevo giro (si no quedan participantes, todo se revierte y el ganador anterior se mantiene)
  return query select * from public.sorteo_realizar(p_fecha, p_premio);
end;
$$;

revoke all on function public.sorteo_elegibles(date) from public, anon, authenticated;
revoke all on function public.sorteo_regirar(date, smallint) from public, anon;
grant execute on function public.sorteo_regirar(date, smallint) to authenticated;
notify pgrst, 'reload schema';
