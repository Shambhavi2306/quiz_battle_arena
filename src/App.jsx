import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Zap, Users, Trophy, Swords, Copy, Check, ArrowRight, Sparkles, Clock3,
  Crown, Radio, ShieldCheck, Gamepad2, LogOut, RotateCcw, Wifi, WifiOff,
  ChevronRight, Target, Flame, X
} from 'lucide-react';
import {
  isSupabaseConfigured,
  supabase,
  setPlayerToken
} from './lib/supabase.js';

const QUESTIONS = [
  { category:'SCIENCE', question:'Which planet is known as the Red Planet?', options:['Venus','Mars','Jupiter','Mercury'], answer:1, explanation:'Iron oxide gives Mars its distinctive reddish appearance.' },
  { category:'TECH', question:'What does “CPU” stand for?', options:['Central Processing Unit','Computer Power Utility','Core Program Upload','Central Performance User'], answer:0, explanation:'The CPU executes instructions and coordinates computer operations.' },
  { category:'SPACE', question:'Which is the largest planet in our solar system?', options:['Earth','Saturn','Jupiter','Neptune'], answer:2, explanation:'Jupiter is the largest planet by both mass and diameter.' },
  { category:'WEB', question:'Which language styles the appearance of web pages?', options:['HTML','CSS','SQL','Python'], answer:1, explanation:'CSS controls layouts, colors, typography, and other visual styles.' },
  { category:'GENERAL', question:'How many sides does a hexagon have?', options:['Five','Six','Seven','Eight'], answer:1, explanation:'A hexagon is a polygon with six sides.' },
  { category:'TECH', question:'Which of these is a JavaScript runtime?', options:['Node.js','Figma','PostgreSQL','Photoshop'], answer:0, explanation:'Node.js lets JavaScript run outside a browser.' },
  { category:'SCIENCE', question:'What is the chemical symbol for gold?', options:['Ag','Gd','Au','Go'], answer:2, explanation:'Au comes from the Latin word aurum.' },
  { category:'GAMES', question:'What does FPS commonly mean in gaming?', options:['Frames Per Second','Fast Player Score','First Play Session','Final Power System'], answer:0, explanation:'Frames per second measures how many images are displayed each second.' },
  { category:'MATH', question:'What is 12 × 8?', options:['86','92','96','108'], answer:2, explanation:'12 multiplied by 8 equals 96.' },
  { category:'WORLD', question:'Which ocean is the largest?', options:['Atlantic','Indian','Arctic','Pacific'], answer:3, explanation:'The Pacific Ocean is the largest and deepest ocean on Earth.' }
];
const LETTERS = ['A','B','C','D'];
const randomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const shortName = (s) => (s || 'PLAYER').trim().slice(0, 18).toUpperCase();
const initials = (s) => shortName(s).slice(0,2);
const timeNow = () => Date.now();

