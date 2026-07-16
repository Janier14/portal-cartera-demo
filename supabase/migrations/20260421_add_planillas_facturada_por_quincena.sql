alter table public.planillas
  add column if not exists facturada_q1 boolean not null default false,
  add column if not exists facturada_q2 boolean not null default false;

with migrated as (
  update public.planillas
  set
    facturada_q1 = (coalesce(facturada_q1, false) or coalesce(facturada, false)),
    facturada_q2 = coalesce(facturada_q2, false)
  where
    facturada_q1 is distinct from (coalesce(facturada_q1, false) or coalesce(facturada, false))
    or facturada_q2 is distinct from coalesce(facturada_q2, false)
  returning compania, tipo, mes, anio
)
select count(*) as filas_afectadas
from migrated;

comment on column public.planillas.facturada_q1 is 'Factura emitida para la primera quincena.';
comment on column public.planillas.facturada_q2 is 'Factura emitida para la segunda quincena.';
comment on column public.planillas.facturada is 'DEPRECATED: campo legado reemplazado por facturada_q1 y facturada_q2. Mantener solo por compatibilidad.';
