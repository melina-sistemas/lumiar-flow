alter table public.users
  add column if not exists status text not null default 'approved',
  add column if not exists access_status text not null default 'approved',
  add column if not exists password_hash text null,
  add column if not exists password_salt text null,
  add column if not exists token_version integer not null default 0,
  add column if not exists created_by_admin boolean not null default false,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists approved_at timestamptz null,
  add column if not exists approved_by text null,
  add column if not exists rejected_at timestamptz null,
  add column if not exists rejected_by text null,
  add column if not exists rejection_reason text not null default '',
  add column if not exists last_login_at timestamptz null;

alter table public.users
  drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role in ('admin', 'staff', 'user'));

alter table public.users
  drop constraint if exists users_status_check;

alter table public.users
  add constraint users_status_check
  check (status in ('pending', 'approved', 'rejected', 'blocked'));

update public.users
set
  status = coalesce(status, 'approved'),
  access_status = coalesce(access_status, status, 'approved');

create index if not exists idx_users_status on public.users(status);
create index if not exists idx_users_access_status on public.users(access_status);
