create extension if not exists pgcrypto;

create table if not exists public.events (
  id text primary key,
  name text not null,
  reveal_at timestamptz not null
);

insert into public.events (id, name, reveal_at)
values ('saxon-trip', 'Saxon Trip', '2026-11-16 15:00:00+01')
on conflict (id) do update
set name = excluded.name,
    reveal_at = excluded.reveal_at;

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events (id),
  user_id uuid not null references auth.users (id),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;
alter table public.photos enable row level security;

drop policy if exists "Events are visible to guests" on public.events;
create policy "Events are visible to guests"
on public.events for select
to anon, authenticated
using (true);

drop policy if exists "Guests can read their photos or revealed photos" on public.photos;
create policy "Guests can read their photos or revealed photos"
on public.photos for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.events
    where events.id = photos.event_id
      and events.reveal_at <= now()
  )
);

create or replace function public.save_party_photo(photo_event_id text, photo_storage_path text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  guest_id uuid := auth.uid();
  current_count integer;
begin
  if guest_id is null then
    raise exception 'A guest session is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(guest_id::text, 0));

  if not exists (
    select 1
    from public.events
    where id = photo_event_id
      and reveal_at > now()
  ) then
    raise exception 'This event is not accepting photos.';
  end if;

  if split_part(photo_storage_path, '/', 1) <> photo_event_id
     or split_part(photo_storage_path, '/', 2) <> guest_id::text
     or (select count(*) from storage.objects
         where bucket_id = 'party-photos'
           and name = photo_storage_path) <> 1 then
    raise exception 'The uploaded photo does not belong to this guest and event.';
  end if;

  select count(*)::integer
  into current_count
  from public.photos
  where event_id = photo_event_id
    and user_id = guest_id;

  if current_count >= 24 then
    raise exception 'Your camera is out of shots.';
  end if;

  insert into public.photos (event_id, user_id, storage_path)
  values (photo_event_id, guest_id, photo_storage_path);

  return 23 - current_count;
end;
$$;

revoke all on function public.save_party_photo(text, text) from public, anon;
grant execute on function public.save_party_photo(text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('party-photos', 'party-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Guests can upload to their event folder" on storage.objects;
create policy "Guests can upload to their event folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'party-photos'
  and array_length(storage.foldername(name), 1) = 2
  and exists (
    select 1
    from public.events
    where events.id = (storage.foldername(storage.objects.name))[1]
      and events.reveal_at > now()
  )
  and (storage.foldername(storage.objects.name))[2] = (select auth.uid())::text
);

drop policy if exists "Guests can read their own or revealed photos" on storage.objects;
drop policy if exists "Guests can read revealed photos" on storage.objects;
create policy "Guests can read revealed photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'party-photos'
  and exists (
    select 1
    from public.events
    where events.id = (storage.foldername(storage.objects.name))[1]
      and events.reveal_at <= now()
  )
);

drop policy if exists "Guests can clean up unregistered uploads" on storage.objects;
create policy "Guests can clean up unregistered uploads"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'party-photos'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and not exists (
    select 1
    from public.photos
    where photos.storage_path = storage.objects.name
  )
);
