import { useState } from 'react'
import { MODE_CONFIG } from '../data/players.js'

function getPredictedRank(str, mode) {
  if (mode === 'ipl') {
    if (str >= 85) return { pos: '1st–2nd', short: 'Champions contender' }
    if (str >= 80) return { pos: 'Top 4',   short: 'Playoff favourite' }
    if (str >= 75) return { pos: '5th–6th', short: 'On the bubble' }
    if (str >= 68) return { pos: '7th–8th', short: 'Mid-table' }
    return               { pos: 'Bottom 3', short: 'Uphill battle' }
  }
  if (str >= 84) return { pos: 'Champions',     short: 'Tournament favourite' }
  if (str >= 78) return { pos: 'Semi-final',    short: 'Deep run expected' }
  if (str >= 70) return { pos: 'Quarter-final', short: 'Competitive side' }
  return               { pos: 'Group stage',    short: 'Underdog story' }
}

// Returns [{text, tone: 'positive'|'negative'|'neutral'}]
function getPerformanceWriteup(wins, losses, total, iplOutcome, iplPosition, predictedPos, potm, stageReached, mode) {
  const pct  = total > 0 ? wins / total : 0
  const star = potm ?? null
  const p    = (t) => ({ text: t, tone: 'positive' })
  const n    = (t) => ({ text: t, tone: 'negative' })
  const neu  = (t) => ({ text: t, tone: 'neutral'  })

  // ─── IPL ─────────────────────────────────────────────────────────────────
  if (iplOutcome === 'champion') {
    return [
      star ? p(`Night after night, ${star} lit up the tournament — and when the final ball was bowled, it was your XI holding the trophy.`)
           : p(`From the first ball of the season to the last, this team played with a belief that never wavered.`),
      neu(`They came in predicted to finish ${predictedPos}, and they`),
      p(`silenced every doubter along the way.`),
      p(`Champions of the IPL.`),
    ]
  }
  if (iplOutcome === 'runner-up') {
    return [
      neu(`Predicted ${predictedPos}, this team wrote their own story deep into the competition.`),
      star ? n(`${star} gave everything, and so did the rest of the XI — but the Final belongs to someone else this year.`)
           : p(`They pushed all the way to the Final — further than most believed they could go.`),
      p(`There is no shame in this — only pride.`),
    ]
  }
  if (iplOutcome === 'eliminated') {
    const ploff = iplPosition ? `a ${ordinal(iplPosition)}-place finish` : 'a playoff berth'
    return [
      p(`They earned ${ploff} in the league, and the knockouts gave them a stage they rose to — for a while.`),
      star ? p(`${star} was at the heart of everything good this side did.`)
           : neu(`The effort was real, even when the breaks didn't go their way.`),
      neu(`A campaign to build on.`),
    ]
  }
  if (iplOutcome === 'not_qualified') {
    const pos = iplPosition ? `finished ${ordinal(iplPosition)}` : 'fell short of the top four'
    return [
      n(`They ${pos} — and the playoff spots that seemed within reach slipped away, one tight game at a time.`),
      star ? p(`${star} gave them hope on more occasions than most.`)
           : n(`The gaps were small, the margins painful.`),
      neu(`This group will be better for the experience.`),
    ]
  }

  // ─── World Cup modes ──────────────────────────────────────────────────────
  const stage = stageReached || ''
  if (stage === 'Champion') {
    return [
      neu(`Predicted ${predictedPos}, few gave this team a chance when the tournament began.`),
      star ? p(`${star} stood tallest when the tournament needed a hero, and the rest of the XI answered every call.`)
           : p(`They played every stage with composure — and when the final was done, they stood alone at the top.`),
      p(`World Cup winners.`),
    ]
  }
  if (stage === 'Runner-up') {
    return [
      p(`They were predicted to finish ${predictedPos} — and yet here they were, in the Final, one win from the ultimate prize.`),
      star ? p(`${star} carried this side through its toughest moments.`)
           : p(`It was a journey that exceeded every expectation.`),
      n(`The game of inches found them on the wrong side today,`),
      neu(`but the story of this campaign will be told long after.`),
    ]
  }
  if (stage === 'Semi-Final') {
    return [
      n(`A semi-final exit stings, but there is no disgrace in falling at this stage of a World Cup.`),
      star ? p(`${star} was exceptional throughout.`)
           : neu(`There were performances across the XI worth remembering.`),
      p(`Predicted ${predictedPos}, they went further — and for stretches of the tournament, looked capable of going all the way.`),
    ]
  }
  if (stage === 'Super 8') {
    return [
      p(`They survived the group stage and battled into the Super 8s — which is more than many can say.`),
      star ? p(`${star} was the bright light of a tournament that eventually ran out of road.`)
           : neu(`The quality was there in bursts, just not consistently enough.`),
      neu(`Predicted ${predictedPos} — the gap between ambition and result is smaller than it seems.`),
    ]
  }
  if (pct <= 0.3) {
    return [
      n(`It was a brutal group stage — the kind that leaves questions hanging in the air long after.`),
      star ? p(`${star} tried to drag this team forward alone, and nearly did.`)
           : n(`The margins were fine, the results weren't.`),
      n(`Predicted ${predictedPos}, they never quite found their footing when it mattered most.`),
      neu(`Rebuild starts now.`),
    ]
  }
  return [
    n(`They pushed hard through the group stage but ultimately couldn't find the wins to advance.`),
    star ? p(`${star} showed flashes of brilliance.`)
         : neu(`There were moments of real quality.`),
    neu(`Predicted ${predictedPos} — this wasn't the ending they deserved, but the cricket told its own story.`),
  ]
}

