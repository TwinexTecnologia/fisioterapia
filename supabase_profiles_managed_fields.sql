-- Salva todos os campos do cadastro de perfis gerenciados pelo app.
-- Rode este arquivo no SQL Editor do Supabase.

alter table public.profiles
add column if not exists login_email text,
add column if not exists crefito text,
add column if not exists is_active boolean not null default true,
add column if not exists allowed_modules text[] not null default '{}'::text[],
add column if not exists cep text,
add column if not exists street text,
add column if not exists address_number text,
add column if not exists address_complement text,
add column if not exists neighborhood text,
add column if not exists city text,
add column if not exists state text;

create index if not exists profiles_role_idx
on public.profiles(role);

create index if not exists profiles_parent_admin_id_idx
on public.profiles(parent_admin_id);

alter table public.profiles enable row level security;

create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.is_owner_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_profile_role() = 'owner', false);
$$;

create or replace function public.is_fisio_admin_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_profile_role() = 'fisio_admin', false);
$$;

create or replace function public.save_managed_profile(
  p_profile_id uuid,
  p_full_name text,
  p_role text,
  p_parent_admin_id uuid,
  p_login_email text,
  p_crefito text,
  p_is_active boolean,
  p_allowed_modules text[],
  p_cep text,
  p_street text,
  p_address_number text,
  p_address_complement text,
  p_neighborhood text,
  p_city text,
  p_state text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  v_actor_role := public.current_profile_role();

  if v_actor_role = 'owner' then
    if p_role <> 'fisio_admin' then
      raise exception 'Owner so pode salvar perfis fisio_admin.';
    end if;
  elsif v_actor_role = 'fisio_admin' then
    if p_role <> 'fisio_paciente' then
      raise exception 'Fisio admin so pode salvar perfis fisio_paciente.';
    end if;
    if p_parent_admin_id is distinct from auth.uid() then
      raise exception 'parent_admin_id invalido para este fisio admin.';
    end if;
  else
    raise exception 'Perfil sem permissao para salvar usuarios gerenciados.';
  end if;

  insert into public.profiles (
    id,
    full_name,
    role,
    parent_admin_id,
    login_email,
    crefito,
    is_active,
    allowed_modules,
    cep,
    street,
    address_number,
    address_complement,
    neighborhood,
    city,
    state
  )
  values (
    p_profile_id,
    p_full_name,
    p_role,
    p_parent_admin_id,
    p_login_email,
    p_crefito,
    coalesce(p_is_active, true),
    coalesce(p_allowed_modules, '{}'::text[]),
    p_cep,
    p_street,
    p_address_number,
    p_address_complement,
    p_neighborhood,
    p_city,
    p_state
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    role = excluded.role,
    parent_admin_id = excluded.parent_admin_id,
    login_email = excluded.login_email,
    crefito = excluded.crefito,
    is_active = excluded.is_active,
    allowed_modules = excluded.allowed_modules,
    cep = excluded.cep,
    street = excluded.street,
    address_number = excluded.address_number,
    address_complement = excluded.address_complement,
    neighborhood = excluded.neighborhood,
    city = excluded.city,
    state = excluded.state,
    updated_at = timezone('utc', now())
  returning * into v_profile;

  return v_profile;
end;
$$;

grant execute on function public.save_managed_profile(
  uuid, text, text, uuid, text, text, boolean, text[], text, text, text, text, text, text, text
) to authenticated;

drop policy if exists profiles_select_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_owner_select_admins on public.profiles;
drop policy if exists profiles_owner_insert_admins on public.profiles;
drop policy if exists profiles_owner_update_admins on public.profiles;
drop policy if exists profiles_fisio_admin_select_patients on public.profiles;
drop policy if exists profiles_fisio_admin_insert_patients on public.profiles;
drop policy if exists profiles_fisio_admin_update_patients on public.profiles;

create policy profiles_select_self
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy profiles_owner_select_admins
on public.profiles
for select
to authenticated
using (
  public.is_owner_user()
  and role = 'fisio_admin'
);

create policy profiles_owner_insert_admins
on public.profiles
for insert
to authenticated
with check (
  public.is_owner_user()
  and role = 'fisio_admin'
);

create policy profiles_owner_update_admins
on public.profiles
for update
to authenticated
using (
  public.is_owner_user()
  and (
    role = 'fisio_admin'
    or parent_admin_id is null
  )
)
with check (
  public.is_owner_user()
  and role = 'fisio_admin'
);

create policy profiles_fisio_admin_select_patients
on public.profiles
for select
to authenticated
using (
  public.is_fisio_admin_user()
  and role = 'fisio_paciente'
  and parent_admin_id = auth.uid()
);

create policy profiles_fisio_admin_insert_patients
on public.profiles
for insert
to authenticated
with check (
  public.is_fisio_admin_user()
  and role = 'fisio_paciente'
  and parent_admin_id = auth.uid()
);

create policy profiles_fisio_admin_update_patients
on public.profiles
for update
to authenticated
using (
  public.is_fisio_admin_user()
  and (
    (role = 'fisio_paciente' and parent_admin_id = auth.uid())
    or parent_admin_id is null
  )
)
with check (
  public.is_fisio_admin_user()
  and role = 'fisio_paciente'
  and parent_admin_id = auth.uid()
);
