-- Quiz Battle: Neon Arena
-- Run this whole file in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.quiz_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_player_id uuid,
  status text not null default 'waiting' check (status in ('waiting','playing','finished')),
  current_round integer not null default 0,
  question_ids integer[] not null default '{}',
  round_started_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.quiz_rooms(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 18),
  player_token text not null,
  score integer not null default 0,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  unique(room_id, nickname)
);

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.quiz_rooms(id) on delete cascade,
  player_id uuid not null references public.quiz_players(id) on delete cascade,
  round_index integer not null,
  answer_index integer not null,
  is_correct boolean not null,
  points_awarded integer not null default 0,
  answered_at timestamptz not null default now(),
  unique(room_id, player_id, round_index)
);

create table if not exists public.quiz_questions (
  id integer primary key,
  category text not null,
  question text not null,
  options jsonb not null,
  correct_index integer not null check (correct_index between 0 and 3),
  explanation text not null
);

insert into public.quiz_questions(id,category,question,options,correct_index,explanation) values
(1,'SCIENCE','Which planet is known as the Red Planet?','["Venus","Mars","Jupiter","Mercury"]',1,'Iron oxide gives Mars its distinctive reddish appearance.'),
(2,'TECH','What does CPU stand for?','["Central Processing Unit","Computer Power Utility","Core Program Upload","Central Performance User"]',0,'The CPU executes instructions and coordinates computer operations.'),
(3,'SPACE','Which is the largest planet in our solar system?','["Earth","Saturn","Jupiter","Neptune"]',2,'Jupiter is the largest planet by both mass and diameter.'),
(4,'WEB','Which language styles the appearance of web pages?','["HTML","CSS","SQL","Python"]',1,'CSS controls layouts, colors, typography, and other visual styles.'),
(5,'GENERAL','How many sides does a hexagon have?','["Five","Six","Seven","Eight"]',1,'A hexagon is a polygon with six sides.'),
(6,'TECH','Which of these is a JavaScript runtime?','["Node.js","Figma","PostgreSQL","Photoshop"]',0,'Node.js lets JavaScript run outside a browser.'),
(7,'SCIENCE','What is the chemical symbol for gold?','["Ag","Gd","Au","Go"]',2,'Au comes from the Latin word aurum.'),
(8,'GAMES','What does FPS commonly mean in gaming?','["Frames Per Second","Fast Player Score","First Play Session","Final Power System"]',0,'Frames per second measures how many images are displayed each second.'),
(9,'MATH','What is 12 × 8?','["86","92","96","108"]',2,'12 multiplied by 8 equals 96.'),
(10,'WORLD','Which ocean is the largest?','["Atlantic","Indian","Arctic","Pacific"]',3,'The Pacific Ocean is the largest and deepest ocean on Earth.')
on conflict (id) do update set category=excluded.category,question=excluded.question,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;

alter table public.quiz_rooms enable row level security;
alter table public.quiz_players enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.quiz_questions enable row level security;

-- No direct client table reads/writes: use the SECURITY DEFINER RPCs below.
revoke all on public.quiz_rooms from anon, authenticated;
revoke all on public.quiz_players from anon, authenticated;
revoke all on public.quiz_answers from anon, authenticated;
revoke all on public.quiz_questions from anon, authenticated;

