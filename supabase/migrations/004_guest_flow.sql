-- Global Business: guest flow (safe to re-run)
-- Players enter instantly as guests with a ready company, and get a "save your progress"
-- prompt at progress milestones (not at the first building).
--
-- BEFORE running: Dashboard > Authentication > Sign In / Providers > enable "Allow anonymous sign-ins".
-- (That switch is a dashboard setting; it cannot be changed from SQL.)

alter table companies add column if not exists save_prompts int not null default 0;

-- 1) Every new auth user (guest or registered) gets a company automatically.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare nm text; tries int := 0;
begin
  if exists (select 1 from companies where owner_id = new.id) then return new; end if;
  loop
    nm := 'Company ' || lpad(floor(random() * 100000)::int::text, 5, '0');
    begin
      insert into companies (owner_id, name) values (new.id, nm);
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 10 then return new; end if;   -- never block sign-up; the app falls back to the "found company" form
    end;
  end loop;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill users who have no company yet
insert into companies (owner_id, name)
select u.id, 'Company ' || substr(replace(u.id::text, '-', ''), 1, 6)
from auth.users u
where not exists (select 1 from companies c where c.owner_id = u.id)
on conflict do nothing;

-- 2) Players can rename the auto-generated company
create or replace function rename_company(new_name text)
returns void language plpgsql security definer set search_path = public as $$
declare nm text := btrim(new_name);
begin
  if char_length(nm) < 3 or char_length(nm) > 30 then raise exception 'Name must be 3-30 characters'; end if;
  update companies set name = nm where owner_id = auth.uid();
exception when unique_violation then
  raise exception 'That name is already taken';
end $$;

-- 3) Save-progress prompt: guests only, first at 200 XP (Level 2), again at 500 XP.
--    Change the two numbers below to move the milestones.
create or replace function should_prompt_save()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     and exists (
       select 1 from companies c
       where c.owner_id = auth.uid()
         and ((c.save_prompts = 0 and c.xp >= 200) or (c.save_prompts = 1 and c.xp >= 500)));
$$;

create or replace function mark_save_prompted()
returns void language sql security definer set search_path = public as $$
  update companies set save_prompts = save_prompts + 1 where owner_id = auth.uid();
$$;
