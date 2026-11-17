-- Sorteo semanal CENTIC: inscripciones, ganadores, admins
-- Fechas de sorteo: viernes 20-nov, 27-nov, 04-dic, 11-dic 2026 a las 16:00 (America/Bogota)

create table if not exists public.sorteo_inscripciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(trim(nombre)) between 3 and 120),
  correo text not null check (correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  documento text not null check (documento ~ '^[0-9A-Za-z.\-]{4,20}$'),
  telefono text,
  comercial text not null check (comercial in ('Carolina Diaz','Sebastian Barbosa','Luna Torres','Ximena Valencia','Diego Barbosa','Otro')),
  comercial_otro text,
  referido_por text,
  sorteo_fecha date not null,
  abono_validado boolean not null default false,
  monto_abono numeric(12,0),
  abono_validado_at timestamptz,
  created_at timestamptz not null default now(),
  constraint comercial_otro_requerido check (comercial <> 'Otro' or char_length(trim(coalesce(comercial_otro,''))) > 0),
  constraint inscripcion_unica_semana unique (documento, sorteo_fecha)
);

create index if not exists sorteo_inscripciones_fecha_idx on public.sorteo_inscripciones (sorteo_fecha, abono_validado);
create index if not exists sorteo_inscripciones_comercial_idx on public.sorteo_inscripciones (comercial);
create index if not exists sorteo_inscripciones_created_idx on public.sorteo_inscripciones (created_at);

create table if not exists public.sorteo_ganadores (
  id uuid primary key default gen_random_uuid(),
  inscripcion_id uuid not null references public.sorteo_inscripciones(id) on delete restrict,
  sorteo_fecha date not null,
  premio smallint not null check (premio in (50, 30)),
  created_at timestamptz not null default now(),
  constraint un_premio_por_semana unique (sorteo_fecha, premio),
  constraint un_premio_por_persona unique (sorteo_fecha, inscripcion_id)
);
create index if not exists sorteo_ganadores_inscripcion_idx on public.sorteo_ganadores (inscripcion_id);

create table if not exists public.sorteo_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.sorteo_inscripciones enable row level security;
alter table public.sorteo_ganadores enable row level security;
alter table public.sorteo_admins enable row level security;

-- ¿El usuario actual es admin (y con correo confirmado)?
create or replace function public.sorteo_es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sorteo_admins a
    join auth.users u on u.id = a.user_id
    where a.user_id = (select auth.uid())
      and u.email_confirmed_at is not null
  );
$$;

-- Fecha del sorteo al que se asigna una inscripción hecha "ahora"
create or replace function public.sorteo_fecha_actual()
returns date
language sql
stable
set search_path = ''
as $$
  select f
  from unnest(array['2026-11-20','2026-11-27','2026-12-04','2026-12-11']::date[]) as f
  where now() < ((f::timestamp + time '16:00') at time zone 'America/Bogota')
  order by f
  limit 1;
$$;

-- Admin: lectura y actualización (validar abonos)
drop policy if exists "admin lee inscripciones" on public.sorteo_inscripciones;
create policy "admin lee inscripciones" on public.sorteo_inscripciones
  for select to authenticated using ((select public.sorteo_es_admin()));

drop policy if exists "admin actualiza inscripciones" on public.sorteo_inscripciones;
create policy "admin actualiza inscripciones" on public.sorteo_inscripciones
  for update to authenticated
  using ((select public.sorteo_es_admin()))
  with check ((select public.sorteo_es_admin()));

drop policy if exists "admin lee ganadores" on public.sorteo_ganadores;
create policy "admin lee ganadores" on public.sorteo_ganadores
  for select to authenticated using ((select public.sorteo_es_admin()));

drop policy if exists "admin se ve" on public.sorteo_admins;
create policy "admin se ve" on public.sorteo_admins
  for select to authenticated using (user_id = (select auth.uid()));

