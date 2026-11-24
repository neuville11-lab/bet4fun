-- Execute this complete script once in Supabase SQL Editor.
create table if not exists public.bets (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.bets enable row level security;
grant select, insert, update, delete on public.bets to authenticated;
drop policy if exists "Users can read their own bets" on public.bets;
drop policy if exists "Users can add their own bets" on public.bets;
drop policy if exists "Users can update their own bets" on public.bets;
drop policy if exists "Users can delete their own bets" on public.bets;
create policy "Users can read their own bets" on public.bets for select to authenticated using (auth.uid() = user_id);
create policy "Users can add their own bets" on public.bets for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update their own bets" on public.bets for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own bets" on public.bets for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.captures (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  bet_id text not null,
  object_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  foreign key (user_id, bet_id) references public.bets(user_id, id) on delete cascade
);
alter table public.captures enable row level security;
grant select, insert, delete on public.captures to authenticated;
drop policy if exists "Users can read their own capture records" on public.captures;
drop policy if exists "Users can add their own capture records" on public.captures;
drop policy if exists "Users can delete their own capture records" on public.captures;
create policy "Users can read their own capture records" on public.captures for select to authenticated using (auth.uid() = user_id);
create policy "Users can add their own capture records" on public.captures for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can delete their own capture records" on public.captures for delete to authenticated using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bet-captures', 'bet-captures', false, 10485760, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Users can read own capture files" on storage.objects;
drop policy if exists "Users can upload own capture files" on storage.objects;
drop policy if exists "Users can update own capture files" on storage.objects;
drop policy if exists "Users can delete own capture files" on storage.objects;
create policy "Users can read own capture files" on storage.objects for select to authenticated using (bucket_id = 'bet-captures' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can upload own capture files" on storage.objects for insert to authenticated with check (bucket_id = 'bet-captures' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can update own capture files" on storage.objects for update to authenticated using (bucket_id = 'bet-captures' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'bet-captures' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can delete own capture files" on storage.objects for delete to authenticated using (bucket_id = 'bet-captures' and (storage.foldername(name))[1] = auth.uid()::text);