function ordinal(n) {
  if (!n) return ''
  const s = ['th','st','nd','rd'], v = n % 100
  return n + (s[(v-20)%10] || s[v] || s[0])
}

const ROLE_LABEL = {
  'opener': 'OPN', 'top-order': 'BAT', 'middle-order': 'BAT',
  'wicket-keeper': 'WK', 'all-rounder': 'ALL',
  'pace-bowler': 'PACE', 'spin-bowler': 'SPIN',
}
const ROLE_COLOR = {
  'opener': '#1F6FEB', 'top-order': '#1F6FEB', 'middle-order': '#0047CC',
  'wicket-keeper': '#f59e0b', 'all-rounder': '#3b82f6',
  'pace-bowler': '#ef4444', 'spin-bowler': '#a855f7',
}

function getRating(wins, losses, total, perfect, targetWins, iplOutcome) {
  if (!total) return { label: 'COMPLETE', color: '#94a3b8', emoji: '🏏', desc: 'Season complete.' }
  if (iplOutcome === 'champion')     return { label: 'IPL CHAMPIONS', color: '#f59e0b', emoji: '🏆', desc: 'You lifted the trophy. An all-time great team.' }
  if (iplOutcome === 'runner-up')    return { label: 'RUNNERS-UP',    color: '#94a3b8', emoji: '🥈', desc: 'So close — you made the Final and pushed hard.' }
  if (iplOutcome === 'eliminated')   return { label: 'PLAYOFF RUN',   color: '#3b82f6', emoji: '⚡', desc: 'You made the playoffs but fell short of the Final.' }
  if (iplOutcome === 'not_qualified') {
    const pct = wins / total
    if (pct >= 0.55) return { label: 'SOLID SEASON',  color: '#94a3b8', emoji: '📋', desc: 'Good league form but just missed the top 4.' }
    return { label: 'TOUGH SEASON', color: '#ef4444', emoji: '😬', desc: 'A difficult campaign — couldn\'t break into playoffs.' }
  }
  if (perfect) return { label: 'LEGENDARY', color: '#f59e0b', emoji: '🏆', desc: `You achieved the impossible — ${targetWins}-0!` }
  if (losses === 0) return { label: 'DOMINANT', color: '#1F6FEB', emoji: '👑', desc: 'Unbeaten all season — extraordinary.' }
  const pct = wins / total
  if (pct >= 0.85) return { label: 'ELITE', color: '#1F6FEB', emoji: '⭐', desc: 'One of the all-time great sides.' }
  if (pct >= 0.70) return { label: 'QUALITY', color: '#3b82f6', emoji: '🔵', desc: 'A strong side that fell just short.' }
  if (pct >= 0.55) return { label: 'DECENT', color: '#94a3b8', emoji: '⚪', desc: 'Competitive but not quite elite.' }
  return { label: 'TOUGH RUN', color: '#ef4444', emoji: '😬', desc: 'Even legends have bad seasons.' }
}

