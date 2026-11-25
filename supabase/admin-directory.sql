-- Privileged user directory for BET4FUN.
-- Execute this script once in Supabase SQL Editor.
-- Only the authenticated account below can call this function successfully.
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and lower(coalesce(u.email, '')) = 'enekogoenaga74@gmail.com'
      and u.email_confirmed_at is not null
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email::text,
    coalesce(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      split_part(u.email, '@', 1)
    )::text,
    u.created_at,
    u.last_sign_in_at
  from auth.users u
  where u.deleted_at is null
  order by u.created_at desc;
end;
$function$;

revoke all on function public.admin_list_users() from public;
revoke all on function public.admin_list_users() from anon;
grant execute on function public.admin_list_users() to authenticated;