export default function App() {
  const [screen, setScreen] = useState('home');
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [round, setRound] = useState(0);
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [answerState, setAnswerState] = useState(null);
  const [seconds, setSeconds] = useState(15);
  const [scores, setScores] = useState({});
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [playerId, setPlayerId] = useState('');
  const [host, setHost] = useState(false);
  const [copied, setCopied] = useState(false);
  const [live, setLive] = useState(false);
  const [matchQuestions, setMatchQuestions] = useState([]);
  const [answeredPlayers, setAnsweredPlayers] = useState([]);
  const timerRef = useRef(null);
  const advanceLockRef = useRef(false);
  const roundKeyRef = useRef('');
  const incomingQuestionKeyRef = useRef('');
  const channelRef = useRef(null);
  const roomRef = useRef(null);
  const playerRef = useRef(null);
  const localMode = !isSupabaseConfigured;

  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { playerRef.current = playerId; }, [playerId]);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);
  useEffect(() => {
    const key = `${room?.code || ''}:${round}:${question?.question || ''}:${screen}`;
    if (key !== roundKeyRef.current) {
      roundKeyRef.current = key;
      advanceLockRef.current = false;
    }
  }, [room?.code, round, question?.question, screen]);

  // Each device renders a local countdown; only the host is allowed to advance
  // the server round. A small grace period avoids racing the database timer.
  useEffect(() => {
    if (localMode || screen !== 'arena' || !room?.code || !question) return;
    const startedAt = Date.now();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(Math.max(0, 15 - elapsed));
    };
    tick();
    const interval = window.setInterval(() => {
      tick();
      if (Date.now() - startedAt >= 15500) {
        window.clearInterval(interval);
        if (host) advanceRound();
      }
    }, 200);
    return () => window.clearInterval(interval);
  }, [localMode, screen, room?.code, round, question?.question, host]);

  // When all players have answered, the host advances immediately. The lock
  // prevents simultaneous timeout and answer-completion triggers from double
  // advancing the same round.
  useEffect(() => {
    if (localMode || !host || screen !== 'arena' || players.length === 0) return;
    if (answeredPlayers.length >= players.length) advanceRound();
  }, [localMode, host, screen, answeredPlayers.length, players.length, room?.code, round]);

  const sortedPlayers = useMemo(() => [...players].sort((a,b) => (scores[b.id] || 0) - (scores[a.id] || 0)), [players, scores]);
  const showNotice = (msg) => { setNotice(msg); window.setTimeout(() => setNotice(''), 3800); };
  const shuffleQuestions = () => [...QUESTIONS].sort(() => Math.random() - .5).slice(0, 5);

  function clearChannel() {
    if (channelRef.current && supabase) supabase.removeChannel(channelRef.current);
    channelRef.current = null;
    setLive(false);
  }
  useEffect(() => () => clearChannel(), []);

  async function createRoom() {
    if (!nickname.trim()) return showNotice('Enter a nickname first.');
    setBusy(true);
    try {
      if (localMode) {
        const code = randomCode();
        const id = crypto.randomUUID();
        setPlayerId(id); setHost(true);
        const newRoom = { code, id: code, host_id: id, status: 'waiting', current_round: 0, created_at: new Date().toISOString() };
        setRoom(newRoom);
        setPlayers([{ id, nickname: shortName(nickname), is_host: true, connected: true }]);
        setScores({ [id]: 0 });
        setMatchQuestions(shuffleQuestions());
        setScreen('lobby');
        showNotice('Preview mode: connect Supabase for cross-device play.');
      } else {
        const { data, error } = await supabase.rpc('create_quiz_room', { p_nickname: shortName(nickname) });
        if (error) throw error;
        setRoom(data.room); setPlayerId(data.player.id); setHost(true);
        setPlayerToken(data.player.token);
        setPlayers(data.players || [data.player]); setScores({ [data.player.id]: 0 });
        setMatchQuestions(data.questions || []);
        await subscribeRoom(data.room.code);
        setScreen('lobby');
      }
    } catch (e) { showNotice(e.message || 'Could not create room.'); }
    finally { setBusy(false); }
  }

  async function joinRoom() {
    if (!nickname.trim()) return showNotice('Enter a nickname first.');
    if (!joinCode.trim()) return showNotice('Enter a room code.');
    setBusy(true);
    try {
      if (localMode) {
        return showNotice('Preview mode only supports local demo. Configure Supabase to join from another device.');
      }
      const { data, error } = await supabase.rpc('join_quiz_room', {
        p_code: joinCode.trim().toUpperCase(), p_nickname: shortName(nickname)
      });
      if (error) throw error;
      setRoom(data.room); setPlayerId(data.player.id); setHost(false);
      setPlayerToken(data.player.token);
      setPlayers(data.players || []); setScores(data.scores || {});
      setMatchQuestions(data.questions || []);
      await subscribeRoom(data.room.code);
      await broadcastUpdate({
  room: data.room,
  players: data.players,
  scores: data.scores || {}
});
      setScreen(data.room.status === 'playing' ? 'arena' : data.room.status === 'finished' ? 'results' : 'lobby');
      if (data.room.status === 'playing') await refreshGame(data.room.code);
    } catch (e) { showNotice(e.message || 'Could not join room. Check the code.'); }
    finally { setBusy(false); }
  }


