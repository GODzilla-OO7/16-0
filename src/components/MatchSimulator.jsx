import { useState, useEffect, useRef, useMemo } from 'react'
import { simulateFullSeason, simulateIPLPlayoffs, generateIPLTable, simulateSuperOver, calcTeamStrength } from '../utils/simulator.js'
import { MODE_CONFIG } from '../data/players.js'
import MatchEvent from './MatchEvent.jsx'
import ImpactSub from './ImpactSub.jsx'
import { getSupabase } from '../lib/supabase.js'

// ─── Final drama commentary ─────────────────────────────────────────────────

const COMMENTARY_T20 = [
  'Both teams stride out. The stadium is packed to the rafters.',
  'Toss done. The match is underway — first ball delivered!',
  'Powerplay: Openers taking on the attack. Boundaries flow!',
  'Middle overs — wickets fall, pressure mounts on both sides.',
  'DEATH OVERS — last five overs. One team surges ahead!',
  'The final ball is bowled…',
]
const COMMENTARY_ODI = [
  'The captains shake hands at the toss. History is in the making.',
  'Both openers stride to the crease under bright skies.',
  'First 15 overs: steady start, then the boundaries come.',
  'Over 30 — drinks break. The game is perfectly poised.',
  '50-over crunch! Yorkers, sixes, runouts — everything on the line.',
  'The last ball of the Final is delivered…',
]

