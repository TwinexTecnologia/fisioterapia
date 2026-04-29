-- Salva todos os campos do cadastro de perfis gerenciados pelo app.
-- Rode este arquivo no SQL Editor do Supabase.

alter table public.profiles
add column if not exists login_email text,
add column if not exists crefito text,
add column if not exists is_active boolean not null default true,
add column if not exists allowed_modules text[] not null default '{}'::text[],
add column if not exists phone text,
add column if not exists clinic_name text,
add column if not exists bio text,
add column if not exists avatar_url text,
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

create table if not exists public.patient_device_bindings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  authorized_device_id text not null,
  authorized_device_label text,
  authorized_device_kind text,
  authorized_user_agent text,
  first_bound_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists patient_device_bindings_last_seen_idx
on public.patient_device_bindings(last_seen_at desc);

create table if not exists public.patient_login_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_admin_id uuid references public.profiles(id) on delete set null,
  profile_name text,
  login_email text,
  device_id text,
  device_label text,
  device_kind text,
  user_agent text,
  login_status text not null,
  blocked_reason text,
  logged_at timestamptz not null default timezone('utc', now())
);

create index if not exists patient_login_history_user_logged_at_idx
on public.patient_login_history(user_id, logged_at desc);

create index if not exists patient_login_history_parent_admin_logged_at_idx
on public.patient_login_history(parent_admin_id, logged_at desc);

alter table public.patient_device_bindings enable row level security;
alter table public.patient_login_history enable row level security;

