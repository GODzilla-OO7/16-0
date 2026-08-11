/**
 * SharedLeague — real-time shared IPL league for H2H mode.
 * Both players advance match by match together; host controls pacing.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { getSupabase } from '../lib/supabase.js'
import { getLiveStandings } from '../utils/sharedTournament.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROLE_COLOR = {
  'opener': '#f59e0b', 'top-order': '#f59e0b',
  'middle-order': '#22c55e', 'wicket-keeper': '#a78bfa',
  'all-rounder': '#4169E1', 'pace-bowler': '#ef4444', 'spin-bowler': '#f97316',
}

function Card({ style, children }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: '0.875rem', ...style,
    }}>
      {children}
    </div>
  )
}

function Label({ children, color = '#64748b' }) {
  return (
    <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color, marginBottom: '0.3rem' }}>
      {children}
    </div>
  )
}

// ─── Match result card ────────────────────────────────────────────────────────

function MatchCard({ fixture, playerName, isMe, isH2H }) {
  if (!fixture) return null
  const won = fixture.won

  return (
    <div style={{
      flex: 1,
      padding: '0.875rem',
      background: won ? '#0d1a0d' : '#1a0808',
      border: `1px solid ${won ? '#22c55e44' : '#ef444433'}`,
      borderRadius: '0.75rem',
      animation: 'fade-in 0.4s ease both',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <div>
          <div style={{ fontSize: '0.62rem', fontWeight: 800, color: isMe ? '#4169E1' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' }}>
            {playerName} {isMe ? '(you)' : ''}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            vs {isH2H ? <span style={{ color: '#f59e0b', fontWeight: 700 }}>⚔️ {fixture.opponent}</span> : fixture.opponent}
          </div>
        </div>
        <span style={{
          fontSize: '0.65rem', fontWeight: 800, padding: '0.15rem 0.5rem',
          borderRadius: '999px',
          background: won ? '#22c55e22' : '#ef444422',
          color: won ? '#22c55e' : '#ef4444',
        }}>
          {won ? 'WIN' : 'LOSS'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--text)' }}>
          {fixture.my_runs}/{fixture.my_wickets}
        </div>
        <div style={{ color: '#475569', fontSize: '0.8rem' }}>vs</div>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#64748b' }}>
          {fixture.opp_runs}/{fixture.opp_wickets}
        </div>
      </div>
      <div style={{ fontSize: '0.68rem', color: won ? '#86efac' : '#fca5a5', fontWeight: 600, marginTop: '0.25rem' }}>
        {fixture.margin}
      </div>
    </div>
  )
}

// ─── H2H battle reveal ────────────────────────────────────────────────────────

function H2HBattleCard({ tournament, h2hResult }) {
  const { host_name, guest_name, host_fixtures, guest_fixtures, h2h_match_idx } = tournament
  const hF = host_fixtures[h2h_match_idx]
  const gF = guest_fixtures[h2h_match_idx]

  return (
    <div style={{
      padding: '1.25rem',
      background: 'linear-gradient(135deg, #0d1225, #12091f)',
      border: '1px solid #f59e0b44',
      borderRadius: '1rem',
      textAlign: 'center',
      animation: 'fade-in-up 0.5s ease both',
      marginBottom: '1rem',
    }}>
      <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
        ⚔️ Head to Head Match
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center', marginBottom: '1rem' }}>
        <div style={{ flex: 1, textAlign: 'right' }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 900, color: h2hResult.host_won ? '#22c55e' : '#64748b' }}>{host_name}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)' }}>{h2hResult.host_runs}<span style={{ fontSize: '0.9rem', color: '#64748b' }}>/{h2hResult.host_wickets}</span></div>
        </div>
        <div style={{ fontSize: '1.2rem', color: '#f59e0b', fontWeight: 900, flexShrink: 0 }}>vs</div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 900, color: !h2hResult.host_won ? '#22c55e' : '#64748b' }}>{guest_name}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)' }}>{h2hResult.guest_runs}<span style={{ fontSize: '0.9rem', color: '#64748b' }}>/{h2hResult.guest_wickets}</span></div>
        </div>
      </div>
      <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#f59e0b' }}>
        {h2hResult.host_won ? `🏆 ${host_name} wins` : `🏆 ${guest_name} wins`} · {h2hResult.margin}
      </div>
    </div>
  )
}

// ─── Points table ─────────────────────────────────────────────────────────────

function PointsTable({ tournament, revealedMatches }) {
  const standings = getLiveStandings(tournament, revealedMatches)
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.875rem', overflow: 'hidden', marginBottom: '1rem' }}>
      <div style={{ padding: '0.6rem 0.875rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Points Table</span>
        <span style={{ fontSize: '0.62rem', color: '#475569' }}>After match {revealedMatches}</span>
      </div>
      {standings.map((row, i) => (
        <div key={row.name} style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.45rem 0.875rem',
          borderBottom: i < standings.length - 1 ? '1px solid var(--border2)' : 'none',
          background: row.is_host || row.is_guest ? 'rgba(31,111,235,0.06)' : 'transparent',
        }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: i < 4 ? '#f59e0b' : '#475569', width: 14, flexShrink: 0 }}>{i + 1}</span>
          <span style={{
            flex: 1, fontSize: '0.75rem', fontWeight: row.is_host || row.is_guest ? 800 : 500,
            color: row.is_host ? '#4169E1' : row.is_guest ? '#a78bfa' : 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {row.is_host ? '🏠 ' : row.is_guest ? '🚪 ' : ''}{row.name}
          </span>
          <span style={{ fontSize: '0.68rem', color: '#64748b', width: 28, textAlign: 'center' }}>{row.wins}W</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#f59e0b', width: 28, textAlign: 'right' }}>{row.points}</span>
        </div>
      ))}
      <div style={{ padding: '0.35rem 0.875rem', fontSize: '0.58rem', color: '#2a3855', fontStyle: 'italic' }}>
        Top 4 qualify for playoffs · AI standings scaled to match {revealedMatches}/14
      </div>
    </div>
  )
}

// ─── Playoff bracket ─────────────────────────────────────────────────────────

function PlayoffMatchRow({ label, match, revealed }) {
  if (!match) return null
  return (
    <div style={{
      padding: '0.75rem 1rem',
      background: revealed ? 'var(--card)' : 'transparent',
      border: `1px solid ${revealed ? 'var(--border)' : 'transparent'}`,
      borderRadius: '0.625rem',
      marginBottom: '0.625rem',
      opacity: revealed ? 1 : 0.3,
      transition: 'opacity 0.4s ease, background 0.4s ease',
    }}>
      <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: match.winner === match.teamA ? 900 : 500, color: match.winner === match.teamA ? 'var(--text)' : '#64748b' }}>
          {match.teamA}
        </span>
        <span style={{ fontSize: '0.7rem', color: '#475569' }}>{match.a_runs}/{match.a_wickets}</span>
        <span style={{ color: '#2a3855', fontSize: '0.7rem' }}>vs</span>
        <span style={{ fontSize: '0.7rem', color: '#475569' }}>{match.b_runs}/{match.b_wickets}</span>
        <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: match.winner === match.teamB ? 900 : 500, color: match.winner === match.teamB ? 'var(--text)' : '#64748b', textAlign: 'right' }}>
          {match.teamB}
        </span>
      </div>
      {revealed && (
        <div style={{ fontSize: '0.68rem', color: '#22c55e', fontWeight: 700, marginTop: '0.25rem' }}>
          🏆 {match.winner} won by {match.margin}
        </div>
      )}
    </div>
  )
}

function PlayoffView({ tournament, playoffs, isMe, onReady, myReady, oppReady }) {
  const stage = playoffs.current_stage  // 0=Q1+Elim, 1=Q2, 2=Final, 3=done

  return (
    <div style={{ padding: '0 1rem 1.5rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🏆</div>
        <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text)' }}>IPL Playoffs</div>
        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.25rem' }}>Top 4 teams battle for the title</div>
      </div>

      {/* Standings summary — top 4 */}
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {tournament.final_standings.slice(0, 4).map((row, i) => (
          <div key={row.name} style={{
            flex: '1 1 40%',
            padding: '0.5rem 0.75rem',
            background: row.is_host || row.is_guest ? 'rgba(31,111,235,0.1)' : 'var(--card)',
            border: `1px solid ${row.is_host || row.is_guest ? '#4169E144' : 'var(--border)'}`,
            borderRadius: '0.5rem',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '0.6rem', color: '#f59e0b', fontWeight: 800 }}>#{i + 1}</div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.name}
            </div>
            <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{row.wins}W — {row.points}pts</div>
          </div>
        ))}
      </div>

      {/* Bracket */}
      <PlayoffMatchRow label="Qualifier 1 (1st vs 2nd — winner to Final)" match={playoffs.q1}    revealed={stage >= 1} />
      <PlayoffMatchRow label="Eliminator  (3rd vs 4th — loser is out)"    match={playoffs.elim}  revealed={stage >= 1} />
      <PlayoffMatchRow label="Qualifier 2 (Q1 loser vs Elim winner)"      match={playoffs.q2}    revealed={stage >= 2} />
      <PlayoffMatchRow label="Final"                                        match={playoffs.final} revealed={stage >= 3} />

      {/* Champion reveal */}
      {stage >= 3 && (
        <div style={{
          marginTop: '1rem', padding: '1.5rem', textAlign: 'center',
          background: 'linear-gradient(135deg, #0d1225, #12091f)',
          border: '1px solid #f59e0b55',
          borderRadius: '1rem',
          animation: 'fade-in-up 0.5s ease both',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏆</div>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>IPL Champions</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#f59e0b' }}>{playoffs.champion}</div>
        </div>
      )}

      {/* Ready controls */}
      {stage < 3 && (
        <ReadyControls
          matchLabel={stage === 0 ? 'Reveal Q1 + Eliminator' : stage === 1 ? 'Reveal Qualifier 2' : 'Reveal the Final'}
          isMe={isMe}
          myReady={myReady}
          oppReady={oppReady}
          onReady={onReady}
        />
      )}
    </div>
  )
}

