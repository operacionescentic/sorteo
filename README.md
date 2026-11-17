# Sorteo CENTIC — sorteo.centicsas.com.co

Next.js 16 + React 19 + Supabase. Desplegado en Vercel.

## Rutas
| Ruta | Descripción |
|---|---|
| `/` | Info del sorteo, ofertas y formulario de inscripción |
| `/ganadores` | Ganadores públicos (se refresca cada 20 s) |
| `/api/ganadores` | Endpoint público JSON (CORS abierto) |
| `/admin` | Panel admin: validar abonos, filtros por comercial / fecha, exportar CSV |
| `/admin/ruleta` | Ruleta: se habilita cada viernes a las 4:00 pm (hora Colombia) |

## Base de datos
Migración: `supabase/migrations/20261117000000_sorteo.sql`

- `sorteo_inscripciones`, `sorteo_ganadores`, `sorteo_admins` — RLS activo, anon no lee nada.
- Inscripción pública vía RPC `sorteo_inscribir` (la semana se asigna en el servidor).
- Sorteo vía RPC `sorteo_realizar` (solo admin, solo desde el viernes 16:00, elige ganador al azar en la BD entre abonos validados).
- Ganadores públicos vía RPC `sorteo_ganadores_publicos` (documento enmascarado).
- Fechas de sorteo hardcodeadas en la migración y en `lib/sorteo.ts` (mantener sincronizadas).

## Admin
1. Supabase → Authentication → Users → **Add user** → `gerenciacomercial@centicsas.com.co`, con contraseña y **Auto Confirm**.
   Un trigger lo registra como admin automáticamente.
2. Recomendado: Authentication → Sign In / Providers → desactivar **Allow new users to sign up**.

## Variables de entorno (Vercel y `.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Despliegue
1. Subir el repo a GitHub e importarlo en Vercel (framework Next.js), con las variables de entorno.
2. Vercel → Settings → Domains → `sorteo.centicsas.com.co`.
3. En el DNS de `centicsas.com.co`: registro `CNAME sorteo → cname.vercel-dns.com`.