export default function MatchSimulator({ team, mode, manager, ratingType, onDone, h2hContext = null }) {
  const [leagueSeason,    setLeagueSeason]    = useState(null)
  const [revealed,        setRevealed]        = useState([])
  const [liveRuns,        setLiveRuns]        = useState({})
  const [liveWkts,        setLiveWkts]        = useState({})
  const [expandedMatch,   setExpandedMatch]   = useState(null)
  const [iplPhase,        setIplPhase]        = useState('league') // league|table|playoffs|done
  const [iplTable,        setIplTable]        = useState(null)
  const [iplPosition,     setIplPosition]     = useState(null)
  const [playoffData,     setPlayoffData]     = useState(null)
  const [playoffRevealed, setPlayoffRevealed] = useState([])

  // Final drama states
  const [pendingFinal,    setPendingFinal]    = useState(null)  // the pre-simulated result
  const [finalPhase,      setFinalPhase]      = useState('idle') // idle|button|playing|done
  const [finalStep,       setFinalStep]       = useState(0)
  const [showCelebration, setShowCelebration] = useState(false)

  // Heartbreak overlay — shown full-screen on Semi or Final loss in WC
  const [showHeartbreak,  setShowHeartbreak]  = useState(false)

  // Match events — quick-time moments (century, hat-trick etc.)
  const [pendingEvent,    setPendingEvent]    = useState(null)  // { event, matchToReveal, resumeFn }

  // League Super Over — shown when a close league match flips to SO
  const [pendingLeagueSO, setPendingLeagueSO] = useState(null)  // { match, resume }

  // Impact Sub — mid-season transfer before playoffs (IPL only)
  const [activeTeam,      setActiveTeam]      = useState(team)  // may be updated by Impact Sub
  const [showImpactSub,   setShowImpactSub]   = useState(false)
  const [impactSubDone,   setImpactSubDone]   = useState(false)
  const [impactSubLog,    setImpactSubLog]    = useState(null)  // { out, in, event }
  const [iconSubPlayer,   setIconSubPlayer]   = useState(null)  // set if impact sub brought in a legend

  // Win streak tracker
  const [currentStreak,   setCurrentStreak]   = useState({ type: null, count: 0 })
  const [bestWinStreak,   setBestWinStreak]   = useState(0)
  const streakRef         = useRef({ type: null, count: 0 })  // stable read in timeouts — avoids nested-setState bug

  // Guard: prevent double-calls to callOnDone (e.g. double-click on results button)
  const onDoneCalledRef = useRef(false)

  // H2H: showdown match animation + live opponent results
  const [h2hShowdown, setH2hShowdown]       = useState(null)  // { match, opponentName }
  const [h2hOppResults, setH2hOppResults]   = useState([])    // opponent's published results
  const h2hPollRef = useRef(null)


  // Group draw — WC modes show a group draw before simulation starts
  const cfg    = MODE_CONFIG[mode]
  const isIPL  = mode === 'ipl'
  const format = cfg.format  // t20 | odi

  // Shuffle opponents for the group draw (generated once, used for both draw UI and simulation)
  const [drawnAllOpponents] = useState(() => {
    if (isIPL) return null
    const pool = [...cfg.opponents]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return pool
  })

  // IPL starts immediately; WC modes wait for user to click "Start Tournament"
  const [tournamentStarted, setTournamentStarted] = useState(isIPL)

  const leagueRef   = useRef(null)
  const playoffRef  = useRef(null)
  const tableTimRef = useRef(null)
  const finalTimRef = useRef(null)

  // ── H2H live results polling ────────────────────────────────────────────────
  useEffect(() => {
    if (!h2hContext?.roomId) return
    async function pollOppResults() {
      const sb = await getSupabase()
      if (!sb) return
      const { data } = await sb
        .from('h2h_live_results')
        .select('*')
        .eq('room_id', h2hContext.roomId)
        .neq('player_id', h2hContext.myUserId)
        .order('match_num', { ascending: true })
      if (data) setH2hOppResults(data)
    }
    pollOppResults()
    h2hPollRef.current = setInterval(pollOppResults, 3000)
    return () => clearInterval(h2hPollRef.current)
  }, [h2hContext?.roomId])

  // ── Helper: publish my match result to Supabase ────────────────────────────
  async function publishH2HResult(match, matchNum) {
    if (!h2hContext?.roomId) return
    try {
      const sb = await getSupabase()
      if (!sb) return
      await sb.from('h2h_live_results').insert({
        room_id:    h2hContext.roomId,
        player_id:  h2hContext.myUserId,
        match_num:  matchNum,
        opponent_name: match.opponent,
        won:        match.won,
        my_score:   match.myScore ?? null,
        opp_score:  match.oppScore ?? null,
        is_h2h_showdown: match.isH2HShowdown ?? false,
      })
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!tournamentStarted) return  // Wait for group draw → "Start Tournament" click

    const groupStageCount = mode === 'odi-wc' ? 9 : mode === 't20-wc' ? 4 : 0
    const groupOppNames   = drawnAllOpponents ? drawnAllOpponents.slice(0, groupStageCount) : null
    // H2H: inject opponent team as match 7 + compute their strength
    const h2hOpp = h2hContext?.opponentTeam?.length > 0
      ? { name: h2hContext.opponentName, strength: calcTeamStrength(h2hContext.opponentTeam, null, 'ipl') }
      : null
    const season = simulateFullSeason(team, mode, manager, { groupOppNames, h2hOpponent: h2hOpp })
    setLeagueSeason(season)

    let i = 0
    // Consistent 1200ms for all matches — gives time to read each result
    function getMatchDelay(match) {
      if (!match) return 1200
      if (match.stage === 'Final') return 700  // final still dramatic
      return 1200
    }

    function scheduleNext() {
      if (i >= season.results.length) {
        if (isIPL) {
          tableTimRef.current = setTimeout(() => {
            const td = generateIPLTable(season.wins)
            setIplTable(td)
            setIplPosition(td.position)
            setIplPhase('table')
          }, 900)
        } else {
          // Check if last match was a Semi-Final loss → show heartbreak
          const lastMatch = season.results[season.results.length - 1]
          const isSemiLoss = lastMatch && !lastMatch.won && lastMatch.stage === 'Semi-Final'
          if (isSemiLoss) {
            setTimeout(() => setShowHeartbreak(true), 800)
          } else {
            setTimeout(() => setIplPhase('done'), 600)
          }
        }
        return
      }
      const match = season.results[i]
      leagueRef.current = setTimeout(() => {
        // Intercept Final for non-IPL modes
        if (!isIPL && match.stage === 'Final') {
          setPendingFinal(match)
          setFinalPhase('button')
          return
        }
        // Intercept match event (century / hat-trick moments)
        // In H2H auto-sim mode: auto-resolve after a short delay instead of waiting for user
        if (match.event) {
          const autoResolve = !!h2hContext
          const doResume = (success, choiceLabel) => {
            setPendingEvent(null)
              const BATTING_MILESTONES = { 'half-century': 50, 'century': 100, '150': 150, '200': 200 }
              // Types that grant a bonus wicket to the bowling tally on success
              const WICKET_EVENTS = new Set(['catch', 'run-out', 'stumping'])
              // Types that grant bonus runs on success
              const RUN_BONUS_EVENTS = { 'free-hit': 6, 'powerplay': 12 }

              let finalMatch = { ...match, eventResult: { success, choiceLabel } }
              // Patch stats so the QTE player always appears in the scorecard (success or failure)
              if (match.event && finalMatch.stats) {
                const evt = match.event
                const milestone = BATTING_MILESTONES[evt.type]
                if (milestone !== undefined) {
                  const origScorer = finalMatch.stats.topScorer
                  const preservedScorer2 = origScorer?.name !== evt.playerName ? origScorer : finalMatch.stats.topScorer2
                  if (success) {
                    // Player scored milestone + bonus runs
                    const bonus = Math.floor(Math.random() * 36)  // 0–35 extra runs
                    const teamTotal = parseScoreStr(match.myScore ?? '').runs
                    const cappedRuns = teamTotal ? Math.min(milestone + bonus, teamTotal) : milestone + bonus
                    finalMatch = { ...finalMatch, stats: { ...finalMatch.stats,
                      topScorer:  { name: evt.playerName, runs: cappedRuns },
                      topScorer2: preservedScorer2,
                    }}
                  } else {
                    // Player fell one short — show milestone−1 runs so they appear in the card
                    finalMatch = { ...finalMatch, stats: { ...finalMatch.stats,
                      topScorer:  { name: evt.playerName, runs: milestone - 1 },
                      topScorer2: preservedScorer2,
                    }}
                  }
                } else if (evt.type === 'hat-trick') {
                  const origBowler = finalMatch.stats.topBowler
                  const wickets = success ? 3 : 2   // 3 on success, 2 if catch dropped / missed
                  finalMatch = { ...finalMatch, stats: { ...finalMatch.stats, topBowler: { name: evt.playerName, wickets } } }
                  if (origBowler && origBowler.name !== evt.playerName) {
                    setLiveWkts(prev => ({ ...prev, [origBowler.name]: (prev[origBowler.name] || 0) + origBowler.wickets }))
                  }
                } else if (success && RUN_BONUS_EVENTS[evt.type] !== undefined) {
                  // Bonus runs on success only (free-hit / powerplay)
                  const bonus = RUN_BONUS_EVENTS[evt.type]
                  const existing = finalMatch.stats.topScorer
                  const teamTotal = parseScoreStr(match.myScore ?? '').runs
                  const rawRuns = (existing?.runs ?? 0) + bonus
                  const cappedRuns = teamTotal ? Math.min(rawRuns, teamTotal) : rawRuns
                  finalMatch = { ...finalMatch, stats: { ...finalMatch.stats, topScorer: { name: evt.playerName, runs: cappedRuns } } }
                }
              }
              setRevealed(prev => [...prev, finalMatch])
              publishH2HResult(finalMatch, i + 1)
              addStats(finalMatch, setLiveRuns, setLiveWkts)
              updateStreak(match.won, streakRef, setCurrentStreak, setBestWinStreak)
              // Fielding/stumping events add a wicket not tracked in base match stats
              if (success && match.event) {
                const evt = match.event
                if (WICKET_EVENTS.has(evt.type)) {
                  setLiveWkts(prev => ({ ...prev, [evt.playerName]: (prev[evt.playerName] || 0) + 1 }))
                }
              }
              i++
              scheduleNext()
          }
          if (autoResolve) {
            // H2H auto-sim: resolve QTE randomly after a short pause (no user click needed)
            setTimeout(() => doResume(Math.random() < 0.6, 'auto'), 600)
          } else {
            setPendingEvent({ event: match.event, opponent: match.opponent, resume: doResume })
          }
          return
        }
        // Intercept league Super Over
        if (match.superOver) {
          const soResume = (soWon) => {
            setPendingLeagueSO(null)
            const finalM = { ...match, won: soWon }
            setRevealed(prev => [...prev, finalM])
            publishH2HResult(finalM, i + 1)
            addStats(finalM, setLiveRuns, setLiveWkts)
            updateStreak(soWon, streakRef, setCurrentStreak, setBestWinStreak)
            i++
            scheduleNext()
          }
          if (h2hContext) {
            // H2H auto-sim: use the already-simulated super over result
            setTimeout(() => soResume(match.superOver.won), 800)
          } else {
            setPendingLeagueSO({ match, resume: soResume })
          }
          return
        }

        setRevealed(prev => [...prev, match])
        publishH2HResult(match, i + 1)
        // H2H showdown: brief animation pause when the two H2H teams face each other
        if (match.isH2HShowdown && h2hContext) {
          setH2hShowdown({ match, opponentName: h2hContext.opponentName })
          setTimeout(() => setH2hShowdown(null), 4000)
        }
        addStats(match, setLiveRuns, setLiveWkts)
        updateStreak(match.won, streakRef, setCurrentStreak, setBestWinStreak)
        i++
        scheduleNext()
      }, getMatchDelay(match))
    }

    scheduleNext()

    return () => {
      clearTimeout(leagueRef.current)
      clearTimeout(playoffRef.current)
      clearTimeout(tableTimRef.current)
      clearTimeout(finalTimRef.current)
    }
  }, [tournamentStarted])

  // H2H auto-sim: auto-proceed from league table to playoffs (skip user click)
  useEffect(() => {
    if (!h2hContext || iplPhase !== 'table' || !iplTable) return
    const t = setTimeout(() => {
      // Skip impact sub in H2H mode — proceed straight to playoffs if qualified
      if (iplTable.qualified) startPlayoffs()
      else callOnDone()
    }, 4000)  // show table for 4 seconds so the player can see it
    return () => clearTimeout(t)
  }, [iplPhase, h2hContext])

  function startPlayoffs() {
    const pd = simulateIPLPlayoffs(activeTeam, manager, iplPosition, iplTable?.table ?? [])
    if (!pd?.results?.length) { setIplPhase('done'); return }
    setPlayoffData(pd)
    setIplPhase('playoffs')

    let j = 0
    function nextPlayoff() {
      if (j >= pd.results.length) { setIplPhase('done'); return }
      const match = pd.results[j]

      // Intercept the Final
      if (match.stage === 'Final') {
        setPendingFinal({ ...match, _fromPlayoff: true, _playoffData: pd })
        setFinalPhase('button')
        return
      }

      setPlayoffRevealed(prev => [...prev, match])
      addStats(match, setLiveRuns, setLiveWkts)
      j++
      playoffRef.current = setTimeout(nextPlayoff, 1200)
    }
    playoffRef.current = setTimeout(nextPlayoff, 1200)
  }

  // ── Dramatic final ───────────────────────────────────────────────────────

  function startFinalDrama() {
    // Show first innings first, then transition to live chase
    setFinalPhase('bat')
  }

  function finishFinal(wonOverride) {
    if (!pendingFinal) return
    const match       = pendingFinal
    const isFromPlayoff = match._fromPlayoff
    // wonOverride comes from Super Over result; falls back to pre-simulated result
    const actuallyWon = wonOverride !== undefined ? wonOverride : match.won

    addStats(match, setLiveRuns, setLiveWkts)

    if (isFromPlayoff) {
      const pd = match._playoffData
      setPlayoffRevealed(prev => [...prev, { ...match, won: actuallyWon, _fromPlayoff: undefined, _playoffData: undefined }])
      const fullPd = { ...pd, outcome: actuallyWon ? 'champion' : 'runner-up' }
      setPlayoffData(fullPd)
      if (actuallyWon) {
        setTimeout(() => setShowCelebration(true), 800)
      } else {
        setTimeout(() => setIplPhase('done'), 800)
      }
    } else {
      // WC mode
      setRevealed(prev => [...prev, { ...match, won: actuallyWon }])
      if (actuallyWon) {
        setTimeout(() => setShowCelebration(true), 800)
      } else {
        setTimeout(() => setShowHeartbreak(true), 800)
      }
    }
  }

  function dismissCelebration() {
    setShowCelebration(false)
    setTimeout(() => setIplPhase('done'), 300)
  }

  function dismissHeartbreak() {
    setShowHeartbreak(false)
    setTimeout(() => setIplPhase('done'), 300)
  }

  function callOnDone() {
    if (!leagueSeason || onDoneCalledRef.current) return
    onDoneCalledRef.current = true
    const iplOutcome = isIPL
      ? (!iplTable?.qualified ? 'not_qualified' : (playoffData?.outcome || 'eliminated'))
      : null
    onDone(
      {
        wins:            leagueSeason.wins,
        losses:          leagueSeason.losses,
        myStrength:      leagueSeason.myStrength,
        perfect:         leagueSeason.perfect,
        total:           leagueSeason.total,
        stageReached:    leagueSeason.stageReached,
        actualWinner:    leagueSeason.actualWinner,
        tournamentStats: leagueSeason.tournamentStats,
        iplOutcome,
        iplTable,
        iplPosition,
        iconPlayer:      iconSubPlayer,   // legend via impact sub (null if none)
        impactSubLog,                     // { out, in, event } or null
        finalTeam:       activeTeam,      // team after any impact sub swap (may differ from original team prop)
      },
      [...revealed, ...playoffRevealed],
    )
  }

  // ── Derived display values ─────────────────────────────────────────────

  const leagueWins   = revealed.filter(r => r.won).length
  const leagueLosses = revealed.filter(r => !r.won).length

  const topRunScorers   = Object.entries(liveRuns).map(([name, runs]) => ({ name, runs })).sort((a,b) => b.runs - a.runs).slice(0,5)
  const topWicketTakers = Object.entries(liveWkts).map(([name, w]) => ({ name, wickets: w })).sort((a,b) => b.wickets - a.wickets).slice(0,5)

  const iplChampion =
    playoffData?.outcome === 'champion'  ? 'Your XI' :
    playoffData?.outcome === 'runner-up' ? (playoffData.results?.find(r => r.stage === 'Final')?.opponent ?? iplTable?.table?.find(t => !t.isUser)?.team) :
    iplTable?.table?.find(t => !t.isUser)?.team ?? 'Another team'

  const phaseLabel =
    iplPhase === 'league'   ? (revealed.length >= cfg.totalMatches ? 'League Stage Complete' : 'Season in Progress') :
    iplPhase === 'table'    ? 'IPL Points Table' :
    iplPhase === 'playoffs' ? '⚡ Playoffs' :
    finalPhase === 'button' ? '🏆 The Final' :
    finalPhase === 'playing' ? '🏟 Final in Progress' :
    isIPL && playoffData?.outcome === 'champion'  ? '🏆 IPL Champions!' :
    isIPL && playoffData?.outcome === 'runner-up' ? '🥈 Runners-Up' :
    'Season Complete'

  const commentary = format === 'odi' ? COMMENTARY_ODI : COMMENTARY_T20

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── H2H Showdown Full-screen Overlay ─────────────────────────── */}
      {h2hShowdown && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 5000, pointerEvents: 'none',
          background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fade-in 0.3s ease both',
        }}>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '0.5rem', animation: 'trophy-bounce 0.7s ease both' }}>⚔️</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.5rem' }}>
              H2H SHOWDOWN
            </div>
            <div style={{ fontSize: '0.88rem', color: 'var(--text)', fontWeight: 700, marginBottom: '0.3rem' }}>
              Your XI vs {h2hShowdown.opponentName}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              The moment of truth — two drafted squads collide!
            </div>
            <div style={{ marginTop: '1rem', fontSize: '1.8rem', fontWeight: 900, color: h2hShowdown.match.won ? '#22c55e' : '#ef4444' }}>
              {h2hShowdown.match.won ? '✅ YOU WON!' : '❌ YOU LOST'}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginTop: '0.3rem' }}>
              {h2hShowdown.match.myScore} vs {h2hShowdown.match.oppScore}
            </div>
          </div>
        </div>
      )}

      {/* ── Trophy Celebration Overlay ───────────────────────────────── */}
      {showCelebration && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'radial-gradient(ellipse at 50% 40%, #2a1500 0%, var(--bg) 70%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          animation: 'fade-in 0.4s ease both',
        }}>
          <Confetti />
          <div style={{ textAlign: 'center', position: 'relative', zIndex: 2 }}>
            <div style={{ fontSize: '7rem', lineHeight: 1, animation: 'trophy-bounce 0.7s cubic-bezier(0.34,1.56,0.64,1) both' }}>🏆</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.75rem', animation: 'champion-glow 2s ease infinite, fade-in-up 0.6s 0.4s ease both', animationFillMode: 'both' }}>
              {isIPL ? 'IPL Champions!' : (mode === 'odi-wc' ? 'World Champions!' : 'World Champions!')}
            </div>
            <div style={{ fontSize: '1rem', color: '#94a3b8', marginTop: '0.5rem', animation: 'fade-in 0.5s 0.8s ease both', animationFillMode: 'both' }}>
              You lifted the trophy. An all-time great team.
            </div>
            <button
              onClick={dismissCelebration}
              style={{ marginTop: '2.5rem', padding: '0.875rem 2.5rem', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: 'var(--bg)', border: 'none', borderRadius: '0.75rem', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', animation: 'fade-in 0.5s 1.2s ease both', animationFillMode: 'both' }}
            >
              View Season Summary →
            </button>
          </div>
        </div>
      )}

      {/* ── Impact Sub overlay ──────────────────────────────────────── */}
      {showImpactSub && (
        <ImpactSub
          team={activeTeam}
          mode={mode}
          onComplete={(newTeam, outPlayer, inPlayer, event) => {
            setActiveTeam(newTeam)
            setImpactSubLog({ out: outPlayer, in: inPlayer, event })
            if (inPlayer._isIcon) setIconSubPlayer(inPlayer)
            setImpactSubDone(true)
            setShowImpactSub(false)
            startPlayoffs()
          }}
          onSkip={() => {
            setImpactSubDone(true)
            setShowImpactSub(false)
            startPlayoffs()
          }}
        />
      )}

      {/* ── Match Event overlay ─────────────────────────────────────── */}
      {pendingEvent && (
        <MatchEvent
          event={pendingEvent.event}
          opponent={pendingEvent.opponent}
          onContinue={pendingEvent.resume}
        />
      )}

      {/* ── League Super Over overlay ─────────────────────────────── */}
      {pendingLeagueSO && (
        <LeagueSuperOverModal
          match={pendingLeagueSO.match}
          onDone={pendingLeagueSO.resume}
        />
      )}

      {/* ── Heartbreak Overlay ───────────────────────────────────────── */}
      {showHeartbreak && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'radial-gradient(ellipse at 50% 40%, #1a0505 0%, var(--bg) 70%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          animation: 'fade-in 0.4s ease both',
        }}>
          <div style={{ textAlign: 'center', position: 'relative', zIndex: 2 }}>
            <div style={{ fontSize: '7rem', lineHeight: 1, animation: 'trophy-bounce 0.7s cubic-bezier(0.34,1.56,0.64,1) both' }}>💔</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.75rem', animation: 'fade-in-up 0.6s 0.4s ease both', animationFillMode: 'both' }}>
              {leagueSeason?.stageReached === 'Semi-Final' ? 'Out in the Semis' : 'Heartbreak at the Final'}
            </div>
            <div style={{ fontSize: '1rem', color: '#94a3b8', marginTop: '0.5rem', animation: 'fade-in 0.5s 0.8s ease both', animationFillMode: 'both' }}>
              {leagueSeason?.stageReached === 'Semi-Final'
                ? 'So close to the final — but it wasn\'t to be.'
                : 'You made it to the last match, but fell just short.'}
            </div>
            {leagueSeason?.actualWinner && (
              <div style={{ marginTop: '0.75rem', padding: '0.5rem 1.25rem', background: 'rgba(255,255,255,0.07)', borderRadius: '0.5rem', display: 'inline-block', animation: 'fade-in 0.5s 1s ease both', animationFillMode: 'both' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>🏆 Tournament Winner: </span>
                <span style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: 800 }}>{leagueSeason.actualWinner}</span>
              </div>
            )}
            <button
              onClick={dismissHeartbreak}
              style={{ marginTop: '2.5rem', padding: '0.875rem 2.5rem', background: 'linear-gradient(135deg,#ef4444,#b91c1c)', color: '#fff', border: 'none', borderRadius: '0.75rem', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', animation: 'fade-in 0.5s 1.2s ease both', animationFillMode: 'both' }}
            >
              View Season Summary →
            </button>
          </div>
        </div>
      )}

      {/* ── Main layout ───────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1rem' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.72rem', color: '#4169E1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{cfg.icon} {cfg.label}</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.2rem' }}>
            {!tournamentStarted ? '🎲 Group Stage Draw' : phaseLabel}
          </div>
          {tournamentStarted && (
            <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
              {leagueWins}W – {leagueLosses}L · {revealed.length}/{cfg.totalMatches} league matches
            </div>
          )}
        </div>

        {/* ── Group Draw (WC only, before tournament starts) ─────────── */}
        {!tournamentStarted && drawnAllOpponents && (
          <GroupDraw
            mode={mode}
            drawnOpponents={drawnAllOpponents}
            onStart={() => setTournamentStarted(true)}
          />
        )}

        {/* ── "Play Final" Gate — entrance button only ──────────────── */}
        {finalPhase === 'button' && (
          <FinalGate
            result={pendingFinal}
            onPlay={startFinalDrama}
          />
        )}

        {/* ── First innings animation ─────────────────────────────────── */}
        {finalPhase === 'bat' && pendingFinal && (
          <FinalBat
            result={pendingFinal}
            format={format}
            myBatting={!!pendingFinal.myBatsFirst}
            onComplete={() => setFinalPhase('chase')}
          />
        )}

        {/* ── Live Chase Scorecard ────────────────────────────────────── */}
        {finalPhase === 'chase' && pendingFinal && (
          <FinalChase
            result={pendingFinal}
            format={format}
            team={activeTeam}
            myStr={leagueSeason?.myStrength ?? 65}
            myChasing={!pendingFinal.myBatsFirst}
            onQTE={(event, opp, done) => {
              setPendingEvent({
                event,
                opponent: opp,
                resume: (success, label) => {
                  setPendingEvent(null)
                  done(success, label)
                }
              })
            }}
            onComplete={(won) => {
              setFinalPhase('done')
              finishFinal(won)
            }}
          />
        )}

        {/* Scoreboard */}
        {revealed.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.625rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '0.875rem', justifyContent: 'center' }}>
              {[
                { label: 'Wins',   value: leagueWins,    color: '#4169E1' },
                { label: 'Losses', value: leagueLosses,  color: '#ef4444' },
                { label: 'Played', value: revealed.length, color: '#94a3b8' },
              ].map(s => (
                <div key={s.label} className="score-box" style={{ width: 86, textAlign: 'center', padding: '0.75rem 0.5rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.75rem' }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.2rem' }}>{s.label}</div>
                </div>
              ))}
            </div>
            {/* Live streak badge */}
            {currentStreak.count >= 2 && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.3rem 0.875rem',
                background: currentStreak.type === 'W' ? '#4169E118' : '#ef444418',
                border: `1px solid ${currentStreak.type === 'W' ? '#4169E144' : '#ef444444'}`,
                borderRadius: '999px',
                fontSize: '0.78rem', fontWeight: 800,
                color: currentStreak.type === 'W' ? '#4169E1' : '#ef4444',
                animation: 'fade-in 0.3s ease both',
              }}>
                {currentStreak.type === 'W' ? `🔥 ${currentStreak.count} in a row!` : `💀 ${currentStreak.count} losses in a row`}
              </div>
            )}
            {/* Streak broken — flash of previous streak */}
            {currentStreak.type === 'L' && currentStreak.count === 1 && bestWinStreak >= 3 && (
              <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                Win streak ended at {bestWinStreak} 🏆
              </div>
            )}
          </div>
        )}

        {/* Main two-column grid (three columns in H2H mode) */}
        <div className="sim-grid" style={{ display: 'grid', gridTemplateColumns: revealed.length > 0 ? (h2hContext ? '220px 1fr 260px' : '1fr 260px') : '1fr', gap: '1.25rem', alignItems: 'start' }}>

          {/* H2H Opponent Live Results (left column, H2H only) */}
          {h2hContext && revealed.length > 0 && (
            <div style={{ position: 'sticky', top: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '80vh', overflow: 'hidden' }}>
              <div style={{ padding: '0.5rem 0.75rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.625rem' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>⚔️ {h2hContext.opponentName}</div>
                <div style={{ fontSize: '0.6rem', color: '#64748b' }}>
                  {h2hOppResults.length === 0 ? 'Waiting for results…' : `${h2hOppResults.filter(r => r.won).length}W – ${h2hOppResults.filter(r => !r.won).length}L`}
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {[...h2hOppResults].reverse().map((r, i) => (
                  <div key={i} style={{
                    padding: '0.4rem 0.6rem', borderRadius: '0.4rem',
                    background: r.is_h2h_showdown ? (r.won ? '#0d1a0d' : '#1a0d0d') : 'var(--card)',
                    border: `1px solid ${r.is_h2h_showdown ? (r.won ? '#22c55e44' : '#ef444444') : 'var(--border2)'}`,
                    animation: 'fade-in 0.25s ease both',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: r.won ? '#22c55e' : '#ef4444' }}>
                        {r.won ? '✅' : '❌'}
                      </span>
                      <span style={{ fontSize: '0.6rem', color: '#64748b', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.is_h2h_showdown ? '⚔️ vs YOU' : `vs ${r.opponent_name}`}
                      </span>
                    </div>
                    {(r.my_score || r.opp_score) && (
                      <div style={{ fontSize: '0.55rem', color: '#475569', marginTop: '0.1rem', textAlign: 'right' }}>
                        {r.my_score} • {r.opp_score}
                      </div>
                    )}
                  </div>
                ))}
                {h2hOppResults.length === 0 && (
                  <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.65rem', fontStyle: 'italic' }}>
                    Their results will<br/>appear here…
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Left — phase UI + match cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

            {/* IPL Table */}
            {iplPhase === 'table' && iplTable && (
              <IPLTableView
                table={iplTable.table}
                position={iplTable.position}
                qualified={iplTable.qualified}
                leagueWins={leagueSeason?.wins}
                impactSubLog={impactSubLog}
                onProceed={() => {
                  if (!impactSubDone && iplTable.qualified) {
                    setShowImpactSub(true)
                  } else {
                    startPlayoffs()
                  }
                }}
                onSummary={callOnDone}
              />
            )}

            {/* Done result banner */}
            {iplPhase === 'done' && isIPL && (
              <IPLResultBanner outcome={playoffData?.outcome ?? 'not_qualified'} iplChampion={iplChampion} onDone={callOnDone} />
            )}

            {/* WC non-Final elimination: show results button once all matches are done */}
            {iplPhase === 'done' && !isIPL && finalPhase === 'idle' && (
              <div style={{ textAlign: 'center', padding: '1.25rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.875rem', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.75rem' }}>Tournament over for your team</div>
                <button
                  onClick={callOnDone}
                  style={{ padding: '0.875rem 2rem', background: 'linear-gradient(135deg, #4169E1, #2952CC)', color: 'var(--bg)', border: 'none', borderRadius: '0.75rem', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer' }}
                >
                  View Season Summary →
                </button>
              </div>
            )}

            {/* Playoff header */}
            {(iplPhase === 'playoffs' || (iplPhase === 'done' && playoffRevealed.length > 0)) && (
              <SectionBadge color="#a78bfa" bg="var(--card2)" border="#6d28d944">⚡ Playoffs</SectionBadge>
            )}

            {/* Playoff match cards — newest first */}
            {[...playoffRevealed].reverse().map((r, ri) => {
              const origI = playoffRevealed.length - 1 - ri
              return (
                <MatchCard key={`po-${origI}`} result={r} isLatest={iplPhase === 'playoffs' && origI === playoffRevealed.length - 1} expanded={expandedMatch === `po-${origI}`} onToggle={() => setExpandedMatch(expandedMatch === `po-${origI}` ? null : `po-${origI}`)} />
              )
            })}

            {/* League section divider */}
            {playoffRevealed.length > 0 && revealed.length > 0 && (
              <SectionBadge color="#4169E1" bg="var(--card2)" border="#2952CC44">📋 League Stage</SectionBadge>
            )}

            {/* League match cards — newest first */}
            {[...revealed].reverse().map((r, ri) => {
              const origI = revealed.length - 1 - ri
              return (
                <MatchCard key={origI} result={r} isLatest={iplPhase === 'league' && origI === revealed.length - 1} expanded={expandedMatch === origI} onToggle={() => setExpandedMatch(expandedMatch === origI ? null : origI)} />
              )
            })}

          </div>

          {/* Right — leaderboard */}
          {revealed.length > 0 && (
            <div className="sim-right" style={{ position: 'sticky', top: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <LeaderboardPanel title="🟠 Orange Cap Race" entries={topRunScorers}   valueKey="runs"    unit="runs" color="#f97316" />
              <LeaderboardPanel title="🟣 Purple Cap Race" entries={topWicketTakers} valueKey="wickets" unit="wkts" color="#a855f7" />
              {/* Cap winner crowns — shown once season is complete */}
              {iplPhase !== 'league' && topRunScorers.length > 0 && (
                <div style={{ background: 'linear-gradient(135deg,#7c2d12,#1c1002)', border: '1px solid #f9731644', borderRadius: '0.875rem', padding: '0.875rem 1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>🧡 Orange Cap Winner</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#fff' }}>{topRunScorers[0].name}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f97316' }}>{topRunScorers[0].runs} <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>runs</span></div>
                </div>
              )}
              {iplPhase !== 'league' && topWicketTakers.length > 0 && (
                <div style={{ background: 'linear-gradient(135deg,#2e1065,#0f0520)', border: '1px solid #a855f744', borderRadius: '0.875rem', padding: '0.875rem 1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>💜 Purple Cap Winner</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#fff' }}>{topWicketTakers[0].name}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#a855f7' }}>{topWicketTakers[0].wickets} <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>wkts</span></div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// streakRef holds the live streak so we never read stale state inside a timeout
function updateStreak(won, streakRef, setCurrentStreak, setBestWinStreak) {
  const prev = streakRef.current
  let next
  if (won) {
    const newCount = prev.type === 'W' ? prev.count + 1 : 1
    next = { type: 'W', count: newCount }
    setBestWinStreak(best => Math.max(best, newCount))
  } else {
    next = { type: 'L', count: prev.type === 'L' ? prev.count + 1 : 1 }
  }
  streakRef.current = next
  setCurrentStreak(next)
}

function addStats(match, setRuns, setWkts) {
  if (!match?.stats) return
  const { topScorer, topScorer2, topBowler } = match.stats
  if (topScorer) setRuns(prev => ({ ...prev, [topScorer.name]: (prev[topScorer.name] || 0) + topScorer.runs }))
  // Include the 2nd batter so the race has more names
  if (topScorer2) setRuns(prev => ({ ...prev, [topScorer2.name]: (prev[topScorer2.name] || 0) + topScorer2.runs }))
  if (topBowler) setWkts(prev => ({ ...prev, [topBowler.name]: (prev[topBowler.name] || 0) + topBowler.wickets }))
}

function ordinal(n) {
  if (!n) return ''
  const s = ['th','st','nd','rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function SectionBadge({ color, bg, border, children }) {
  return (
    <div style={{ padding: '0.55rem 1rem', background: bg, border: `1px solid ${border}`, borderRadius: '0.75rem', fontSize: '0.72rem', fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center', marginTop: '0.25rem' }}>
      {children}
    </div>
  )
}

// ─── Confetti ────────────────────────────────────────────────────────────────

function Confetti() {
  const COLORS = ['#f59e0b','#4169E1','#3b82f6','#ef4444','#a855f7','#ec4899','#fff']
  const particles = useMemo(() =>
    Array.from({ length: 55 }, (_, i) => ({
      id: i,
      left:     `${Math.random() * 100}%`,
      color:    COLORS[i % COLORS.length],
      delay:    `${(Math.random() * 2).toFixed(2)}s`,
      duration: `${(2.5 + Math.random() * 2).toFixed(2)}s`,
      size:     `${6 + Math.random() * 8}px`,
      round:    Math.random() > 0.5,
    }))
  , [])

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1 }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute', top: '-20px', left: p.left,
          width: p.size, height: p.size,
          background: p.color,
          borderRadius: p.round ? '50%' : '2px',
          animation: `confetti-fall ${p.duration} ${p.delay} linear infinite`,
        }} />
      ))}
    </div>
  )
}

// ─── Final Gate (entrance only) ──────────────────────────────────────────────

function FinalGate({ result, onPlay }) {
  const opponent = result?.opponent ?? 'the opposition'
  return (
    <div style={{ marginBottom: '1.5rem', animation: 'final-entrance 0.5s ease both' }}>
      <div style={{
        background: 'var(--warn-bg)', border: '2px solid var(--warn-border)',
        borderRadius: '1.25rem', padding: '2rem 1.5rem', textAlign: 'center',
        boxShadow: '0 0 60px #f59e0b15',
      }}>
        <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.75rem' }}>
          🏆 THE FINAL
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.25rem' }}>
          Your XI vs {opponent}
        </div>
        <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem' }}>
          Everything comes down to this one match. You'll be chasing live.
        </div>
        <button
          onClick={onPlay}
          style={{
            padding: '1rem 2.5rem',
            background: 'linear-gradient(135deg,#f59e0b,#d97706)',
            color: 'var(--bg)', border: 'none', borderRadius: '0.875rem',
            fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer',
            letterSpacing: '0.04em', textTransform: 'uppercase',
            boxShadow: '0 0 30px #f59e0b33',
          }}
        >
          ▶ Play The Final
        </button>
      </div>
    </div>
  )
}

// ─── Chase helpers ────────────────────────────────────────────────────────────

function parseScoreStr(str) {
  if (!str || typeof str !== 'string') return { runs: 0, wickets: 0 }
  const [r, w] = str.split('/').map(Number)
  return { runs: r || 0, wickets: w || 0 }
}

// ─── First innings score builder ──────────────────────────────────────────────

function buildFirstInningsPoints(finalRuns, finalWickets, format) {
  const totalOvers = format === 'odi' ? 50 : 20
  const marks      = format === 'odi' ? [10, 25, 40, 50] : [7, 15, 18, 20]
  return marks.map((over, i) => {
    const isLast = i === marks.length - 1
    let runs, wkts
    if (isLast) {
      runs = finalRuns
      wkts = finalWickets
    } else {
      const frac = over / totalOvers
      const pace = over < totalOvers * 0.3 ? 0.70 : over < totalOvers * 0.75 ? 0.95 : 1.15
      const raw  = finalRuns * frac * pace + (Math.random() - 0.5) * 12
      runs = Math.round(Math.max(4, Math.min(raw, finalRuns - 4)))
      const rawW = finalWickets * frac * (0.3 + Math.random() * 0.8)
      wkts = Math.round(Math.max(0, Math.min(rawW, Math.min(9, finalWickets - 1))))
    }
    const crr = over > 0 ? (runs / over).toFixed(1) : '0.0'
    return { over, runs, wkts, crr }
  })
}

// ─── FinalBat — opponent's first innings animation ────────────────────────────

function FinalBat({ result, format, myBatting, onComplete }) {
  const oppParsed  = parseScoreStr(result.oppScore)
  const myParsed   = parseScoreStr(result.myScore)
  const batParsed  = myBatting ? myParsed : oppParsed
  const [points]   = useState(() => buildFirstInningsPoints(batParsed.runs, batParsed.wickets, format))
  const [step,     setStep]     = useState(-1)
  const [finished, setFinished] = useState(false)
  const stepRef  = useRef(-1)
  const timerRef = useRef(null)

  function advance() {
    const next = stepRef.current + 1
    if (next >= points.length) {
      setFinished(true)
      timerRef.current = setTimeout(onComplete, 2200)
      return
    }
    stepRef.current = next
    setStep(next)
    timerRef.current = setTimeout(advance, 2000)
  }

  useEffect(() => {
    timerRef.current = setTimeout(advance, 800)
    return () => clearTimeout(timerRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totalOvers = format === 'odi' ? 50 : 20
  const pt = step >= 0 ? points[step] : null
  const barPct = pt ? Math.round((pt.over / totalOvers) * 100) : 0
  const crrNum = pt ? parseFloat(pt.crr) : 0
  const ref    = format === 'odi' ? 6.5 : 9.5
  const barColor = crrNum > ref + 1.5 ? '#ef4444' : crrNum > ref - 0.5 ? '#f59e0b' : '#4169E1'

  return (
    <div style={{ marginBottom: '1.5rem', animation: 'final-entrance 0.5s ease both' }}>
      <div style={{ background: 'var(--card)', border: '2px solid var(--border)', borderRadius: '1.25rem', padding: '1.5rem' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.68rem', color: '#ef4444', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.4rem' }}>
            🏆 THE FINAL · 1ST INNINGS
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.2rem' }}>
            {myBatting ? 'Your XI' : result.opponent}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Setting the target…</div>
        </div>

        {/* Live score */}
        {pt && (
          <div style={{ textAlign: 'center', marginBottom: '1rem', animation: 'fade-in 0.3s ease both' }}>
            <div style={{ fontSize: '2.75rem', fontWeight: 900, color: finished ? '#ef4444' : 'var(--text)', lineHeight: 1, transition: 'color 0.5s' }}>
              {pt.runs}<span style={{ fontSize: '1.3rem', color: '#64748b', fontWeight: 600 }}>/{pt.wkts}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.75rem', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                <span style={{ color: 'var(--text)', fontWeight: 800 }}>{pt.over}</span> overs
              </span>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                CRR <span style={{ color: 'var(--text)', fontWeight: 800 }}>{pt.crr}</span>
              </span>
            </div>
          </div>
        )}
        {!pt && (
          <div style={{ textAlign: 'center', marginBottom: '1rem', opacity: 0.4, fontSize: '0.85rem', color: '#64748b' }}>Innings starting…</div>
        )}

        {/* Single filling bar */}
        <div style={{ marginBottom: '0.875rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.6rem', color: '#64748b', fontWeight: 600 }}>
            <span>0 overs</span>
            <span>{totalOvers} overs</span>
          </div>
          <div style={{ height: 14, background: 'var(--border)', borderRadius: 7, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${finished ? 100 : barPct}%`,
              background: finished ? '#ef4444' : barColor,
              borderRadius: 7,
              transition: 'width 1.4s cubic-bezier(0.4,0,0.2,1), background 0.5s',
            }} />
          </div>
        </div>

        {/* Status / Target card */}
        {finished ? (
          <div style={{ textAlign: 'center', padding: '0.875rem 1rem', background: '#ef444410', border: '1px solid #ef444433', borderRadius: '0.75rem', animation: 'fade-in 0.4s ease both' }}>
            <div style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>Target set</div>
            <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#ef4444', lineHeight: 1 }}>{batParsed.runs + 1}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
              {myBatting ? `${result.opponent}'s chase begins in a moment…` : 'Your chase begins in a moment…'}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#ef4444', fontSize: '0.8rem', fontWeight: 700 }}>
            {myBatting ? 'Your XI batting…' : `${result.opponent} batting…`}
          </div>
        )}
      </div>
    </div>
  )
}

function buildChasePoints(targetRuns, finalRuns, finalWickets, format) {
  // Always generates the same 4 checkpoints as buildFirstInningsPoints [7,15,18,20]
  // so the second innings bar mirrors the first innings bar.
  // The "stop at winner" happens naturally at the final checkpoint when needed===0.
  const totalOvers = format === 'odi' ? 50 : 20
  const marks      = format === 'odi' ? [10, 25, 40, 50] : [7, 15, 18, 20]

  return marks.map((over, i) => {
    const isLast = i === marks.length - 1
    let runs, wkts

    if (isLast) {
      runs = finalRuns
      wkts = finalWickets
    } else {
      const frac = over / totalOvers
      const pace = over < totalOvers * 0.4 ? 0.78 : over < totalOvers * 0.75 ? 1.0 : 1.15
      const raw  = finalRuns * frac * pace + (Math.random() - 0.5) * 12
      runs = Math.round(Math.max(6, Math.min(raw, finalRuns - 4)))
      const rawW = finalWickets * frac * (0.5 + Math.random() * 0.9)
      wkts = Math.round(Math.max(0, Math.min(rawW, Math.min(9, finalWickets - 1))))
    }
    const ballsLeft = (totalOvers - over) * 6
    const needed    = Math.max(0, targetRuns - runs)
    const crr       = over > 0 ? (runs / over).toFixed(1) : '0.0'
    const rrr       = ballsLeft > 0 ? (needed / ballsLeft * 6).toFixed(1) : '0.0'
    const onTrack   = parseFloat(crr) >= parseFloat(rrr) - 0.5
    return { over, totalOvers, runs, wkts, ballsLeft, needed, crr, rrr, onTrack }
  })
}

// ─── FinalChase — live over-by-over chase scorecard ──────────────────────────

function FinalChase({ result, format, team, myStr, myChasing, onQTE, onComplete }) {
  const oppParsed = parseScoreStr(result.oppScore)
  const myParsed  = parseScoreStr(result.myScore)
  // myChasing=true (default): opp set target, I chase
  // myChasing=false: I set target, opp chases
  const firstInningsParsed = myChasing ? oppParsed : myParsed
  const chaserParsed       = myChasing ? myParsed  : oppParsed
  const target             = firstInningsParsed.runs + 1

  const [points]       = useState(() => buildChasePoints(target, chaserParsed.runs, chaserParsed.wickets, format))
  const [step,         setStep]         = useState(-1)
  const [phase,        setPhase]        = useState('animating')  // animating | qte-paused | result
  const [soData,       setSoData]       = useState(null)         // super over result if triggered

  const stepRef    = useRef(-1)
  const qteUsed    = useRef(false)
  const timerRef   = useRef(null)

  // QTE fires at index 2 (over 18 for T20, over 40 for ODI)
  const QTE_IDX = Math.min(2, points.length - 1)

  function advance() {
    const next = stepRef.current + 1
    if (next >= points.length) {
      // Chase done — Super Over ONLY on a genuine tie (equal scores)
      setPhase('result')
      if (myParsed.runs === oppParsed.runs && Math.random() < 0.5) {
        const so = simulateSuperOver(myStr, 70)
        timerRef.current = setTimeout(() => setSoData(so), 2000)
      } else {
        timerRef.current = setTimeout(() => onComplete(result.won), 2500)
      }
      return
    }

    stepRef.current = next
    setStep(next)

    // Target already reached at this over — stop the bar here, don't advance further
    if (points[next].needed === 0) {
      // Show "Target reached!" card for 2.5s then finish
      timerRef.current = setTimeout(() => {
        setPhase('result')
        // If I'm chasing, reaching target means I won. If opp is chasing and reaches, I lost.
        timerRef.current = setTimeout(() => onComplete(myChasing ? true : false), 2000)
      }, 2500)
      return
    }

    // Fire QTE at the critical over
    if (next === QTE_IDX && !qteUsed.current) {
      qteUsed.current = true
      setPhase('qte-paused')

      const pt = points[next]
      let type, player

      if (myChasing) {
        // I'm batting — batting QTE types
        const batters = team.filter(p => ['opener','top-order','middle-order','wicket-keeper','all-rounder'].includes(p.role))
        if (pt.needed <= 20 && pt.ballsLeft <= 18) {
          // Death overs: free-hit, DRS, or powerplay
          const r = Math.random()
          type = r < 0.4 ? 'free-hit' : r < 0.7 ? 'drs' : 'powerplay'
        } else if (pt.wkts >= 5) {
          type = 'drs'
        } else {
          const r = Math.random()
          type = r < 0.45 ? 'century' : r < 0.8 ? 'half-century' : 'free-hit'
        }
        player = batters[Math.floor(Math.random() * batters.length)] ?? team[0]
      } else {
        // Opp is batting, I'm bowling — wider variety of fielding/bowling events
        const bowlers = team.filter(p => ['pace-bowler','spin-bowler','all-rounder'].includes(p.role))
        const wk = team.find(p => p.role === 'wicket-keeper')
        if (pt.needed <= 20 && pt.ballsLeft <= 18) {
          // Death: DRS, hat-trick, or last-over
          const r = Math.random()
          type = r < 0.35 ? 'drs' : r < 0.65 ? 'hat-trick' : 'last-over'
        } else if (pt.wkts >= 5) {
          type = 'hat-trick'
        } else {
          // Normal: catch, hat-trick, run-out, stumping, last-over
          const pool = ['catch', 'hat-trick', 'run-out', 'last-over', ...(wk ? ['stumping'] : [])]
          type = pool[Math.floor(Math.random() * pool.length)]
        }
        // Assign player based on event type
        if (type === 'stumping') {
          player = wk ?? team[0]
        } else if (type === 'catch' || type === 'run-out') {
          player = team[Math.floor(Math.random() * team.length)]
        } else {
          player = bowlers[Math.floor(Math.random() * bowlers.length)] ?? team[0]
        }
      }

      onQTE({ type, playerName: player.name }, result.opponent, () => {
        setPhase('animating')
        timerRef.current = setTimeout(advance, 1600)
      })
      return
    }

    timerRef.current = setTimeout(advance, 1900)
  }

  useEffect(() => {
    timerRef.current = setTimeout(advance, 1200)
    return () => clearTimeout(timerRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pt            = step >= 0 ? points[Math.min(step, points.length - 1)] : null
  const barPct        = pt ? Math.round((pt.over / (pt.totalOvers ?? 20)) * 100) : 0
  // When step===-1, show "Chase starting…" placeholder (mirrors FinalBat's "Innings starting…")
  const rrr           = pt ? parseFloat(pt.rrr) : 0
  const pressureColor = rrr > 15 ? '#ef4444' : rrr > 12 ? '#f97316' : rrr > 9 ? '#f59e0b' : '#22c55e'
  const pressureBg    = rrr > 15 ? '#ef444418' : rrr > 12 ? '#f9731618' : rrr > 9 ? '#f59e0b15' : '#22c55e18'
  const isDeathCrunch = pt && phase === 'animating' && pt.ballsLeft <= 18 && pt.needed > 0
  const totalOvers    = format === 'odi' ? 50 : 20
  const won           = result.won

  return (
    <div style={{ marginBottom: '1.5rem', animation: 'final-entrance 0.5s ease both' }}>
      <div style={{
        background: 'var(--warn-bg)', border: '2px solid var(--warn-border)',
        borderRadius: '1.25rem', padding: '1.5rem',
        boxShadow: '0 0 60px #f59e0b15',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.4rem' }}>
            🏆 THE FINAL · {myChasing ? 'LIVE CHASE' : `${result.opponent.toUpperCase()} CHASE`}
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.75rem' }}>
            {myChasing ? `Your XI vs ${result.opponent}` : `${result.opponent} chasing your target`}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.58rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{myChasing ? 'They set' : 'You set'}</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ef4444', lineHeight: 1.1 }}>{firstInningsParsed.runs}<span style={{ fontSize: '0.85rem', color: '#64748b' }}>/{firstInningsParsed.wickets}</span></div>
            </div>
            <div style={{ width: 1, background: 'var(--border)', margin: '0 0.25rem' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.58rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Target</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f59e0b', lineHeight: 1.1 }}>{target}</div>
            </div>
          </div>
        </div>

        {/* Live score */}
        {pt && phase !== 'result' && (
          <div style={{ textAlign: 'center', marginBottom: '0.875rem', animation: 'fade-in 0.3s ease both' }}>
            <div style={{ fontSize: '2.75rem', fontWeight: 900, color: pt.needed === 0 ? '#22c55e' : 'var(--text)', lineHeight: 1, transition: 'color 0.5s' }}>
              {pt.runs}<span style={{ fontSize: '1.3rem', color: '#64748b', fontWeight: 600 }}>/{pt.wkts}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.75rem', marginTop: '0.4rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                <span style={{ color: 'var(--text)', fontWeight: 800 }}>{pt.over}</span> overs
              </span>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                CRR <span style={{ color: 'var(--text)', fontWeight: 800 }}>{pt.crr}</span>
              </span>
            </div>
          </div>
        )}
        {!pt && phase !== 'result' && (
          <div style={{ textAlign: 'center', marginBottom: '0.875rem', opacity: 0.4, fontSize: '0.85rem', color: '#64748b' }}>Chase starting…</div>
        )}

        {/* Single filling bar */}
        {phase !== 'result' && (
          <div style={{ marginBottom: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.6rem', color: '#64748b', fontWeight: 600 }}>
              <span>0 overs</span>
              <span>{totalOvers} overs</span>
            </div>
            <div style={{ height: 14, background: 'var(--border)', borderRadius: 7, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${pt?.needed === 0 ? 100 : barPct}%`,
                background: pt?.needed === 0 ? '#22c55e' : pressureColor,
                borderRadius: 7,
                transition: 'width 1.4s cubic-bezier(0.4,0,0.2,1), background 0.5s',
              }} />
            </div>
          </div>
        )}

        {/* Nail-biting pressure cards */}
        {phase === 'animating' && pt && pt.needed > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.875rem' }}>
            <div style={{ flex: 1, padding: '0.5rem 0.25rem', textAlign: 'center', background: pressureBg, border: `1px solid ${pressureColor}44`, borderRadius: '0.5rem', animation: isDeathCrunch ? 'pulse-glow 1.1s ease-in-out infinite' : 'none' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: pressureColor, lineHeight: 1 }}>{pt.needed}</div>
              <div style={{ fontSize: '0.5rem', color: pressureColor, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.1rem' }}>needed</div>
            </div>
            <div style={{ flex: 1, padding: '0.5rem 0.25rem', textAlign: 'center', background: isDeathCrunch ? '#ef444412' : 'var(--border2)', border: `1px solid ${isDeathCrunch ? '#ef444433' : 'var(--border)'}`, borderRadius: '0.5rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: isDeathCrunch ? '#ef4444' : 'var(--text)', lineHeight: 1 }}>{pt.ballsLeft}</div>
              <div style={{ fontSize: '0.5rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.1rem' }}>balls</div>
            </div>
            <div style={{ flex: 1, padding: '0.5rem 0.25rem', textAlign: 'center', background: 'var(--border2)', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: pressureColor, lineHeight: 1 }}>{pt.rrr}</div>
              <div style={{ fontSize: '0.5rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.1rem' }}>req rr</div>
            </div>
            <div style={{ flex: 1, padding: '0.5rem 0.25rem', textAlign: 'center', background: pt.wkts >= 7 ? '#ef444412' : 'var(--border2)', border: `1px solid ${pt.wkts >= 7 ? '#ef444433' : 'var(--border)'}`, borderRadius: '0.5rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: pt.wkts >= 7 ? '#ef4444' : 'var(--text)', lineHeight: 1 }}>{pt.wkts}</div>
              <div style={{ fontSize: '0.5rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.1rem' }}>wkts</div>
            </div>
          </div>
        )}

        {/* Target reached early */}
        {phase === 'animating' && pt && pt.needed === 0 && (
          <div style={{ textAlign: 'center', padding: '1rem', background: myChasing ? 'var(--win-bg)' : 'var(--loss-bg)', border: `2px solid ${myChasing ? 'var(--win-border)' : 'var(--loss-border)'}`, borderRadius: '0.875rem', marginBottom: '0.875rem', animation: 'result-reveal 0.6s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <div style={{ fontSize: '1.75rem', marginBottom: '0.2rem' }}>{myChasing ? '🏆' : '💔'}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: myChasing ? '#4169E1' : '#ef4444' }}>
              {myChasing ? 'Target reached!' : `${result.opponent} wins the chase!`}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
              {chaserParsed.runs}/{chaserParsed.wickets} · over {pt.over}
            </div>
          </div>
        )}
        {phase === 'qte-paused' && (
          <div style={{ textAlign: 'center', padding: '0.625rem', background: '#f59e0b18', border: '1px solid #f59e0b44', borderRadius: '0.5rem', color: '#f59e0b', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.875rem' }}>
            ⚡ Critical moment! Quick Time Event incoming…
          </div>
        )}

        {/* Result card */}
        {phase === 'result' && !soData && (
          <div style={{ padding: '1.25rem', textAlign: 'center', background: won ? 'var(--win-bg)' : 'var(--loss-bg)', border: `2px solid ${won ? 'var(--win-border)' : 'var(--loss-border)'}`, borderRadius: '1rem', animation: 'result-reveal 0.7s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.3rem' }}>{won ? '🏆' : '💔'}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: won ? '#4169E1' : '#ef4444' }}>
              {won ? 'YOU WIN THE FINAL!' : 'Heartbreak at the Final'}
            </div>
            <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '0.3rem' }}>{result.summary}</div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>Your XI: {result.myScore} · {result.opponent}: {result.oppScore}</div>
          </div>
        )}
        {phase === 'result' && soData && (
          <MiniSuperOver soData={soData} opponent={result.opponent} onDone={() => onComplete(soData.won)} />
        )}
      </div>
    </div>
  )
}

// ─── Mini Super Over (inside Final chase) ─────────────────────────────────────

function MiniSuperOver({ soData, opponent, onDone }) {
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 2200)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{
      marginTop: '1rem', padding: '1.25rem 1.5rem', textAlign: 'center',
      background: '#1a0a2e', border: '2px solid #a855f755', borderRadius: '1rem',
      animation: 'result-reveal 0.5s ease both',
    }}>
      <div style={{ fontSize: '1rem', fontWeight: 900, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>
        ⚡ SUPER OVER!
      </div>
      <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
        It's all level! One over decides the IPL champions — 6 balls, 2 wickets.
      </div>
      {!revealed
        ? <div style={{ color: '#a855f7', fontWeight: 700, fontSize: '0.88rem' }}>Batters stride to the crease…</div>
        : (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Your XI</div>
                <div style={{ fontSize: '2.25rem', fontWeight: 900, color: soData.won ? '#22c55e' : '#ef4444' }}>{soData.myRuns}</div>
              </div>
              <div style={{ fontSize: '1.25rem', color: '#475569', alignSelf: 'center' }}>vs</div>
              <div>
                <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{opponent}</div>
                <div style={{ fontSize: '2.25rem', fontWeight: 900, color: soData.won ? '#ef4444' : '#22c55e' }}>{soData.oppRuns}</div>
              </div>
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: soData.won ? '#22c55e' : '#ef4444', marginBottom: '1.25rem' }}>
              {soData.won ? '⚡ WON THE SUPER OVER — IPL CHAMPIONS!' : '💔 Super Over lost — heartbreak.'}
            </div>
            <button
              onClick={onDone}
              style={{
                padding: '0.75rem 2.5rem',
                background: soData.won ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'linear-gradient(135deg,#ef4444,#b91c1c)',
                color: '#fff', border: 'none', borderRadius: '0.75rem',
                fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer',
              }}
            >
              {soData.won ? 'View Season Summary →' : 'See Results →'}
            </button>
          </>
        )
      }
    </div>
  )
}

// ─── League Super Over Modal ──────────────────────────────────────────────────

function LeagueSuperOverModal({ match, onDone }) {
  const so = match.superOver   // { won, myRuns, oppRuns }
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 2500)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        width: '100%', maxWidth: 420,
        background: '#0d1229', border: '2px solid #a855f755',
        borderRadius: '1.25rem', padding: '2rem 1.5rem', textAlign: 'center',
        boxShadow: '0 0 60px #a855f720',
        animation: 'fade-in-up 0.35s ease both',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⚡</div>
        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>
          SUPER OVER!
        </div>
        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '1.5rem' }}>
          vs {match.opponent} — scores level! 6 balls, 2 wickets decides it.
        </div>

        {!revealed
          ? <div style={{ color: '#a855f7', fontWeight: 700, fontSize: '0.875rem' }}>6 balls. 2 wickets. Everything on the line…</div>
          : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '0.62rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Your XI</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 900, color: so.won ? '#22c55e' : '#ef4444' }}>{so.myRuns}</div>
                </div>
                <div style={{ fontSize: '1.5rem', color: '#475569', alignSelf: 'center' }}>vs</div>
                <div>
                  <div style={{ fontSize: '0.62rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{match.opponent}</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 900, color: so.won ? '#ef4444' : '#22c55e' }}>{so.oppRuns}</div>
                </div>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: so.won ? '#22c55e' : '#ef4444', marginBottom: '1.25rem' }}>
                {so.won ? '⚡ Super Over won!' : '💔 Super Over lost'}
              </div>
              <button
                onClick={() => onDone(so.won)}
                style={{
                  padding: '0.75rem 2.5rem',
                  background: so.won ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'linear-gradient(135deg,#ef4444,#b91c1c)',
                  color: '#fff', border: 'none', borderRadius: '0.75rem',
                  fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer',
                }}
              >
                Continue Season →
              </button>
            </>
          )
        }
      </div>
    </div>
  )
}

// ─── IPL Result Banner ────────────────────────────────────────────────────────

function IPLResultBanner({ outcome, iplChampion, onDone }) {
  const cfg = {
    champion:     { bg:'var(--warn-bg)',  border:'var(--warn-border)', icon:'🏆', title:'IPL CHAMPIONS!',  color:'#f59e0b', sub:'You lifted the trophy. Legendary.' },
    'runner-up':  { bg:'var(--card2)',    border:'var(--border)',       icon:'🥈', title:'Runners-Up',      color:'#94a3b8', sub:`Well played — you made the Final. ${iplChampion} won the IPL.` },
    eliminated:   { bg:'var(--elim-bg)', border:'var(--elim-border)',  icon:'❌', title:'Knocked Out',     color:'#ef4444', sub:`So close. ${iplChampion} went on to lift the trophy.` },
    not_qualified:{ bg:'var(--loss-bg)', border:'var(--loss-border)',  icon:'📊', title:'Did Not Qualify', color:'#ef4444', sub:`${iplChampion} won the IPL this season.` },
  }[outcome] ?? { bg:'var(--card)', border:'var(--border)', icon:'📊', title:'Season Complete', color:'#94a3b8', sub:'' }

  return (
    <div style={{ textAlign:'center', padding:'1.5rem', background:cfg.bg, border:`2px solid ${cfg.border}`, borderRadius:'1rem', animation:'fade-in-up 0.4s ease both' }}>
      <div style={{ fontSize:'2.5rem', marginBottom:'0.5rem' }}>{cfg.icon}</div>
      <div style={{ fontSize:'1.25rem', fontWeight:900, color:cfg.color, marginBottom:'0.3rem' }}>{cfg.title}</div>
      <div style={{ fontSize:'0.875rem', color:'#94a3b8', marginBottom:'1.25rem' }}>{cfg.sub}</div>
      {onDone && (
        <button
          onClick={onDone}
          style={{ padding:'0.875rem 2rem', background:'linear-gradient(135deg,#4169E1,#2952CC)', color:'var(--bg)', border:'none', borderRadius:'0.875rem', fontSize:'1rem', fontWeight:800, cursor:'pointer' }}
        >
          See Full Results →
        </button>
      )}
    </div>
  )
}

// ─── IPL Points Table ──────────────────────────────────────────────────────

function IPLTableView({ table, position, qualified, leagueWins, onProceed, onSummary }) {
  const topTeam = table.find(t => !t.isUser)
  return (
    <div style={{ animation:'fade-in-up 0.4s ease both' }}>
      <div style={{ textAlign:'center', marginBottom:'1.25rem', padding:'1.25rem', background: qualified ? 'var(--win-bg)' : 'var(--loss-bg)', border:`1px solid ${qualified ? 'var(--win-border)' : 'var(--loss-border)'}`, borderRadius:'1rem' }}>
        <div style={{ fontSize:'2.5rem', marginBottom:'0.5rem' }}>{qualified ? '🎉' : '😔'}</div>
        <div style={{ fontSize:'1.2rem', fontWeight:900, color: qualified ? '#4169E1' : '#ef4444', marginBottom:'0.3rem' }}>
          {qualified ? `Qualified! (Finished ${ordinal(position)})` : `Missed Playoffs (Finished ${ordinal(position)})`}
        </div>
        <div style={{ fontSize:'0.875rem', color:'#64748b' }}>
          {qualified ? `${leagueWins}W puts you in the top 4.` : `${leagueWins}W — just outside the top 4.`}
        </div>
      </div>

      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'1rem', overflow:'hidden', marginBottom:'1.25rem' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1.5rem 1fr 3rem 3rem 4rem 4.5rem', gap:'0.5rem', padding:'0.6rem 1rem', background:'var(--border2)', borderBottom:'1px solid var(--border)', fontSize:'0.58rem', fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.08em' }}>
          <div>#</div><div>Team</div><div style={{ textAlign:'center' }}>W</div><div style={{ textAlign:'center' }}>L</div><div style={{ textAlign:'center' }}>Pts</div><div style={{ textAlign:'right' }}>NRR</div>
        </div>
        {table.map((row, i) => (
          <div key={row.team} style={{ display:'grid', gridTemplateColumns:'1.5rem 1fr 3rem 3rem 4rem 4.5rem', gap:'0.5rem', padding:'0.6rem 1rem', borderBottom: i < table.length-1 ? '1px solid var(--border2)' : 'none', background: row.isUser ? '#4169E108' : 'transparent', borderLeft: row.isUser ? '3px solid #4169E1' : i < 4 ? '3px solid #4169E122' : '3px solid transparent' }}>
            <div style={{ fontSize:'0.72rem', fontWeight:800, color: i < 4 ? '#4169E1' : 'var(--border)', alignSelf:'center' }}>{i+1}</div>
            <div style={{ fontSize:'0.82rem', fontWeight: row.isUser ? 900 : 600, color: row.isUser ? 'var(--text)' : '#94a3b8', alignSelf:'center' }}>{row.team}{row.isUser && ' ⭐'}</div>
            <div style={{ fontSize:'0.82rem', fontWeight:700, color:'#4169E1', textAlign:'center', alignSelf:'center' }}>{row.wins}</div>
            <div style={{ fontSize:'0.82rem', fontWeight:700, color:'#ef4444', textAlign:'center', alignSelf:'center' }}>{row.losses}</div>
            <div style={{ fontSize:'0.9rem', fontWeight:900, color:'#f59e0b', textAlign:'center', alignSelf:'center' }}>{row.points}</div>
            <div style={{ fontSize:'0.72rem', color: row.nrr?.startsWith('+') ? '#4169E1' : '#ef4444', textAlign:'right', alignSelf:'center', fontWeight:600 }}>{row.nrr}</div>
          </div>
        ))}
      </div>

      {!qualified && topTeam && (
        <div style={{ padding:'1rem', background:'var(--warn-bg)', border:'1px solid var(--warn-border)', borderRadius:'0.875rem', marginBottom:'1.25rem', textAlign:'center' }}>
          <div style={{ fontSize:'0.62rem', color:'#f59e0b', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'0.3rem' }}>IPL Champions (Simulated)</div>
          <div style={{ fontSize:'1.1rem', fontWeight:900, color:'var(--text)' }}>🏆 {topTeam.team}</div>
        </div>
      )}

      <button onClick={qualified ? onProceed : onSummary} style={{ width:'100%', padding:'1rem', background: qualified ? 'linear-gradient(135deg,#4169E1,#2952CC)' : 'linear-gradient(135deg,#3b82f6,#1d4ed8)', color: qualified ? 'var(--bg)' : 'var(--text)', border:'none', borderRadius:'0.875rem', fontSize:'1rem', fontWeight:800, cursor:'pointer' }}>
        {qualified ? 'Proceed to Playoffs →' : 'View Season Summary →'}
      </button>
    </div>
  )
}

// ─── Match card ───────────────────────────────────────────────────────────────

function MatchCard({ result, isLatest, expanded, onToggle }) {
  const { won, matchNum, stage, opponent, summary, myScore, oppScore, stats, oppStats, event, eventResult, superOver } = result
  const stageClr = stage === 'Final' ? '#f59e0b' : (stage?.includes('Qualifier') || stage === 'Eliminator' || stage?.includes('Semi')) ? '#a78bfa' : '#64748b'

  // Primary: always shown
  const myScorer  = stats?.topScorer   || null
  const myBowler  = stats?.topBowler   || null
  const oppScorer = oppStats?.topScorer || null
  const oppBowler = oppStats?.topBowler || null
  const hasPrimary = !!(myScorer || myBowler || oppScorer || oppBowler)

  // Secondary: shown on click
  const myScorer2  = stats?.topScorer2   || null
  const oppScorer2 = oppStats?.topScorer2 || null
  const hasSecondary = !!(myScorer2 || oppScorer2 || eventResult)

  const divBorder = `1px solid ${won ? 'var(--win-border)' : 'var(--loss-border)'}`

  function QTEChip() {
    if (!eventResult || !event) return null
    const icon = event.type === 'hat-trick' ? '🎳' : event.type === 'catch' || event.type === 'run-out' ? '🧤' : '🏏'
    const label = eventResult.success ? '⚡ QTE' : '✗ QTE'
    const color = eventResult.success ? '#f59e0b' : '#ef4444'
    return (
      <span style={{ display:'inline-flex', alignItems:'center', gap:'0.2rem', padding:'0.1rem 0.4rem', borderRadius:'999px', background: color + '18', border:`1px solid ${color}44`, fontSize:'0.52rem', fontWeight:800, color, marginLeft:'0.4rem' }}>
        {icon} {label}
      </span>
    )
  }

  return (
    <div style={{ background: won ? 'var(--win-bg)' : 'var(--loss-bg)', border:`1px solid ${won ? 'var(--win-border)' : 'var(--loss-border)'}`, borderRadius:'0.75rem', overflow:'hidden', animation: isLatest ? 'slide-in-right 0.3s ease both' : 'none' }}>

      {/* Header row */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.65rem 1rem' }}>
        <div style={{ width:26, height:26, borderRadius:'50%', background:'var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6rem', fontWeight:800, color:'#64748b', flexShrink:0 }}>{matchNum}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'0.55rem', color:stageClr, textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700 }}>{stage}</div>
          <div style={{ fontSize:'0.82rem', fontWeight:700, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            vs {opponent}
            <QTEChip />
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ fontSize:'0.68rem', color: won ? '#2952CC' : '#dc2626', fontWeight:700 }}>
            {summary}
            {superOver && (
              <span style={{ display:'inline-block', marginLeft:'0.35rem', padding:'0.05rem 0.35rem', background:'#a855f720', border:'1px solid #a855f744', borderRadius:'999px', fontSize:'0.5rem', color:'#a855f7', fontWeight:800, verticalAlign:'middle', letterSpacing:'0.05em' }}>⚡ SO</span>
            )}
          </div>
          <div style={{ fontSize:'0.58rem', color:'#64748b' }}>
            {myScore} · {oppScore}
            {superOver && <span style={{ color:'#a855f7', marginLeft:'0.3rem' }}>SO: {superOver.myRuns}–{superOver.oppRuns}</span>}
          </div>
        </div>
        <div style={{ width:24, height:24, borderRadius:'50%', flexShrink:0, background: won ? '#4169E122' : '#ef444422', border:`1px solid ${won ? '#4169E166' : '#ef444466'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6rem', fontWeight:900, color: won ? '#4169E1' : '#ef4444' }}>
          {won ? 'W' : 'L'}
        </div>
      </div>

      {/* Primary stats — always visible once match is revealed */}
      {hasPrimary && (
        <div style={{ borderTop: divBorder, display:'grid', gridTemplateColumns:'1fr 1fr', gap:0 }}>
          {/* My team column */}
          <div style={{ padding:'0.45rem 0.75rem', borderRight: divBorder }}>
            <div style={{ fontSize:'0.48rem', color:'#4169E1', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.3rem' }}>Your XI</div>
            {myScorer && (
              <div style={{ display:'flex', alignItems:'center', gap:'0.3rem', marginBottom:'0.2rem' }}>
                <span style={{ fontSize:'0.7rem' }}>🏏</span>
                <div>
                  <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text)', lineHeight:1.2 }}>{myScorer.name}</div>
                  <div style={{ fontSize:'0.65rem', color:'#4169E1', fontWeight:700 }}>{myScorer.runs} runs</div>
                </div>
              </div>
            )}
            {myBowler && (
              <div style={{ display:'flex', alignItems:'center', gap:'0.3rem' }}>
                <span style={{ fontSize:'0.7rem' }}>🎯</span>
                <div>
                  <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text)', lineHeight:1.2 }}>{myBowler.name}</div>
                  <div style={{ fontSize:'0.65rem', color:'#a855f7', fontWeight:700 }}>{myBowler.wickets}/{myBowler.runsConceded}</div>
                </div>
              </div>
            )}
          </div>
          {/* Opponent column */}
          <div style={{ padding:'0.45rem 0.75rem' }}>
            <div style={{ fontSize:'0.48rem', color:'#ef4444', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.3rem' }}>{opponent}</div>
            {oppScorer && (
              <div style={{ display:'flex', alignItems:'center', gap:'0.3rem', marginBottom:'0.2rem' }}>
                <span style={{ fontSize:'0.7rem' }}>🏏</span>
                <div>
                  <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text)', lineHeight:1.2 }}>{oppScorer.name}</div>
                  <div style={{ fontSize:'0.65rem', color:'#ef4444', fontWeight:700 }}>{oppScorer.runs} runs</div>
                </div>
              </div>
            )}
            {oppBowler && (
              <div style={{ display:'flex', alignItems:'center', gap:'0.3rem' }}>
                <span style={{ fontSize:'0.7rem' }}>🎯</span>
                <div>
                  <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text)', lineHeight:1.2 }}>{oppBowler.name}</div>
                  <div style={{ fontSize:'0.65rem', color:'#a855f7', fontWeight:700 }}>{oppBowler.wickets}/{oppBowler.runsConceded}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tap for 2nd scorer/bowler hint + toggle */}
      {hasSecondary && (
        <div
          onClick={onToggle}
          style={{ borderTop: divBorder, padding:'0.3rem 0.75rem', display:'flex', justifyContent:'center', alignItems:'center', gap:'0.3rem', cursor:'pointer', background: expanded ? 'transparent' : 'transparent' }}
        >
          <span style={{ fontSize:'0.52rem', color:'var(--border)', fontWeight:700 }}>
            {expanded ? '▲ Hide 2nd scorer / bowler' : '▼ Tap for 2nd scorer & more'}
          </span>
        </div>
      )}

      {/* Secondary stats — revealed on tap */}
      {expanded && hasSecondary && (
        <div style={{ borderTop: divBorder, padding:'0.6rem 0.75rem', display:'flex', flexDirection:'column', gap:'0.5rem', animation:'fade-in 0.15s ease both' }}>
          {/* 2nd scorers side by side */}
          {(myScorer2 || oppScorer2) && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
              {myScorer2 && (
                <div style={{ display:'flex', alignItems:'center', gap:'0.3rem', padding:'0.35rem 0.5rem', background:'#4169E110', borderRadius:'0.4rem' }}>
                  <span style={{ fontSize:'0.65rem' }}>🏏</span>
                  <div>
                    <div style={{ fontSize:'0.6rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:700 }}>2nd scorer</div>
                    <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--text)' }}>{myScorer2.name}</div>
                    <div style={{ fontSize:'0.62rem', color:'#4169E1', fontWeight:700 }}>{myScorer2.runs} runs</div>
                  </div>
                </div>
              )}
              {oppScorer2 && (
                <div style={{ display:'flex', alignItems:'center', gap:'0.3rem', padding:'0.35rem 0.5rem', background:'#ef444410', borderRadius:'0.4rem' }}>
                  <span style={{ fontSize:'0.65rem' }}>🏏</span>
                  <div>
                    <div style={{ fontSize:'0.6rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:700 }}>2nd scorer</div>
                    <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--text)' }}>{oppScorer2.name}</div>
                    <div style={{ fontSize:'0.62rem', color:'#ef4444', fontWeight:700 }}>{oppScorer2.runs} runs</div>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* QTE event result */}
          {eventResult && event && (
            <div style={{ display:'flex', gap:'0.6rem', alignItems:'flex-start', padding:'0.4rem 0.5rem', background: eventResult.success ? '#f59e0b10' : '#ef444410', borderRadius:'0.4rem' }}>
              <div style={{ fontSize:'1rem' }}>{event.type === 'hat-trick' ? '🎳' : event.type === 'catch' ? '🧤' : event.type === 'run-out' ? '💨' : event.type === 'drs' ? '📺' : '🏏'}</div>
              <div>
                <div style={{ fontSize:'0.55rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.07em' }}>QTE — {event.type.replace(/-/g,' ')}</div>
                <div style={{ fontSize:'0.82rem', fontWeight:800, color:'var(--text)' }}>{event.playerName}</div>
                <div style={{ fontSize:'0.7rem', fontWeight:700, color: eventResult.success ? '#f59e0b' : '#ef4444' }}>
                  {eventResult.success ? '✓ Success!' : `✗ Failed · ${eventResult.choiceLabel}`}
                </div>
              </div>
            </div>
          )}
          {/* Top scorer detail */}
          {myScorer && (
            <div style={{ fontSize:'0.62rem', color:'#64748b' }}>
              Your best: <span style={{ color:'var(--text)', fontWeight:700 }}>{myScorer.name}</span> — {myScorer.runs} runs off {myScorer.balls}b (SR {myScorer.sr}) · <span style={{ color:'#a855f7' }}>{myBowler?.name} {myBowler?.wickets}/{myBowler?.runsConceded}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Group Draw ───────────────────────────────────────────────────────────────

function GroupDraw({ mode, drawnOpponents, onStart }) {
  const isODI = mode === 'odi-wc'

  // T20 WC: Group A = your XI + first 4; Group B = next 5
  // ODI WC: single pool = your XI + all 9
  const groupANames = isODI ? drawnOpponents.slice(0, 9) : drawnOpponents.slice(0, 4)
  const groupBNames = isODI ? null : drawnOpponents.slice(4, 9)

  const GroupCard = ({ title, teams, highlight, accentColor }) => (
    <div style={{ background: '#0e0e18', border: `1px solid ${accentColor}33`, borderRadius: '1rem', overflow: 'hidden', flex: 1 }}>
      <div style={{ padding: '0.65rem 1rem', background: accentColor + '18', borderBottom: `1px solid ${accentColor}22` }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          🏏 {title}
        </span>
      </div>
      {/* Your XI first */}
      {highlight && (
        <div style={{ padding: '0.55rem 1rem', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#4169E108' }}>
          <span style={{ fontSize: '0.85rem' }}>⭐</span>
          <span style={{ fontSize: '0.875rem', fontWeight: 900, color: 'var(--text)' }}>Your XI</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: '#4169E1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>You</span>
        </div>
      )}
      {teams.map((name, i) => (
        <div key={name} style={{ padding: '0.5rem 1rem', borderBottom: i < teams.length - 1 ? '1px solid var(--border2)' : 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>{name}</span>
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', animation: 'fade-in-up 0.4s ease both' }}>
      <div style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'center', marginBottom: '1.25rem' }}>
        {isODI ? 'All 10 teams compete in a round-robin pool.' : 'Top 2 from each group advance to the Super 8.'}
      </div>

      <div style={{ display: 'flex', gap: '0.875rem', marginBottom: '1.5rem' }}>
        <GroupCard
          title={isODI ? 'Pool A' : 'Group A — Your Group'}
          teams={groupANames}
          highlight={true}
          accentColor="#4169E1"
        />
        {groupBNames && (
          <GroupCard
            title="Group B"
            teams={groupBNames}
            highlight={false}
            accentColor="#64748b"
          />
        )}
      </div>

      <button
        onClick={onStart}
        style={{
          width: '100%', padding: '1rem',
          background: 'linear-gradient(135deg, #4169E1, #2952CC)',
          color: 'var(--bg)', border: 'none', borderRadius: '0.875rem',
          fontSize: '1.05rem', fontWeight: 800, cursor: 'pointer',
          letterSpacing: '0.03em',
        }}
      >
        Start Tournament →
      </button>
    </div>
  )
}

// ─── Leaderboard panel ────────────────────────────────────────────────────────

function LeaderboardPanel({ title, entries, valueKey, unit, color }) {
  if (!entries.length) return null
  return (
    <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'0.875rem', overflow:'hidden' }}>
      <div style={{ padding:'0.6rem 1rem', borderBottom:'1px solid var(--border2)', fontSize:'0.72rem', fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em' }}>{title}</div>
      {entries.map((e, i) => (
        <div key={e.name} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1rem', borderBottom: i < entries.length-1 ? '1px solid var(--border2)' : 'none' }}>
          <div style={{ fontSize:'0.62rem', color: i===0 ? color : 'var(--border)', fontWeight:900, width:16 }}>{i===0 ? '▶' : `${i+1}`}</div>
          <div style={{ flex:1, fontSize:'0.78rem', fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name}</div>
          <div style={{ fontSize:'0.875rem', fontWeight:900, color: i===0 ? color : '#94a3b8', flexShrink:0 }}>
            {e[valueKey]}<span style={{ fontSize:'0.58rem', color:'#64748b', marginLeft:'0.2rem' }}>{unit}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
