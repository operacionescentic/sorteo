-- Transmisión pública del sorteo en vivo.
-- Cada giro de la ruleta (sorteo_realizar) guarda una foto de la ruleta: lista de nombres en orden,
-- índice del ganador y el desplazamiento aleatorio del puntero. La página pública /en-vivo y el
-- panel admin animan exactamente el mismo giro a partir de esta fila (Supabase Realtime).
-- Solo contiene datos públicos: nombres y documento del ganador enmascarado.

create table if not exists public.sorteo_transmision (
  id uuid primary key default gen_random_uuid(),
  sorteo_fecha date not null,
  premio smallint not null check (premio in (50, 30)),
  participantes jsonb not null,          -- [{ "nombre": "..." }, ...] en el orden de la ruleta
  ganador_idx integer not null,
  ganador_nombre text not null,
  ganador_documento text not null,       -- enmascarado
  jitter real not null check (jitter between -0.5 and 0.5),
  duracion_ms integer not null default 8000,
  created_at timestamptz not null default now(),
  constraint transmision_un_premio_por_semana unique (sorteo_fecha, premio)
);

alter table public.sorteo_transmision enable row level security;

drop policy if exists "transmision publica" on public.sorteo_transmision;
create policy "transmision publica" on public.sorteo_transmision
  for select to anon, authenticated using (true);

revoke all on public.sorteo_transmision from anon, authenticated;
grant select on public.sorteo_transmision to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sorteo_transmision'
  ) then
    alter publication supabase_realtime add table public.sorteo_transmision;
  end if;
end $$;

-- Orden estable de la ruleta (nombre, id) para que admin y público vean lo mismo
create or replace function public.sorteo_participantes(p_fecha date)
returns table (id uuid, nombre text, documento text, motivo text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.sorteo_es_admin() then
    raise exception 'NO_AUTORIZADO' using errcode = '42501';
  end if;
  return query select * from public.sorteo_elegibles(p_fecha) e order by e.nombre, e.id;
end;
$$;

-- Nombres en la ruleta para la página pública: solo el día del sorteo
create or replace function public.sorteo_participantes_publicos(p_fecha date)
returns table (nombre text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.nombre
  from public.sorteo_elegibles(p_fecha) e
  where (now() at time zone 'America/Bogota')::date = p_fecha
  order by e.nombre, e.id;
$$;

create or replace function public.sorteo_realizar(p_fecha date, p_premio smallint)
returns table (inscripcion_id uuid, nombre text, documento text, premio smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_nombre text;
  v_doc text;
  v_lista jsonb;
  v_idx integer;
begin
  if not public.sorteo_es_admin() then
    raise exception 'NO_AUTORIZADO' using errcode = '42501';
  end if;
  if p_premio not in (50, 30) then
    raise exception 'PREMIO_INVALIDO' using errcode = 'P0001';
  end if;
  if p_fecha not in ('2026-11-20','2026-11-27','2026-12-04','2026-12-11') then
    raise exception 'FECHA_INVALIDA' using errcode = 'P0001';
  end if;
  if now() < ((p_fecha::timestamp + time '16:00') at time zone 'America/Bogota') then
    raise exception 'AUN_NO_ES_HORA' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sorteo_ganadores g where g.sorteo_fecha = p_fecha and g.premio = p_premio) then
    raise exception 'PREMIO_YA_SORTEADO' using errcode = 'P0001';
  end if;

  -- Foto de la ruleta en su orden y ganador al azar dentro de ella
  with l as (
    select e.id, e.nombre, e.documento, (row_number() over (order by e.nombre, e.id) - 1)::integer as idx
    from public.sorteo_elegibles(p_fecha) e
  ),
  g as (select * from l order by random() limit 1)
  select (select jsonb_agg(jsonb_build_object('nombre', l.nombre) order by l.idx) from l),
         g.id, g.nombre, g.documento, g.idx
    into v_lista, v_id, v_nombre, v_doc, v_idx
  from g;

  if v_id is null then
    raise exception 'SIN_PARTICIPANTES' using errcode = 'P0001';
  end if;

  insert into public.sorteo_ganadores (inscripcion_id, sorteo_fecha, premio)
  values (v_id, p_fecha, p_premio);

  insert into public.sorteo_transmision
    (sorteo_fecha, premio, participantes, ganador_idx, ganador_nombre, ganador_documento, jitter)
  values (
    p_fecha, p_premio, v_lista, v_idx, v_nombre,
    repeat('*', greatest(char_length(v_doc) - 3, 0)) || right(v_doc, 3),
    (random() - 0.5)::real
  );

  return query select v_id, v_nombre, v_doc, p_premio;
end;
$$;

revoke all on function public.sorteo_participantes_publicos(date) from public;
grant execute on function public.sorteo_participantes_publicos(date) to anon, authenticated;
revoke all on function public.sorteo_realizar(date, smallint) from public, anon;
grant execute on function public.sorteo_realizar(date, smallint) to authenticated;
revoke all on function public.sorteo_participantes(date) from public, anon;
grant execute on function public.sorteo_participantes(date) to authenticated;
notify pgrst, 'reload schema';
