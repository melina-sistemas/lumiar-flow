create table if not exists public.users (
  id text primary key,
  name text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'staff')),
  level text not null check (level in ('bronze', 'silver', 'gold')),
  reading_score integer not null default 0,
  active_loan_id text null,
  completed_loans_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.books (
  id text primary key,
  title text not null,
  author text not null,
  category text not null,
  isbn text null,
  level text not null check (level in ('easy', 'medium', 'hard')),
  is_premium boolean not null default false,
  total_copies integer not null check (total_copies >= 0),
  available_copies integer not null check (available_copies >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loans (
  id text primary key,
  user_id text not null references public.users(id),
  book_id text not null references public.books(id),
  level_at_loan text not null check (level_at_loan in ('easy', 'medium', 'hard')),
  borrowed_at timestamptz not null,
  due_at timestamptz not null,
  status text not null check (
    status in (
      'active',
      'overdue',
      'returned',
      'DISPONIVEL',
      'PENDENTE_APROVACAO',
      'EMPRESTADO',
      'AGUARDANDO_FILA',
      'DEVOLVIDO',
      'REJEITADO',
      'READY_FOR_PICKUP',
      'PENDING_APPROVAL',
      'RETURN_REQUESTED',
      'WAITING',
      'EXPIRED',
      'CANCELLED'
    )
  ),
  returned_at timestamptz null,
  return_record_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.returns (
  id text primary key,
  loan_id text not null unique references public.loans(id),
  user_id text not null references public.users(id),
  book_id text not null references public.books(id),
  returned_at timestamptz not null,
  is_late boolean not null,
  days_late integer not null default 0,
  score_awarded integer not null,
  quality_score integer not null default 0,
  learning text not null,
  application text not null,
  example text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.book_recommendations (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  book_id text not null references public.books(id) on delete cascade,
  cycle text not null check (cycle in ('short', 'medium', 'long')),
  priority text not null check (priority in ('required', 'recommended')),
  main_focus text not null,
  strategic_justification text not null,
  created_at timestamptz not null default now(),
  unique (user_id, book_id)
);

create table if not exists public.admin_state (
  key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_loans_user_id on public.loans(user_id);
create index if not exists idx_loans_book_id on public.loans(book_id);
create index if not exists idx_returns_user_id on public.returns(user_id);
