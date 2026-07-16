create table if not exists public.audit_user_sessions (
  session_id uuid primary key,
  usuario text not null,
  nombre_completo text,
  rol text,
  source text not null default 'web',
  login_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz,
  logged_out_at timestamptz,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists audit_user_sessions_usuario_idx
  on public.audit_user_sessions (usuario, login_at desc);

create index if not exists audit_user_sessions_active_idx
  on public.audit_user_sessions (logged_out_at, expires_at);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  actor_usuario text,
  actor_nombre text,
  actor_rol text,
  session_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  module text,
  source text not null default 'web',
  status text not null default 'success',
  summary text not null,
  route text,
  ip_address text,
  user_agent text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists audit_events_created_at_idx
  on public.audit_events (created_at desc);

create index if not exists audit_events_actor_usuario_idx
  on public.audit_events (actor_usuario, created_at desc);

create index if not exists audit_events_entity_idx
  on public.audit_events (entity_type, entity_id, created_at desc);

create index if not exists audit_events_session_idx
  on public.audit_events (session_id, created_at desc);
