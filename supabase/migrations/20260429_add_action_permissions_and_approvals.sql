alter table public.usuarios
  add column if not exists action_permissions jsonb not null default '{}'::jsonb;

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz,
  requested_by_usuario text not null,
  requested_by_nombre text,
  requested_by_rol text,
  reviewed_by_usuario text,
  reviewed_by_nombre text,
  reviewed_by_rol text,
  module text not null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  status text not null default 'pending',
  summary text not null,
  reason text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists approval_requests_status_created_at_idx
  on public.approval_requests (status, created_at desc);

create index if not exists approval_requests_module_status_idx
  on public.approval_requests (module, status, created_at desc);

create index if not exists approval_requests_requested_by_idx
  on public.approval_requests (requested_by_usuario, created_at desc);
