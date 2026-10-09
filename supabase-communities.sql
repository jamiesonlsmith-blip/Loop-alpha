-- Loop Communities 1.0: shared interest communities and genuine user contributions.
-- Members manage multiple category memberships; no synthetic community activity is stored.
create table if not exists public.community_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('restaurants','medical','parks','home-services','auto','retail','travel','fun-games','movies','music')),
  joined_at timestamptz not null default now(),
  primary key (user_id, category)
);
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 120),
  category text not null check (category in ('restaurants','medical','parks','home-services','auto','retail','travel','fun-games','movies','music')),
  topic text not null check (topic in ('Recommendation','Local find','Question','Group','Event','General')),
  content text not null check (char_length(btrim(content)) between 10 and 500),
  area text not null default '' check (char_length(area) <= 90),
  created_at timestamptz not null default now()
);
create index if not exists community_posts_category_recent on public.community_posts(category, created_at desc);
create index if not exists community_posts_author_recent on public.community_posts(user_id, created_at desc);
create table if not exists public.community_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 120),
  content text not null check (char_length(btrim(content)) between 2 and 350),
  created_at timestamptz not null default now()
);
create index if not exists community_replies_post_recent on public.community_replies(post_id,created_at);
create table if not exists public.community_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id,user_id)
);
create table if not exists public.community_bookmarks (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id,user_id)
);
alter table public.community_memberships enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_replies enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_bookmarks enable row level security;
grant select, insert, delete on public.community_memberships, public.community_posts, public.community_replies, public.community_reactions, public.community_bookmarks to authenticated;
-- Never permit anonymous readers or client-side edits after publication.
revoke all on public.community_memberships, public.community_posts, public.community_replies, public.community_reactions, public.community_bookmarks from anon;
revoke update on public.community_memberships, public.community_posts, public.community_replies, public.community_reactions, public.community_bookmarks from authenticated;
drop policy if exists "memberships_read_own" on public.community_memberships;
create policy "memberships_read_own" on public.community_memberships for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists "memberships_join_own" on public.community_memberships;
create policy "memberships_join_own" on public.community_memberships for insert to authenticated with check (user_id=(select auth.uid()));
drop policy if exists "memberships_leave_own" on public.community_memberships;
create policy "memberships_leave_own" on public.community_memberships for delete to authenticated using (user_id=(select auth.uid()));
drop policy if exists "posts_read_members" on public.community_posts;
create policy "posts_read_members" on public.community_posts for select to authenticated using (true);
drop policy if exists "posts_write_joined" on public.community_posts;
create policy "posts_write_joined" on public.community_posts for insert to authenticated with check (
 user_id=(select auth.uid()) and exists (
  select 1 from public.community_memberships m where m.user_id=(select auth.uid()) and m.category=community_posts.category
 )
);
drop policy if exists "posts_delete_own" on public.community_posts;
create policy "posts_delete_own" on public.community_posts for delete to authenticated using (user_id=(select auth.uid()));
drop policy if exists "replies_read_members" on public.community_replies;
create policy "replies_read_members" on public.community_replies for select to authenticated using (true);
drop policy if exists "replies_write_joined" on public.community_replies;
create policy "replies_write_joined" on public.community_replies for insert to authenticated with check (
 user_id=(select auth.uid()) and exists (
  select 1 from public.community_posts p
  join public.community_memberships m on m.category=p.category and m.user_id=(select auth.uid())
  where p.id=community_replies.post_id
 )
);
drop policy if exists "replies_delete_own" on public.community_replies;
create policy "replies_delete_own" on public.community_replies for delete to authenticated using (user_id=(select auth.uid()));
drop policy if exists "reactions_read_members" on public.community_reactions;
create policy "reactions_read_members" on public.community_reactions for select to authenticated using (true);
drop policy if exists "reactions_add_joined" on public.community_reactions;
create policy "reactions_add_joined" on public.community_reactions for insert to authenticated with check (
 user_id=(select auth.uid()) and exists (
  select 1 from public.community_posts p
  join public.community_memberships m on m.category=p.category and m.user_id=(select auth.uid())
  where p.id=community_reactions.post_id
 )
);
drop policy if exists "reactions_remove_own" on public.community_reactions;
create policy "reactions_remove_own" on public.community_reactions for delete to authenticated using (user_id=(select auth.uid()));
drop policy if exists "bookmarks_read_own" on public.community_bookmarks;
create policy "bookmarks_read_own" on public.community_bookmarks for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists "bookmarks_add_own" on public.community_bookmarks;
create policy "bookmarks_add_own" on public.community_bookmarks for insert to authenticated with check (user_id=(select auth.uid()));
drop policy if exists "bookmarks_remove_own" on public.community_bookmarks;
create policy "bookmarks_remove_own" on public.community_bookmarks for delete to authenticated using (user_id=(select auth.uid()));
comment on table public.community_posts is 'Genuine Loop member posts; personalized views combine joined categories, relevance, and recent community interaction.';
