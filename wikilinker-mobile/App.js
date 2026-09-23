// App.js — WikiLinker root (v5)
//   • Global ThemeContext (Single Source of Truth) — dark/light with toggle,
//     persisted across launches, zero prop-drilling
//   • Solo flow + Personal Bests Vault (AsyncStorage)
//   • Socket.io real-time multiplayer wiring
//   • Achievements Board — 8 hidden accolades
//
// THEME ARCHITECTURE:
//   <ThemeProvider>  (owns isDarkMode + palette; ./ThemeContext.js)
//     <AppShell/>    (consumes useTheme; ALL colors flow from context)
//   Every StyleSheet that touches color is now a makeXxxStyles(colors)
//   FACTORY memoized against the palette — this is what fixes the
//   "sub-screens default to light / wrong text visibility" bug: module-level
//   StyleSheet.create froze colors at import time, so toggling could never
//   reach them. Factories re-run on toggle; everything flips atomically.
//   `type`, `space`, `radii` stay as static imports — they're not colors.
//
// ─── SERVER CONTRACT (unchanged) ────────────────────────────────────────────
//   CLIENT EMITS (all with ack callbacks):
//     'room:create'  { name }            → ack { ok, code, players, track, hostId } | { ok:false, error }
//     'room:join'    { code, name }      → ack { ok, code, players, track, hostId } | { ok:false, error }
//     'room:leave'   { code }
//     'room:shuffle' { code }            → host only; broadcasts room:update
//     'race:start'   { code }            → host only; broadcasts race:start
//     'player:navigate' { code, title, clicks }
//     'player:finish'   { code, clicks, seconds, path }
//   SERVER BROADCASTS:
//     'room:update'  { players: [{id,name,isHost}], track: {start,target}, hostId }
//     'race:start'   { track: {start,target} }
// ────────────────────────────────────────────────────────────────────────────
//
// EXPO GO NOTE: 'localhost' will NOT work from a physical iPhone. Use your
// Mac Mini's LAN IP (e.g. http://192.168.1.42:3000) or set
// EXPO_PUBLIC_WIKILINKER_SERVER in .env.
//
// PRODUCTION: defaults to the live Render backend. Override with
// EXPO_PUBLIC_WIKILINKER_SERVER for local development.


import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import HomeScreen from './HomeScreen';
import GameScreen from './GameScreen';
import RouteMapScreen from './RouteMapScreen';
import LobbyScreen from './LobbyScreen';
import { ThemeProvider, ThemeContext } from './ThemeContext';
import { type, space, radii } from './theme';

// ---------------------------------------------------------------------------
// SOCKET — one persistent instance for the whole app lifetime
// ---------------------------------------------------------------------------
const SERVER_URL =
  process.env.EXPO_PUBLIC_WIKILINKER_SERVER ?? 'https://wikilinker-webservice.onrender.com';


