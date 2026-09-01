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
  // ── New medals ────────────────────────────────────────────────────────────
  {
    id:    'quarter_century',
    icon:  '🎯',
    name:  'Quarter Century',
    desc:  'Play 25 seasons',
    check: ({ totalSeasons }) => (totalSeasons ?? 0) >= 25,
  },
  {
    id:    'dynasty',
    icon:  '👸',
    name:  'Dynasty',
    desc:  'Win the IPL 3 times',
    check: ({ iplWins }) => (iplWins ?? 0) >= 3,
  },
  {
    id:    'back_to_back',
    icon:  '🔁',
    name:  'Back to Back',
    desc:  'Win the IPL two seasons in a row',
    // history is the OLD history (before current season is appended), so history[0] = previous season
    check: ({ iplOutcome, history }) =>
      iplOutcome === 'champion' && history?.length >= 1 && history[0]?.iplOutcome === 'champion',
  },
  {
    id:    'run_double',
    icon:  '🔥',
    name:  'On Fire',
    desc:  'Win the IPL twice in a row in the same session',
    // Both this season and last must share the same runId, meaning they're from the same continuous play session
    check: ({ iplOutcome, history, runId }) =>
      iplOutcome === 'champion' &&
      history?.length >= 1 &&
      history[0]?.iplOutcome === 'champion' &&
      history[0]?.runId === runId,
  },
  {
    id:    'run_triple',
    icon:  '👑🔥',
    name:  'Reign of Fire',
    desc:  'Win the IPL three times in a row in the same session',
    check: ({ iplOutcome, history, runId }) =>
      iplOutcome === 'champion' &&
      history?.length >= 2 &&
      history[0]?.iplOutcome === 'champion' &&
      history[1]?.iplOutcome === 'champion' &&
      history[0]?.runId === runId &&
      history[1]?.runId === runId,
  },
  {
    id:    'big_guns',
    icon:  '💪',
    name:  'Big Guns',
    desc:  'Finish an IPL season with 12 or more wins',
    check: ({ wins, mode }) => wins >= 12 && mode === 'ipl',
  },
  {
    id:    'trust_gaffer',
    icon:  '🤝',
    name:  'Trust the Gaffer',
    desc:  'Win with a coach who has a tournament bonus',
    check: ({ stageReached, iplOutcome, manager, mode }) =>
      (stageReached === 'Champion' || iplOutcome === 'champion') &&
      manager != null &&
      (manager.wcWinnerFor ?? []).includes(mode) &&
      (manager.bonus?.strength ?? 0) > 0,
  },
  {
    id:    'prime_time',
    icon:  '⚡',
    name:  'Prime Time',
    desc:  'Win a championship in Prime ratings mode',
    check: ({ stageReached, iplOutcome, ratingType }) =>
      ratingType === 'prime' &&
      (stageReached === 'Champion' || iplOutcome === 'champion'),
  },
  {
    id:    'flawless_cup',
    icon:  '🎖️',
    name:  'Immaculate',
    desc:  'Win a World Cup without losing a single match',
    check: ({ losses, stageReached, mode }) =>
      losses === 0 &&
      stageReached === 'Champion' &&
      (mode === 'odi-wc' || mode === 't20-wc'),
  },
  {
    id:    'half_century',
    icon:  '🏟️',
    name:  'Half Century',
    desc:  'Play 50 seasons',
    check: ({ totalSeasons }) => (totalSeasons ?? 0) >= 50,
  },
  {
    id:    'ipl_playoff_reach',
    icon:  '🎪',
    name:  'Playoff Bound',
    desc:  'Qualify for the IPL Playoffs (top 4)',
    check: ({ iplPosition }) => iplPosition != null && iplPosition <= 4,
  },
  // ── Cult / squad medals ───────────────────────────────────────────────────
  {
    id:    'desh_bhakt',
    icon:  '🇮🇳',
    name:  'Desh Bhakt',
    desc:  'Win the IPL with an all-Indian squad',
    check: ({ iplOutcome, team }) =>
      iplOutcome === 'champion' &&
      Array.isArray(team) && team.length > 0 &&
      team.every(p => p.nationality === 'India'),
  },
  {
    id:    'two_man_army',
    icon:  '🎯',
    name:  'Two-Man Army',
    desc:  'Win the IPL with only 2 bowlers in your squad',
    check: ({ iplOutcome, composition }) =>
      iplOutcome === 'champion' &&
      composition != null &&
      ((composition['pace-bowler'] ?? 0) + (composition['spin-bowler'] ?? 0)) <= 2,
  },
  {
    id:    'streets_wont_forget',
    icon:  '🌟',
    name:  "Streets Won't Forget",
    desc:  'Win the IPL with a squad averaging 92+ overall',
    check: ({ iplOutcome, team }) => {
      if (iplOutcome !== 'champion' || !Array.isArray(team) || team.length === 0) return false
      const avg = team.reduce((s, p) => s + (p.overall ?? 0), 0) / team.length
      return avg >= 92
    },
  },
  {
    id:    'cult_xi',
    icon:  '👑',
    name:  'Cult XI',
    desc:  'Win the IPL with 3 or more players rated 95+ overall',
    check: ({ iplOutcome, team }) =>
      iplOutcome === 'champion' &&
      Array.isArray(team) &&
      team.filter(p => (p.overall ?? 0) >= 95).length >= 3,
  },
  {
    id:    'spider_web',
    icon:  '🌀',
    name:  "Spider's Web",
    desc:  'Win the IPL using 4+ spinners in your squad',
    check: ({ iplOutcome, composition }) =>
      iplOutcome === 'champion' &&
      composition != null &&
      (composition['spin-bowler'] ?? 0) >= 4,
  },
  {
    id:    'pace_is_pace',
    icon:  '💨',
    name:  'Pace is Pace',
    desc:  'Win the IPL using 4+ pace bowlers in your squad',
    check: ({ iplOutcome, composition }) =>
      iplOutcome === 'champion' &&
      composition != null &&
      (composition['pace-bowler'] ?? 0) >= 4,
  },
  {
    id:    'united_nations',
    icon:  '🌍',
    name:  'United Nations',
    desc:  'Win a championship with players from 5+ different countries',
    check: ({ stageReached, iplOutcome, team }) => {
      if (!(stageReached === 'Champion' || iplOutcome === 'champion')) return false
      if (!Array.isArray(team) || team.length === 0) return false
      return new Set(team.map(p => p.nationality).filter(Boolean)).size >= 5
    },
  },
  {
    id:    'all_rounders_army',
    icon:  '⚡',
    name:  "All-Rounder's Army",
    desc:  'Win the IPL with 4 or more all-rounders in your squad',
    check: ({ iplOutcome, composition }) =>
      iplOutcome === 'champion' &&
      composition != null &&
      (composition['all-rounder'] ?? 0) >= 4,
  },
  {
    id:    'batting_blitz',
    icon:  '💥',
    name:  'Batting Blitz',
    desc:  'Win the IPL with 7+ batters (openers + top + middle + keeper)',
    check: ({ iplOutcome, composition }) => {
      if (iplOutcome !== 'champion' || composition == null) return false
      const batters = (composition['opener'] ?? 0) + (composition['top-order'] ?? 0)
        + (composition['middle-order'] ?? 0) + (composition['wicket-keeper'] ?? 0)
      return batters >= 7
    },
  },
  {
    id:    'global_xi',
    icon:  '🗺️',
    name:  'Global XI',
    desc:  'Win a World Cup with players from 4+ different countries',
    check: ({ stageReached, mode, team }) => {
      if (stageReached !== 'Champion') return false
      if (!(mode === 'odi-wc' || mode === 't20-wc')) return false
      if (!Array.isArray(team) || team.length === 0) return false
      return new Set(team.map(p => p.nationality).filter(Boolean)).size >= 4
    },
  },

  // ── New Mode medals ───────────────────────────────────────────────────────
  {
    id:    'free_spirit',
    icon:  '🔓',
    name:  'Free Spirit',
    desc:  'Win the IPL with Free Positions ON',
    check: ({ iplOutcome, freePositions }) =>
      iplOutcome === 'champion' && freePositions === true,
  },
  {
    id:    'blind_faith',
    icon:  '🕶️',
    name:  'Blind Faith',
    desc:  'Win the IPL with Hidden Ratings ON',
    check: ({ iplOutcome, hiddenRatings }) =>
      iplOutcome === 'champion' && hiddenRatings === true,
  },
  {
    id:    'chaos_champion',
    icon:  '🌪️',
    name:  'Chaos Champion',
    desc:  'Win the IPL with Free Positions AND Hidden Ratings both ON',
    check: ({ iplOutcome, freePositions, hiddenRatings }) =>
      iplOutcome === 'champion' && freePositions === true && hiddenRatings === true,
  },
  {
    id:    'all_chaos',
    icon:  '💥',
    name:  'Full Chaos',
    desc:  'Win the IPL with Free Positions, Hidden Ratings, and Overseas Limit all active simultaneously',
    check: ({ iplOutcome, freePositions, hiddenRatings, overseasLimit }) =>
      iplOutcome === 'champion' && freePositions === true && hiddenRatings === true && overseasLimit === false,
  },
  {
    id:    'free_perfect',
    icon:  '💫',
    name:  'Free & Flawless',
    desc:  'Win an unbeaten IPL season with Free Positions ON',
    check: ({ iplOutcome, losses, freePositions }) =>
      iplOutcome === 'champion' && losses === 0 && freePositions === true,
  },
  {
    id:    'sixth_sense',
    icon:  '👁️',
    name:  'Sixth Sense',
    desc:  'Win an unbeaten IPL season with Hidden Ratings ON',
    check: ({ iplOutcome, losses, hiddenRatings }) =>
      iplOutcome === 'champion' && losses === 0 && hiddenRatings === true,
  },
  {
    id:    'border_free',
    icon:  '✈️',
    name:  'No Borders',
    desc:  'Win the IPL with Overseas Limit OFF',
    check: ({ iplOutcome, overseasLimit }) =>
      iplOutcome === 'champion' && overseasLimit === false,
  },
  {
    id:    'foreign_legion',
    icon:  '🌐',
    name:  'Foreign Legion',
    desc:  'Win the IPL with 5+ overseas players (Overseas Limit OFF)',
    check: ({ iplOutcome, overseasLimit, team }) =>
      iplOutcome === 'champion' &&
      overseasLimit === false &&
      Array.isArray(team) &&
      team.filter(p => p.nationality !== 'India').length >= 5,
  },
  {
    id:    'all_import',
    icon:  '🛬',
    name:  'World XI',
    desc:  'Win the IPL with 7+ overseas players (Overseas Limit OFF)',
    check: ({ iplOutcome, overseasLimit, team }) =>
      iplOutcome === 'champion' &&
      overseasLimit === false &&
      Array.isArray(team) &&
      team.filter(p => p.nationality !== 'India').length >= 7,
  },
  {
    id:    'prime_free',
    icon:  '✨',
    name:  'Prime Blind',
    desc:  'Win the IPL in Prime ratings mode with Hidden Ratings ON',
    check: ({ iplOutcome, ratingType, hiddenRatings }) =>
      iplOutcome === 'champion' && ratingType === 'prime' && hiddenRatings === true,
  },

  // ── Budget medals ─────────────────────────────────────────────────────────
  {
    id:    'bargain_champ',
    icon:  '💰',
    name:  'Bargain Champ',
    desc:  'Win the IPL on ₹75cr or less starting budget',
    check: ({ iplOutcome, budget }) =>
      iplOutcome === 'champion' && (budget ?? 110) <= 75,
  },
  {
    id:    'broke_brilliant',
    icon:  '🪙',
    name:  'Broke & Brilliant',
    desc:  'Win the IPL on ₹65cr starting budget',
    check: ({ iplOutcome, budget }) =>
      iplOutcome === 'champion' && (budget ?? 110) <= 65,
  },
  {
    id:    'big_spender',
    icon:  '🤑',
    name:  'Cash Splash',
    desc:  'Win the IPL on the maximum ₹125cr starting budget',
    check: ({ iplOutcome, budget }) =>
      iplOutcome === 'champion' && (budget ?? 110) >= 125,
  },
  {
    id:    'budget_squeeze',
    icon:  '💸',
    name:  'Shoestring',
    desc:  'Qualify for the IPL Playoffs on ₹70cr or less budget',
    check: ({ iplPosition, budget }) =>
      iplPosition != null && iplPosition <= 4 && (budget ?? 110) <= 70,
  },
  {
    id:    'budget_prime',
    icon:  '⚡💰',
    name:  'Value Prime',
    desc:  'Win the IPL in Prime ratings mode on ₹80cr or less budget',
    check: ({ iplOutcome, ratingType, budget }) =>
      iplOutcome === 'champion' && ratingType === 'prime' && (budget ?? 110) <= 80,
  },

  // ── Season win count medals ───────────────────────────────────────────────
  {
    id:    'baker_dozen',
    icon:  '🥖',
    name:  "Baker's Dozen",
    desc:  'Finish an IPL season with 13+ wins',
    check: ({ wins, mode }) => wins >= 13 && mode === 'ipl',
  },
  {
    id:    'invincible',
    icon:  '🛡️',
    name:  'Invincible',
    desc:  'Finish an IPL season with 14+ wins',
    check: ({ wins, mode }) => wins >= 14 && mode === 'ipl',
  },
  {
    id:    'gritty',
    icon:  '🪨',
    name:  'Gritty',
    desc:  'Win the IPL losing only 1 match all season',
    check: ({ iplOutcome, losses }) =>
      iplOutcome === 'champion' && losses === 1,
  },

  // ── Difficulty medals ─────────────────────────────────────────────────────
  {
    id:    'easy_champion',
    icon:  '😎',
    name:  'Easy Does It',
    desc:  'Win the IPL on Easy difficulty',
    check: ({ iplOutcome, difficulty }) =>
      iplOutcome === 'champion' && difficulty === 'easy',
  },
  {
    id:    'medium_champion',
    icon:  '🥩',
    name:  'Medium Rare',
    desc:  'Win the IPL on Medium difficulty',
    check: ({ iplOutcome, difficulty }) =>
      iplOutcome === 'champion' && difficulty === 'normal',
  },

  // ── Career milestone medals ───────────────────────────────────────────────
  {
    id:    'five_seasons',
    icon:  '🎮',
    name:  'Five-Timer',
    desc:  'Play 5 seasons',
    check: ({ totalSeasons }) => (totalSeasons ?? 0) >= 5,
  },
  {
    id:    'emperor',
    icon:  '🏯',
    name:  'Emperor',
    desc:  'Win the IPL 5 times',
    check: ({ iplWins }) => (iplWins ?? 0) >= 5,
  },
  {
    id:    'ipl_god',
    icon:  '⚡🏆',
    name:  'IPL God',
    desc:  'Win the IPL 10 times',
    check: ({ iplWins }) => (iplWins ?? 0) >= 10,
  },
  {
    id:    'century_club',
    icon:  '💯',
    name:  'Century Club',
    desc:  'Play 100 seasons',
    check: ({ totalSeasons }) => (totalSeasons ?? 0) >= 100,
  },
  {
    id:    'season_star',
    icon:  '⭐',
    name:  'Season Star',
    desc:  'Win the IPL at least twice across 3+ total seasons',
    check: ({ iplWins, totalSeasons }) =>
      (iplWins ?? 0) >= 2 && (totalSeasons ?? 0) >= 3,
  },
  {
    id:    'comeback_trail',
    icon:  '🔄',
    name:  'Comeback Trail',
    desc:  'Win the IPL the season after being a runner-up',
    check: ({ iplOutcome, history }) =>
      iplOutcome === 'champion' &&
      Array.isArray(history) && history.length >= 1 &&
      history[0]?.iplOutcome === 'runner-up',
  },

  // ── Multi-season run medals ───────────────────────────────────────────────
  {
    id:    'third_season',
    icon:  '🔺',
    name:  'Hat-Trick Run',
    desc:  'Reach season 3 of the same continuous run',
    check: ({ seasonNumber }) => (seasonNumber ?? 1) >= 3,
  },
  {
    id:    'long_campaign',
    icon:  '🗓️',
    name:  'Long Campaign',
    desc:  'Reach season 5 of the same continuous run',
    check: ({ seasonNumber }) => (seasonNumber ?? 1) >= 5,
  },

  // ── Squad composition medals ──────────────────────────────────────────────
  {
    id:    'keeper_pair',
    icon:  '🧤',
    name:  'Twin Gloves',
    desc:  'Win the IPL with 2 wicket-keepers in your squad',
    check: ({ iplOutcome, composition }) =>
      iplOutcome === 'champion' &&
      composition != null &&
      (composition['wicket-keeper'] ?? 0) >= 2,
  },
  {
    id:    'opener_heavy',
    icon:  '🏏',
    name:  'Opening Party',
    desc:  'Win the IPL with 4+ openers in your squad',
    check: ({ iplOutcome, composition }) =>
      iplOutcome === 'champion' &&
      composition != null &&
      (composition['opener'] ?? 0) >= 4,
  },
  {
    id:    'pure_pace',
    icon:  '💨',
    name:  'Pure Pace',
    desc:  'Win the IPL with 5+ pace bowlers in your squad',
    check: ({ iplOutcome, composition }) =>
      iplOutcome === 'champion' &&
      composition != null &&
      (composition['pace-bowler'] ?? 0) >= 5,
  },
  {
    id:    'spin_city',
    icon:  '🌀',
    name:  'Spin City',
    desc:  'Win the IPL with 5+ spinners in your squad',
    check: ({ iplOutcome, composition }) =>
      iplOutcome === 'champion' &&
      composition != null &&
      (composition['spin-bowler'] ?? 0) >= 5,
  },
  {
    id:    'no_allrounders',
    icon:  '🎯',
    name:  'Specialists Only',
    desc:  'Win the IPL with 0 all-rounders in your squad',
    check: ({ iplOutcome, composition }) =>
      iplOutcome === 'champion' &&
      composition != null &&
      (composition['all-rounder'] ?? 0) === 0,
  },
  {
    id:    'batting_paradise',
    icon:  '🏏💥',
    name:  'Batting Paradise',
    desc:  'Win the IPL with 8+ batting players (openers + top + middle + keeper)',
    check: ({ iplOutcome, composition }) => {
      if (iplOutcome !== 'champion' || composition == null) return false
      const batters = (composition['opener'] ?? 0) + (composition['top-order'] ?? 0)
        + (composition['middle-order'] ?? 0) + (composition['wicket-keeper'] ?? 0)
      return batters >= 8
    },
  },
  {
    id:    'middle_order_mayhem',
    icon:  '⚡🏏',
    name:  'Middle Mayhem',
    desc:  'Win the IPL with 4+ middle-order batters in your squad',
    check: ({ iplOutcome, composition }) =>
      iplOutcome === 'champion' &&
      composition != null &&
      (composition['middle-order'] ?? 0) >= 4,
  },

  // ── Era / nationality medals ──────────────────────────────────────────────
  {
    id:    'classic_glory',
    icon:  '📼',
    name:  'Classic Glory',
    desc:  'Win the IPL with a squad drawn entirely from 2008–2014 seasons',
    check: ({ iplOutcome, team }) => {
      if (iplOutcome !== 'champion' || !Array.isArray(team) || team.length === 0) return false
      const getYear = p => {
        if (!p.iplYear) return null
        const m = String(p.iplYear).match(/\d{4}/)
        return m ? parseInt(m[0]) : null
      }
      const years = team.map(getYear)
      return years.every(y => y != null && y <= 2014)
    },
  },
  {
    id:    'modern_glory',
    icon:  '🔮',
    name:  'Modern Glory',
    desc:  'Win the IPL with a squad drawn entirely from 2015+ seasons',
    check: ({ iplOutcome, team }) => {
      if (iplOutcome !== 'champion' || !Array.isArray(team) || team.length === 0) return false
      const getYear = p => {
        if (!p.iplYear) return null
        const m = String(p.iplYear).match(/\d{4}/)
        return m ? parseInt(m[0]) : null
      }
      const years = team.map(getYear)
      return years.every(y => y != null && y >= 2015)
    },
  },
  {
    id:    'era_blend',
    icon:  '⏳',
    name:  'Time Machine',
    desc:  'Win the IPL with players from both Classic (≤2014) and Modern (≥2015) eras',
    check: ({ iplOutcome, team }) => {
      if (iplOutcome !== 'champion' || !Array.isArray(team) || team.length === 0) return false
      const getYear = p => {
        if (!p.iplYear) return null
        const m = String(p.iplYear).match(/\d{4}/)
        return m ? parseInt(m[0]) : null
      }
      const years = team.map(getYear).filter(Boolean)
      return years.some(y => y <= 2014) && years.some(y => y >= 2015)
    },
  },
  {
    id:    'indian_core',
    icon:  '🇮🇳',
    name:  'Indian Core',
    desc:  'Win the IPL with 8+ Indian players in your squad',
    check: ({ iplOutcome, team }) =>
      iplOutcome === 'champion' &&
      Array.isArray(team) &&
      team.filter(p => p.nationality === 'India').length >= 8,
  },
  {
    id:    'caribbean_fire',
    icon:  '🌴',
    name:  'Caribbean Fire',
    desc:  'Win the IPL with 3+ West Indies players in your squad',
    check: ({ iplOutcome, team }) =>
      iplOutcome === 'champion' &&
      Array.isArray(team) &&
      team.filter(p => p.nationality === 'West Indies').length >= 3,
  },
]

