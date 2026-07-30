/**
 * useProfile — local-first profile system, API-ready.
 *
 * Storage: localStorage now.
 * Future: swap `storage` calls for `await api.post('/profile', ...)` etc.
 */

const STORAGE_KEY = 'cricket16_profile'

// ─── Award definitions ──────────────────────────────────────────────────────

export const AWARDS = [
  {
    id:    'perfect_season',
    icon:  '💎',
    name:  'Flawless',
    desc:  'Complete a perfect unbeaten season',
    check: ({ wins, losses, perfect }) => perfect === true || losses === 0,
  },
  {
    id:    'world_champion',
    icon:  '🏆',
    name:  'World Champion',
    desc:  'Win an ODI or T20 World Cup',
    check: ({ stageReached, mode }) => stageReached === 'Champion' && (mode === 'odi-wc' || mode === 't20-wc'),
  },
  {
    id:    'ipl_champion',
    icon:  '🌟',
    name:  'IPL Champion',
    desc:  'Win the IPL',
    check: ({ iplOutcome }) => iplOutcome === 'champion',
  },
  {
    id:    'final_appearance',
    icon:  '🥈',
    name:  'Finalist',
    desc:  'Reach a WC or IPL Final',
    check: ({ stageReached, iplOutcome }) =>
      stageReached === 'Runner-up' || stageReached === 'Champion' || stageReached === 'Final' ||
      iplOutcome === 'champion' || iplOutcome === 'runner-up',
  },
  {
    id:    'semi_finalist',
    icon:  '⚡',
    name:  'Semi-Finalist',
    desc:  'Reach a World Cup Semi-Final',
    check: ({ stageReached }) => ['Semi-Final', 'Runner-up', 'Champion'].includes(stageReached),
  },
  {
    id:    'all_modes',
    icon:  '🌍',
    name:  'All-Format Legend',
    desc:  'Win a season in IPL, ODI WC, and T20 WC',
    check: ({ modesWon }) => modesWon?.has('ipl') && modesWon?.has('odi-wc') && modesWon?.has('t20-wc'),
  },
  {
    id:    'ten_seasons',
    icon:  '📋',
    name:  'Veteran',
    desc:  'Complete 10 seasons total',
    check: ({ totalSeasons }) => (totalSeasons ?? 0) >= 10,
  },
  {
    id:    'dominant_run',
    icon:  '👑',
    name:  'Dominant',
    desc:  'Finish a season with 85%+ win rate',
    check: ({ wins, total }) => total > 0 && wins / total >= 0.85,
  },
  {
    id:    'underdog',
    icon:  '🐉',
    name:  'Underdog',
    desc:  'Win a tournament predicted to finish in the bottom group',
    check: ({ stageReached, iplOutcome, predictedPos }) =>
      (stageReached === 'Champion' || iplOutcome === 'champion') &&
      (predictedPos === 'Bottom 3' || predictedPos === 'Group stage'),
  },
  {
    id:    'hard_champion',
    icon:  '🔒',
    name:  'Iron Will',
    desc:  'Win a championship on Hard difficulty',
    check: ({ stageReached, iplOutcome, difficulty }) =>
      difficulty === 'hard' &&
      (stageReached === 'Champion' || iplOutcome === 'champion'),
  },
]

// ─── Default profile shape ──────────────────────────────────────────────────

function defaultProfile() {
  return {
    email:         null,
    displayName:   null,
    createdAt:     new Date().toISOString(),
    totalSeasons:  0,
    modesWon:      [],           // array (serialised Set)
    awards:        [],           // earned award IDs
    history:       [],           // [{mode, wins, losses, stageReached, iplOutcome, rating, date}]
  }
}

// ─── Storage layer (swap for API calls when hosting) ───────────────────────

const storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  },
  save(profile) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)) }
    catch { /* quota exceeded / SSR */ }
  },
  clear() {
    try { localStorage.removeItem(STORAGE_KEY) }
    catch { /* */ }
  },
}

// ─── Public API ────────────────────────────────────────────────────────────

export function loadProfile() {
  return storage.load() ?? defaultProfile()
}

export function saveProfile(profile) {
  storage.save(profile)
}

export function updateEmail(email, displayName) {
  const p = loadProfile()
  p.email       = email?.trim() || null
  p.displayName = displayName?.trim() || null
  saveProfile(p)
  return p
}

/**
 * Called after every season. Records history, checks awards, returns updated profile.
 * `data` shape:
 *   { mode, wins, losses, total, stageReached, iplOutcome, iplPosition,
 *     perfect, difficulty, predictedPos, manager }
 */
export function recordSeason(data) {
  const p = loadProfile()

  // Increment counters
  p.totalSeasons = (p.totalSeasons ?? 0) + 1

  // Track modes won
  const modesWonSet = new Set(p.modesWon ?? [])
  if (data.iplOutcome === 'champion') modesWonSet.add('ipl')
  if (data.stageReached === 'Champion' && data.mode === 'odi-wc') modesWonSet.add('odi-wc')
  if (data.stageReached === 'Champion' && data.mode === 't20-wc') modesWonSet.add('t20-wc')
  p.modesWon = [...modesWonSet]

  // Check awards
  const earnedSet = new Set(p.awards ?? [])
  const context = { ...data, modesWon: modesWonSet, totalSeasons: p.totalSeasons }
  const newlyEarned = []

  for (const award of AWARDS) {
    if (earnedSet.has(award.id)) continue
    try {
      if (award.check(context)) {
        earnedSet.add(award.id)
        newlyEarned.push(award)
      }
    } catch { /* */ }
  }
  p.awards = [...earnedSet]

  // Add to history (keep last 50)
  p.history = [
    {
      mode:         data.mode,
      wins:         data.wins,
      losses:       data.losses,
      stageReached: data.stageReached,
      iplOutcome:   data.iplOutcome,
      difficulty:   data.difficulty,
      manager:      data.manager?.name ?? null,
      date:         new Date().toISOString(),
    },
    ...(p.history ?? []),
  ].slice(0, 50)

  saveProfile(p)
  return { profile: p, newlyEarned }
}

export function clearProfile() {
  storage.clear()
}