export const socket = io(SERVER_URL, {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

const ACK_TIMEOUT_MS = 5000;

const ADJ = ['Turbo', 'Sneaky', 'Cosmic', 'Feral', 'Dapper', 'Chaotic', 'Silent', 'Golden'];
const NOUN = ['Llama', 'Falcon', 'Badger', 'Comet', 'Wombat', 'Pixel', 'Otter', 'Mongoose'];
const randomName = () =>
  ADJ[Math.floor(Math.random() * ADJ.length)] + NOUN[Math.floor(Math.random() * NOUN.length)];

// ---------------------------------------------------------------------------
// ACHIEVEMENTS BANK — 8 hidden accolades (requirements live ONLY in `check`)
// ---------------------------------------------------------------------------
const ACHIEVEMENTS = [
  {
    id: 'speed_of_light',
    emoji: '⚡',
    title: 'SPEED OF LIGHT',
    flavor: 'You crossed the encyclopedia before the ink dried.',
    check: (r) => r.finished && r.clicks <= 3 && r.seconds < 45,
  },
  {
    id: 'wikipedia_scholar',
    emoji: '🧠',
    title: 'WIKIPEDIA SCHOLAR',
    flavor: 'Few clicks, no hurry. You actually read the articles.',
    check: (r) => r.finished && r.clicks <= 4 && r.seconds >= 60,
  },
  {
    id: 'hyper_racer',
    emoji: '🏎️',
    title: 'HYPER RACER',
    flavor: 'Pure velocity through the hyperlinks.',
    check: (r) => r.finished && ((r.clicks >= 5 && r.clicks <= 7) || r.seconds < 35),
  },
  {
    id: 'tourist_scenic_route',
    emoji: '🧭',
    title: 'TOURIST SCENIC ROUTE',
    flavor: 'You took the long way around and enjoyed every view.',
    check: (r) => r.finished && r.clicks >= 8 && r.clicks <= 14,
  },
  {
    id: 'rabbit_hole_avoider',
    emoji: '🕳️',
    title: 'RABBIT HOLE AVOIDER',
    flavor: 'Deep in the warren, you still found daylight.',
    check: (r) => r.finished && r.clicks >= 15 && r.clicks <= 25,
  },
  {
    id: 'core_of_the_earth',
    emoji: '🌋',
    title: 'CORE OF THE EARTH',
    flavor: 'You dug so deep the links turned to magma.',
    check: (r) => r.finished && r.clicks > 25,
  },
  {
    id: 'leisurely_cruise',
    emoji: '🐢',
    title: 'LEISURELY CRUISE',
    flavor: 'The target waited. You arrived fashionably late.',
    check: (r) => r.finished && r.seconds > 300,
  },
  {
    id: 'regret_resignation',
    emoji: '🏳️',
    title: 'REGRET & RESIGNATION',
    flavor: 'Some races end with a white flag. This was one of them.',
    check: (r) => !r.finished,
  },
];

const evaluateRun = (run) =>
  ACHIEVEMENTS.filter((a) => a.check(run)).map((a) => a.id);

const achievementById = (id) => ACHIEVEMENTS.find((a) => a.id === id);

// ---------------------------------------------------------------------------
// ACHIEVEMENTS STORAGE
// ---------------------------------------------------------------------------
const ACHIEVEMENTS_KEY = '@wikilinker/unlocked_achievements_v1';

export async function getUnlockedAchievements() {
  try {
    const raw = await AsyncStorage.getItem(ACHIEVEMENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function unlockAchievements(earnedIds) {
  try {
    const existing = await getUnlockedAchievements();
    const newlyUnlocked = earnedIds.filter((id) => !existing.includes(id));
    if (newlyUnlocked.length === 0) {
      return { unlocked: existing, newlyUnlocked: [] };
    }
    const merged = [...existing, ...newlyUnlocked];
    await AsyncStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(merged));
    return { unlocked: merged, newlyUnlocked };
  } catch {
    return { unlocked: [], newlyUnlocked: [] };
  }
}

export async function clearAchievements() {
  try { await AsyncStorage.removeItem(ACHIEVEMENTS_KEY); } catch {}
}

// ---------------------------------------------------------------------------
// PERSONAL RECORDS ENGINE (solo only)
// ---------------------------------------------------------------------------
const RECORDS_KEY = '@wikilinker/solo_records_v1';
const MAX_RECORDS = 10;

const compareRuns = (a, b) =>
  a.clicks - b.clicks || a.seconds - b.seconds || b.savedAt - a.savedAt;

export async function getSoloRecords() {
  try {
    const raw = await AsyncStorage.getItem(RECORDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveSoloRun(start, target, clicks, seconds) {
  const record = {
    id: 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    start,
    target,
    clicks,
    seconds,
    savedAt: Date.now(),
    dateISO: new Date().toISOString(),
  };
  try {
    const existing = await getSoloRecords();
    const merged = [...existing, record].sort(compareRuns).slice(0, MAX_RECORDS);
    await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(merged));
    const rank = merged.findIndex((r) => r.id === record.id);
    return { records: merged, isNewRecord: rank !== -1, rank: rank + 1 };
  } catch {
    return { records: [], isNewRecord: false, rank: 0 };
  }
}

export async function clearSoloRecords() {
  try { await AsyncStorage.removeItem(RECORDS_KEY); } catch {}
}

// ---------------------------------------------------------------------------
// SHARED FORMATTERS
// ---------------------------------------------------------------------------
const fmtTime = (s = 0) =>
  Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

const fmtDate = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

const MEDALS = ['🥇', '🥈', '🥉'];

// ---------------------------------------------------------------------------
// MY RECORDS SCOREBOARD — pulls its palette from context, not props
// ---------------------------------------------------------------------------
function RecordsModal({ visible, records, onClose, onClear }) {
  const { colors } = useContext(ThemeContext);
  const r = useMemo(() => makeRecordsStyles(colors), [colors]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={r.backdrop}>
        <View style={r.sheet}>
          <View style={r.grabber} />
          <View style={r.headRow}>
            <Text style={r.title}>The Vault</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={r.close}>✕</Text>
            </Pressable>
          </View>
          <Text style={r.subtitle}>YOUR TOP {MAX_RECORDS} SOLO RUNS</Text>

          {records.length === 0 ? (
            <View style={r.empty}>
              <Text style={r.emptyEmoji}>🏛️</Text>
              <Text style={r.emptyText}>
                The vault is empty. Finish a solo run and it lives here forever.
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {records.map((rec, i) => (
                <View key={rec.id} style={[r.row, i === 0 && r.rowGold]}>
                  <Text style={r.rank}>{MEDALS[i] ?? '#' + (i + 1)}</Text>
                  <View style={r.runInfo}>
                    <Text style={r.route} numberOfLines={1}>
                      <Text style={r.routeStart}>{rec.start}</Text>
                      <Text style={r.routeArrow}> → </Text>
                      <Text style={r.routeTarget}>{rec.target}</Text>
                    </Text>
                    <Text style={r.meta}>
                      {rec.clicks} clicks · {fmtTime(rec.seconds)} · {fmtDate(rec.dateISO)}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {records.length > 0 && (
            <Pressable onPress={onClear} hitSlop={8} style={r.clearBtn}>
              <Text style={r.clearText}>Clear All Records</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// ACCOLADES BOARD — locked slots stay redacted in both themes
// ---------------------------------------------------------------------------
function AccoladesModal({ visible, unlockedIds, onClose }) {
  const { colors } = useContext(ThemeContext);
  const a = useMemo(() => makeAccoladesStyles(colors), [colors]);
  const unlockedCount = ACHIEVEMENTS.filter((x) => unlockedIds.includes(x.id)).length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={a.backdrop}>
        <View style={a.sheet}>
          <View style={a.grabber} />
          <View style={a.headRow}>
            <Text style={a.title}>
              <Text style={a.promptChar}>{'>'}</Text> ACCOLADES
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={a.close}>✕</Text>
            </Pressable>
          </View>
          <Text style={a.subtitle}>
            {unlockedCount} / {ACHIEVEMENTS.length} UNLOCKED — KEEP RACING TO REVEAL THE REST
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={a.grid}>
              {ACHIEVEMENTS.map((ach) => {
                const isUnlocked = unlockedIds.includes(ach.id);

                if (!isUnlocked) {
                  return (
                    <View key={ach.id} style={[a.card, a.cardLocked]}>
                      <Text style={a.lockEmoji}>🔒</Text>
                      <Text style={a.lockedTitle}>[ LOCKED ACCOLADE ]</Text>
                      <View style={a.silhouetteWide} />
                      <View style={a.silhouetteNarrow} />
                    </View>
                  );
                }

                return (
                  <View key={ach.id} style={[a.card, a.cardUnlocked]}>
                    <Text style={a.achEmoji}>{ach.emoji}</Text>
                    <Text style={a.achTitle}>{ach.title}</Text>
                    <Text style={a.achFlavor}>{ach.flavor}</Text>
                  </View>
                );
              })}
            </View>
            <View style={{ height: space(6) }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// APP SHELL — the whole app, living INSIDE the provider
// ---------------------------------------------------------------------------
function AppShell() {
  const { colors, isDarkMode, toggleTheme } = useContext(ThemeContext);
  const styles = useMemo(() => makeRootStyles(colors), [colors]);

  const [screen, setScreen] = useState('home');   // 'home' | 'lobby' | 'game' | 'results'
  const [mode, setMode] = useState('solo');       // 'solo' | 'multi'
  const [run, setRun] = useState(null);
  const [result, setResult] = useState(null);

  // Vault (solo)
  const [records, setRecords] = useState([]);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [recordToast, setRecordToast] = useState(null);

  // Achievements
  const [achievements, setAchievements] = useState([]);
  const [accoladesOpen, setAccoladesOpen] = useState(false);
  const [achievementToast, setAchievementToast] = useState(null);
  const achToastTimer = useRef(null);

  // Username (persisted)
  const [username, setUsername] = useState(null);
  const [usernamePending, setUsernamePending] = useState(true);
  const [usernameInput, setUsernameInput] = useState('');

  // Multiplayer lobby state
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [lobbyCode, setLobbyCode] = useState(null);
  const [playersList, setPlayersList] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [track, setTrack] = useState({ start: '…', target: '…' });
  const [joinError, setJoinError] = useState(null);
  const [multiplayerStatus, setMultiplayerStatus] = useState(null);
  const [raceScores, setRaceScores] = useState(null);

  const playerNameRef = useRef(randomName());
  const errorTimer = useRef(null);

  // ── Load persisted username on launch ──
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('username');
        if (saved) {
          setUsername(saved);
          playerNameRef.current = saved;
        }
      } catch {}
      setUsernamePending(false);
    })();
  }, []);

  // ── Save username when set ──
  const handleSetUsername = useCallback((name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setUsername(trimmed);
    playerNameRef.current = trimmed;
    AsyncStorage.setItem('username', trimmed).catch(() => {});
  }, []);

  useEffect(() => {
    getSoloRecords().then(setRecords);
    getUnlockedAchievements().then(setAchievements);
  }, []);

  useEffect(() => () => {
    clearTimeout(errorTimer.current);
    clearTimeout(achToastTimer.current);
  }, []);

  const flashError = useCallback((msg) => {
    setJoinError(msg);
    clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setJoinError(null), 3500);
  }, []);

  const flashAchievementToast = useCallback((msg) => {
    setAchievementToast(msg);
    clearTimeout(achToastTimer.current);
    achToastTimer.current = setTimeout(() => setAchievementToast(null), 5000);
  }, []);

  // ---- ACHIEVEMENT VALIDATION HOOK ----------------------------------------
  const processRunForAchievements = useCallback(async ({ clicks, seconds, finished }) => {
    const earned = evaluateRun({
      clicks: clicks ?? 0,
      seconds: seconds ?? 0,
      finished: !!finished,
    });
    if (earned.length === 0) return;

    const { unlocked, newlyUnlocked } = await unlockAchievements(earned);
    if (unlocked.length) setAchievements(unlocked);

    if (newlyUnlocked.length) {
      const names = newlyUnlocked
        .map((id) => {
          const ach = achievementById(id);
          return ach ? ach.emoji + ' ' + ach.title : null;
        })
        .filter(Boolean)
        .join('  ·  ');
      flashAchievementToast('🏅 ACCOLADE UNLOCKED: ' + names);
    }
  }, [flashAchievementToast]);

  // ---- SOCKET LISTENERS ---------------------------------------------------
  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    const onRoomUpdate = (payload = {}) => {
      if (Array.isArray(payload.players)) {
        setPlayersList(payload.players);
        // Derive live race scores from the players list (source of truth)
        setRaceScores(
          payload.players.map((p) => ({
            id: p.id,
            name: p.name,
            clicks: p.clicks ?? 0,
            finished: p.finished ?? false,
          }))
        );
      }
      if (payload.track) setTrack(payload.track);
      if (payload.hostId) setIsHost(payload.hostId === socket.id);
    };

    const onRaceStart = (payload = {}) => {
      const t = payload.track;
      if (!t?.start || !t?.target) return;
      setResult(null);
      setRecordToast(null);
      setMode('multi');
      setRun({ startPage: t.start, targetPage: t.target });
      setScreen('game');
    };

    const onRaceStatus = (payload = {}) => {
      // payload: { players: [{name, finished}], waiting: bool }
      setMultiplayerStatus(payload);
    };

    const onRaceUpdateScores = (payload = {}) => {
      // payload: { scores: [{id, name, clicks, finished}] }
      setRaceScores(payload.scores ?? null);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:update', onRoomUpdate);
    socket.on('race:start', onRaceStart);
    socket.on('race:status', onRaceStatus);
    socket.on('race:update-scores', onRaceUpdateScores);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:update', onRoomUpdate);
      socket.off('race:start', onRaceStart);
      socket.off('race:status', onRaceStatus);
      socket.off('race:update-scores', onRaceUpdateScores);
    };
  }, []);

  const adoptLobby = useCallback((res) => {
    setLobbyCode(res.code);
    setPlayersList(res.players ?? []);
    setTrack(res.track ?? { start: '…', target: '…' });
    setIsHost(res.hostId === socket.id);
    setScreen('lobby');
  }, []);

  const handleCreateRace = useCallback(() => {
    if (!socket.connected) return flashError('Not connected to server — check SERVER_URL');
    socket.timeout(ACK_TIMEOUT_MS).emit(
      'room:create',
      { name: playerNameRef.current },
      (timeoutErr, res) => {
        if (timeoutErr) return flashError('Server didn\u2019t respond — is it running?');
        if (!res?.ok) return flashError(res?.error ?? 'Could not create room');
        adoptLobby(res);
      }
    );
  }, [adoptLobby, flashError]);

  const handleJoinRace = useCallback((code) => {
    if (!socket.connected) return flashError('Not connected to server — check SERVER_URL');
    socket.timeout(ACK_TIMEOUT_MS).emit(
      'room:join',
      { code, name: playerNameRef.current },
      (timeoutErr, res) => {
        if (timeoutErr) return flashError('Server didn\u2019t respond — is it running?');
        if (!res?.ok) return flashError(res?.error ?? 'Could not join room');
        adoptLobby(res);
      }
    );
  }, [adoptLobby, flashError]);

  const handleStartRace = useCallback(() => {
    socket.emit('race:start', { code: lobbyCode });
  }, [lobbyCode]);

  const handleChangeTrack = useCallback(() => {
    socket.emit('room:shuffle', { code: lobbyCode });
  }, [lobbyCode]);

  const handleEditTrack = useCallback(({ start, target }) => {
    socket.timeout(ACK_TIMEOUT_MS).emit(
      'track:change',
      { code: lobbyCode, start, target },
      (timeoutErr, res) => {
        if (timeoutErr) return flashError('Server didn\u2019t respond — is it running?');
        if (!res?.ok) return flashError(res?.error ?? 'Could not update track');
      }
    );
  }, [lobbyCode, flashError]);

  const resetLobbyState = useCallback(() => {
    setLobbyCode(null);
    setPlayersList([]);
    setIsHost(false);
    setTrack({ start: '…', target: '…' });
  }, []);

  const handleLeaveLobby = useCallback(() => {
    socket.emit('room:leave', { code: lobbyCode });
    resetLobbyState();
    setScreen('home');
  }, [lobbyCode, resetLobbyState]);

  const startSolo = useCallback(({ startPage, targetPage }) => {
    setResult(null);
    setRecordToast(null);
    setMode('solo');
    setRun({ startPage, targetPage });
    setScreen('game');
  }, []);

  const handleInGameNavigate = useCallback((title, path) => {
    if (mode === 'multi' && lobbyCode) {
      socket.emit('player:navigate', { code: lobbyCode, title, clicks: path.length - 1 });
    }
  }, [mode, lobbyCode]);

  const handleReachedTarget = useCallback(async ({ clicks, path, seconds }) => {
    setResult({ path, clicks, seconds, finished: true });
    setScreen('results');

    processRunForAchievements({ clicks, seconds, finished: true });

    if (mode === 'multi' && lobbyCode) {
      socket.emit('player:finish', { code: lobbyCode, clicks, seconds, path });
      return;
    }

    const { records: updated, isNewRecord, rank } = await saveSoloRun(
      run?.startPage ?? path[0],
      run?.targetPage ?? path[path.length - 1],
      clicks,
      seconds
    );
    setRecords(updated);
    if (isNewRecord) {
      setRecordToast('★ NEW PERSONAL BEST — #' + rank + ' IN THE VAULT');
    }
  }, [mode, lobbyCode, run, processRunForAchievements]);

  const handleQuit = useCallback(({ clicks, path, seconds } = {}) => {
    processRunForAchievements({
      clicks: clicks ?? (Array.isArray(path) ? Math.max(0, path.length - 1) : 0),
      seconds: seconds ?? 0,
      finished: false,
    });

    // NOTE: Do NOT emit room:leave or resetLobbyState here.
    // The room stays alive so the player can return to the lobby
    // from the results screen via handleRestart or handleBackToLobby.
    // The room is only cleaned up when the user explicitly presses
    // LEAVE in the lobby or HOME on the results screen.

    if (Array.isArray(path) && path.length) {
      setResult({
        path,
        clicks: clicks ?? path.length - 1,
        seconds: seconds ?? 0,
        finished: false,
      });
      setScreen('results');
    } else {
      setScreen('home');
    }
  }, [processRunForAchievements]);

  const handleRestart = useCallback(() => {
    setResult(null);
    setRecordToast(null);
    if (mode === 'multi') {
      // Return to the lobby — server still holds the room, don't wipe state.
      setScreen('lobby');
    } else {
      setMode('solo');
      setScreen('home');
    }
  }, [mode]);

  const handleRaceAgain = useCallback(({ startPage, targetPage }) => {
    console.log('[App] handleRaceAgain called — lobbyCode:', lobbyCode, 'mode:', mode);
    if (lobbyCode) {
      // Multiplayer: go back to the existing lobby
      console.log('[App] Active lobby detected — returning to lobby', lobbyCode);
      setResult(null);
      setRecordToast(null);
      setScreen('lobby');
      return;
    }
    // Solo: start a new race
    setResult(null);
    setRecordToast(null);
    setMode('solo');
    setRun({ startPage, targetPage });
    setScreen('game');
  }, [lobbyCode, mode]);

  const handleBackToLobby = useCallback(() => {
    setResult(null);
    setRecordToast(null);
    setScreen('lobby');
  }, []);

  const handleHome = useCallback(() => {
    setResult(null);
    setRecordToast(null);
    setMode('solo');
    setScreen('home');
  }, []);

  const handleClearRecords = useCallback(async () => {
    await clearSoloRecords();
    setRecords([]);
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={colors.ink}
      />

      {screen === 'home' && (
        <>
          <HomeScreen
            onStartSolo={startSolo}
            onJoin={handleJoinRace}
            onCreate={handleCreateRace}
          />

          {/* Bottom pill row: records + accolades */}
          <View style={styles.pillRow}>
            <Pressable
              onPress={() => setVaultOpen(true)}
              style={({ pressed }) => [styles.vaultBtn, pressed && styles.pillPressed]}
              hitSlop={8}
            >
              <Text style={styles.vaultText}>🏆 MY RECORDS</Text>
            </Pressable>
            <Pressable
              onPress={() => setAccoladesOpen(true)}
              style={({ pressed }) => [styles.accoladesBtn, pressed && styles.pillPressed]}
              hitSlop={8}
            >
              <Text style={styles.accoladesText}>🏅 ACCOLADES</Text>
            </Pressable>
          </View>

          {/* Theme toggle — top-left, opposite the connection pill */}
          <Pressable
            onPress={toggleTheme}
            style={({ pressed }) => [styles.themePill, pressed && styles.pillPressed]}
            hitSlop={8}
          >
            <Text style={styles.themePillText}>
              {isDarkMode ? '☀ LIGHT MODE' : '☾ DARK MODE'}
            </Text>
          </Pressable>

          {/* Connection status pill */}
          <View style={[styles.connPill, isConnected ? styles.connLive : styles.connOff]}>
            <Text style={[styles.connText, { color: isConnected ? colors.link : colors.paperDim }]}>
              {isConnected ? '● LIVE' : '○ OFFLINE — SOLO ONLY'}
            </Text>
          </View>

          {joinError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>⚠ {joinError}</Text>
            </View>
          )}
        </>
      )}

      {screen === 'lobby' && (
        <LobbyScreen
          lobbyCode={lobbyCode ?? '----'}
          players={playersList}
          isHost={isHost}
          track={track}
          onStartRace={handleStartRace}
          onLeaveLobby={handleLeaveLobby}
          onChangeTrack={handleChangeTrack}
          onEditTrack={handleEditTrack}
          socket={socket}
        />
      )}

      {screen === 'game' && run && (
        <GameScreen
          startPage={run.startPage}
          targetPage={run.targetPage}
          onNavigate={handleInGameNavigate}
          onReachedTarget={handleReachedTarget}
          onQuit={handleQuit}
          multiplayerStatus={mode === 'multi' ? multiplayerStatus : null}
          raceScores={mode === 'multi' ? raceScores : null}
          roomCode={lobbyCode}
        />
      )}

      {screen === 'results' && result && (
        <>
          <RouteMapScreen
            path={result.path}
            clicks={result.clicks}
            seconds={result.seconds}
            startPage={run?.startPage ?? ''}
            targetPage={run?.targetPage ?? ''}
            finished={result.finished}
            isMultiplayer={mode === 'multi'}
            onRestart={handleRestart}
            onRaceAgain={handleRaceAgain}
            onBackToLobby={handleBackToLobby}
            onHome={handleHome}
          />
          {recordToast && (
            <View style={styles.toast}>
              <Text style={styles.toastText}>{recordToast}</Text>
            </View>
          )}
        </>
      )}

      {achievementToast && (
        <View style={styles.achToast}>
          <Text style={styles.achToastText}>{achievementToast}</Text>
        </View>
      )}

      <RecordsModal
        visible={vaultOpen}
        records={records}
        onClose={() => setVaultOpen(false)}
        onClear={handleClearRecords}
      />

      <AccoladesModal
        visible={accoladesOpen}
        unlockedIds={achievements}
        onClose={() => setAccoladesOpen(false)}
      />

      {/* ── Username prompt (shown once on first launch) ── */}
      <Modal visible={usernamePending || !username} transparent animationType="fade">
        <View style={styles.usernameOverlay}>
          <View style={[styles.usernameSheet, { backgroundColor: colors.inkRaised, borderColor: colors.hairline }]}>
            <Text style={[styles.usernameTitle, { color: colors.paper, fontFamily: type.displayBlack }]}>
              Choose your name
            </Text>
            <Text style={[styles.usernameHint, { color: colors.paperDim }]}>
              This will be your display name in multiplayer races.
            </Text>
            <TextInput
              style={[styles.usernameInput, { borderColor: colors.link, color: colors.paper, fontFamily: type.display }]}
              value={usernameInput}
              onChangeText={setUsernameInput}
              placeholder="Enter your name"
              placeholderTextColor={colors.paperDim}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={20}
              returnKeyType="go"
              onSubmitEditing={() => handleSetUsername(usernameInput)}
            />
            <Pressable
              onPress={() => handleSetUsername(usernameInput)}
              disabled={!usernameInput.trim()}
              style={({ pressed }) => [
                styles.usernameBtn,
                { backgroundColor: colors.link },
                pressed && { backgroundColor: colors.linkPressed },
                !usernameInput.trim() && { opacity: 0.35 },
              ]}
            >
              <Text style={[styles.usernameBtnText, { color: colors.ink, fontFamily: type.display }]}>
                SAVE
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// APP — provider owns the tree; everything below it re-themes atomically
// ---------------------------------------------------------------------------
export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

// ---------------------------------------------------------------------------
// STYLE FACTORIES — every color comes from the palette parameter.
// No hex codes below this line except none: roles only.
// ---------------------------------------------------------------------------
const makeRootStyles = (colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },

  pillRow: {
    position: 'absolute',
    bottom: space(10),
    alignSelf: 'center',
    flexDirection: 'row',
    gap: space(2),
  },
  vaultBtn: {
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radii.pill,
    paddingVertical: space(2),
    paddingHorizontal: space(4),
    backgroundColor: colors.ink,
  },
  vaultText: {
    color: colors.gold,
    fontFamily: type.mono,
    fontSize: 12,
    letterSpacing: 2,
  },
  accoladesBtn: {
    borderWidth: 1,
    borderColor: colors.visited,
    borderRadius: radii.pill,
    paddingVertical: space(2),
    paddingHorizontal: space(4),
    backgroundColor: colors.ink,
  },
  accoladesText: {
    color: colors.visited,
    fontFamily: type.mono,
    fontSize: 12,
    letterSpacing: 2,
  },
  pillPressed: { backgroundColor: colors.inkRaised },

  themePill: {
    position: 'absolute',
    top: space(14),
    left: space(5),
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: space(2),
    backgroundColor: colors.ink,
  },
  themePillText: {
    color: colors.paperDim,
    fontFamily: type.mono,
    fontSize: 9,
    letterSpacing: 1,
  },

  connPill: {
    position: 'absolute',
    top: space(14),
    right: space(5),
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: space(2),
  },
  connLive: { borderColor: colors.link },
  connOff: { borderColor: colors.hairline },
  connText: { fontFamily: type.mono, fontSize: 9, letterSpacing: 1 },

  errorBanner: {
    position: 'absolute',
    top: space(20),
    left: space(5),
    right: space(5),
    backgroundColor: colors.inkRaised,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.card,
    paddingVertical: space(3),
    paddingHorizontal: space(4),
  },
  errorText: {
    color: colors.danger,
    fontFamily: type.mono,
    fontSize: 12,
    letterSpacing: 1,
  },

  toast: {
    position: 'absolute',
    top: space(16),
    alignSelf: 'center',
    backgroundColor: colors.inkRaised,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radii.card,
    paddingVertical: space(2),
    paddingHorizontal: space(4),
  },
  toastText: {
    color: colors.gold,
    fontFamily: type.mono,
    fontSize: 12,
    letterSpacing: 1,
  },

  achToast: {
    position: 'absolute',
    top: space(23),
    alignSelf: 'center',
    maxWidth: '90%',
    backgroundColor: colors.inkRaised,
    borderWidth: 1,
    borderColor: colors.visited,
    borderRadius: radii.card,
    paddingVertical: space(2),
    paddingHorizontal: space(4),
  },
  achToastText: {
    color: colors.visited,
    fontFamily: type.mono,
    fontSize: 12,
    letterSpacing: 1,
    textAlign: 'center',
  },

  // ── Username prompt ──
  usernameOverlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  usernameSheet: {
    width: '85%',
    maxWidth: 340,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: space(6),
    gap: space(3),
  },
  usernameTitle: {
    fontSize: 24,
    textAlign: 'center',
  },
  usernameHint: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  usernameInput: {
    borderWidth: 2,
    borderRadius: radii.card,
    paddingVertical: space(3),
    paddingHorizontal: space(4),
    fontSize: 18,
    textAlign: 'center',
  },
  usernameBtn: {
    borderRadius: radii.card,
    paddingVertical: space(4),
    alignItems: 'center',
  },
  usernameBtnText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
});

const makeRecordsStyles = (colors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.ink,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: space(5),
    paddingBottom: space(10),
    maxHeight: '75%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.hairline,
    marginTop: space(2),
    marginBottom: space(3),
  },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: colors.paper,
    fontFamily: type.displayBlack,
    fontSize: 28,
  },
  close: { color: colors.paperDim, fontSize: 20, padding: space(1) },
  subtitle: {
    color: colors.paperDim,
    fontFamily: type.mono,
    fontSize: 10,
    letterSpacing: 2,
    marginTop: space(1),
    marginBottom: space(4),
  },
  empty: { alignItems: 'center', paddingVertical: space(10), gap: space(3) },
  emptyEmoji: { fontSize: 40 },
  emptyText: {
    color: colors.paperDim,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 260,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.inkRaised,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.card,
    padding: space(3),
    marginBottom: space(2),
  },
  rowGold: { borderColor: colors.gold },
  rank: {
    fontSize: 18,
    fontFamily: type.mono,
    color: colors.paperDim,
    width: 34,
    textAlign: 'center',
  },
  runInfo: { flex: 1 },
  route: { fontSize: 15 },
  routeStart: {
    color: colors.link,
    fontFamily: type.display,
    textDecorationLine: 'underline',
  },
  routeArrow: { color: colors.paperDim },
  routeTarget: {
    color: colors.gold,
    fontFamily: type.display,
    textDecorationLine: 'underline',
  },
  meta: {
    color: colors.paperDim,
    fontFamily: type.mono,
    fontSize: 11,
    marginTop: 3,
  },
  clearBtn: { alignSelf: 'center', marginTop: space(4), padding: space(1) },
  clearText: {
    color: colors.danger,
    fontFamily: type.mono,
    fontSize: 12,
    letterSpacing: 1,
    textDecorationLine: 'underline',
  },
});

const makeAccoladesStyles = (colors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.ink,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: space(5),
    paddingBottom: space(10),
    maxHeight: '80%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.hairline,
    marginTop: space(2),
    marginBottom: space(3),
  },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: colors.paper,
    fontFamily: type.mono,
    fontSize: 22,
    letterSpacing: 2,
  },
  promptChar: { color: colors.link },
  close: { color: colors.paperDim, fontSize: 20, padding: space(1) },
  subtitle: {
    color: colors.paperDim,
    fontFamily: type.mono,
    fontSize: 10,
    letterSpacing: 2,
    marginTop: space(1),
    marginBottom: space(4),
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    borderRadius: radii.card,
    padding: space(3),
    marginBottom: space(2),
    minHeight: 118,
  },
  cardLocked: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.hairline,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.75,
  },
  cardUnlocked: {
    backgroundColor: colors.inkRaised,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  lockEmoji: { fontSize: 24, marginBottom: space(1), opacity: 0.6 },
  lockedTitle: {
    color: colors.paperDim,
    fontFamily: type.mono,
    fontSize: 9,
    letterSpacing: 1,
    marginBottom: space(2),
  },
  silhouetteWide: {
    width: '80%',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.hairline,
    marginBottom: space(1),
  },
  silhouetteNarrow: {
    width: '55%',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.hairline,
  },
  achEmoji: { fontSize: 26, marginBottom: space(1) },
  achTitle: {
    color: colors.gold,
    fontFamily: type.mono,
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: space(1),
  },
  achFlavor: {
    color: colors.paperDim,
    fontSize: 11,
    lineHeight: 15,
  },
});
