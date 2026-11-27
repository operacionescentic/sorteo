-- El formulario usa "Juan Sebastian Barbosa Forero"; la restricción solo aceptaba "Sebastian Barbosa"
-- y rechazaba la inscripción ("Revisa los datos ingresados").
alter table public.sorteo_inscripciones drop constraint if exists sorteo_inscripciones_comercial_check;
update public.sorteo_inscripciones set comercial = 'Juan Sebastian Barbosa Forero' where comercial = 'Sebastian Barbosa';
alter table public.sorteo_inscripciones add constraint sorteo_inscripciones_comercial_check
  check (comercial in ('Carolina Diaz','Juan Sebastian Barbosa Forero','Luna Torres','Ximena Valencia','Diego Barbosa','Otro'));