export default function Results({ team, mode, manager, summary, matchResults, onPlayAgain }) {
  const [tab, setTab] = useState('overview') // overview | playerstats | matches

  // Null-safe destructure
  const cfg     = MODE_CONFIG[mode] || {}
  const wins    = summary?.wins    ?? 0
  const losses  = summary?.losses  ?? 0
  const total   = summary?.total   ?? matchResults?.length ?? 0
  const perfect = summary?.perfect ?? false
  const myStr   = summary?.myStrength ?? 0
  const ts      = summary?.tournamentStats || {}

  const topScorers        = ts.topScorers       || []
  const topWicketTakers   = ts.topWicketTakers  || []
  const potm              = ts.potm             || null
  const bestXI            = ts.bestXI           || []
  const tournamentBestXI  = ts.tournamentBestXI || []
  const playerStats       = ts.playerStats      || []

  const iplOutcome   = summary?.iplOutcome   ?? null
  const iplPosition  = summary?.iplPosition  ?? null
  const stageReached = summary?.stageReached ?? null
  const actualWinner = summary?.actualWinner ?? null

  // Show heartbreak for: IPL runner-up, WC Final loss, WC Semi-Final exit
  const isHeartbreak = iplOutcome === 'runner-up' || stageReached === 'Runner-up' || stageReached === 'Semi-Final'

  const predicted    = getPredictedRank(myStr, mode)
  const perfWriteup = getPerformanceWriteup(wins, losses, total, iplOutcome, iplPosition, predicted.pos, potm, stageReached, mode)
  const rating = getRating(wins, losses, total, perfect, cfg.targetWins, iplOutcome)

  const shareText = () => {
    const blocks = (matchResults || []).map(r => r.won ? '🟩' : '🟥').join('')
    return `Cricket 16-0 — ${cfg.label ?? ''}\n\n${blocks}\n\n${wins}W - ${losses}L · ${rating.label}${potm ? `\nPlayer of Tournament: ${potm}` : ''}\n\nPlay at cricket16-0.app`
  }

  const copyShare = () => navigator.clipboard.writeText(shareText()).catch(() => {})

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 0%, #0f1a0f 0%, #0a0a0f 60%)',
      padding: '2rem 1rem 4rem',
    }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* Heartbreak overlay — shown when losing a Final */}
        {isHeartbreak && (
          <div style={{
            textAlign: 'center',
            marginBottom: '0.5rem',
            animation: 'fade-in-up 0.6s ease both',
          }}>
            <style>{`
              @keyframes heartbeat {
                0%,100%{transform:scale(1)} 25%{transform:scale(1.25)} 50%{transform:scale(0.95)} 75%{transform:scale(1.15)}
              }
            `}</style>
            <div style={{
              fontSize: '4rem',
              animation: 'heartbeat 1.2s ease 0.4s 2',
              display: 'inline-block',
            }}>💔</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f87171', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: '0.25rem' }}>
              So close — but not this time
            </div>
            {actualWinner && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>
                🏆 <span style={{ color: '#f1f5f9', fontWeight: 800 }}>{actualWinner}</span> won the tournament
              </div>
            )}
          </div>
        )}

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: '2rem', animation: 'fade-in-up 0.5s ease both' }}>
          <div style={{ fontSize: '4rem', marginBottom: '0.75rem' }}>{rating.emoji}</div>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: rating.color, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
            {rating.label}
          </div>
          <div style={{ fontSize: 'clamp(3rem,10vw,5rem)', fontWeight: 900, letterSpacing: '-0.04em', color: '#f1f5f9', lineHeight: 1 }}>
            {wins}-{losses}
          </div>
          <div style={{ fontSize: '0.95rem', color: '#64748b', marginTop: '0.35rem', marginBottom: '0.75rem' }}>
            {cfg.label} · {total} match{total !== 1 ? 'es' : ''} played
          </div>
          <div style={{ fontSize: '1rem', color: '#94a3b8', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            {rating.desc}
          </div>

          {/* Match blocks */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 3, marginBottom: '1.5rem' }}>
            {(matchResults || []).map((r, i) => (
              <div
                key={i}
                title={`Match ${i+1} vs ${r.opponent} — ${r.summary}`}
                style={{
                  width: 26, height: 26, borderRadius: 4,
                  background: r.won ? '#0047CC' : '#dc2626',
                }}
              />
            ))}
          </div>

          {/* Team strength bar */}
          <div style={{
            background: '#12121a', border: '1px solid #2a2a3a',
            borderRadius: '0.75rem', padding: '1rem 1.25rem', marginBottom: '1.25rem',
            textAlign: 'left',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                Team Rating{manager ? ` · ${manager.icon} ${manager.name}` : ''}
              </span>
              <span style={{ fontSize: '0.8rem', fontWeight: 900, color: '#f59e0b' }}>{myStr}</span>
            </div>
            <div style={{ height: 8, background: '#1a1a26', borderRadius: 4 }}>
              <div style={{ width: `${myStr}%`, height: '100%', background: 'linear-gradient(90deg, #1F6FEB, #f59e0b)', borderRadius: 4, transition: 'width 1s ease' }} />
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={onPlayAgain}
              style={{
                padding: '0.875rem 1.75rem',
                background: 'linear-gradient(135deg, #1F6FEB, #0047CC)',
                color: '#0a0a0f', border: 'none', borderRadius: '0.625rem',
                fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer',
              }}
            >
              Play Again
            </button>
            <button
              onClick={copyShare}
              style={{
                padding: '0.875rem 1.75rem',
                background: 'transparent', color: '#94a3b8',
                border: '1px solid #2a2a3a', borderRadius: '0.625rem',
                fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
              }}
            >
              Copy Result
            </button>
          </div>
        </div>

        {/* ── Season Highlights ─────────────────────────────── */}
        <SeasonHighlights
          topScorers={topScorers}
          topWicketTakers={topWicketTakers}
          potm={potm}
          iplPosition={iplPosition}
          predictedPos={predicted.pos}
          predictedShort={predicted.short}
          perfWriteup={perfWriteup}
          iplOutcome={iplOutcome}
          stageReached={stageReached}
          mode={mode}
        />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1.25rem', background: '#12121a', padding: '0.35rem', borderRadius: '0.75rem', border: '1px solid #2a2a3a' }}>
          {[
            { id: 'overview',     label: '📊 Awards' },
            { id: 'playerstats',  label: '🏏 Player Stats' },
            { id: 'matches',      label: '📋 Matches' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '0.5rem 0.5rem',
                background: tab === t.id ? '#1F6FEB' : 'transparent',
                color: tab === t.id ? '#0a0a0f' : '#64748b',
                border: 'none', borderRadius: '0.5rem',
                fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'overview' && (
          <OverviewTab
            potm={potm}
            topScorers={topScorers}
            topWicketTakers={topWicketTakers}
            tournamentBestXI={tournamentBestXI}
            bestXI={bestXI}
            team={team}
          />
        )}
        {tab === 'playerstats' && (
          <PlayerStatsTab playerStats={playerStats} team={team} />
        )}
        {tab === 'matches' && (
          <MatchesTab matchResults={matchResults} />
        )}
      </div>
    </div>
  )
}

// ─── Season Highlights ─────────────────────────────────────────────────────

function SeasonHighlights({ topScorers, topWicketTakers, potm, iplPosition, predictedPos, predictedShort, perfWriteup, iplOutcome, stageReached, mode }) {
  const topBat   = topScorers?.[0]
  const topBowl  = topWicketTakers?.[0]

  return (
    <div style={{ marginBottom: '1.5rem', animation: 'fade-in-up 0.4s 0.1s ease both', animationFillMode: 'both' }}>

      {/* Hero stat cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.625rem', marginBottom: '1rem' }}>

        {/* Top Batter */}
        <div style={{ background: '#12121a', border: '1px solid #1F6FEB33', borderRadius: '0.875rem', padding: '0.875rem 0.75rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>🏏</div>
          <div style={{ fontSize: '0.55rem', color: '#1F6FEB', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.35rem' }}>Top Scorer</div>
          {topBat ? (
            <>
              <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#f1f5f9', lineHeight: 1.2, marginBottom: '0.25rem' }}>{topBat.name}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#1F6FEB' }}>{topBat.runs}</div>
              <div style={{ fontSize: '0.55rem', color: '#64748b' }}>runs</div>
            </>
          ) : <div style={{ fontSize: '0.7rem', color: '#2a2a3a' }}>—</div>}
        </div>

        {/* Top Bowler */}
        <div style={{ background: '#12121a', border: '1px solid #a855f733', borderRadius: '0.875rem', padding: '0.875rem 0.75rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>🎯</div>
          <div style={{ fontSize: '0.55rem', color: '#a855f7', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.35rem' }}>Top Bowler</div>
          {topBowl ? (
            <>
              <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#f1f5f9', lineHeight: 1.2, marginBottom: '0.25rem' }}>{topBowl.name}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#a855f7' }}>{topBowl.wickets}</div>
              <div style={{ fontSize: '0.55rem', color: '#64748b' }}>wickets</div>
            </>
          ) : <div style={{ fontSize: '0.7rem', color: '#2a2a3a' }}>—</div>}
        </div>

        {/* Best Player / POTM */}
        <div style={{ background: 'linear-gradient(135deg,#1a1200,#0d0900)', border: '1px solid #f59e0b33', borderRadius: '0.875rem', padding: '0.875rem 0.75rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>🏅</div>
          <div style={{ fontSize: '0.55rem', color: '#f59e0b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.35rem' }}>Best Player</div>
          {potm ? (
            <>
              <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#f1f5f9', lineHeight: 1.2 }}>{potm}</div>
              <div style={{ fontSize: '0.55rem', color: '#f59e0b', marginTop: '0.25rem', fontWeight: 700 }}>Player of Tournament</div>
            </>
          ) : <div style={{ fontSize: '0.7rem', color: '#2a2a3a' }}>—</div>}
        </div>
      </div>

      {/* Predicted vs Actual — hero block */}
      {(() => {
        const isChampion = iplOutcome === 'champion' || stageReached === 'Champion'
        const isRunnerup = iplOutcome === 'runner-up' || stageReached === 'Runner-up'
        const isFinal    = stageReached === 'Final'
        const isSemi     = stageReached === 'Semi-Final'
        const isSuper8   = stageReached === 'Super 8'
        const isGroup    = stageReached === 'Group Stage'
        const isElim     = iplOutcome === 'eliminated'
        const isNoQ      = iplOutcome === 'not_qualified'

        const actualColor =
          isChampion ? '#f59e0b' :
          isRunnerup ? '#94a3b8' :
          isFinal    ? '#a78bfa' :
          isSemi || isElim ? '#3b82f6' :
          isSuper8   ? '#94a3b8' :
          isGroup || isNoQ ? '#ef4444' :
          '#f1f5f9'

        const actualLabel =
          iplOutcome === 'champion'      ? '🏆 IPL Champions' :
          iplOutcome === 'runner-up'     ? '🥈 Runners-Up' :
          iplOutcome === 'eliminated'    ? '⚡ Playoff exit' :
          iplOutcome === 'not_qualified' ? (iplPosition ? `${ordinal(iplPosition)} place` : '❌ Missed Playoffs') :
          stageReached === 'Champion'    ? '🏆 World Champions' :
          stageReached === 'Runner-up'   ? '🥈 Final (Runner-up)' :
          stageReached === 'Final'       ? '🏟 Reached the Final' :
          stageReached === 'Semi-Final'  ? '⚡ Semi-Final exit' :
          stageReached === 'Super 8'     ? '📋 Super 8 exit' :
          stageReached === 'Group Stage' ? '❌ Group Stage exit' :
          'Season complete'

        const exceeded = isChampion || isRunnerup || isFinal || isSemi || isElim

        return (
          <div style={{
            background: 'linear-gradient(135deg, #0a0f1a 0%, #0d180d 100%)',
            border: '1px solid #1e3a2e',
            borderRadius: '1rem',
            padding: '1.25rem',
            animation: 'fade-in-up 0.3s ease both',
          }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#1F6FEB', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1rem', textAlign: 'center' }}>
              ⚡ Season Story
            </div>

            {/* Predicted → Actual */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch', marginBottom: '1.25rem' }}>
              {/* Predicted box */}
              <div style={{ flex: 1, textAlign: 'center', background: '#12121a', border: '1px solid #2a2a3a', borderRadius: '0.75rem', padding: '0.875rem 0.5rem' }}>
                <div style={{ fontSize: '0.5rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>Predicted</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#64748b', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{predictedPos}</div>
                <div style={{ fontSize: '0.55rem', color: '#2a2a3a', marginTop: '0.25rem', fontWeight: 600 }}>{predictedShort}</div>
              </div>

              {/* Arrow */}
              <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, padding: '0 0.1rem' }}>
                <div style={{ fontSize: '1.25rem', color: exceeded ? '#1F6FEB' : '#ef4444', fontWeight: 900 }}>
                  {exceeded ? '→' : '→'}
                </div>
              </div>

              {/* Actual box */}
              <div style={{
                flex: 1, textAlign: 'center',
                background: isChampion ? 'linear-gradient(135deg, #1a1200, #0f0900)' : '#12121a',
                border: `2px solid ${actualColor}44`,
                borderRadius: '0.75rem', padding: '0.875rem 0.5rem',
                boxShadow: isChampion ? `0 0 20px ${actualColor}18` : 'none',
              }}>
                <div style={{ fontSize: '0.5rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>Actual</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: actualColor, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{actualLabel}</div>
              </div>
            </div>

            {/* Color-coded narrative */}
            <div style={{ fontSize: '0.82rem', lineHeight: 1.75, fontStyle: 'italic', borderTop: '1px solid #1e3a2e', paddingTop: '0.875rem' }}>
              {perfWriteup.map((seg, i) => (
                <span key={i} style={{
                  color: seg.tone === 'positive' ? '#4ade80' : seg.tone === 'negative' ? '#f87171' : '#94a3b8',
                }}>
                  {seg.text}{' '}
                </span>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Awards tab ────────────────────────────────────────────────────────────

function OverviewTab({ potm, topScorers, topWicketTakers, tournamentBestXI, bestXI, team }) {
  const top3bat  = topScorers.slice(0, 3)
  const top3bowl = topWicketTakers.slice(0, 3)
  const medals   = ['🥇', '🥈', '🥉']

  // Tournament XI entries — only user's players, capped by stage reached
  const xiEntries = tournamentBestXI

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', animation: 'fade-in 0.3s ease both' }}>

      {/* Best Overall Player */}
      {potm && (
        <div style={{
          background: 'linear-gradient(135deg, #1a1200, #0f0d00)',
          border: '2px solid #f59e0b44',
          borderRadius: '1rem', padding: '1.25rem',
          display: 'flex', alignItems: 'center', gap: '1rem',
        }}>
          <div style={{ fontSize: '2.5rem' }}>🏅</div>
          <div>
            <div style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>Player of the Tournament</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#f1f5f9' }}>{potm}</div>
            <div style={{ fontSize: '0.7rem', color: '#f59e0b88', marginTop: '0.1rem' }}>From your XI · Top combined impact</div>
          </div>
        </div>
      )}

      {/* Top 3 Batsmen + Top 3 Wicket-Takers side-by-side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
        {/* Top 3 Batsmen */}
        {top3bat.length > 0 && (
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#1F6FEB', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem', paddingLeft: '0.25rem' }}>
              🏏 Top Batters
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {top3bat.map((p, i) => (
                <div key={p.name} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.625rem 0.75rem',
                  background: i === 0 ? '#0d2418' : '#12121a',
                  border: `1px solid ${i === 0 ? '#1F6FEB44' : '#2a2a3a'}`,
                  borderRadius: '0.625rem',
                }}>
                  <div style={{ fontSize: i === 0 ? '1rem' : '0.8rem', width: 20, textAlign: 'center', flexShrink: 0 }}>{medals[i]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: i === 0 ? '1rem' : '0.85rem', fontWeight: 900, color: i === 0 ? '#1F6FEB' : '#94a3b8' }}>{p.runs} <span style={{ fontSize: '0.52rem', color: '#64748b', fontWeight: 600 }}>runs</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top 3 Wicket-Takers */}
        {top3bowl.length > 0 && (
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem', paddingLeft: '0.25rem' }}>
              🎯 Top Bowlers
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {top3bowl.map((p, i) => (
                <div key={p.name} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.625rem 0.75rem',
                  background: i === 0 ? '#130d1f' : '#12121a',
                  border: `1px solid ${i === 0 ? '#a855f744' : '#2a2a3a'}`,
                  borderRadius: '0.625rem',
                }}>
                  <div style={{ fontSize: i === 0 ? '1rem' : '0.8rem', width: 20, textAlign: 'center', flexShrink: 0 }}>{medals[i]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: i === 0 ? '1rem' : '0.85rem', fontWeight: 900, color: i === 0 ? '#a855f7' : '#94a3b8' }}>{p.wickets} <span style={{ fontSize: '0.52rem', color: '#64748b', fontWeight: 600 }}>wkts</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tournament Best XI — only user's players, capped by stage reached */}
      <div>
        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.625rem', paddingLeft: '0.25rem' }}>
          🌟 Tournament Best XI
        </div>
        {xiEntries.length === 0 ? (
          <div style={{ background: '#12121a', border: '1px solid #2a2a3a', borderRadius: '0.875rem', padding: '1.25rem', textAlign: 'center', color: '#64748b', fontSize: '0.75rem', fontStyle: 'italic' }}>
            No players made the tournament XI — the team was eliminated too early.
          </div>
        ) : (
          <div style={{ background: '#12121a', border: '1px solid #2a2a3a', borderRadius: '0.875rem', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {xiEntries.map((p, i) => {
              const roleClr = ROLE_COLOR[p.role] ?? '#64748b'
              const roleTag = ROLE_LABEL[p.role] ?? 'BAT'
              const isUser  = p.isUser || p.team === 'Your XI'
              return (
                <div key={`${p.name}-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.55rem 0.875rem',
                  borderBottom: i < xiEntries.length - 2 ? '1px solid #1a1a26' : 'none',
                  borderRight: i % 2 === 0 ? '1px solid #1a1a26' : 'none',
                  background: isUser ? '#1F6FEB08' : '#3b82f608',
                  borderLeft: `3px solid ${isUser ? '#1F6FEB44' : '#3b82f644'}`,
                }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#2a2a3a', width: 16, textAlign: 'center', flexShrink: 0 }}>{i+1}</div>
                  <div style={{ padding: '0.1rem 0.3rem', borderRadius: '0.2rem', flexShrink: 0, background: roleClr + '22', border: `1px solid ${roleClr}44`, fontSize: '0.45rem', fontWeight: 900, color: roleClr, minWidth: 30, textAlign: 'center' }}>
                    {roleTag}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: '0.55rem', color: isUser ? '#1F6FEB' : '#64748b', fontWeight: isUser ? 700 : 400 }}>
                      {isUser ? 'Your XI' : p.team}
                    </div>
                  </div>
                </div>
              )
            })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatTable({ title, rows, col1, col1Key, col2, col2Key, color }) {
  if (!rows || rows.length === 0) return null
  return (
    <div style={{ background: '#12121a', border: '1px solid #2a2a3a', borderRadius: '0.875rem', overflow: 'hidden' }}>
      <div style={{
        padding: '0.75rem 1.25rem', borderBottom: '1px solid #1a1a26',
        fontSize: '0.8rem', fontWeight: 800, color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {title}
      </div>
      {rows.map((r, i) => (
        <div key={r.name} style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.625rem 1.25rem',
          borderBottom: i < rows.length - 1 ? '1px solid #1a1a26' : 'none',
          background: i === 0 ? color + '08' : 'transparent',
        }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 900, color: i === 0 ? color : '#2a2a3a', width: 20 }}>
            {i === 0 ? '👑' : `${i + 1}`}
          </div>
          <div style={{ flex: 1, fontSize: '0.875rem', fontWeight: 700, color: '#f1f5f9' }}>{r[col1Key]}</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900, color: i === 0 ? color : '#94a3b8' }}>{r[col2Key]}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Tournament XI tab ────────────────────────────────────────────────────────

function TournamentXITab({ tournamentBestXI }) {
  const entries = tournamentBestXI

  return (
    <div style={{ animation: 'fade-in 0.3s ease both' }}>
      <div style={{ background: '#12121a', border: '1px solid #2a2a3a', borderRadius: '0.875rem', overflow: 'hidden' }}>
        <div style={{
          padding: '0.75rem 1.25rem', borderBottom: '1px solid #1a1a26',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>🌟 Tournament Best XI</span>
          <span style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>ranked by impact</span>
        </div>
        {entries.length === 0 ? (
          <div style={{ padding: '2rem 1.25rem', textAlign: 'center', color: '#64748b', fontSize: '0.78rem', fontStyle: 'italic' }}>
            No players made the tournament XI — the team was eliminated too early.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {entries.map((p, i) => {
              const roleClr = ROLE_COLOR[p.role] ?? '#64748b'
              const roleTag = ROLE_LABEL[p.role] ?? 'BAT'
              const isUser  = p.isUser || p.team === 'Your XI'
              return (
                <div key={`${p.name}-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.65rem 1rem',
                  borderBottom: i < entries.length - 2 ? '1px solid #1a1a26' : 'none',
                  borderRight: i % 2 === 0 ? '1px solid #1a1a26' : 'none',
                  background: isUser ? '#1F6FEB08' : '#3b82f608',
                  borderLeft: `3px solid ${isUser ? '#1F6FEB44' : '#3b82f644'}`,
                }}>
                  {/* Number */}
                  <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#2a2a3a', width: 18, textAlign: 'center', flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  {/* Role badge */}
                  <div style={{
                    padding: '0.1rem 0.3rem', borderRadius: '0.2rem', flexShrink: 0,
                    background: roleClr + '22', border: `1px solid ${roleClr}44`,
                    fontSize: '0.48rem', fontWeight: 900, color: roleClr,
                    minWidth: 32, textAlign: 'center',
                  }}>
                    {roleTag}
                  </div>
                  {/* Name + team label */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: '0.58rem', color: isUser ? '#1F6FEB' : '#64748b', fontWeight: isUser ? 700 : 400 }}>
                      {isUser ? 'Your XI' : p.team}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Player Stats tab ────────────────────────────────────────────────────────

function PlayerStatsTab({ playerStats, team }) {
  const isBatter  = r => ['opener','top-order','middle-order','wicket-keeper'].includes(r)
  const isBowler  = r => ['pace-bowler','spin-bowler'].includes(r)
  const isAllRndr = r => r === 'all-rounder'

  const rows = (playerStats && playerStats.length > 0)
    ? playerStats
    : (team || []).map(p => ({ name: p.name, role: p.role, runs: 0, balls: 0, sr: '—', wickets: 0, bowlBalls: 0, bowlRuns: 0, economy: '—' }))

  const thStyle = {
    padding: '0.5rem 0.5rem',
    fontSize: '0.52rem', fontWeight: 800, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.07em',
    textAlign: 'right', whiteSpace: 'nowrap',
    borderBottom: '1px solid #1a1a26',
  }
  const thLeft = { ...thStyle, textAlign: 'left' }
  const tdStyle = { padding: '0.55rem 0.5rem', fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8', textAlign: 'right', verticalAlign: 'middle' }
  const tdLeft = { ...tdStyle, textAlign: 'left' }

  return (
    <div style={{ animation: 'fade-in 0.3s ease both' }}>
      <div style={{ background: '#12121a', border: '1px solid #2a2a3a', borderRadius: '0.875rem', overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #1a1a26', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>🏏 Player Stats</span>
          <span style={{ fontSize: '0.6rem', color: '#2a2a3a', fontWeight: 600, marginLeft: 'auto' }}>Full season totals</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 340 }}>
            <thead>
              <tr style={{ background: '#0e0e18' }}>
                <th style={thLeft}>Player</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Runs</th>
                <th style={thStyle}>SR</th>
                <th style={thStyle}>Wkts</th>
                <th style={thStyle}>Econ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const roleClr = ROLE_COLOR[p.role] ?? '#64748b'
                const roleTag = ROLE_LABEL[p.role] ?? 'BAT'
                const showBat  = isBatter(p.role) || isAllRndr(p.role)
                const showBowl = isBowler(p.role) || isAllRndr(p.role)
                return (
                  <tr key={p.name} style={{ borderBottom: i < rows.length - 1 ? '1px solid #1a1a26' : 'none', background: i % 2 === 0 ? 'transparent' : '#0e0e1488' }}>
                    <td style={{ ...tdLeft, color: '#f1f5f9', fontWeight: 700, whiteSpace: 'nowrap' }}>{p.name}</td>
                    <td style={tdStyle}>
                      <span style={{ padding: '0.1rem 0.35rem', borderRadius: '0.2rem', background: roleClr + '22', border: `1px solid ${roleClr}44`, fontSize: '0.48rem', fontWeight: 900, color: roleClr }}>
                        {roleTag}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: showBat && p.runs > 0 ? '#1F6FEB' : '#2a2a3a', fontWeight: showBat && p.runs > 0 ? 800 : 400 }}>
                      {showBat ? (p.runs || 0) : '—'}
                    </td>
                    <td style={{ ...tdStyle, color: showBat && p.sr !== '—' ? '#86efac' : '#2a2a3a' }}>
                      {showBat ? p.sr : '—'}
                    </td>
                    <td style={{ ...tdStyle, color: showBowl && p.wickets > 0 ? '#a855f7' : '#2a2a3a', fontWeight: showBowl && p.wickets > 0 ? 800 : 400 }}>
                      {showBowl ? (p.wickets || 0) : '—'}
                    </td>
                    <td style={{ ...tdStyle, color: showBowl && p.economy !== '—' ? '#c084fc' : '#2a2a3a' }}>
                      {showBowl ? p.economy : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Matches tab ────────────────────────────────────────────────────────────

function MatchesTab({ matchResults }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', animation: 'fade-in 0.3s ease both' }}>
      {(matchResults || []).map((r, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.75rem 1rem',
          background: r.won ? '#0d2418' : '#1a0d0d',
          border: `1px solid ${r.won ? '#0047CC44' : '#7f1d1d44'}`,
          borderRadius: '0.625rem',
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: '#1a1a26',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.65rem', fontWeight: 800, color: '#64748b', flexShrink: 0,
          }}>{r.matchNum}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.58rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{r.stage}</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f1f5f9' }}>vs {r.opponent}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', color: r.won ? '#0047CC' : '#dc2626', fontWeight: 700 }}>{r.summary}</div>
            <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{r.myScore} · {r.oppScore}</div>
          </div>
          <div style={{
            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
            background: r.won ? '#1F6FEB22' : '#ef444422',
            border: `1px solid ${r.won ? '#1F6FEB66' : '#ef444466'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.65rem', fontWeight: 900, color: r.won ? '#1F6FEB' : '#ef4444',
          }}>
            {r.won ? 'W' : 'L'}
          </div>
        </div>
      ))}
    </div>
  )
}