async function subscribeRoom(code) {
  clearChannel();
  if (!supabase) return;

  // Reset local answer state only when a genuinely new question arrives.
  const channel = supabase.channel(`quiz-room-${code}`, {
    config: { broadcast: { self: true } }
  });

  channel.on('broadcast', { event: 'room-update' }, ({ payload }) => {
    if (!payload) return;

    const incomingQuestion = payload.question;
    const incomingRound = payload.round;

    if (incomingQuestion) {
      const questionKey =
        `${incomingRound ?? ''}:${incomingQuestion.question ?? ''}`;

      if (questionKey !== incomingQuestionKeyRef.current) {
        incomingQuestionKeyRef.current = questionKey;
        setSelected(null);
        setAnswerState(null);
      }

      setQuestion(incomingQuestion);
    }

    if (payload.players) setPlayers(payload.players);
    if (payload.scores) setScores(payload.scores);
    if (payload.room) setRoom(payload.room);
    if (incomingRound !== undefined) setRound(incomingRound);
    if (payload.answeredPlayers) {
      setAnsweredPlayers(payload.answeredPlayers);
    }
    if (payload.screen) setScreen(payload.screen);
    if (payload.seconds !== undefined) setSeconds(payload.seconds);
  });

  channel.subscribe((status) => setLive(status === 'SUBSCRIBED'));
  channelRef.current = channel;
}

  async function broadcastUpdate(payload) {
    if (!supabase || !channelRef.current) return;
    await channelRef.current.send({ type: 'broadcast', event: 'room-update', payload });
  }

  async function refreshGame(code = room?.code) {
    if (!supabase || !code) return;
    try {
      const { data, error } = await supabase.rpc('get_quiz_state', { p_code: code });
      if (error) throw error;
      setRoom(data.room); setPlayers(data.players || []); setScores(data.scores || {});
      setRound(data.round || 0); setQuestion(data.question || null);
      setAnsweredPlayers(data.answeredPlayers || []);
      setMatchQuestions(data.questions || []);
      if (data.room?.status === 'playing') setScreen('arena');
      if (data.room?.status === 'finished') setScreen('results');
    } catch (e) { showNotice(e.message || 'Could not refresh match.'); }
  }

  async function startMatch() {
    if (!room) return;
    if (players.length < 2 && !localMode) return showNotice('You need at least two players to start.');
    if (localMode) {
      setMatchQuestions(shuffleQuestions()); setRound(0); setScores(Object.fromEntries(players.map(p => [p.id,0])));
      setQuestion(null); setScreen('arena'); setRoom({ ...room, status: 'playing', current_round: 0 });
      startLocalRound(0);
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('start_quiz_match', { p_code: room.code });
      if (error) throw error;
      await refreshGame(room.code);
      await broadcastUpdate({ room: data.room, players: data.players, scores: data.scores, round: 0, question: data.question, screen: 'arena', seconds: 15 });
    } catch (e) { showNotice(e.message || 'Could not start match.'); }
    finally { setBusy(false); }
  }

  function startLocalRound(index) {
    if (index >= matchQuestions.length) { setScreen('results'); setRoom(r => ({...r, status:'finished'})); return; }
    setRound(index); setQuestion(matchQuestions[index]); setSelected(null); setAnswerState(null); setSeconds(15); setAnsweredPlayers([]);
    if (timerRef.current) clearInterval(timerRef.current);
    let remaining = 15;
    timerRef.current = setInterval(() => {
      remaining -= 1; setSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        setAnswerState('timeout');
        window.setTimeout(() => startLocalRound(index + 1), 1100);
      }
    }, 1000);
  }


async function submitAnswer(index) {
  if (selected !== null || answerState || !question) return;
  setSelected(index);

  if (localMode) {
    const correct = index === question.answer;
    const gained = correct ? 500 + Math.max(0, seconds) * 20 : 0;
    setScores(current => ({ ...current, [playerId]: (current[playerId] || 0) + gained }));
    setAnswerState(correct ? 'correct' : 'wrong');
    if (timerRef.current) clearInterval(timerRef.current);
    window.setTimeout(() => startLocalRound(round + 1), 1200);
    return;
  }

  try {
    const { data, error } = await supabase.rpc('submit_quiz_answer', {
      p_code: room.code,
      p_answer_index: index,
      p_round: round
    });
    if (error) throw error;

    setAnswerState(data.correct ? 'correct' : 'wrong');
    // The RPC response contains the authoritative server state. Broadcast it so
    // the host can see when the final player has answered, even if the host
    // was not the player who submitted last.
    await broadcastUpdate({
      room: data.room,
      players: data.players || [],
      scores: data.scores || {},
      round: data.round ?? round,
      question: data.question || question,
      screen: 'arena',
      answeredPlayers: data.answeredPlayers || [],
      seconds
    });
    await refreshGame(room.code);
  } catch (e) {
    setSelected(null);
    showNotice(e.message || 'Answer could not be submitted.');
  }
}


