import { useState, useEffect, Component } from 'react'
import { MODE_CONFIG, POSITIONS } from './data/players.js'
import ModeSelect from './components/ModeSelect.jsx'
import DraftSettings from './components/DraftSettings.jsx'
import ManagerSelect from './components/ManagerSelect.jsx'
import WheelSpin from './components/WheelSpin.jsx'
import TeamSheet from './components/TeamSheet.jsx'
import TeamStrengthPanel from './components/TeamStrengthPanel.jsx'
import MatchSimulator from './components/MatchSimulator.jsx'
import Results from './components/Results.jsx'
import ProfileModal from './components/ProfileModal.jsx'
import AuthModal from './components/AuthModal.jsx'
import UserProfile from './components/UserProfile.jsx'
import SquadComposer from './components/SquadComposer.jsx'
import RetentionScreen from './components/RetentionScreen.jsx'
import DailyChallenge from './components/DailyChallenge.jsx'
import H2HLobby from './components/H2HLobby.jsx'
import H2HDraft from './components/H2HDraft.jsx'
import SharedLeague from './components/SharedLeague.jsx'
import { STARTING_BUDGET } from './components/WheelSpin.jsx'
import { recordSeason, loadProfile } from './hooks/useProfile.js'
import { useAuth, saveGameResult, incrementTotalPlays, signInWithGoogle } from './hooks/useAuth.js'
import { generateTournament } from './utils/sharedTournament.js'
import { getSupabase } from './lib/supabase.js'

