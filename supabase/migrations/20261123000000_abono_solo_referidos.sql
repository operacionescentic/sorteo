-- El abono ya no es obligatorio para participar en la semana de inscripción.
-- Solo aplica a los referidos: quien refiere participa en la semana del referido
-- únicamente si ese referido tiene el abono validado.

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
    );
$$;

revoke all on function public.sorteo_elegibles(date) from public, anon, authenticated;
notify pgrst, 'reload schema';