-- Inscripción pública (anon) vía RPC: asigna la semana en el servidor
create or replace function public.sorteo_inscribir(
  p_nombre text,
  p_correo text,
  p_documento text,
  p_telefono text,
  p_comercial text,
  p_comercial_otro text,
  p_referido_por text
)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha date := public.sorteo_fecha_actual();
begin
  if v_fecha is null then
    raise exception 'SORTEO_CERRADO' using errcode = 'P0001';
  end if;

  insert into public.sorteo_inscripciones
    (nombre, correo, documento, telefono, comercial, comercial_otro, referido_por, sorteo_fecha)
  values (
    trim(p_nombre),
    lower(trim(p_correo)),
    regexp_replace(trim(p_documento), '[.\s]', '', 'g'),
    nullif(trim(coalesce(p_telefono, '')), ''),
    p_comercial,
    case when p_comercial = 'Otro' then trim(p_comercial_otro) else null end,
    nullif(trim(coalesce(p_referido_por, '')), ''),
    v_fecha
  );

  return v_fecha;
exception
  when unique_violation then
    raise exception 'YA_INSCRITO' using errcode = 'P0001';
end;
$$;

-- Realizar sorteo (solo admin, desde el viernes 16:00). Devuelve el ganador.
create or replace function public.sorteo_realizar(p_fecha date, p_premio smallint)
returns table (inscripcion_id uuid, nombre text, documento text, premio smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ins public.sorteo_inscripciones%rowtype;
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

  select i.* into v_ins
  from public.sorteo_inscripciones i
  where i.sorteo_fecha = p_fecha
    and i.abono_validado
    and not exists (select 1 from public.sorteo_ganadores g where g.sorteo_fecha = p_fecha and g.inscripcion_id = i.id)
  order by random()
  limit 1;

  if v_ins.id is null then
    raise exception 'SIN_PARTICIPANTES' using errcode = 'P0001';
  end if;

  insert into public.sorteo_ganadores (inscripcion_id, sorteo_fecha, premio)
  values (v_ins.id, p_fecha, p_premio);

  return query select v_ins.id, v_ins.nombre, v_ins.documento, p_premio;
end;
$$;

-- Ganadores públicos (datos enmascarados)
create or replace function public.sorteo_ganadores_publicos()
returns table (sorteo_fecha date, premio smallint, nombre text, documento text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select g.sorteo_fecha,
         g.premio,
         i.nombre,
         repeat('*', greatest(char_length(i.documento) - 3, 0)) || right(i.documento, 3),
         g.created_at
  from public.sorteo_ganadores g
  join public.sorteo_inscripciones i on i.id = g.inscripcion_id
  order by g.sorteo_fecha desc, g.premio desc;
$$;

-- Admin automático: al crear/confirmar el usuario gerenciacomercial@centicsas.com.co
create or replace function public.sorteo_registrar_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(new.email) = 'gerenciacomercial@centicsas.com.co' then
    insert into public.sorteo_admins (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists sorteo_registrar_admin on auth.users;
create trigger sorteo_registrar_admin
  after insert on auth.users
  for each row execute function public.sorteo_registrar_admin();

insert into public.sorteo_admins (user_id)
select id from auth.users where lower(email) = 'gerenciacomercial@centicsas.com.co'
on conflict do nothing;

-- Permisos
revoke all on function public.sorteo_es_admin() from public, anon;
revoke all on function public.sorteo_inscribir(text,text,text,text,text,text,text) from public;
revoke all on function public.sorteo_realizar(date, smallint) from public, anon;
revoke all on function public.sorteo_ganadores_publicos() from public;
revoke all on function public.sorteo_registrar_admin() from public, anon, authenticated;

grant execute on function public.sorteo_es_admin() to authenticated;
grant execute on function public.sorteo_fecha_actual() to anon, authenticated;
grant execute on function public.sorteo_inscribir(text,text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.sorteo_realizar(date, smallint) to authenticated;
grant execute on function public.sorteo_ganadores_publicos() to anon, authenticated;

revoke all on public.sorteo_inscripciones, public.sorteo_ganadores, public.sorteo_admins from anon;
revoke update on public.sorteo_inscripciones from authenticated;
grant select on public.sorteo_inscripciones to authenticated;
grant update (abono_validado, monto_abono, abono_validado_at) on public.sorteo_inscripciones to authenticated;
grant select on public.sorteo_ganadores, public.sorteo_admins to authenticated;