// Error boundary — catches H2HDraft crashes and shows a recoverable error screen
class H2HErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('[H2H crash]', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem' }}>⚠️</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)' }}>H2H Draft crashed</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', fontFamily: 'monospace', background: 'var(--card)', padding: '0.75rem', borderRadius: '0.5rem', maxWidth: 480, wordBreak: 'break-all' }}>
            {this.state.error?.message ?? String(this.state.error)}
          </div>
          <button
            onClick={() => { this.setState({ error: null }); this.props.onBack?.() }}
            style={{ padding: '0.75rem 1.5rem', background: 'linear-gradient(135deg,#4169E1,#2952CC)', color: '#fff', border: 'none', borderRadius: '0.625rem', fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem' }}
          >
            ← Back to menu
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Batting order sort — mirrors TeamSheet's defaultSort
const BATTING_ORDER_WEIGHT = {
  'opener': 0, 'top-order': 1, 'wicket-keeper': 2,
  'middle-order': 3, 'all-rounder': 4,
  'pace-bowler': 5, 'spin-bowler': 6,
}
function sortByBattingOrder(arr) {
  return [...arr].sort((a, b) => (BATTING_ORDER_WEIGHT[a.role] ?? 9) - (BATTING_ORDER_WEIGHT[b.role] ?? 9))
}

export default function App() {
  useEffect(() => {
    const sync = () => {
      const isDark = localStorage.getItem('cricket-theme') === 'dark'
      document.body.classList.toggle('light', !isDark)
    }
    sync()
    window.addEventListener('cricket-theme-change', sync)
    return () => window.removeEventListener('cricket-theme-change', sync)
  }, [])

  // ── URL-encoded share view (#share=...) ─────────────────────────────────────
  const [sharedResult, setSharedResult] = useState(null)
  useEffect(() => {
    const hash = window.location.hash
    if (!hash.startsWith('#share=')) return
    try {
      const encoded = hash.slice('#share='.length)
      const decoded = JSON.parse(decodeURIComponent(escape(atob(encoded))))
      setSharedResult(decoded)
    } catch { /* ignore bad hashes */ }
  }, [])
  const { user, signOut } = useAuth()

  const [mode, setMode]             = useState(null)
  const [phase, setPhase]           = useState('menu')
  const [settings, setSettings]     = useState(null)
  const [manager, setManager]       = useState(null)
  const [team, setTeam]             = useState([])
  const [draftedIds, setDraftedIds] = useState(new Set())
  const [rerollsLeft, setRerollsLeft] = useState(3)
  const [summary, setSummary]       = useState(null)
  const [matchResults, setMatchResults] = useState([])
  const [showProfile, setShowProfile]   = useState(false)
  const [showAuth, setShowAuth]         = useState(false)
  const [showUserProfile, setShowUserProfile] = useState(false)
  const [showDailyChallenge, setShowDailyChallenge] = useState(false)
  const [newAwards,   setNewAwards]     = useState([])
  const [previewManager,   setPreviewManager]   = useState(null) // coach landed (spin preview for TeamStrengthPanel)
  const [confirmedManager, setConfirmedManager] = useState(null) // coach confirmed by user click
  const [composition, setComposition] = useState(null) // squad role blueprint
  const [budgetLeft, setBudgetLeft]   = useState(STARTING_BUDGET) // ₹125cr auction budget
  const [seasonNumber, setSeasonNumber]       = useState(1)          // current season (1, 2, 3…)
  const [releasedPlayerIds, setReleasedPlayerIds] = useState(new Set()) // can't draft these in next season
  const [prevBudgetLeftover, setPrevBudgetLeftover] = useState(0)    // leftover from last auction
  const [retentionTeam, setRetentionTeam]     = useState([])         // full season-end team snapshot for retention screen
  const [showH2H,      setShowH2H]        = useState(false)
  const [h2hRoom,      setH2hRoom]        = useState(null)   // active H2H draft room
  const [h2hLeagueRoom, setH2hLeagueRoom] = useState(null)  // active shared league room
  const [activeChallenge, setActiveChallenge] = useState(null) // daily challenge in progress

  function handleModeSelect(m) {
    setMode(m)
    setPhase('settings')
  }

  // Settings → squad composition → draft
  function handleSettingsStart(s) {
    setSettings(s)
    setTeam([])
    setDraftedIds(new Set())
    setManager(null)
    setPreviewManager(null); setConfirmedManager(null)
    setRerollsLeft(s.rerolls ?? 3)
    setBudgetLeft(STARTING_BUDGET)
    setPhase('compose')
  }

  function handleCompositionDone(comp) {
    setComposition(comp)
    setPhase('draft')
  }

  // After team is complete → pick a manager
  function handleGoToManager() {
    setPhase('manager')
  }

  // Manager selected → start simulation
  function handleManagerSelect(mgr) {
    setManager(mgr)
    setPhase('simulate')
  }

  function handlePlayerPicked(player) {
    // Always insert in sorted batting order so TeamSheet list and CricketOval match
    setTeam(prev => sortByBattingOrder([...prev, player]))
    setDraftedIds(prev => new Set([...prev, player.id]))
  }

  function handleReroll() {
    setRerollsLeft(r => Math.max(0, r - 1))
  }

  function handleSimDone(sum, results) {
    setSummary(sum)
    setMatchResults(results)
    setPhase('results')
    incrementTotalPlays()  // global counter — works for everyone, logged in or not

    // Record season locally + check awards
    const { newlyEarned } = recordSeason({
      mode,
      wins:         sum.wins,
      losses:       sum.losses,
      total:        sum.total,
      stageReached: sum.stageReached,
      iplOutcome:   sum.iplOutcome,
      iplPosition:  sum.iplPosition,
      perfect:      sum.perfect,
      difficulty:   settings?.difficulty,
      ratingType:   settings?.ratingType,
      manager,
    })
    if (newlyEarned.length > 0) {
      setNewAwards(newlyEarned)
    }

    // Save to Supabase if signed in
    if (user) {
      saveGameResult(user.id, {
        mode,
        wins:         sum.wins,
        losses:       sum.losses,
        total:        sum.total,
        stageReached: sum.stageReached,
        iplOutcome:   sum.iplOutcome,
        iplPosition:  sum.iplPosition,
        perfect:      sum.perfect,
      })
    }
  }

  function handlePlayAgain() {
    setMode(null); setPhase('menu')
    setTeam([]); setDraftedIds(new Set())
    setSettings(null); setManager(null)
    setRerollsLeft(3)
    setSummary(null); setMatchResults([])
    setNewAwards([])
    setPreviewManager(null); setConfirmedManager(null)
    setComposition(null)
    setBudgetLeft(STARTING_BUDGET)
    setActiveChallenge(null)
    setSeasonNumber(1)
    setReleasedPlayerIds(new Set())
    setPrevBudgetLeftover(0)
    setRetentionTeam([])
    window.__activeChallenge = null
  }

  function handleBackToSettings() {
    setPhase('settings')
    setTeam([]); setDraftedIds(new Set())
    setManager(null)
    setPreviewManager(null); setConfirmedManager(null)
    setComposition(null)
    setBudgetLeft(STARTING_BUDGET)
  }

  // Back from draft → composition screen (S1) or retention screen (S2+)
  function handleBackToComposition() {
    if (seasonNumber > 1) {
      // In S2+, undo the season increment from handleRetentionDone so re-confirming works correctly
      setSeasonNumber(n => n - 1)
      setTeam([])
      setDraftedIds(new Set())
      setManager(null)
      setPreviewManager(null); setConfirmedManager(null)
      // retentionTeam snapshot still holds the full season-end XI for the retention screen
      setPhase('retention')
    } else {
      setPhase('compose')
      setTeam([]); setDraftedIds(new Set())
      setManager(null)
      setPreviewManager(null); setConfirmedManager(null)
      setComposition(null)
      setBudgetLeft(STARTING_BUDGET)
    }
  }

  // Results → retention window (next season)
  function handleNextSeason() {
    setPrevBudgetLeftover(budgetLeft)   // save unused auction budget
    setRetentionTeam([...team])         // snapshot full 11-player team for retention screen
    setPhase('retention')
  }

  // Retention confirmed → straight to draft (keep Season 1 composition, pre-fill retained players)
  function handleRetentionDone({ retained, releasedIds, newBudget }) {
    setSeasonNumber(n => n + 1)
    setReleasedPlayerIds(releasedIds)
    setBudgetLeft(newBudget)
    // Pre-fill team and draftedIds with retained players
    setTeam(retained)
    setDraftedIds(new Set(retained.map(p => p.id)))
    setManager(null)
    setPreviewManager(null); setConfirmedManager(null)
    // composition stays from Season 1 — we reuse it so slot needs are computed correctly
    setRerollsLeft(settings?.rerolls ?? 3)  // fresh rerolls for the new auction
    setSummary(null); setMatchResults([])
    setNewAwards([])
    setPhase('draft')   // skip composition screen, go straight to auction
  }

  // Retry bidding: keep composition + settings, reset squad + budget
  function handleRetryBidding() {
    setTeam([])
    setDraftedIds(new Set())
    setManager(null)
    setPreviewManager(null); setConfirmedManager(null)
    setBudgetLeft(STARTING_BUDGET)
    setRerollsLeft(settings?.rerolls ?? 3)
  }

  // Persistent challenge banner — shown across all phases while a daily challenge is active
  const BANNER_H = 38
  const challengeBanner = activeChallenge ? (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1100,
      background: 'linear-gradient(90deg, #1a3a7a, #4169E1)',
      padding: '0 1.25rem',
      height: BANNER_H,
      display: 'flex', alignItems: 'center', gap: '0.625rem',
      boxShadow: '0 2px 12px rgba(31,111,235,0.35)',
    }}>
      <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>
        🗓️ Daily Challenge
      </span>
      <span style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffffff', flexShrink: 0 }}>
        {activeChallenge.constraint_label}
      </span>
      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        — {activeChallenge.constraint_desc}
      </span>
    </div>
  ) : null

  const btnBase = {
    width: 44, height: 44, borderRadius: '50%',
    background: 'var(--card)', border: '1px solid var(--border)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    transition: 'border-color 0.2s, color 0.2s',
  }

  const profileBtn = (
    <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 800, display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
      {/* Medals button */}
      <button
        onClick={() => { setNewAwards([]); setShowProfile(true) }}
        title="Medals & Awards"
        style={{ ...btnBase, color: newAwards.length > 0 ? '#f59e0b' : '#64748b', fontSize: '1.1rem', position: 'relative' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.color = '#f59e0b' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = newAwards.length > 0 ? '#f59e0b' : '#64748b' }}
      >
        🏅
        {newAwards.length > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', background: '#f59e0b', fontSize: '0.55rem', fontWeight: 900, color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {newAwards.length}
          </span>
        )}
      </button>
    </div>
  )

  // Shared League full-page takeover
  if (h2hLeagueRoom) {
    return (
      <SharedLeague
        room={h2hLeagueRoom}
        uid={sessionStorage.getItem('h2h_uid') ?? ''}
        onBack={() => { setH2hLeagueRoom(null) }}
      />
    )
  }

  // H2H active draft screen (full-page takeover)
  if (h2hRoom) {
    const handleH2HBack = () => { setH2hRoom(null); setShowH2H(false) }
    return (
      <H2HErrorBoundary onBack={handleH2HBack}>
      <H2HDraft
        room={h2hRoom}
        uid={sessionStorage.getItem('h2h_uid') ?? ''}
        onBack={handleH2HBack}
        onDone={finalRoom => {
          const myUid   = sessionStorage.getItem('h2h_uid') ?? ''
          const amHost  = myUid === finalRoom.host_id
          const myTeam  = sortByBattingOrder(amHost ? (finalRoom.host_team ?? []) : (finalRoom.guest_team ?? []))
          setH2hRoom(null)
          setShowH2H(false)
          setTeam(myTeam)
          setMode('ipl')
          setSettings({ ratingType: 'overall', difficulty: 'normal', rerolls: 0 })
          setManager(null)
          setPhase('simulate')
        }}
        onInitSharedLeague={async (finalRoom) => {
          // Host generates and saves the tournament
          const myUid     = sessionStorage.getItem('h2h_uid') ?? ''
          const hostName  = finalRoom.host_name ?? 'Host XI'
          const guestName = finalRoom.guest_name ?? 'Guest XI'
          const tournament = generateTournament(
            finalRoom.host_team ?? [], finalRoom.guest_team ?? [],
            null, null, hostName, guestName,
          )
          const sb = await getSupabase()
          if (sb) await sb.from('h2h_rooms').update({ tournament }).eq('id', finalRoom.id)
          // Host also transitions
          setH2hRoom(null)
          setShowH2H(false)
          setH2hLeagueRoom({ ...finalRoom, tournament })
        }}
        onSharedLeague={(finalRoom) => {
          // Guest transitions when tournament appears
          setH2hRoom(null)
          setShowH2H(false)
          setH2hLeagueRoom(finalRoom)
        }}
      />
      </H2HErrorBoundary>
    )
  }

  const globalOverlays = (
    <>
      {challengeBanner}
      {showProfile && (
        <ProfileModal onClose={() => setShowProfile(false)} newAwards={newAwards} />
      )}
      {showH2H && (
        <H2HLobby
          onClose={() => setShowH2H(false)}
          onStartDraft={(room, uid) => {
            setShowH2H(false)
            setH2hRoom(room)
          }}
        />
      )}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSuccess={() => setShowAuth(false)} />}
      {showUserProfile && user && (
        <UserProfile
          user={user}
          onClose={() => setShowUserProfile(false)}
          onSignOut={() => { signOut(); setShowUserProfile(false) }}
        />
      )}
      {showDailyChallenge && (
        <DailyChallenge
          user={user}
          onClose={() => setShowDailyChallenge(false)}
          onPlay={(challenge) => {
            setShowDailyChallenge(false)
            setMode('ipl')
            setPhase('settings')
            setActiveChallenge(challenge)
            window.__activeChallenge = challenge
          }}
        />
      )}
    </>
  )

  // ── Shared result view — shown when URL has #share=... ─────────────────────
  if (sharedResult) return <SharedResultView data={sharedResult} onPlay={() => setSharedResult(null)} />

  if (phase === 'menu')     return (
    <>
      <ModeSelect
        onSelect={handleModeSelect}
        onH2H={() => setShowH2H(true)}
        onDailyChallenge={() => setShowDailyChallenge(true)}
        user={user}
        onSignIn={() => setShowAuth(true)}
        onGoogleSignIn={signInWithGoogle}
        onAccount={() => setShowUserProfile(true)}
        onMedals={() => { setNewAwards([]); setShowProfile(true) }}
        newAwards={newAwards}
      />
      {profileBtn}
      {globalOverlays}
    </>
  )
  if (phase === 'settings') return (
    <div style={{ paddingTop: activeChallenge ? BANNER_H : 0, background: 'var(--bg)', minHeight: '100vh' }}>
      <DraftSettings mode={mode} onStart={handleSettingsStart} onBack={() => setPhase('menu')} />
      {profileBtn}
      {globalOverlays}
    </div>
  )
  if (phase === 'compose') return (
    <div style={{ paddingTop: activeChallenge ? BANNER_H : 0, background: 'var(--bg)', minHeight: '100vh' }}>
      <SquadComposer onDone={handleCompositionDone} onBack={() => setPhase('settings')} />
      {profileBtn}
      {globalOverlays}
    </div>
  )

  // Manager select now comes AFTER the draft is complete
  if (phase === 'manager')  return (
    <div style={{ paddingTop: activeChallenge ? BANNER_H : 0, background: 'var(--bg)', minHeight: '100vh' }}>
      <ManagerSelect mode={mode} team={team} onSelect={handleManagerSelect} onBack={() => setPhase('draft')} />
      {profileBtn}
      {globalOverlays}
    </div>
  )

  if (phase === 'draft') {
    const slotsFilled = team.length
    const totalSlots  = POSITIONS.length
    const isDone      = slotsFilled === totalSlots
    const cfg         = MODE_CONFIG[mode]

    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingTop: activeChallenge ? 36 : 0 }}>
        {/* Sticky header */}
        <div className="draft-header" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.875rem 1.5rem', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: activeChallenge ? 36 : 0, background: 'var(--card)',
          backdropFilter: 'blur(8px)', zIndex: 10,
        }}>
          <button onClick={handleBackToComposition} style={{ background: 'none', color: 'var(--text-muted)', border: 'none', fontSize: '0.85rem', cursor: 'pointer' }}>
            ← Back
          </button>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)' }}>
            {cfg.icon} {cfg.label}
            {settings?.hardMode && <span style={{ fontSize: '0.7rem', color: '#f59e0b', marginLeft: '0.5rem' }}>🔒 HARD</span>}
            {settings?.ratingType === 'prime' && <span style={{ fontSize: '0.7rem', color: '#a855f7', marginLeft: '0.5rem' }}>⚡ PRIME</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              fontSize: '0.8rem', fontWeight: 800,
              color: budgetLeft < 20 ? '#ef4444' : budgetLeft < 40 ? '#f59e0b' : '#22c55e',
            }}>
              💰 ₹{budgetLeft}cr
            </div>
            <div style={{ fontSize: '0.85rem', color: isDone ? '#4169E1' : 'var(--text-muted)', fontWeight: 700 }}>
              {slotsFilled}/{totalSlots}
            </div>
          </div>
        </div>

        <div className="draft-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 296px', gap: '1.25rem', maxWidth: 1100, margin: '0 auto', padding: '1.25rem', alignItems: 'start' }}>

          {/* Left column — wheel or done banner */}
          <div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
              {!isDone ? (
                <WheelSpin
                  mode={mode}
                  settings={settings}
                  composition={composition}
                  slotIndex={slotsFilled}
                  totalSlots={totalSlots}
                  draftedIds={draftedIds}
                  releasedPlayerIds={releasedPlayerIds}
                  team={team}
                  rerollsLeft={rerollsLeft}
                  onReroll={handleReroll}
                  onResult={handlePlayerPicked}
                  budget={budgetLeft}
                  onSpend={amt => setBudgetLeft(b => Math.max(0, b - amt))}
                  onRetryFromBeginning={handleBackToSettings}
                  onRetryBidding={handleRetryBidding}
                />
              ) : (
                <div style={{ padding: '1.75rem 1.5rem', textAlign: 'center', animation: 'fade-in-up 0.4s ease both' }}>
                  <div style={{ fontSize: '0.72rem', color: '#4169E1', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
                    XI Complete
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.5rem' }}>
                    Squad is set ✓
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
                    Reorder your XI using the arrows on the right, then spin for a coach and start the season.
                  </div>
                </div>
              )}
            </div>

            {/* Team strength panel */}
            {team.length > 0 && (
              <TeamStrengthPanel
                team={team}
                manager={isDone ? (confirmedManager || previewManager) : null}
                mode={mode}
                ratingType={settings?.ratingType ?? 'season'}
                showPenalty={isDone}
                onStart={isDone && confirmedManager ? () => handleManagerSelect(confirmedManager) : undefined}
              />
            )}
          </div>

          {/* Right column — TeamSheet scrolls in its own space; ManagerSelect pinned below */}
          <div className="draft-right-col" style={{
            position: 'sticky', top: activeChallenge ? 'calc(36px + 4.5rem)' : '4.5rem',
            height: activeChallenge ? 'calc(100vh - 5.5rem - 36px)' : 'calc(100vh - 5.5rem)',
            display: 'flex', flexDirection: 'column', gap: '0.625rem',
          }}>
            {/* Overseas tracker — IPL only, always visible at top of right column */}
            {mode === 'ipl' && (() => {
              const overseasCount = team.filter(p => p.nationality !== 'India').length
              const limitReached  = overseasCount >= 4
              return (
                <div style={{
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                  padding: '0.5rem 0.875rem',
                  background: limitReached ? '#ef444410' : 'var(--card)',
                  border: `1.5px solid ${limitReached ? '#ef444455' : 'var(--border)'}`,
                  borderRadius: '0.625rem',
                }}>
                  <span style={{ fontSize: '0.75rem' }}>✈️</span>
                  <div>
                    <div style={{ fontSize: '0.55rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>
                      Overseas slots
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      {[0,1,2,3].map(i => (
                        <div key={i} style={{
                          width: 16, height: 16, borderRadius: '50%',
                          background: i < overseasCount ? '#4169E1' : 'transparent',
                          border: `2px solid ${i < overseasCount ? '#4169E1' : 'var(--border)'}`,
                          transition: 'background 0.2s, border-color 0.2s',
                        }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: limitReached ? '#ef4444' : 'var(--muted)', marginLeft: 'auto' }}>
                    {overseasCount}/4
                  </div>
                  {limitReached && (
                    <div style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: 700 }}>FULL</div>
                  )}
                </div>
              )
            })()}

            {/* TeamSheet takes all remaining space and scrolls internally if needed */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <TeamSheet
                team={team}
                onReorder={newOrder => setTeam(newOrder)}
                ratingType={settings?.ratingType}
                mode={mode}
                composition={composition}
              />
            </div>

            {/* ManagerSelect: fixed at bottom, never compresses TeamSheet */}
            {isDone && (
              <div style={{ flexShrink: 0 }}>
                <ManagerSelect
                  inline
                  mode={mode}
                  team={team}
                  onLand={mgr => setPreviewManager(mgr)}
                  onSelect={mgr => { setConfirmedManager(mgr); setPreviewManager(mgr) }}
                />
              </div>
            )}
          </div>
        </div>
      {profileBtn}
      {globalOverlays}
      </div>
    )
  }

  if (phase === 'simulate') return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingTop: activeChallenge ? BANNER_H : 0 }}>
      <MatchSimulator team={team} mode={mode} manager={manager} ratingType={settings?.ratingType} onDone={handleSimDone} />
      {profileBtn}
      {globalOverlays}
    </div>
  )

  if (phase === 'retention') return (
    <>
      <RetentionScreen
        team={retentionTeam}          // snapshot of full season-end XI, not the live (possibly cleared) team
        prevBudgetLeftover={prevBudgetLeftover}
        seasonNumber={seasonNumber + 1}
        onConfirm={handleRetentionDone}
      />
      {globalOverlays}
    </>
  )

  if (phase === 'results') return (
    <>
      <Results
        team={team} mode={mode} manager={manager}
        summary={summary} matchResults={matchResults}
        onPlayAgain={handlePlayAgain}
        onNextSeason={handleNextSeason}
        seasonNumber={seasonNumber}
        newAwards={newAwards}
      />
      {profileBtn}
      {globalOverlays}
    </>
  )

  return null
}

