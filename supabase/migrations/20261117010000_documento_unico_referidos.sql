-- Documento único (una inscripción por persona) y referidos por número de documento.
-- Regla: una persona participa en el sorteo de su semana de inscripción (con abono validado)
-- y, además, en cada semana en la que un referido suyo se inscriba y tenga el abono validado.

alter table public.sorteo_inscripciones drop constraint if exists inscripcion_unica_semana;
alter table public.sorteo_inscripciones drop constraint if exists documento_unico;
alter table public.sorteo_inscripciones add constraint documento_unico unique (documento);

alter table public.sorteo_inscripciones rename column referido_por to referido_documento;
alter table public.sorteo_inscripciones drop constraint if exists referido_fk;
alter table public.sorteo_inscripciones
  add constraint referido_fk foreign key (referido_documento)
  references public.sorteo_inscripciones (documento) on update cascade on delete restrict;
alter table public.sorteo_inscripciones drop constraint if exists referido_no_propio;
alter table public.sorteo_inscripciones
  add constraint referido_no_propio check (referido_documento is null or referido_documento <> documento);
create index if not exists sorteo_inscripciones_referido_idx on public.sorteo_inscripciones (referido_documento);

drop function if exists public.sorteo_inscribir(text,text,text,text,text,text,text);

create or replace function public.sorteo_inscribir(
  p_nombre text,
  p_correo text,
  p_documento text,
  p_telefono text,
  p_comercial text,
  p_comercial_otro text,
  p_referido_documento text
)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha date := public.sorteo_fecha_actual();
  v_doc text := regexp_replace(trim(coalesce(p_documento, '')), '[.\s-]', '', 'g');
  v_ref text := nullif(regexp_replace(trim(coalesce(p_referido_documento, '')), '[.\s-]', '', 'g'), '');
begin
  if v_fecha is null then
    raise exception 'SORTEO_CERRADO' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sorteo_inscripciones where documento = v_doc) then
    raise exception 'YA_INSCRITO' using errcode = 'P0001';
  end if;
  if v_ref is not null then
    if v_ref = v_doc then
      raise exception 'REFERIDO_PROPIO' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.sorteo_inscripciones where documento = v_ref) then
      raise exception 'REFERIDO_NO_EXISTE' using errcode = 'P0001';
    end if;
  end if;

  insert into public.sorteo_inscripciones
    (nombre, correo, documento, telefono, comercial, comercial_otro, referido_documento, sorteo_fecha)
  values (
    trim(p_nombre),
    lower(trim(p_correo)),
    v_doc,
    nullif(trim(coalesce(p_telefono, '')), ''),
    p_comercial,
    case when p_comercial = 'Otro' then trim(p_comercial_otro) else null end,
    v_ref,
    v_fecha
  );

  return v_fecha;
exception
  when unique_violation then
    raise exception 'YA_INSCRITO' using errcode = 'P0001';
end;
$$;

-- Participantes elegibles de una semana (sin contar ganadores de esa semana)
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
  where i.abono_validado
    and (
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
    );
$$;

-- Versión para la ruleta (solo admin)
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
  return query select * from public.sorteo_elegibles(p_fecha) e order by e.nombre;
end;
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

  select e.id, e.nombre, e.documento into v_id, v_nombre, v_doc
  from public.sorteo_elegibles(p_fecha) e
  order by random()
  limit 1;

  if v_id is null then
    raise exception 'SIN_PARTICIPANTES' using errcode = 'P0001';
  end if;

  insert into public.sorteo_ganadores (inscripcion_id, sorteo_fecha, premio)
  values (v_id, p_fecha, p_premio);

  return query select v_id, v_nombre, v_doc, p_premio;
end;
$$;

revoke all on function public.sorteo_inscribir(text,text,text,text,text,text,text) from public;
revoke all on function public.sorteo_elegibles(date) from public, anon, authenticated;
revoke all on function public.sorteo_participantes(date) from public, anon;
grant execute on function public.sorteo_inscribir(text,text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.sorteo_participantes(date) to authenticated;
notify pgrst, 'reload schema';