create or replace function public._quiz_state(p_code text, p_token text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.quiz_rooms; p public.quiz_players; out_players jsonb; out_scores jsonb; q public.quiz_questions; answered jsonb;
begin
  select * into r from quiz_rooms where code=upper(p_code);
  if not found then raise exception 'Room not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'nickname',nickname,'is_host',is_host) order by joined_at),'[]'::jsonb)
    into out_players from quiz_players where room_id=r.id;
  select coalesce(jsonb_object_agg(id::text,score),'{}'::jsonb) into out_scores from quiz_players where room_id=r.id;
  select coalesce(jsonb_agg(player_id),'[]'::jsonb) into answered from quiz_answers where room_id=r.id and round_index=r.current_round;
  if r.status='playing' and cardinality(r.question_ids)>r.current_round then
    select * into q from quiz_questions where id=r.question_ids[r.current_round+1];
  end if;
  return jsonb_build_object(
    'room',jsonb_build_object('id',r.id,'code',r.code,'host_id',r.host_player_id,'status',r.status,'current_round',r.current_round),
    'players',out_players,'scores',out_scores,'round',r.current_round,
    'question',case when q.id is null then null else jsonb_build_object('category',q.category,'question',q.question,'options',q.options,'answer',q.correct_index,'explanation',q.explanation) end,
    'questions',coalesce((select jsonb_agg(jsonb_build_object('category',qq.category,'question',qq.question,'options',qq.options,'answer',qq.correct_index,'explanation',qq.explanation) order by array_position(r.question_ids,qq.id)) from quiz_questions qq where qq.id=any(r.question_ids)),'[]'::jsonb),
    'answeredPlayers',answered
  );
end $$;

create or replace function public.create_quiz_room(p_nickname text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.quiz_rooms; p public.quiz_players; tok text; c text; ids integer[];
begin
  if length(trim(p_nickname)) not between 1 and 18 then raise exception 'Nickname must be 1–18 characters'; end if;
  loop
    c := upper(substr(encode(gen_random_bytes(6),'hex'),1,6));
    exit when not exists(select 1 from quiz_rooms where code=c);
  end loop;
  tok := encode(gen_random_bytes(24),'hex');
  select array_agg(id order by random()) into ids from (select id from quiz_questions order by random() limit 5) x;
  insert into quiz_rooms(code,question_ids) values(c,ids) returning * into r;
  insert into quiz_players(room_id,nickname,player_token,is_host) values(r.id,trim(p_nickname),tok,true) returning * into p;
  update quiz_rooms set host_player_id=p.id where id=r.id returning * into r;
  return jsonb_build_object('room',jsonb_build_object('id',r.id,'code',r.code,'host_id',p.id,'status',r.status,'current_round',r.current_round),
    'player',jsonb_build_object('id',p.id,'nickname',p.nickname,'is_host',true,'token',tok),'players',jsonb_build_array(jsonb_build_object('id',p.id,'nickname',p.nickname,'is_host',true)),'questions','[]'::jsonb);
end $$;

create or replace function public.join_quiz_room(p_code text,p_nickname text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.quiz_rooms; p public.quiz_players; tok text;
begin
  if length(trim(p_nickname)) not between 1 and 18 then raise exception 'Nickname must be 1–18 characters'; end if;
  select * into r from quiz_rooms where code=upper(trim(p_code)) for update;
  if not found then raise exception 'Room not found. Check the code.'; end if;
  if r.status <> 'waiting' then raise exception 'This match has already started'; end if;
  if (select count(*) from quiz_players where room_id=r.id)>=8 then raise exception 'Room is full (maximum 8 players)'; end if;
  if exists(select 1 from quiz_players where room_id=r.id and lower(nickname)=lower(trim(p_nickname))) then raise exception 'That nickname is already taken in this room'; end if;
  tok := encode(gen_random_bytes(24),'hex');
  insert into quiz_players(room_id,nickname,player_token) values(r.id,trim(p_nickname),tok) returning * into p;
  return jsonb_build_object('room',jsonb_build_object('id',r.id,'code',r.code,'host_id',r.host_player_id,'status',r.status,'current_round',r.current_round),
    'player',jsonb_build_object('id',p.id,'nickname',p.nickname,'is_host',false,'token',tok),
    'players',(select jsonb_agg(jsonb_build_object('id',id,'nickname',nickname,'is_host',is_host) order by joined_at) from quiz_players where room_id=r.id),
    'scores',(select coalesce(jsonb_object_agg(id::text,score),'{}'::jsonb) from quiz_players where room_id=r.id),
    'questions','[]'::jsonb);
end $$;

create or replace function public.get_quiz_state(p_code text)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select public._quiz_state(p_code,null)
$$;

create or replace function public.start_quiz_match(p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.quiz_rooms; n integer; state jsonb;
begin
  select * into r from quiz_rooms where code=upper(p_code) for update;
  if not found then raise exception 'Room not found'; end if;
  select count(*) into n from quiz_players where room_id=r.id;
  if n<2 then raise exception 'At least two players are required'; end if;
  if r.status<>'waiting' then raise exception 'Match already started'; end if;
  update quiz_rooms set status='playing',current_round=0,round_started_at=now() where id=r.id;
  state:=public._quiz_state(p_code,null);
  return state;
end $$;

create or replace function public.submit_quiz_answer(p_code text,p_answer_index integer,p_round integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.quiz_rooms; pid uuid; tok text; q public.quiz_questions; correct boolean; pts integer; elapsed numeric; state jsonb;
begin
  tok := current_setting('request.headers',true)::jsonb->>'x-player-token';
  if tok is null or length(tok)<20 then raise exception 'Player session missing. Rejoin the room.'; end if;
  select * into r from quiz_rooms where code=upper(p_code) for update;
  if not found or r.status<>'playing' then raise exception 'Match is not active'; end if;
  if p_round<>r.current_round then raise exception 'This question has expired'; end if;
  select id into pid from quiz_players where room_id=r.id and player_token=tok;
  if pid is null then raise exception 'Player session invalid. Rejoin the room.'; end if;
  if exists(select 1 from quiz_answers where room_id=r.id and player_id=pid and round_index=p_round) then raise exception 'You already answered this round'; end if;
  if now()>r.round_started_at+interval '15 seconds' then raise exception 'Time is up'; end if;
  if p_answer_index not between 0 and 3 then raise exception 'Invalid answer'; end if;
  select * into q from quiz_questions where id=r.question_ids[r.current_round+1];
  correct := (p_answer_index=q.correct_index);
  elapsed := greatest(0,extract(epoch from (now()-r.round_started_at)));
  pts := case when correct then 500 + greatest(0, floor((15-elapsed)*20)::integer) else 0 end;
  insert into quiz_answers(room_id,player_id,round_index,answer_index,is_correct,points_awarded)
    values(r.id,pid,p_round,p_answer_index,correct,pts);
  update quiz_players set score=score+pts where id=pid;
  state:=public._quiz_state(p_code,null);
  return state || jsonb_build_object('correct',correct,'pointsAwarded',pts,
    'allAnswered',(select count(*) from quiz_answers where room_id=r.id and round_index=p_round)>=(select count(*) from quiz_players where room_id=r.id));
end $$;

create or replace function public.advance_quiz_round(p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.quiz_rooms; tok text; state jsonb; all_answered boolean;
begin
  tok := current_setting('request.headers',true)::jsonb->>'x-player-token';
  select * into r from quiz_rooms where code=upper(p_code) for update;
  if not found then raise exception 'Room not found'; end if;
  if tok is null or not exists(select 1 from quiz_players where id=r.host_player_id and player_token=tok) then
    raise exception 'Only the host can advance the round';
  end if;
  if r.status<>'playing' then raise exception 'Match is not active'; end if;
  select (count(*) >= (select count(*) from quiz_players where room_id=r.id)) into all_answered
    from quiz_answers where room_id=r.id and round_index=r.current_round;
  if not coalesce(all_answered,false) and now() < r.round_started_at+interval '15 seconds' then
    raise exception 'Wait for every player to answer or for the timer to expire';
  end if;
  if r.current_round+1 >= cardinality(r.question_ids) then
    update quiz_rooms set status='finished' where id=r.id;
  else
    update quiz_rooms set current_round=current_round+1,round_started_at=now() where id=r.id;
  end if;
  state:=public._quiz_state(p_code,null);
  return state || jsonb_build_object('screen',case when (state->'room'->>'status')='finished' then 'results' else 'arena' end);
end $$;

-- Require explicit player token header on game-changing RPCs; anon clients cannot call internal helper.
revoke all on function public._quiz_state(text,text) from public, anon, authenticated;
revoke all on function public.create_quiz_room(text) from public;
revoke all on function public.join_quiz_room(text,text) from public;
revoke all on function public.get_quiz_state(text) from public;
revoke all on function public.start_quiz_match(text) from public;
revoke all on function public.submit_quiz_answer(text,integer,integer) from public;
revoke all on function public.advance_quiz_round(text) from public;
grant execute on function public.create_quiz_room(text) to anon, authenticated;
grant execute on function public.join_quiz_room(text,text) to anon, authenticated;
grant execute on function public.get_quiz_state(text) to anon, authenticated;
grant execute on function public.start_quiz_match(text) to anon, authenticated;
grant execute on function public.submit_quiz_answer(text,integer,integer) to anon, authenticated;
grant execute on function public.advance_quiz_round(text) to anon, authenticated;
