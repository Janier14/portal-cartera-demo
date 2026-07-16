create table if not exists public.directorio_contactos (
  id uuid primary key default gen_random_uuid(),
  directorio_id integer not null references public.directorio (id) on delete cascade,
  rol text not null check (rol in ('Cartera', 'Operaciones')),
  nombre text not null,
  email text,
  telefono text,
  notas text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists directorio_contactos_directorio_id_idx
  on public.directorio_contactos (directorio_id);

create unique index if not exists directorio_contactos_unique_contact_idx
  on public.directorio_contactos (
    directorio_id,
    rol,
    lower(nombre),
    lower(coalesce(email, '')),
    coalesce(telefono, '')
  );

alter table public.directorio_contactos enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'directorio_contactos'
      and policyname = 'directorio_contactos_anon_select'
  ) then
    create policy directorio_contactos_anon_select
      on public.directorio_contactos
      for select
      to anon
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'directorio_contactos'
      and policyname = 'directorio_contactos_service_role_all'
  ) then
    create policy directorio_contactos_service_role_all
      on public.directorio_contactos
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end
$$;

create or replace function public.sync_directorio_contactos(
  p_directorio_id integer,
  p_contactos jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_rol text;
  v_nombre text;
  v_email text;
  v_telefono text;
  v_notas text;
begin
  if p_directorio_id is null then
    raise exception 'El directorio_id es obligatorio';
  end if;

  if p_contactos is null then
    p_contactos := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_contactos) <> 'array' then
    raise exception 'Los contactos deben enviarse como un arreglo JSON';
  end if;

  delete from public.directorio_contactos
  where directorio_id = p_directorio_id;

  for v_item in
    select value
    from jsonb_array_elements(p_contactos)
  loop
    v_rol := btrim(coalesce(v_item ->> 'rol', ''));
    v_nombre := btrim(coalesce(v_item ->> 'nombre', ''));
    v_email := nullif(btrim(coalesce(v_item ->> 'email', '')), '');
    v_telefono := nullif(btrim(coalesce(v_item ->> 'telefono', '')), '');
    v_notas := nullif(btrim(coalesce(v_item ->> 'notas', '')), '');

    if v_rol not in ('Cartera', 'Operaciones') then
      raise exception 'Rol de contacto invalido: %', v_rol;
    end if;

    if v_nombre = '' then
      raise exception 'El nombre del contacto es obligatorio';
    end if;

    insert into public.directorio_contactos (
      directorio_id,
      rol,
      nombre,
      email,
      telefono,
      notas
    )
    values (
      p_directorio_id,
      v_rol,
      v_nombre,
      v_email,
      v_telefono,
      v_notas
    );
  end loop;
end;
$$;

create or replace function public.save_directorio_with_contactos(
  p_directorio_id integer default null,
  p_nombre text default null,
  p_tipo text default null,
  p_link_pago text default null,
  p_notas text default null,
  p_contactos jsonb default '[]'::jsonb
)
returns public.directorio
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.directorio%rowtype;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_tipo text := nullif(btrim(coalesce(p_tipo, '')), '');
  v_link_pago text := coalesce(btrim(p_link_pago), '');
  v_notas text := coalesce(btrim(p_notas), '');
begin
  if v_nombre = '' then
    raise exception 'El nombre de la aseguradora es obligatorio';
  end if;

  if p_directorio_id is null then
    insert into public.directorio (
      nombre,
      tipo,
      link_pago,
      notas
    )
    values (
      v_nombre,
      coalesce(v_tipo, 'Seguros'),
      v_link_pago,
      v_notas
    )
    returning * into v_row;
  else
    update public.directorio
    set
      nombre = v_nombre,
      tipo = coalesce(v_tipo, 'Seguros'),
      link_pago = v_link_pago,
      notas = v_notas
    where id = p_directorio_id
    returning * into v_row;

    if not found then
      raise exception 'Aseguradora no encontrada';
    end if;
  end if;

  perform public.sync_directorio_contactos(v_row.id, p_contactos);

  return v_row;
end;
$$;

with legacy_source as (
  select
    d.id as directorio_id,
    coalesce(nullif(btrim(d.responsable), ''), 'Contacto principal') as nombre_contacto,
    case
      when d.correos is null then array[]::text[]
      else d.correos
    end as correos,
    case
      when d.telefonos is null then array[]::text[]
      else d.telefonos
    end as telefonos,
    nullif(btrim(d.notas), '') as notas
  from public.directorio d
  where nullif(btrim(d.responsable), '') is not null
     or coalesce(array_length(d.correos, 1), 0) > 0
     or coalesce(array_length(d.telefonos, 1), 0) > 0
), legacy_expanded as (
  select
    s.directorio_id,
    'Cartera'::text as rol,
    s.nombre_contacto as nombre,
    nullif(btrim(s.correos[gs.idx]), '') as email,
    nullif(btrim(s.telefonos[gs.idx]), '') as telefono,
    s.notas
  from legacy_source s
  cross join lateral generate_series(
    1,
    greatest(
      coalesce(array_length(s.correos, 1), 0),
      coalesce(array_length(s.telefonos, 1), 0),
      1
    )
  ) as gs(idx)
)
insert into public.directorio_contactos (
  directorio_id,
  rol,
  nombre,
  email,
  telefono,
  notas
)
select
  e.directorio_id,
  e.rol,
  e.nombre,
  e.email,
  e.telefono,
  e.notas
from legacy_expanded e
where not exists (
  select 1
  from public.directorio_contactos dc
  where dc.directorio_id = e.directorio_id
    and dc.rol = e.rol
    and lower(dc.nombre) = lower(e.nombre)
    and lower(coalesce(dc.email, '')) = lower(coalesce(e.email, ''))
    and coalesce(dc.telefono, '') = coalesce(e.telefono, '')
);