// ── Shared result view ─────────────────────────────────────────────────────────

function SharedResultView({ data, onPlay }) {
  // Support both compact keys (new) and verbose keys (old shared links)
  const wins             = data.w   ?? data.wins
  const losses           = data.l   ?? data.losses
  const rating           = data.r   ?? data.rating
  const mode             = data.m   ?? data.mode
  const potm             = data.p   ?? data.potm
  const topScorer        = data.ts  ?? data.topScorer
  const topScorerRuns    = data.sr  ?? data.topScorerRuns
  const topWicketTaker   = data.tw  ?? data.topWicketTaker
  const topWicketTakerWkts = data.wk ?? data.topWicketTakerWkts
  const manager          = data.mg  ?? data.manager
  const stage            = data.st  ?? data.stage
  const team             = data.tm  ?? data.team ?? []
  // Awards: encoded as ["icon|name", ...] strings
  const awards = (data.aw ?? []).map(s => {
    const idx = s.indexOf('|')
    return idx === -1 ? { icon: '🏅', name: s } : { icon: s.slice(0, idx), name: s.slice(idx + 1) }
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>

        {/* Badge */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'inline-block', padding: '0.25rem 0.75rem', background: 'rgba(31,111,235,0.12)', border: '1px solid rgba(31,111,235,0.25)', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, color: '#4169E1', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
            Cricket 16-0 · {mode || 'Season'}
          </div>
          <div style={{ fontSize: '3rem', lineHeight: 1 }}>🏆</div>
        </div>

        {/* Main card */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '1.25rem', padding: '1.5rem', marginBottom: '1rem' }}>

          {/* Record */}
          <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '2.75rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>
              {wins}W <span style={{ color: '#64748b', fontSize: '1.8rem' }}>–</span> {losses}L
            </div>
            {stage && <div style={{ fontSize: '0.8rem', color: '#4169E1', fontWeight: 700, marginTop: '0.35rem' }}>{stage}</div>}
            <div style={{ display: 'inline-block', marginTop: '0.5rem', padding: '0.2rem 0.75rem', background: '#4169E118', border: '1px solid #4169E133', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, color: '#4169E1' }}>{rating}</div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '1.25rem' }}>
            {potm && (
              <div style={{ padding: '0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.625rem' }}>
                <div style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>Player of Tournament</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)' }}>{potm}</div>
              </div>
            )}
            {topScorer && (
              <div style={{ padding: '0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.625rem' }}>
                <div style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>Top Run Scorer</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)' }}>{topScorer}</div>
                {topScorerRuns && <div style={{ fontSize: '0.72rem', color: '#4169E1', fontWeight: 700 }}>{topScorerRuns} runs</div>}
              </div>
            )}
            {topWicketTaker && (
              <div style={{ padding: '0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.625rem' }}>
                <div style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>Top Wicket Taker</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)' }}>{topWicketTaker}</div>
                {topWicketTakerWkts && <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 700 }}>{topWicketTakerWkts} wickets</div>}
              </div>
            )}
            {manager && (
              <div style={{ padding: '0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.625rem' }}>
                <div style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>Manager</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)' }}>{manager}</div>
              </div>
            )}
          </div>

          {/* Team names */}
          {team.length > 0 && (
            <div>
              <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Their XI</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {team.map((name, i) => (
                  <span key={i} style={{ padding: '0.2rem 0.6rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text)' }}>
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Medal cards */}
        {awards.length > 0 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '1.25rem', padding: '1rem 1.25rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.6rem' }}>
              🏅 Medals Earned
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {awards.map((award, i) => (
                <div key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.4rem 0.75rem',
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.06))',
                  border: '1.5px solid rgba(245,158,11,0.35)',
                  borderRadius: '0.625rem',
                }}>
                  <span style={{ fontSize: '1rem', lineHeight: 1 }}>{award.icon}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#f59e0b', lineHeight: 1.1 }}>{award.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={onPlay}
          style={{ width: '100%', padding: '1rem', background: 'linear-gradient(135deg, #4169E1, #2952CC)', color: '#fff', border: 'none', borderRadius: '0.875rem', fontSize: '1rem', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 20px rgba(31,111,235,0.35)', letterSpacing: '0.02em' }}
        >
          Can you go unbeaten? Play Cricket 16-0 →
        </button>
        <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.72rem', color: '#64748b' }}>16zero.in</div>
      </div>
    </div>
  )
}