// ─── Default profile shape ──────────────────────────────────────────────────

function defaultProfile() {
  return {
    email:         null,
    displayName:   null,
    createdAt:     new Date().toISOString(),
    totalSeasons:  0,
    iplWins:       0,            // count of IPL championships
    modesWon:      [],           // array (serialised Set)
    awards:        [],           // earned award IDs
    history:       [],           // [{mode, wins, losses, stageReached, iplOutcome, rating, date}]
  }
}

// ─── Storage layer (swap for API calls when hosting) ───────────────────────

// Use sessionStorage — data clears on tab close for logged-out users.
// Signed-in users have their data persisted in Supabase.
const storage = {
  load() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  },
  save(profile) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(profile)) }
    catch { /* quota exceeded / SSR */ }
  },
  clear() {
    try { sessionStorage.removeItem(STORAGE_KEY) }
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
/**
 * @param {object}  data       - season result data
 * @param {boolean} isLoggedIn - awards computed but only persisted when true
 */
export function recordSeason(data, isLoggedIn = false) {
  const p = loadProfile()

  // Increment counters
  p.totalSeasons = (p.totalSeasons ?? 0) + 1
  if (data.iplOutcome === 'champion') p.iplWins = (p.iplWins ?? 0) + 1

  // Track modes won
  const modesWonSet = new Set(p.modesWon ?? [])
  if (data.iplOutcome === 'champion') modesWonSet.add('ipl')
  if (data.stageReached === 'Champion' && data.mode === 'odi-wc') modesWonSet.add('odi-wc')
  if (data.stageReached === 'Champion' && data.mode === 't20-wc') modesWonSet.add('t20-wc')
  p.modesWon = [...modesWonSet]

  // Check awards — always compute newlyEarned, only persist if logged in
  const earnedSet = new Set(p.awards ?? [])
  const context = { ...data, modesWon: modesWonSet, totalSeasons: p.totalSeasons, iplWins: p.iplWins, history: p.history ?? [], runId: data.runId ?? null }
  const newlyEarned = []

  for (const award of AWARDS) {
    if (earnedSet.has(award.id)) continue
    try {
      if (award.check(context)) {
        newlyEarned.push(award)
        if (isLoggedIn) earnedSet.add(award.id)
      }
    } catch { /* */ }
  }
  if (isLoggedIn) p.awards = [...earnedSet]

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
      runId:        data.runId ?? null,
      seasonNumber: data.seasonNumber ?? null,
      date:         new Date().toISOString(),
    },
    ...(p.history ?? []),
  ].slice(0, 50)

  saveProfile(p)
  return { profile: p, newlyEarned }
}

/**
 * Call once after sign-in to persist all medals earned this session.
 */
export function mergeSessionAwardsOnSignIn(awardIds) {
  if (!awardIds?.length) return
  const p = loadProfile()
  const earnedSet = new Set(p.awards ?? [])
  awardIds.forEach(id => earnedSet.add(id))
  p.awards = [...earnedSet]
  saveProfile(p)
}

export function clearProfile() {
  storage.clear()
}