async function advanceRound() {
  if (!host || !room || !supabase || advanceLockRef.current) return;
  advanceLockRef.current = true;

  try {
    const { data, error } = await supabase.rpc('advance_quiz_round', {
      p_code: room.code
    });
    if (error) throw error;

    const nextScreen = data.screen || (data.room?.status === 'finished' ? 'results' : 'arena');
    setRoom(data.room || null);
    setPlayers(data.players || []);
    setScores(data.scores || {});
    setRound(data.round ?? 0);
    setQuestion(data.question || null);
    setAnsweredPlayers(data.answeredPlayers || []);
    setSelected(null);
    setAnswerState(null);
    setSeconds(15);
    setMatchQuestions(data.questions || []);
    setScreen(nextScreen);

    await broadcastUpdate({
      room: data.room,
      players: data.players || [],
      scores: data.scores || {},
      round: data.round ?? 0,
      question: data.question || null,
      screen: nextScreen,
      seconds: 15,
      answeredPlayers: data.answeredPlayers || []
    });
  } catch (e) {
    advanceLockRef.current = false;
    const message = e.message || 'Could not advance round.';
    // The database timer is authoritative. If a client timer fires a fraction
    // early, retry shortly instead of leaving the match stuck.
    if (/wait for every player|wait for all answers|timer to expire/i.test(message)) {
      window.setTimeout(() => advanceRound(), 450);
    } else {
      showNotice(message);
    }
  }
}  async function copyCode() {
    try { await navigator.clipboard.writeText(room?.code || ''); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    catch { showNotice(`Room code: ${room?.code}`); }
  }

  function leaveRoom() {
    if (timerRef.current) clearInterval(timerRef.current);
    clearChannel(); setRoom(null); setPlayers([]); setScores({}); setQuestion(null);
    setPlayerId(''); setHost(false); setSelected(null); setAnswerState(null); setScreen('home');
  }

  const player = players.find(p => p.id === playerId) || { nickname: shortName(nickname), id: playerId };
  const questionNumber = Math.min(round + 1, matchQuestions.length || 5);

  return <div className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar">
      <button className="brand" onClick={() => screen === 'home' ? null : leaveRoom()} aria-label="Quiz Battle home">
        <span className="brand-mark"><Swords size={19}/></span><span>QUIZ<span className="brand-accent">BATTLE</span><small>NEON ARENA</small></span>
      </button>
      <div className="top-right">
        <span className={`connection ${localMode ? 'preview' : live ? 'online' : 'offline'}`}><span className="status-dot"/>{localMode ? 'PREVIEW MODE' : live ? 'LIVE CONNECTION' : 'CONNECTING'}</span>
        {screen !== 'home' && <button className="icon-button" onClick={leaveRoom} aria-label="Leave room"><LogOut size={17}/></button>}
      </div>
    </header>

    {notice && <div className="toast" role="status"><Sparkles size={16}/>{notice}<button onClick={() => setNotice('')}><X size={14}/></button></div>}

    {screen === 'home' && <main className="hero page-width">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-line"/><Radio size={14}/> THE ULTIMATE KNOWLEDGE SHOWDOWN</div>
        <h1>THINK FAST.<br/><span className="gradient-text">WIN BIG.</span></h1>
        <p className="hero-desc">Your brain is your weapon. Challenge your crew in a real-time quiz battle where every second counts.</p>
        <div className="hero-stats"><div><strong>05</strong><span>ROUNDS</span></div><i/><div><strong>15<span className="tiny-unit">s</span></strong><span>PER QUESTION</span></div><i/><div><strong>∞</strong><span>RIVAL ENERGY</span></div></div>
        <div className="hero-badges"><span><Zap size={14}/> Speed bonus</span><span><Trophy size={14}/> Live leaderboard</span><span><ShieldCheck size={14}/> Fair scoring</span></div>
      </div>
      <div className="entry-card">
        <div className="card-topline"><span className="card-kicker">PLAYER ACCESS</span><span className="live-tag"><span className="status-dot"/> READY TO PLAY</span></div>
        <div className="card-icon"><Gamepad2 size={27}/></div>
        <h2>Enter the arena</h2><p className="muted">Choose your identity. Find your rivals.</p>
        <label className="field-label" htmlFor="nickname">YOUR NICKNAME</label>
        <input id="nickname" className="text-input" maxLength={18} placeholder="e.g. NeonNinja" value={nickname} onChange={e => setNickname(e.target.value)} onKeyDown={e => e.key === 'Enter' && createRoom()} />
        <button className="primary-button" onClick={createRoom} disabled={busy}>{busy ? 'CREATING ROOM…' : 'CREATE A ROOM'}<ArrowRight size={18}/></button>
        <div className="or-divider"><span/> OR JOIN A BATTLE <span/></div>
        <div className="join-row"><input className="text-input code-input" maxLength={6} placeholder="ROOM CODE" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && joinRoom()} /><button className="join-button" onClick={joinRoom} disabled={busy}><ArrowRight size={18}/></button></div>
        <p className="card-foot"><ShieldCheck size={13}/> No downloads. Just a browser and a brain.</p>
      </div>
      <div className="hero-bottom"><div className="scroll-cue"><span/> READY PLAYER ONE?</div><div className="hero-bottom-note">BUILT FOR FRIENDLY RIVALRIES <span>✦</span> POWERED BY KNOWLEDGE</div></div>
    </main>}

    {screen === 'lobby' && <main className="page-width interior">
      <div className="section-eyebrow"><span className="eyebrow-line"/> MULTIPLAYER LOBBY</div>
      <div className="lobby-heading"><div><h1>YOUR CREW.<br/><span className="gradient-text">YOUR ARENA.</span></h1><p className="muted">Share the code. Rally your rivals. Get ready to battle.</p></div><div className="room-chip"><span>ROOM CODE</span><strong>{room?.code}</strong><button onClick={copyCode}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'COPIED' : 'COPY CODE'}</button></div></div>
      <div className="lobby-grid">
        <section className="panel players-panel"><div className="panel-heading"><div><Users size={18}/><h2>PLAYERS IN LOBBY</h2></div><span className="count-pill">{players.length} / 8</span></div>
          <div className="player-list">{players.map((p,i)=><div className="player-row" key={p.id}><div className={`avatar avatar-${i%4}`}>{initials(p.nickname)}</div><div className="player-meta"><strong>{p.nickname}{p.id === playerId ? <span className="you-tag">YOU</span> : null}</strong><small>{p.is_host || p.id === room?.host_id ? 'ROOM HOST' : 'READY TO PLAY'}</small></div><div className="player-ready"><span className="status-dot"/>{p.is_host || p.id === room?.host_id ? 'HOST' : 'READY'}</div></div>)}
            {players.length < 2 && <div className="waiting-row"><div className="waiting-pulse"><Users size={18}/></div><div><strong>Waiting for challengers</strong><small>Invite a friend using the room code above</small></div><span className="waiting-dots">•••</span></div>}
          </div>
          <div className="invite-strip"><div className="invite-icon"><Users size={18}/></div><div><strong>THE MORE, THE MERRIER</strong><small>Up to 8 players can join a match.</small></div></div>
          <button className="primary-button start-button" onClick={startMatch} disabled={busy || (!localMode && players.length < 2) || !host}>{busy ? 'STARTING…' : 'START BATTLE'}<Swords size={18}/></button>
          {!host && <p className="host-note">The host will start the battle when everyone is ready.</p>}
          {localMode && <p className="preview-note">This is a local preview. Configure Supabase to invite players on other devices.</p>}
        </section>
        <aside className="panel rules-panel"><div className="panel-heading"><div><Target size={18}/><h2>HOW TO PLAY</h2></div><span className="mini-tag">RULES</span></div>
          {[['01','Five rounds','Answer five multiple-choice questions.'],['02','Beat the clock','You have 15 seconds per question.'],['03','Think fast','Correct answers earn 500 points plus a speed bonus.'],['04','Claim the crown','The highest total score wins the arena.']].map(r=><div className="rule-row" key={r[0]}><span>{r[0]}</span><div><strong>{r[1]}</strong><p>{r[2]}</p></div></div>)}
          <div className="prize-card"><div className="prize-icon"><Trophy size={22}/></div><div><strong>THE NEON CROWN</strong><small>One winner. Eternal bragging rights.</small></div><Sparkles size={18}/></div>
        </aside>
      </div>
    </main>}

    {screen === 'arena' && <main className="page-width arena-page">
      <div className="arena-top"><div><div className="section-eyebrow"><span className="eyebrow-line"/> LIVE MATCH <span className="live-tag"><span className="status-dot"/> {localMode ? 'DEMO' : 'LIVE'}</span></div><h1>THE <span className="gradient-text">ARENA</span></h1></div><div className="round-chip"><span>ROUND</span><strong>{String(questionNumber).padStart(2,'0')} <small>/ {String(matchQuestions.length || 5).padStart(2,'0')}</small></strong></div></div>
      <div className="arena-grid">
        <section className="panel question-panel">
          <div className="question-meta"><span className="category-pill">{question?.category || 'LOADING'}</span><div className={`timer ${seconds <= 5 ? 'timer-danger' : ''}`}><Clock3 size={16}/><strong>00:{String(seconds).padStart(2,'0')}</strong></div></div>
          <div className="timer-track"><span style={{width:`${Math.max(0,seconds)/15*100}%`}}/></div>
          <div className="question-count">QUESTION {String(questionNumber).padStart(2,'0')} <span>—</span> LOCK IN YOUR ANSWER</div>
          <h2 className="question-title">{question?.question || 'Preparing your next challenge…'}</h2>
          <div className="answers-grid">{(question?.options || []).map((option,i)=><button key={option} disabled={selected !== null || Boolean(answerState)} className={`answer-option ${selected===i ? 'answer-selected' : ''} ${answerState && question?.answer===i ? 'answer-correct' : ''} ${selected===i && answerState==='wrong' ? 'answer-wrong' : ''}`} onClick={() => submitAnswer(i)}><span className="answer-letter">{LETTERS[i]}</span><span>{option}</span>{answerState && question?.answer===i && <Check size={17}/>}</button>)}</div>
          {answerState && <div className={`answer-feedback ${answerState}`}><strong>{answerState === 'correct' ? 'NICE SHOT!' : answerState === 'timeout' ? 'TIME’S UP!' : 'NOT THIS TIME'}</strong><span>{question?.explanation || (question?.answer !== undefined ? `Correct answer: ${question.options[question.answer]}` : '')}</span></div>}
          <div className="question-footer"><span><ShieldCheck size={14}/> One answer per round</span><span><Flame size={14}/> Speed bonus active</span></div>
        </section>
        <aside className="panel scoreboard-panel"><div className="panel-heading"><div><Trophy size={18}/><h2>LIVE LEADERBOARD</h2></div><span className="mini-tag">LIVE</span></div><div className="score-list">{sortedPlayers.map((p,i)=><div className={`score-row ${p.id===playerId?'score-you':''}`} key={p.id}><span className={`rank rank-${i+1}`}>{String(i+1).padStart(2,'0')}</span><div className={`avatar avatar-${i%4}`}>{initials(p.nickname)}</div><div className="score-meta"><strong>{p.nickname}{p.id===playerId && <span className="you-tag">YOU</span>}</strong><small>{p.id===room?.host_id?'HOST':'CHALLENGER'}</small></div><strong className="score-number">{(scores[p.id]||0).toLocaleString()}</strong></div>)}</div><div className="score-foot"><span className="status-dot"/>{answeredPlayers.length} / {players.length} ANSWERED</div><button className="subtle-button" onClick={() => refreshGame()}><RotateCcw size={15}/> REFRESH MATCH STATE</button></aside>
      </div>
    </main>}

    {screen === 'results' && <main className="page-width results-page">
      <div className="result-hero"><div className="trophy-orbit"><div><Trophy size={43}/></div></div><div className="section-eyebrow"><span className="eyebrow-line"/> MATCH COMPLETE</div><h1>THE ARENA<br/><span className="gradient-text">HAS A CHAMPION.</span></h1><p className="muted">Brains, speed, and a little bit of neon glory.</p></div>
      <section className="panel final-panel"><div className="panel-heading"><div><Crown size={18}/><h2>FINAL STANDINGS</h2></div><span className="mini-tag">FINAL</span></div>{sortedPlayers.map((p,i)=><div className={`final-row ${i===0?'final-winner':''}`} key={p.id}><span className={`final-rank rank-${i+1}`}>{i===0?<Crown size={17}/>:String(i+1).padStart(2,'0')}</span><div className={`avatar avatar-${i%4}`}>{initials(p.nickname)}</div><div className="score-meta"><strong>{p.nickname}{p.id===playerId && <span className="you-tag">YOU</span>}</strong><small>{i===0?'ARENA CHAMPION':'CHALLENGER'}</small></div><strong className="final-score">{(scores[p.id]||0).toLocaleString()} <small>PTS</small></strong></div>)}<button className="primary-button" onClick={leaveRoom}>BACK TO HOME <ArrowRight size={18}/></button></section>
    </main>}

    <footer className="footer"><span>© 2026 QUIZ BATTLE <span className="footer-sep">/</span> NEON ARENA</span><span><span className="footer-dot"/> BUILT FOR THE BOLD</span></footer>
  </div>;
}