create or replace function public.register_patient_device_login(
  p_device_id text,
  p_device_label text,
  p_device_kind text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_existing public.patient_device_bindings;
  v_now timestamptz := timezone('utc', now());
  v_device_id text := nullif(trim(coalesce(p_device_id, '')), '');
  v_device_label text := nullif(trim(coalesce(p_device_label, '')), '');
  v_device_kind text := nullif(trim(coalesce(p_device_kind, '')), '');
  v_user_agent text := nullif(trim(coalesce(p_user_agent, '')), '');
  v_message text;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if v_device_id is null then
    raise exception 'Device invalido.';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = auth.uid()
  limit 1;

  if not found then
    raise exception 'Perfil do usuario nao encontrado.';
  end if;

  if v_profile.role <> 'fisio_paciente' then
    return jsonb_build_object(
      'allowed', true,
      'status', 'not_applicable'
    );
  end if;

  select *
  into v_existing
  from public.patient_device_bindings
  where user_id = v_profile.id
  limit 1;

  if not found then
    insert into public.patient_device_bindings (
      user_id,
      authorized_device_id,
      authorized_device_label,
      authorized_device_kind,
      authorized_user_agent,
      first_bound_at,
      last_seen_at,
      updated_at
    )
    values (
      v_profile.id,
      v_device_id,
      v_device_label,
      v_device_kind,
      v_user_agent,
      v_now,
      v_now,
      v_now
    );

    insert into public.patient_login_history (
      user_id,
      parent_admin_id,
      profile_name,
      login_email,
      device_id,
      device_label,
      device_kind,
      user_agent,
      login_status,
      blocked_reason,
      logged_at
    )
    values (
      v_profile.id,
      v_profile.parent_admin_id,
      v_profile.full_name,
      v_profile.login_email,
      v_device_id,
      v_device_label,
      v_device_kind,
      v_user_agent,
      'authorized_first_device',
      null,
      v_now
    );

    return jsonb_build_object(
      'allowed', true,
      'status', 'authorized_first_device'
    );
  end if;

  if v_existing.authorized_device_id = v_device_id then
    update public.patient_device_bindings
    set
      authorized_device_label = coalesce(v_device_label, authorized_device_label),
      authorized_device_kind = coalesce(v_device_kind, authorized_device_kind),
      authorized_user_agent = coalesce(v_user_agent, authorized_user_agent),
      last_seen_at = v_now,
      updated_at = v_now
    where user_id = v_profile.id;

    insert into public.patient_login_history (
      user_id,
      parent_admin_id,
      profile_name,
      login_email,
      device_id,
      device_label,
      device_kind,
      user_agent,
      login_status,
      blocked_reason,
      logged_at
    )
    values (
      v_profile.id,
      v_profile.parent_admin_id,
      v_profile.full_name,
      v_profile.login_email,
      v_device_id,
      v_device_label,
      v_device_kind,
      v_user_agent,
      'authorized_known_device',
      null,
      v_now
    );

    return jsonb_build_object(
      'allowed', true,
      'status', 'authorized_known_device'
    );
  end if;

  v_message := 'Dispositivo vinculado diferente do primeiro acesso. Favor entrar em contato com o fisioterapeuta para liberar um novo dispositivo.';

  insert into public.patient_login_history (
    user_id,
    parent_admin_id,
    profile_name,
    login_email,
    device_id,
    device_label,
    device_kind,
    user_agent,
    login_status,
    blocked_reason,
    logged_at
  )
  values (
    v_profile.id,
    v_profile.parent_admin_id,
    v_profile.full_name,
    v_profile.login_email,
    v_device_id,
    v_device_label,
    v_device_kind,
    v_user_agent,
    'blocked_new_device',
    'different_device',
    v_now
  );

  return jsonb_build_object(
    'allowed', false,
    'status', 'blocked_new_device',
    'message', v_message,
    'authorized_device_label', v_existing.authorized_device_label,
    'authorized_device_kind', v_existing.authorized_device_kind
  );
end;
$$;

create or replace function public.list_managed_patient_login_history(
  p_profile_id uuid
)
returns table (
  logged_at timestamptz,
  device_label text,
  device_kind text,
  login_status text,
  blocked_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_target public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  v_actor_role := public.current_profile_role();

  select *
  into v_target
  from public.profiles
  where id = p_profile_id
  limit 1;

  if not found then
    raise exception 'Perfil nao encontrado.';
  end if;

  if v_target.role <> 'fisio_paciente' then
    raise exception 'Historico disponivel apenas para fisio paciente.';
  end if;

  if v_actor_role = 'fisio_admin' and v_target.parent_admin_id is distinct from auth.uid() then
    raise exception 'Sem permissao para visualizar este historico.';
  end if;

  if v_actor_role not in ('fisio_admin', 'owner') then
    raise exception 'Sem permissao para visualizar historico de login.';
  end if;

  return query
  select
    h.logged_at,
    h.device_label,
    h.device_kind,
    h.login_status,
    h.blocked_reason
  from public.patient_login_history h
  where h.user_id = p_profile_id
  order by h.logged_at desc
  limit 100;
end;
$$;

create or replace function public.release_managed_patient_device_lock(
  p_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_target public.profiles;
  v_now timestamptz := timezone('utc', now());
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  v_actor_role := public.current_profile_role();

  select *
  into v_target
  from public.profiles
  where id = p_profile_id
  limit 1;

  if not found then
    raise exception 'Perfil nao encontrado.';
  end if;

  if v_target.role <> 'fisio_paciente' then
    raise exception 'Liberacao disponivel apenas para fisio paciente.';
  end if;

  if v_actor_role = 'fisio_admin' and v_target.parent_admin_id is distinct from auth.uid() then
    raise exception 'Sem permissao para liberar este dispositivo.';
  end if;

  if v_actor_role not in ('fisio_admin', 'owner') then
    raise exception 'Sem permissao para liberar dispositivo.';
  end if;

  delete from public.patient_device_bindings
  where user_id = p_profile_id;

  insert into public.patient_login_history (
    user_id,
    parent_admin_id,
    profile_name,
    login_email,
    device_id,
    device_label,
    device_kind,
    user_agent,
    login_status,
    blocked_reason,
    logged_at
  )
  values (
    v_target.id,
    v_target.parent_admin_id,
    v_target.full_name,
    v_target.login_email,
    null,
    null,
    null,
    null,
    'device_lock_released',
    'released_by_admin',
    v_now
  );

  return jsonb_build_object(
    'ok', true,
    'released_at', v_now
  );
end;
$$;

create or replace function public.list_admin_security_notifications()
returns table (
  profile_id uuid,
  profile_name text,
  login_email text,
  logged_at timestamptz,
  device_label text,
  device_kind text,
  login_status text,
  blocked_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  v_actor_role := public.current_profile_role();

  if v_actor_role not in ('fisio_admin', 'owner') then
    raise exception 'Sem permissao para visualizar notificacoes de seguranca.';
  end if;

  return query
  select distinct on (h.user_id)
    h.user_id as profile_id,
    coalesce(h.profile_name, p.full_name) as profile_name,
    coalesce(h.login_email, p.login_email) as login_email,
    h.logged_at,
    h.device_label,
    h.device_kind,
    h.login_status,
    h.blocked_reason
  from public.patient_login_history h
  join public.profiles p
    on p.id = h.user_id
  where p.role = 'fisio_paciente'
    and h.login_status = 'blocked_new_device'
    and (
      (v_actor_role = 'fisio_admin' and p.parent_admin_id = auth.uid())
      or v_actor_role = 'owner'
    )
    and not exists (
      select 1
      from public.patient_login_history newer
      where newer.user_id = h.user_id
        and newer.logged_at > h.logged_at
        and newer.login_status = 'device_lock_released'
    )
  order by h.user_id, h.logged_at desc;
end;
$$;

grant execute on function public.register_patient_device_login(text, text, text, text)
to authenticated;

grant execute on function public.list_managed_patient_login_history(uuid)
to authenticated;

grant execute on function public.release_managed_patient_device_lock(uuid)
to authenticated;

grant execute on function public.list_admin_security_notifications()
to authenticated;
