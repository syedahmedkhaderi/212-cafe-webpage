-- 212 Café — a brake on password guessing
--
-- Same shape as `order_rate_limit` from 0005: counted in the database, because a limit
-- enforced in the browser is a suggestion. Supabase Auth applies its own limits at the
-- edge; this one is ours, it is visible, and it is keyed on the thing being attacked.

begin;

create table if not exists auth_rate_limit (
  -- lower(email). Deliberately not the IP: a shared café or office NAT would punish
  -- everyone behind it, and an attacker with a botnet is not slowed by an IP limit.
  key           text primary key,
  window_start  timestamptz not null default now(),
  attempt_count integer not null default 0
);

alter table auth_rate_limit enable row level security;
-- No policy at all. Only the SECURITY DEFINER function below touches it, exactly as
-- with order_rate_limit.

/**
 * Records an attempt and reports whether the caller has run out of budget.
 *
 * Returns true when the attempt may proceed. Ten attempts per five minutes: a person
 * mistyping a password does not hit it, and a script trying a dictionary does.
 *
 * ⚠ Known, accepted trade-off. This must be callable before anyone is signed in, so it
 * is granted to `anon` — which means someone can deliberately burn a colleague's budget
 * by submitting bad passwords for their address. It is therefore a BRAKE, not a lockout:
 * the window self-heals in five minutes, nothing is disabled, and no email is confirmed
 * or denied to exist. An account-locking design would turn this into a better denial of
 * service than the one it prevents.
 */
create or replace function check_auth_rate_limit(p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window constant interval := interval '5 minutes';
  v_max    constant integer  := 10;
  v_key    text := lower(trim(coalesce(p_email, '')));
  v_count  integer;
begin
  if v_key = '' then
    return false;
  end if;

  delete from public.auth_rate_limit where window_start < now() - interval '1 hour';

  insert into public.auth_rate_limit (key, window_start, attempt_count)
  values (v_key, now(), 1)
  on conflict (key) do update
    set attempt_count = case
          when public.auth_rate_limit.window_start < now() - v_window then 1
          else public.auth_rate_limit.attempt_count + 1
        end,
        window_start = case
          when public.auth_rate_limit.window_start < now() - v_window then now()
          else public.auth_rate_limit.window_start
        end
  returning attempt_count into v_count;

  return v_count <= v_max;
end;
$$;

revoke all on function check_auth_rate_limit(text) from public;
grant execute on function check_auth_rate_limit(text) to anon, authenticated;

/** Clears the budget after a successful sign-in, so a forgetful morning costs nothing. */
create or replace function clear_auth_rate_limit(p_email text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.auth_rate_limit where key = lower(trim(coalesce(p_email, '')));
$$;

revoke all on function clear_auth_rate_limit(text) from public;
grant execute on function clear_auth_rate_limit(text) to anon, authenticated;

commit;