// ─── Ready button row ─────────────────────────────────────────────────────────

function ReadyControls({ matchLabel, isMe, myReady, oppReady, onReady }) {
  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{
          flex: 1, padding: '0.45rem 0.75rem', borderRadius: '0.5rem', textAlign: 'center',
          background: myReady ? '#0d1a0d' : 'var(--card)',
          border: `1px solid ${myReady ? '#22c55e55' : 'var(--border)'}`,
          fontSize: '0.7rem', fontWeight: 700,
          color: myReady ? '#22c55e' : '#64748b',
        }}>
          {myReady ? '✅ You' : '⏳ You'}
        </div>
        <div style={{
          flex: 1, padding: '0.45rem 0.75rem', borderRadius: '0.5rem', textAlign: 'center',
          background: oppReady ? '#0d1a0d' : 'var(--card)',
          border: `1px solid ${oppReady ? '#22c55e55' : 'var(--border)'}`,
          fontSize: '0.7rem', fontWeight: 700,
          color: oppReady ? '#22c55e' : '#64748b',
        }}>
          {oppReady ? '✅ Opponent' : '⏳ Opponent'}
        </div>
      </div>
      {!myReady && (
        <button
          onClick={onReady}
          style={{
            width: '100%', padding: '0.8rem',
            background: 'linear-gradient(135deg, #4169E1, #2952CC)',
            color: '#fff', border: 'none', borderRadius: '0.625rem',
            fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          {matchLabel} →
        </button>
      )}
      {myReady && !oppReady && (
        <div style={{ padding: '0.75rem', textAlign: 'center', color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>
          Waiting for opponent…
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SharedLeague({ room: initialRoom, uid, onBack }) {
  const [room, setRoom]         = useState(initialRoom)
  const roomRef                 = useRef(initialRoom)
  const channelRef              = useRef(null)
  const [showTable, setShowTable] = useState(false)

  const tournament = room.tournament
  const isHost     = room.host_id === uid
  const isMe       = isHost  // used for display labelling

  const applyRoomUpdate = useCallback((updated) => {
    roomRef.current = updated
    setRoom(updated)
  }, [])

  // ── Supabase subscription ─────────────────────────────────────────────────
  useEffect(() => {
    getSupabase().then(sb => {
      if (!sb) return
      channelRef.current = sb
        .channel(`shared_league_${room.id}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'h2h_rooms', filter: `id=eq.${room.id}`,
        }, payload => applyRoomUpdate(payload.new))
        .subscribe()
    })
    return () => channelRef.current?.unsubscribe()
  }, [room.id])

  // Polling fallback
  useEffect(() => {
    const poll = setInterval(async () => {
      const sb = await getSupabase()
      if (!sb) return
      const { data } = await sb.from('h2h_rooms').select('*').eq('id', room.id).single()
      if (data) applyRoomUpdate(data)
    }, 3000)
    return () => clearInterval(poll)
  }, [room.id])

  // ── Host advances when both ready ─────────────────────────────────────────
  useEffect(() => {
    if (!isHost || !tournament) return
    const t = tournament
    const inLeague   = t.phase === 'league'
    const inPlayoffs = t.phase === 'playoffs'
    const leagueReady   = inLeague   && t.host_ready && t.guest_ready
    const playoffReady  = inPlayoffs && t.playoffs?.host_ready && t.playoffs?.guest_ready
    if (!leagueReady && !playoffReady) return

    async function advance() {
      const sb = await getSupabase()
      if (!sb) return
      const { data } = await sb.from('h2h_rooms').select('tournament').eq('id', room.id).single()
      const latest = data?.tournament
      if (!latest?.host_ready || !latest?.guest_ready) return  // already advanced

      let newT = { ...latest, host_ready: false, guest_ready: false }

      if (inLeague) {
        const nextMatch = (latest.current_match ?? 0) + 1
        if (nextMatch >= 14) {
          newT.phase         = 'playoffs'
          newT.current_match = 14
        } else {
          newT.current_match = nextMatch
        }
      } else if (inPlayoffs) {
        const playoffs  = { ...latest.playoffs }
        const nextStage = (playoffs.current_stage ?? 0) + 1
        playoffs.current_stage = nextStage
        playoffs.host_ready    = false
        playoffs.guest_ready   = false
        if (nextStage >= 3) {
          newT.phase = 'done'
        }
        newT.playoffs = playoffs
      }

      await sb.from('h2h_rooms').update({ tournament: newT }).eq('id', room.id)
    }

    advance()
  }, [tournament?.host_ready, tournament?.guest_ready, tournament?.playoffs?.host_ready, tournament?.playoffs?.guest_ready, tournament?.phase])

  // ── Set ready flag ────────────────────────────────────────────────────────
  async function clickReady() {
    const sb = await getSupabase()
    if (!sb) return
    const t = roomRef.current?.tournament
    if (!t) return

    const inLeague   = t.phase === 'league'
    const inPlayoffs = t.phase === 'playoffs'

    for (let attempt = 0; attempt < 4; attempt++) {
      const { data } = await sb.from('h2h_rooms').select('tournament').eq('id', room.id).single()
      const latest = data?.tournament
      if (!latest) return

      if (inLeague) {
        const myField = isHost ? 'host_ready' : 'guest_ready'
        if (latest[myField]) return  // already set
        const newT = { ...latest, [myField]: true }
        await sb.from('h2h_rooms').update({ tournament: newT }).eq('id', room.id)
      } else if (inPlayoffs) {
        const playoffs  = { ...latest.playoffs }
        const myField   = isHost ? 'host_ready' : 'guest_ready'
        if (playoffs[myField]) return
        playoffs[myField] = true
        const newT = { ...latest, playoffs }
        await sb.from('h2h_rooms').update({ tournament: newT }).eq('id', room.id)
      }

      await new Promise(r => setTimeout(r, 100 + attempt * 80))
      break
    }
  }

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!tournament) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
          <div>Setting up the league…</div>
        </div>
      </div>
    )
  }

  const t             = tournament
  const phase         = t.phase
  const currentMatch  = t.current_match ?? 0
  const h2hIdx        = t.h2h_match_idx
  const myReady       = isHost ? (t.host_ready ?? false) : (t.guest_ready ?? false)
  const oppReady      = isHost ? (t.guest_ready ?? false) : (t.host_ready ?? false)

  const myName        = isHost ? t.host_name : t.guest_name
  const oppName       = isHost ? t.guest_name : t.host_name
  const myFixtures    = isHost ? t.host_fixtures : t.guest_fixtures
  const oppFixtures   = isHost ? t.guest_fixtures : t.host_fixtures

  // Derive per-match label
  const isH2HMatch    = currentMatch === h2hIdx
  const myFix         = myFixtures?.[currentMatch]
  const oppFix        = oppFixtures?.[currentMatch]

  // My record so far (revealed matches)
  const myWins    = (myFixtures  ?? []).slice(0, currentMatch).filter(f => f?.won).length
  const oppWins   = (oppFixtures ?? []).slice(0, currentMatch).filter(f => f?.won).length

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <div style={{
        padding: '0.75rem 1.25rem',
        borderBottom: '1px solid var(--border2)',
        background: 'var(--card)',
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '0.375rem', color: '#64748b', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', padding: '0.3rem 0.6rem', flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = '#64748b' }}
        >
          ← Exit
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--text)' }}>🏏 IPL Shared League</div>
          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
            {phase === 'league'
              ? `Match ${currentMatch + 1} of 14 · ${myName}: ${myWins}W  ${oppName}: ${oppWins}W`
              : phase === 'playoffs' ? 'Playoffs' : '🏆 Season Complete'}
          </div>
        </div>
        {phase === 'league' && (
          <button
            onClick={() => setShowTable(v => !v)}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '0.375rem', color: '#64748b', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', padding: '0.3rem 0.6rem', flexShrink: 0 }}
          >
            📊 {showTable ? 'Hide' : 'Table'}
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ maxWidth: 520, width: '100%', margin: '0 auto', padding: '1rem 1rem 2rem', flex: 1 }}>

        {/* ── LEAGUE PHASE ── */}
        {phase === 'league' && (
          <>
            {/* Points table (toggle) */}
            {showTable && <PointsTable tournament={t} revealedMatches={currentMatch} />}

            {/* H2H special banner */}
            {isH2HMatch && myFix && (
              <H2HBattleCard tournament={t} h2hResult={t.h2h_result} />
            )}

            {/* Match N reveal */}
            {!isH2HMatch && (
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem', paddingLeft: '0.125rem' }}>
                  Match {currentMatch + 1} results
                </div>
                <div style={{ display: 'flex', gap: '0.625rem' }}>
                  <MatchCard fixture={myFix}  playerName={myName}  isMe={true}  isH2H={false} />
                  <MatchCard fixture={oppFix} playerName={oppName} isMe={false} isH2H={false} />
                </div>
              </div>
            )}

            {/* Score so far */}
            {currentMatch > 0 && (
              <div style={{
                display: 'flex', gap: '0.5rem', marginBottom: '0.875rem',
                padding: '0.625rem 0.875rem',
                background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.625rem',
              }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.6rem', color: '#4169E1', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{myName}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)' }}>{myWins}<span style={{ fontSize: '0.7rem', color: '#64748b' }}>W</span></div>
                </div>
                <div style={{ borderLeft: '1px solid var(--border)', flexShrink: 0 }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.6rem', color: '#a78bfa', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{oppName}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)' }}>{oppWins}<span style={{ fontSize: '0.7rem', color: '#64748b' }}>W</span></div>
                </div>
                <div style={{ borderLeft: '1px solid var(--border)', flexShrink: 0 }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Matches</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f59e0b' }}>{currentMatch}<span style={{ fontSize: '0.7rem', color: '#64748b' }}>/14</span></div>
                </div>
              </div>
            )}

            {/* Coming up */}
            {currentMatch < 13 && !isH2HMatch && (
              <div style={{ fontSize: '0.7rem', color: '#2a3855', marginBottom: '0.75rem', paddingLeft: '0.125rem' }}>
                {currentMatch + 1 === h2hIdx
                  ? '⚔️ Next: Your head-to-head clash!'
                  : currentMatch + 1 < h2hIdx
                  ? `⚔️ Head to head in ${h2hIdx - currentMatch - 1} match${h2hIdx - currentMatch - 1 !== 1 ? 'es' : ''}`
                  : null}
              </div>
            )}

            {/* Ready controls */}
            <ReadyControls
              matchLabel={currentMatch >= 13 ? 'Go to Playoffs →' : `Reveal Match ${currentMatch + 2} →`}
              isMe={isMe}
              myReady={myReady}
              oppReady={oppReady}
              onReady={clickReady}
            />
          </>
        )}

        {/* ── PLAYOFFS PHASE ── */}
        {phase === 'playoffs' && t.playoffs && (
          <PlayoffView
            tournament={t}
            playoffs={t.playoffs}
            isMe={isMe}
            myReady={isHost ? (t.playoffs.host_ready ?? false) : (t.playoffs.guest_ready ?? false)}
            oppReady={isHost ? (t.playoffs.guest_ready ?? false) : (t.playoffs.host_ready ?? false)}
            onReady={clickReady}
          />
        )}

        {/* ── DONE ── */}
        {phase === 'done' && t.playoffs && (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '0.5rem' }}>🏆</div>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>IPL Champions</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#f59e0b', marginBottom: '0.75rem' }}>{t.playoffs.champion}</div>
            <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.5rem' }}>
              {t.playoffs.champion === myName
                ? "You did it. What a run through the shared league!"
                : t.playoffs.champion === oppName
                ? "They got the trophy this time. Run it back?"
                : "What a tournament — rematch?"}
            </div>
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                {[
                  { label: myName, wins: myFixtures.filter(f => f?.won).length },
                  { label: oppName, wins: oppFixtures.filter(f => f?.won).length },
                ].map(p => (
                  <div key={p.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700 }}>{p.label}</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)' }}>{p.wins}W</div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{14 - p.wins}L</div>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={onBack}
              style={{
                marginTop: '1.5rem', width: '100%', padding: '0.875rem',
                background: 'linear-gradient(135deg, #4169E1, #2952CC)',
                color: '#fff', border: 'none', borderRadius: '0.625rem',
                fontSize: '1rem', fontWeight: 800, cursor: 'pointer',
              }}
            >
              🏏 Play Again →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
