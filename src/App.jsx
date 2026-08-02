import { useState, useEffect } from 'react'
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
import DailyChallenge from './components/DailyChallenge.jsx'
import H2HLobby from './components/H2HLobby.jsx'
import H2HDraft from './components/H2HDraft.jsx'
import { STARTING_BUDGET } from './components/WheelSpin.jsx'
import { recordSeason, loadProfile } from './hooks/useProfile.js'
import { useAuth, saveGameResult, incrementTotalPlays } from './hooks/useAuth.js'

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
  const [showH2H,    setShowH2H]      = useState(false)
  const [h2hRoom,    setH2hRoom]      = useState(null)  // active H2H room

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
  }

  function handleBackToSettings() {
    setPhase('settings')
    setTeam([]); setDraftedIds(new Set())
    setManager(null)
    setPreviewManager(null); setConfirmedManager(null)
    setComposition(null)
    setBudgetLeft(STARTING_BUDGET)
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

  const btnBase = {
    width: 44, height: 44, borderRadius: '50%',
    background: 'var(--card)', border: '1px solid var(--border)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    transition: 'border-color 0.2s, color 0.2s',
  }

  const profileBtn = (
    <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 800, display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
      {/* Account button */}
      <button
        onClick={() => user ? setShowUserProfile(true) : setShowAuth(true)}
        title={user ? 'Your account' : 'Sign in'}
        style={{
          ...btnBase,
          color: user ? '#1F6FEB' : '#64748b',
          borderColor: user ? '#1F6FEB44' : 'var(--border)',
          fontSize: user ? '0.75rem' : '1.1rem',
          fontWeight: 900,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#1F6FEB'; e.currentTarget.style.color = '#1F6FEB' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = user ? '#1F6FEB44' : 'var(--border)'; e.currentTarget.style.color = user ? '#1F6FEB' : '#64748b' }}
      >
        {user ? (user.email?.[0]?.toUpperCase() ?? '👤') : '👤'}
      </button>

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

  // H2H active draft screen (full-page takeover)
  if (h2hRoom) {
    return (
      <H2HDraft
        room={h2hRoom}
        uid={sessionStorage.getItem('h2h_uid') ?? ''}
        onBack={() => { setH2hRoom(null); setShowH2H(false) }}
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
      />
    )
  }

  const globalOverlays = (
    <>
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
            // Start a normal IPL game — the challenge constraint will be enforced in WheelSpin
            setMode('ipl')
            setPhase('settings')
            // Store challenge for constraint checking after results
            window.__activeChallenge = challenge
          }}
        />
      )}
    </>
  )

  if (phase === 'menu')     return (
    <>
      <ModeSelect
        onSelect={handleModeSelect}
        onH2H={() => setShowH2H(true)}
        onDailyChallenge={() => setShowDailyChallenge(true)}
        user={user}
        onSignIn={() => setShowAuth(true)}
        onAccount={() => setShowUserProfile(true)}
        onMedals={() => { setNewAwards([]); setShowProfile(true) }}
        newAwards={newAwards}
      />
      {profileBtn}
      {globalOverlays}
    </>
  )
  if (phase === 'settings') return (
    <>
      <DraftSettings mode={mode} onStart={handleSettingsStart} onBack={() => setPhase('menu')} />
      {profileBtn}
      {globalOverlays}
    </>
  )
  if (phase === 'compose') return (
    <>
      <SquadComposer onDone={handleCompositionDone} onBack={() => setPhase('settings')} />
      {profileBtn}
      {globalOverlays}
    </>
  )

  // Manager select now comes AFTER the draft is complete
  if (phase === 'manager')  return (
    <>
      <ManagerSelect mode={mode} team={team} onSelect={handleManagerSelect} onBack={() => setPhase('draft')} />
      {profileBtn}
      {globalOverlays}
    </>
  )

  if (phase === 'draft') {
    const slotsFilled = team.length
    const totalSlots  = POSITIONS.length
    const isDone      = slotsFilled === totalSlots
    const cfg         = MODE_CONFIG[mode]

    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        {/* Sticky header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.875rem 1.5rem', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--card)',
          backdropFilter: 'blur(8px)', zIndex: 10,
        }}>
          <button onClick={handleBackToSettings} style={{ background: 'none', color: 'var(--text-muted)', border: 'none', fontSize: '0.85rem', cursor: 'pointer' }}>
            ← Settings
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
            <div style={{ fontSize: '0.85rem', color: isDone ? '#1F6FEB' : 'var(--text-muted)', fontWeight: 700 }}>
              {slotsFilled}/{totalSlots}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 296px', gap: '1.25rem', maxWidth: 1100, margin: '0 auto', padding: '1.25rem', alignItems: 'start' }}>

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
                  <div style={{ fontSize: '0.72rem', color: '#1F6FEB', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
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
                showPenalty={isDone}
                onStart={isDone && confirmedManager ? () => handleManagerSelect(confirmedManager) : undefined}
              />
            )}
          </div>

          {/* Right column — TeamSheet scrolls in its own space; ManagerSelect pinned below */}
          <div style={{
            position: 'sticky', top: '4.5rem',
            height: 'calc(100vh - 5.5rem)',
            display: 'flex', flexDirection: 'column', gap: '0.625rem',
          }}>
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
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <MatchSimulator team={team} mode={mode} manager={manager} ratingType={settings?.ratingType} onDone={handleSimDone} />
      {profileBtn}
      {globalOverlays}
    </div>
  )

  if (phase === 'results') return (
    <>
      <Results team={team} mode={mode} manager={manager} summary={summary} matchResults={matchResults} onPlayAgain={handlePlayAgain} />
      {profileBtn}
      {globalOverlays}
    </>
  )

  return null
}
