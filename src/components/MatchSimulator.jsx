import { useState, useEffect, useRef, useMemo } from 'react'
import { simulateFullSeason, simulateIPLPlayoffs, generateIPLTable } from '../utils/simulator.js'
import { MODE_CONFIG } from '../data/players.js'
import MatchEvent from './MatchEvent.jsx'

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

export default function MatchSimulator({ team, mode, manager, ratingType, onDone }) {
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

  useEffect(() => {
    if (!tournamentStarted) return  // Wait for group draw → "Start Tournament" click

    const groupStageCount = mode === 'odi-wc' ? 9 : mode === 't20-wc' ? 4 : 0
    const groupOppNames   = drawnAllOpponents ? drawnAllOpponents.slice(0, groupStageCount) : null
    const season = simulateFullSeason(team, mode, manager, { groupOppNames })
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
        if (match.event) {
          setPendingEvent({
            event: match.event,
            opponent: match.opponent,
            resume: () => {
              setPendingEvent(null)
              setRevealed(prev => [...prev, match])
              addStats(match, setLiveRuns, setLiveWkts)
              i++
              scheduleNext()
            }
          })
          return
        }
        setRevealed(prev => [...prev, match])
        addStats(match, setLiveRuns, setLiveWkts)
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

  function startPlayoffs() {
    const pd = simulateIPLPlayoffs(team, manager, iplPosition)
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
    setFinalPhase('playing')
    setFinalStep(0)
    const commentary = format === 'odi' ? COMMENTARY_ODI : COMMENTARY_T20
    let step = 0
    const delays = [900, 1000, 1100, 1100, 1200, 1500]

    const advance = () => {
      step++
      setFinalStep(step)
      if (step < commentary.length - 1) {
        finalTimRef.current = setTimeout(advance, delays[step] ?? 1000)
      } else {
        // Last step — reveal result after short pause
        finalTimRef.current = setTimeout(() => {
          setFinalPhase('done')
          finishFinal()
        }, 1600)
      }
    }
    finalTimRef.current = setTimeout(advance, delays[0])
  }

  function finishFinal() {
    if (!pendingFinal) return
    const match = pendingFinal
    const isFromPlayoff = match._fromPlayoff

    addStats(match, setLiveRuns, setLiveWkts)

    if (isFromPlayoff) {
      const pd = match._playoffData
      // Add all pre-simulated non-final matches that were already revealed + the final
      setPlayoffRevealed(prev => [...prev, { ...match, _fromPlayoff: undefined, _playoffData: undefined }])
      // Determine outcome from playoffData
      const fullPd = { ...pd, outcome: match.won ? 'champion' : 'runner-up' }
      setPlayoffData(fullPd)
      if (match.won) {
        setTimeout(() => setShowCelebration(true), 800)
      } else {
        // IPL Final loss — no heartbreak overlay, go straight to results
        setTimeout(() => setIplPhase('done'), 800)
      }
    } else {
      // WC mode — final was a league season match
      setRevealed(prev => [...prev, match])
      if (match.won) {
        setTimeout(() => setShowCelebration(true), 800)
      } else {
        // WC Final loss → show full-screen heartbreak overlay
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
    if (!leagueSeason) return
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
      },
      leagueSeason.results,
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
      {/* ── Trophy Celebration Overlay ───────────────────────────────── */}
      {showCelebration && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'radial-gradient(ellipse at 50% 40%, #2a1500 0%, #0a0a0f 70%)',
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
              style={{ marginTop: '2.5rem', padding: '0.875rem 2.5rem', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#0a0a0f', border: 'none', borderRadius: '0.75rem', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', animation: 'fade-in 0.5s 1.2s ease both', animationFillMode: 'both' }}
            >
              View Season Summary →
            </button>
          </div>
        </div>
      )}

      {/* ── Match Event overlay ─────────────────────────────────────── */}
      {pendingEvent && (
        <MatchEvent
          event={pendingEvent.event}
          opponent={pendingEvent.opponent}
          onContinue={pendingEvent.resume}
        />
      )}

      {/* ── Heartbreak Overlay ───────────────────────────────────────── */}
      {showHeartbreak && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'radial-gradient(ellipse at 50% 40%, #1a0505 0%, #0a0a0f 70%)',
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
                <span style={{ fontSize: '0.9rem', color: '#f1f5f9', fontWeight: 800 }}>{leagueSeason.actualWinner}</span>
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
          <div style={{ fontSize: '0.72rem', color: '#1F6FEB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{cfg.icon} {cfg.label}</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#f1f5f9', marginBottom: '0.2rem' }}>
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

        {/* ── "Play Final" Gate ─────────────────────────────────────── */}
        {(finalPhase === 'button' || finalPhase === 'playing' || finalPhase === 'done') && (
          <FinalGate
            result={pendingFinal}
            phase={finalPhase}
            step={finalStep}
            commentary={commentary}
            onPlay={startFinalDrama}
            onDone={callOnDone}
          />
        )}

        {/* Scoreboard */}
        {revealed.length > 0 && (
          <div style={{ display: 'flex', gap: '0.875rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
            {[
              { label: 'Wins',   value: leagueWins,    color: '#1F6FEB' },
              { label: 'Losses', value: leagueLosses,  color: '#ef4444' },
              { label: 'Played', value: revealed.length, color: '#94a3b8' },
            ].map(s => (
              <div key={s.label} style={{ width: 86, textAlign: 'center', padding: '0.75rem 0.5rem', background: '#12121a', border: '1px solid #2a2a3a', borderRadius: '0.75rem' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.2rem' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Main two-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: revealed.length > 0 ? '1fr 260px' : '1fr', gap: '1.25rem', alignItems: 'start' }}>

          {/* Left — phase UI + match cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

            {/* IPL Table */}
            {iplPhase === 'table' && iplTable && (
              <IPLTableView table={iplTable.table} position={iplTable.position} qualified={iplTable.qualified} leagueWins={leagueSeason?.wins} onProceed={startPlayoffs} onSummary={callOnDone} />
            )}

            {/* Done result banner */}
            {iplPhase === 'done' && isIPL && (
              <IPLResultBanner outcome={playoffData?.outcome ?? 'not_qualified'} iplChampion={iplChampion} onDone={callOnDone} />
            )}

            {/* WC non-Final elimination: show results button once all matches are done */}
            {iplPhase === 'done' && !isIPL && finalPhase === 'idle' && (
              <div style={{ textAlign: 'center', padding: '1.25rem', background: '#12121a', border: '1px solid #2a2a3a', borderRadius: '0.875rem', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.75rem' }}>Tournament over for your team</div>
                <button
                  onClick={callOnDone}
                  style={{ padding: '0.875rem 2rem', background: 'linear-gradient(135deg, #1F6FEB, #0047CC)', color: '#0a0a0f', border: 'none', borderRadius: '0.75rem', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer' }}
                >
                  View Season Summary →
                </button>
              </div>
            )}

            {/* Playoff header */}
            {(iplPhase === 'playoffs' || (iplPhase === 'done' && playoffRevealed.length > 0)) && (
              <SectionBadge color="#a78bfa" bg="#1a0f2e" border="#6d28d944">⚡ Playoffs</SectionBadge>
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
              <SectionBadge color="#1F6FEB" bg="#0d180d" border="#0047CC44">📋 League Stage</SectionBadge>
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
            <div style={{ position: 'sticky', top: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <LeaderboardPanel title="🏏 Top Scorers"   entries={topRunScorers}   valueKey="runs"    unit="runs" color="#1F6FEB" />
              <LeaderboardPanel title="🎯 Wicket Takers" entries={topWicketTakers} valueKey="wickets" unit="wkts" color="#a855f7" />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function addStats(match, setRuns, setWkts) {
  if (!match?.stats) return
  const { topScorer, topBowler } = match.stats
  if (topScorer) setRuns(prev => ({ ...prev, [topScorer.name]: (prev[topScorer.name] || 0) + topScorer.runs }))
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
  const COLORS = ['#f59e0b','#1F6FEB','#3b82f6','#ef4444','#a855f7','#ec4899','#fff']
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

// ─── Final Gate ──────────────────────────────────────────────────────────────

function FinalGate({ result, phase, step, commentary, onPlay, onDone }) {
  const opponent = result?.opponent ?? 'the opposition'
  const isPlaying = phase === 'playing'
  const isDone    = phase === 'done'

  return (
    <div style={{ marginBottom: '1.5rem', animation: 'final-entrance 0.5s ease both' }}>
      <div style={{
        background: 'linear-gradient(135deg, #1a1200, #0d0900)',
        border: '2px solid #f59e0b44',
        borderRadius: '1.25rem',
        padding: '2rem 1.5rem',
        textAlign: 'center',
        boxShadow: '0 0 60px #f59e0b15',
      }}>
        <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.75rem' }}>
          🏆 THE FINAL
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#f1f5f9', marginBottom: '0.25rem' }}>
          Your XI vs {opponent}
        </div>
        <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem' }}>
          Everything comes down to this one match.
        </div>

        {/* Commentary steps */}
        {(isPlaying || isDone) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem', textAlign: 'left' }}>
            {commentary.slice(0, step).map((line, i) => (
              <div
                key={i}
                style={{
                  padding: '0.625rem 0.875rem',
                  background: '#1a1a26',
                  borderRadius: '0.5rem',
                  fontSize: '0.82rem',
                  color: i === step - 1 ? '#f1f5f9' : '#64748b',
                  fontWeight: i === step - 1 ? 700 : 400,
                  animation: 'commentary-in 0.35s ease both',
                  borderLeft: `3px solid ${i === step - 1 ? '#f59e0b' : '#2a2a3a'}`,
                }}
              >
                {line}
              </div>
            ))}
          </div>
        )}

        {/* Result reveal */}
        {isDone && result && (
          <div style={{
            padding: '1.25rem',
            background: result.won ? '#0d2418' : '#1a0d0d',
            border: `2px solid ${result.won ? '#1F6FEB55' : '#ef444455'}`,
            borderRadius: '1rem',
            marginBottom: '1rem',
            animation: 'result-reveal 0.7s cubic-bezier(0.34,1.56,0.64,1) both',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.3rem' }}>{result.won ? '🏆' : '💔'}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: result.won ? '#1F6FEB' : '#ef4444' }}>
              {result.won ? 'YOU WIN THE FINAL!' : 'Heartbreak at the Final'}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginTop: '0.3rem' }}>{result.summary}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>{result.myScore} · {result.oppScore}</div>
          </div>
        )}

        {/* Play button */}
        {phase === 'button' && (
          <button
            onClick={onPlay}
            style={{
              padding: '1rem 2.5rem',
              background: 'linear-gradient(135deg,#f59e0b,#d97706)',
              color: '#0a0a0f', border: 'none', borderRadius: '0.875rem',
              fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer',
              letterSpacing: '0.04em', textTransform: 'uppercase',
              boxShadow: '0 0 30px #f59e0b33',
            }}
          >
            ▶ Play The Final
          </button>
        )}
        {phase === 'playing' && (
          <div style={{ color: '#f59e0b', fontSize: '0.875rem', fontWeight: 700 }}>Match in progress…</div>
        )}
        {isDone && onDone && (
          <button
            onClick={onDone}
            style={{ marginTop: '0.5rem', width: '100%', padding: '0.875rem', background: 'linear-gradient(135deg,#1F6FEB,#0047CC)', color: '#0a0a0f', border: 'none', borderRadius: '0.875rem', fontSize: '1rem', fontWeight: 800, cursor: 'pointer' }}
          >
            See Full Results →
          </button>
        )}
      </div>
    </div>
  )
}

// ─── IPL Result Banner ────────────────────────────────────────────────────────

function IPLResultBanner({ outcome, iplChampion, onDone }) {
  const cfg = {
    champion:     { bg:'linear-gradient(135deg,#1a1200,#0f0d00)', border:'#f59e0b55', icon:'🏆', title:'IPL CHAMPIONS!',  color:'#f59e0b', sub:'You lifted the trophy. Legendary.' },
    'runner-up':  { bg:'#1a1a26',  border:'#94a3b844', icon:'🥈', title:'Runners-Up',          color:'#94a3b8', sub:`Well played — you made the Final. ${iplChampion} won the IPL.` },
    eliminated:   { bg:'#1a0d0d',  border:'#ef444444', icon:'❌', title:'Knocked Out',           color:'#ef4444', sub:`So close. ${iplChampion} went on to lift the trophy.` },
    not_qualified:{ bg:'#1a0d0d',  border:'#7f1d1d44', icon:'📊', title:'Did Not Qualify',      color:'#ef4444', sub:`${iplChampion} won the IPL this season.` },
  }[outcome] ?? { bg:'#12121a', border:'#2a2a3a', icon:'📊', title:'Season Complete', color:'#94a3b8', sub:'' }

  return (
    <div style={{ textAlign:'center', padding:'1.5rem', background:cfg.bg, border:`2px solid ${cfg.border}`, borderRadius:'1rem', animation:'fade-in-up 0.4s ease both' }}>
      <div style={{ fontSize:'2.5rem', marginBottom:'0.5rem' }}>{cfg.icon}</div>
      <div style={{ fontSize:'1.25rem', fontWeight:900, color:cfg.color, marginBottom:'0.3rem' }}>{cfg.title}</div>
      <div style={{ fontSize:'0.875rem', color:'#94a3b8', marginBottom:'1.25rem' }}>{cfg.sub}</div>
      {onDone && (
        <button
          onClick={onDone}
          style={{ padding:'0.875rem 2rem', background:'linear-gradient(135deg,#1F6FEB,#0047CC)', color:'#0a0a0f', border:'none', borderRadius:'0.875rem', fontSize:'1rem', fontWeight:800, cursor:'pointer' }}
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
      <div style={{ textAlign:'center', marginBottom:'1.25rem', padding:'1.25rem', background: qualified ? '#0d2418' : '#1a0d0d', border:`1px solid ${qualified ? '#0047CC44' : '#7f1d1d44'}`, borderRadius:'1rem' }}>
        <div style={{ fontSize:'2.5rem', marginBottom:'0.5rem' }}>{qualified ? '🎉' : '😔'}</div>
        <div style={{ fontSize:'1.2rem', fontWeight:900, color: qualified ? '#1F6FEB' : '#ef4444', marginBottom:'0.3rem' }}>
          {qualified ? `Qualified! (Finished ${ordinal(position)})` : `Missed Playoffs (Finished ${ordinal(position)})`}
        </div>
        <div style={{ fontSize:'0.875rem', color:'#64748b' }}>
          {qualified ? `${leagueWins}W puts you in the top 4.` : `${leagueWins}W — just outside the top 4.`}
        </div>
      </div>

      <div style={{ background:'#12121a', border:'1px solid #2a2a3a', borderRadius:'1rem', overflow:'hidden', marginBottom:'1.25rem' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1.5rem 1fr 3rem 3rem 4rem 4.5rem', gap:'0.5rem', padding:'0.6rem 1rem', background:'#1a1a26', borderBottom:'1px solid #2a2a3a', fontSize:'0.58rem', fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.08em' }}>
          <div>#</div><div>Team</div><div style={{ textAlign:'center' }}>W</div><div style={{ textAlign:'center' }}>L</div><div style={{ textAlign:'center' }}>Pts</div><div style={{ textAlign:'right' }}>NRR</div>
        </div>
        {table.map((row, i) => (
          <div key={row.team} style={{ display:'grid', gridTemplateColumns:'1.5rem 1fr 3rem 3rem 4rem 4.5rem', gap:'0.5rem', padding:'0.6rem 1rem', borderBottom: i < table.length-1 ? '1px solid #1a1a26' : 'none', background: row.isUser ? '#1F6FEB08' : 'transparent', borderLeft: row.isUser ? '3px solid #1F6FEB' : i < 4 ? '3px solid #1F6FEB22' : '3px solid transparent' }}>
            <div style={{ fontSize:'0.72rem', fontWeight:800, color: i < 4 ? '#1F6FEB' : '#2a2a3a', alignSelf:'center' }}>{i+1}</div>
            <div style={{ fontSize:'0.82rem', fontWeight: row.isUser ? 900 : 600, color: row.isUser ? '#f1f5f9' : '#94a3b8', alignSelf:'center' }}>{row.team}{row.isUser && ' ⭐'}</div>
            <div style={{ fontSize:'0.82rem', fontWeight:700, color:'#1F6FEB', textAlign:'center', alignSelf:'center' }}>{row.wins}</div>
            <div style={{ fontSize:'0.82rem', fontWeight:700, color:'#ef4444', textAlign:'center', alignSelf:'center' }}>{row.losses}</div>
            <div style={{ fontSize:'0.9rem', fontWeight:900, color:'#f59e0b', textAlign:'center', alignSelf:'center' }}>{row.points}</div>
            <div style={{ fontSize:'0.72rem', color: row.nrr?.startsWith('+') ? '#1F6FEB' : '#ef4444', textAlign:'right', alignSelf:'center', fontWeight:600 }}>{row.nrr}</div>
          </div>
        ))}
      </div>

      {!qualified && topTeam && (
        <div style={{ padding:'1rem', background:'#1a1200', border:'1px solid #f59e0b33', borderRadius:'0.875rem', marginBottom:'1.25rem', textAlign:'center' }}>
          <div style={{ fontSize:'0.62rem', color:'#f59e0b', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'0.3rem' }}>IPL Champions (Simulated)</div>
          <div style={{ fontSize:'1.1rem', fontWeight:900, color:'#f1f5f9' }}>🏆 {topTeam.team}</div>
        </div>
      )}

      <button onClick={qualified ? onProceed : onSummary} style={{ width:'100%', padding:'1rem', background: qualified ? 'linear-gradient(135deg,#1F6FEB,#0047CC)' : 'linear-gradient(135deg,#3b82f6,#1d4ed8)', color: qualified ? '#0a0a0f' : '#f1f5f9', border:'none', borderRadius:'0.875rem', fontSize:'1rem', fontWeight:800, cursor:'pointer' }}>
        {qualified ? 'Proceed to Playoffs →' : 'View Season Summary →'}
      </button>
    </div>
  )
}

// ─── Match card ───────────────────────────────────────────────────────────────

function MatchCard({ result, isLatest, expanded, onToggle }) {
  const { won, matchNum, stage, opponent, summary, myScore, oppScore, stats } = result
  const hasHighlights = !!(stats?.topScorer || stats?.topBowler)
  const stageClr = stage === 'Final' ? '#f59e0b' : (stage?.includes('Qualifier') || stage === 'Eliminator' || stage?.includes('Semi')) ? '#a78bfa' : '#64748b'

  return (
    <div style={{ background: won ? '#0d2418' : '#1a0d0d', border:`1px solid ${won ? '#0047CC44' : '#7f1d1d44'}`, borderRadius:'0.75rem', overflow:'hidden', animation: isLatest ? 'slide-in-right 0.3s ease both' : 'none' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.75rem 1rem', cursor: hasHighlights ? 'pointer' : 'default' }} onClick={hasHighlights ? onToggle : undefined}>
        <div style={{ width:28, height:28, borderRadius:'50%', background:'#1a1a26', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.62rem', fontWeight:800, color:'#64748b', flexShrink:0 }}>{matchNum}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'0.58rem', color:stageClr, textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700 }}>{stage}</div>
          <div style={{ fontSize:'0.875rem', fontWeight:700, color:'#f1f5f9', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>vs {opponent}</div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ fontSize:'0.7rem', color: won ? '#0047CC' : '#dc2626', fontWeight:700 }}>{summary}</div>
          <div style={{ fontSize:'0.62rem', color:'#64748b' }}>{myScore} · {oppScore}</div>
        </div>
        <div style={{ width:26, height:26, borderRadius:'50%', flexShrink:0, background: won ? '#1F6FEB22' : '#ef444422', border:`1px solid ${won ? '#1F6FEB66' : '#ef444466'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.62rem', fontWeight:900, color: won ? '#1F6FEB' : '#ef4444' }}>
          {won ? 'W' : 'L'}
        </div>
        {hasHighlights && <div style={{ fontSize:'0.58rem', color:'#2a2a3a', flexShrink:0 }}>{expanded ? '▲' : '▼'}</div>}
      </div>

      {expanded && hasHighlights && (
        <div style={{ padding:'0.75rem 1rem 1rem', borderTop:`1px solid ${won ? '#0047CC22' : '#7f1d1d22'}`, display:'flex', flexDirection:'column', gap:'0.625rem', animation:'fade-in 0.15s ease both' }}>
          {stats.topScorer && (
            <div style={{ display:'flex', gap:'0.75rem', alignItems:'flex-start' }}>
              <div style={{ width:26, height:26, borderRadius:'50%', flexShrink:0, background:'#1F6FEB18', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8rem' }}>🏏</div>
              <div>
                <div style={{ fontSize:'0.58rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.07em' }}>Top Scorer</div>
                <div style={{ fontSize:'0.9rem', fontWeight:800, color:'#f1f5f9' }}>{stats.topScorer.name}</div>
                <div style={{ fontSize:'0.75rem', color:'#1F6FEB', fontWeight:700 }}>{stats.topScorer.runs} runs off {stats.topScorer.balls}b · SR {stats.topScorer.sr}</div>
              </div>
            </div>
          )}
          {stats.topBowler && (
            <div style={{ display:'flex', gap:'0.75rem', alignItems:'flex-start' }}>
              <div style={{ width:26, height:26, borderRadius:'50%', flexShrink:0, background:'#a855f718', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8rem' }}>🎯</div>
              <div>
                <div style={{ fontSize:'0.58rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.07em' }}>Best Bowling</div>
                <div style={{ fontSize:'0.9rem', fontWeight:800, color:'#f1f5f9' }}>{stats.topBowler.name}</div>
                <div style={{ fontSize:'0.75rem', color:'#a855f7', fontWeight:700 }}>{stats.topBowler.wickets}/{stats.topBowler.runsConceded}</div>
              </div>
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
        <div style={{ padding: '0.55rem 1rem', borderBottom: '1px solid #1a1a26', display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1F6FEB08' }}>
          <span style={{ fontSize: '0.85rem' }}>⭐</span>
          <span style={{ fontSize: '0.875rem', fontWeight: 900, color: '#f1f5f9' }}>Your XI</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: '#1F6FEB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>You</span>
        </div>
      )}
      {teams.map((name, i) => (
        <div key={name} style={{ padding: '0.5rem 1rem', borderBottom: i < teams.length - 1 ? '1px solid #1a1a26' : 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
          accentColor="#1F6FEB"
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
          background: 'linear-gradient(135deg, #1F6FEB, #0047CC)',
          color: '#0a0a0f', border: 'none', borderRadius: '0.875rem',
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
    <div style={{ background:'#12121a', border:'1px solid #2a2a3a', borderRadius:'0.875rem', overflow:'hidden' }}>
      <div style={{ padding:'0.6rem 1rem', borderBottom:'1px solid #1a1a26', fontSize:'0.72rem', fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em' }}>{title}</div>
      {entries.map((e, i) => (
        <div key={e.name} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1rem', borderBottom: i < entries.length-1 ? '1px solid #1a1a26' : 'none' }}>
          <div style={{ fontSize:'0.62rem', color: i===0 ? color : '#2a2a3a', fontWeight:900, width:16 }}>{i===0 ? '▶' : `${i+1}`}</div>
          <div style={{ flex:1, fontSize:'0.78rem', fontWeight:600, color:'#f1f5f9', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name}</div>
          <div style={{ fontSize:'0.875rem', fontWeight:900, color: i===0 ? color : '#94a3b8', flexShrink:0 }}>
            {e[valueKey]}<span style={{ fontSize:'0.58rem', color:'#64748b', marginLeft:'0.2rem' }}>{unit}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
