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
import CricketOval from './components/CricketOval.jsx'
import AuthModal from './components/AuthModal.jsx'
import UserProfile from './components/UserProfile.jsx'
import { recordSeason, loadProfile } from './hooks/useProfile.js'
import { useAuth, saveGameResult } from './hooks/useAuth.js'

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
  const [newAwards,   setNewAwards]     = useState([])
  const [previewManager,   setPreviewManager]   = useState(null) // coach landed (spin preview for TeamStrengthPanel)
  const [confirmedManager, setConfirmedManager] = useState(null) // coach confirmed by user click

  function handleModeSelect(m) {
    setMode(m)
    setPhase('settings')
  }

  // Settings → go straight to draft (manager comes AFTER team is complete)
  function handleSettingsStart(s) {
    setSettings(s)
    setTeam([])
    setDraftedIds(new Set())
    setManager(null)
    setPreviewManager(null); setConfirmedManager(null)
    setRerollsLeft(s.rerolls ?? 3)
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
  }

  function handleBackToSettings() {
    setPhase('settings')
    setTeam([]); setDraftedIds(new Set())
    setManager(null)
    setPreviewManager(null); setConfirmedManager(null)
  }

  const btnBase = {
    width: 44, height: 44, borderRadius: '50%',
    background: '#12121a', border: '1px solid #2a2a3a',
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
          color: user ? '#22c55e' : '#64748b',
          borderColor: user ? '#22c55e44' : '#2a2a3a',
          fontSize: user ? '0.75rem' : '1.1rem',
          fontWeight: 900,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.color = '#22c55e' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = user ? '#22c55e44' : '#2a2a3a'; e.currentTarget.style.color = user ? '#22c55e' : '#64748b' }}
      >
        {user ? (user.email?.[0]?.toUpperCase() ?? '👤') : '👤'}
      </button>

      {/* Medals button */}
      <button
        onClick={() => { setNewAwards([]); setShowProfile(true) }}
        title="Medals & Awards"
        style={{ ...btnBase, color: newAwards.length > 0 ? '#f59e0b' : '#64748b', fontSize: '1.1rem' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.color = '#22c55e' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a3a'; e.currentTarget.style.color = newAwards.length > 0 ? '#f59e0b' : '#64748b' }}
      >
        🏅
      </button>
    </div>
  )

  const globalOverlays = (
    <>
      {globalOverlays}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSuccess={() => setShowAuth(false)} />}
      {showUserProfile && user && (
        <UserProfile
          user={user}
          onClose={() => setShowUserProfile(false)}
          onSignOut={() => { signOut(); setShowUserProfile(false) }}
        />
      )}
    </>
  )

  if (phase === 'menu')     return (
    <>
      <ModeSelect onSelect={handleModeSelect} />
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
          position: 'sticky', top: 0, background: 'rgba(10,10,15,0.96)',
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
          <div style={{ fontSize: '0.85rem', color: slotsFilled === totalSlots ? 'var(--green)' : 'var(--text-muted)', fontWeight: 700 }}>
            {slotsFilled}/{totalSlots}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: '1.5rem', maxWidth: 1080, margin: '0 auto', padding: '1.5rem', alignItems: 'start' }}>

          {/* Left column */}
          <div>
            <div style={{ background: '#12121a', border: '1px solid #2a2a3a', borderRadius: '1rem', overflow: 'hidden' }}>
              {!isDone ? (
                <WheelSpin
                  mode={mode}
                  settings={settings}
                  slotIndex={slotsFilled}
                  totalSlots={totalSlots}
                  draftedIds={draftedIds}
                  team={team}
                  rerollsLeft={rerollsLeft}
                  onReroll={handleReroll}
                  onResult={handlePlayerPicked}
                />
              ) : (
                <div style={{ animation: 'fade-in-up 0.4s ease both' }}>
                  <div style={{ textAlign: 'center', padding: '1.5rem 1.5rem 0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', color: '#22c55e', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>
                      XI Complete
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#f1f5f9', marginBottom: '0.35rem' }}>
                      Squad is set
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.82rem', marginBottom: '1rem' }}>
                      {confirmedManager
                        ? `${confirmedManager.icon} ${confirmedManager.name} is your coach`
                        : 'Reorder your XI, then pick your coach on the right →'}
                    </div>
                  </div>
                  <div style={{ padding: '0 1rem' }}>
                    <CricketOval
                    team={team}
                    ratingType={settings?.ratingType}
                    onReorder={newOrder => setTeam(newOrder)}
                  />
                  </div>
                  {confirmedManager && (
                    <div style={{ padding: '1rem' }}>
                      <button
                        onClick={() => handleManagerSelect(confirmedManager)}
                        style={{ width: '100%', padding: '1rem', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#0a0a0f', border: 'none', borderRadius: '0.75rem', fontSize: '1.05rem', fontWeight: 800, cursor: 'pointer' }}
                      >
                        🏏 Start Season →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* TeamStrengthPanel — shows predicted finish once coach lands/confirmed */}
            {team.length > 0 && (
              <TeamStrengthPanel team={team} manager={isDone ? (confirmedManager || previewManager) : null} mode={mode} showPenalty={isDone} />
            )}
          </div>

          {/* Right column: TeamSheet while drafting, inline ManagerSelect when done */}
          <div style={{ position: 'sticky', top: '4.5rem' }}>
            {!isDone ? (
              <TeamSheet
                team={team}
                currentSlot={slotsFilled}
                onReorder={newOrder => setTeam(newOrder)}
                ratingType={settings?.ratingType}
                mode={mode}
              />
            ) : (
              <ManagerSelect
                inline
                mode={mode}
                team={team}
                onLand={mgr => { setPreviewManager(mgr); if (!confirmedManager) setConfirmedManager(null) }}
                onSelect={mgr => { setPreviewManager(null); setConfirmedManager(mgr) }}
              />
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
