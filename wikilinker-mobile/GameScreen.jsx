import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform, Pressable, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import { ThemeContext } from './ThemeContext';
import { type, space } from './theme';
import { socket } from './App';

const USER_AGENT = 'WikiLinkerApp/1.0 (contact@domain.com) ReactNativeWebView';
const REST_PREFIX = 'https://en.wikipedia.org/api/rest_v1/page/html/';
const LOAD_WATCHDOG_MS = 12_000;

const BLOCKED_NS =
  /^(File|Image|Special|Help|Talk|Template|Template_talk|Category|Portal|Wikipedia|Wikipedia_talk|User|User_talk|Draft|Module|MediaWiki):/i;

const normalize = (t) =>
  decodeURIComponent(String(t || ''))
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase();

const cleanTitle = (t) => String(t || '').split(/[#?]/)[0].replace(/_/g, ' ').trim();

const fmtClock = (s) => {
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  return m > 0 ? m + ':' + sec : s + 's';
};

const INJECTED_JS = `
(function () {
  if (window.__wikiLinkerHooked) { return; }
  window.__wikiLinkerHooked = true;

  function findAnchor(node) {
    var n = node, hops = 0;
    while (n && hops < 12) {
      if (n.tagName === 'A') { return n; }
      n = n.parentNode;
      hops++;
    }
    return null;
  }

  function extractTitle(anchor) {
    var raw = anchor.getAttribute('href') || anchor.href || '';
    if (!raw) { return null; }
    if (raw.charAt(0) === '#') { return null; }
    var m = raw.match(/(?:^\\.\\/|\\/wiki\\/)([^?#]+)/);
    if (!m) { return null; }
    var t = m[1].split('#')[0].split('?')[0];
    try { return decodeURIComponent(t); } catch (e) { return t; }
  }

  document.addEventListener('click', function (e) {
    var a = findAnchor(e.target);
    if (!a) { return; }

    e.preventDefault();
    e.stopPropagation();

    var href = a.getAttribute('href') || '';
    if (a.classList && a.classList.contains('new')) { return; }
    if (href.indexOf('redlink=1') !== -1) { return; }

    var title = extractTitle(a);
    if (!title) { return; }
    if (/^(File|Image|Special|Help|Talk|Template|Category|Portal|Wikipedia|User|Draft|Module|MediaWiki)(_talk)?:/i.test(title)) {
      return;
    }

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'navigate',
      title: title
    }));
  }, true);

  // Force white background + black text for readability regardless of app theme
  document.body.style.backgroundColor = '#ffffff';
  document.body.style.color = '#000000';

  // Fix images: prepend https: to protocol-relative URLs and remove lazy loading
  (function fixImages() {
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var src = img.getAttribute('src') || '';
      if (src.indexOf('//') === 0) {
        img.setAttribute('src', 'https:' + src);
      }
      img.removeAttribute('loading');
    }
  })();

  var css = document.createElement('style');
  css.textContent = 'a[rel~="mw:ExtLink"]{pointer-events:none;color:inherit;text-decoration:none;} .mw-editsection{display:none;} body{padding:12px;background-color:#ffffff;color:#000000;}';
  (document.head || document.documentElement).appendChild(css);
})();
true;
`;

// Distinct background colors for racer badges
const RACER_COLORS = [
  '#6366f1', '#10b981', '#f43f5e', '#f59e0b',
  '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6',
];

const getInitials = (name) => {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

export default function GameScreen({
  startPage = 'Banana',
  targetPage = 'Philosophy',
  onQuit,            
  onNavigate,        
  onReachedTarget,
  multiplayerStatus = null, // { players: [{name, finished}], waiting: bool }
  raceScores = null,       // [{id, name, clicks, finished}] — live from server
  roomCode = null,         // multiplayer lobby code (for guarded cleanup)
}) {
  console.log('[GameScreen] RENDER — raceScores:', JSON.stringify(raceScores), 'multiplayerStatus:', JSON.stringify(multiplayerStatus));
  const { colors } = useContext(ThemeContext);
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [currentTitle, setCurrentTitle] = useState(startPage);
  const [path, setPath] = useState([startPage]);
  const [loading, setLoading] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [raceActive, setRaceActive] = useState(true);
  const lastNavRef = useRef(0);
  const watchdogRef = useRef(null);

  // ── Guarded cleanup: only emit room:leave on explicit quit, not on
  //    normal unmount (e.g. navigating to results after reaching target).
  const didExplicitlyQuit = useRef(false);

  const clicks = path.length - 1;

  // ── Diagnostic: log raceScores changes ──
  useEffect(() => {
    if (raceScores !== null) {
      console.log('[GameScreen] raceScores UPDATED:', JSON.stringify(raceScores));
    }
  }, [raceScores]);

  useEffect(() => {
    if (!raceActive) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [raceActive]);

  useEffect(() => {
    if (loading) {
      watchdogRef.current = setTimeout(() => setLoading(false), LOAD_WATCHDOG_MS);
    }
    return () => clearTimeout(watchdogRef.current);
  }, [loading]);

  // ── Guarded cleanup: only emit room:leave on explicit quit ──
  useEffect(() => {
    return () => {
      if (didExplicitlyQuit.current) {
        console.log('[GameScreen] Cleanup — emitting room:leave (explicit quit)');
        socket.emit('room:leave', { code: roomCode });
      } else {
        console.log('[GameScreen] Cleanup — skipping room:leave (race-restart navigation)');
      }
    };
  }, [roomCode]);

  const navigateTo = useCallback((rawTitle) => {
    const now = Date.now();
    if (now - lastNavRef.current < 400) return;
    lastNavRef.current = now;

    const title = cleanTitle(rawTitle);
    if (!title || BLOCKED_NS.test(rawTitle)) return;
    if (normalize(title) === normalize(path[path.length - 1])) return;

    const next = [...path, title];

    if (normalize(title) === normalize(targetPage)) {
      setRaceActive(false);
      setLoading(false);
      setPath(next);
      onNavigate?.(title, next);
      onReachedTarget?.({ clicks: next.length - 1, path: next, seconds });
      return;
    }

    setLoading(true);
    setCurrentTitle(title);
    setPath(next);
    onNavigate?.(title, next);
  }, [path, targetPage, seconds, onNavigate, onReachedTarget]);

  const revertLastMove = useCallback(() => {
    setLoading(false);
    setPath((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.slice(0, -1);
      setCurrentTitle(next[next.length - 1]);
      return next;
    });
  }, []);

  const handleMessage = useCallback((event) => {
    let msg;
    try {
      msg = JSON.parse(event?.nativeEvent?.data ?? '');
    } catch {
      return;
    }
    if (msg?.type === 'navigate' && typeof msg.title === 'string' && msg.title.length) {
      navigateTo(msg.title.slice(0, 300));
    }
  }, [navigateTo]);

  const handleShouldLoad = useCallback((request) => {
    const url = request?.url ?? '';

    if (url.startsWith(REST_PREFIX)) {
      const restTitle = cleanTitle(decodeURIComponent(url.slice(REST_PREFIX.length)));
      if (restTitle && normalize(restTitle) !== normalize(currentTitle)) {
        setCurrentTitle(restTitle);
        const nextPath = [...path.slice(0, -1), restTitle];
        setPath(nextPath);

        if (normalize(restTitle) === normalize(targetPage)) {
          setRaceActive(false);
          setLoading(false);
          onNavigate?.(restTitle, nextPath);
          onReachedTarget?.({ clicks: nextPath.length - 1, path: nextPath, seconds });
          return false;
        }
      }
      return true;
    }

    if (url === 'about:blank') return true;

    const escapee = url.match(/https?:\/\/[^/]*wikipedia\.org\/wiki\/([^?#]+)/);
    if (escapee) {
      navigateTo(decodeURIComponent(escapee[1]));
    }
    return false;
  }, [currentTitle, path, targetPage, seconds, navigateTo, onNavigate, onReachedTarget]);

  const source = useMemo(() => ({
    uri: REST_PREFIX + encodeURIComponent(currentTitle.replace(/ /g, '_')),
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html; charset=utf-8',
      'Api-User-Agent': USER_AGENT,
    },
  }), [currentTitle]);

  return (
    <View style={s.screen}>
      <View style={s.hud}>
        <Pressable
          onPress={() => {
            didExplicitlyQuit.current = true;
            onQuit?.({ clicks, path, seconds });
          }}
          hitSlop={10}
          style={({ pressed }) => [s.quitBtn, pressed && s.quitPressed]}
        >
          <Text style={s.quitText}>← QUIT</Text>
        </Pressable>

        <View style={s.hudMid}>
          <Text style={s.hudLabel}>TARGET</Text>
          <Text style={s.hudPage} numberOfLines={1}>
            {targetPage}
          </Text>
        </View>

        <View style={s.hudRight}>
          <Text style={s.clicks}>{clicks}<Text style={s.clicksUnit}> CLICKS</Text></Text>
          <Text style={s.timer}>{fmtClock(seconds)}</Text>
        </View>
      </View>

      <View style={s.nowReading}>
        <Text style={s.hudLabel}>NOW READING</Text>
        <Text style={s.hudPage} numberOfLines={1}>{currentTitle}</Text>
      </View>

      {/* ── Race Ticker ── */}
      {raceScores !== null && (
        <View style={s.raceTicker}>
          {raceScores.length <= 1 ? (
            <Text style={s.raceTickerWaiting}>
              ⏳ Waiting for opponents to join the race…
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.raceTickerScroll}
            >
              {raceScores.map((racer, idx) => {
                const bgColor = RACER_COLORS[idx % RACER_COLORS.length];
                const finished = racer.finished ?? false;
                return (
                  <View key={racer.id ?? racer.name} style={s.racerBadge}>
                    <View style={[s.racerAvatar, { backgroundColor: bgColor, opacity: finished ? 1 : 0.85 }]}>
                      <Text style={s.racerInitials}>{getInitials(racer.name)}</Text>
                    </View>
                    <Text style={[s.racerClicks, finished && { color: colors.gold }]}>
                      {racer.clicks ?? 0}
                    </Text>
                    {finished && (
                      <Text style={s.racerCheck}>✓</Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      <View style={s.webWrap}>
        <WebView
          source={source}
          userAgent={USER_AGENT}
          injectedJavaScriptBeforeContentLoaded={INJECTED_JS}
          injectedJavaScript={INJECTED_JS}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={handleShouldLoad}
          onLoadEnd={() => setLoading(false)}
          onError={revertLastMove}
          onHttpError={({ nativeEvent }) => {
            if (nativeEvent?.statusCode >= 400) revertLastMove();
          }}
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures={false}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['https://*']}
          decelerationRate="normal"
          style={{ flex: 1, backgroundColor: '#ffffff' }}
        />
        {loading && (
          <View style={s.loading}>
            <ActivityIndicator color={colors.link} size="large" />
            <Text style={s.loadingText}>turning the page…</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingTop: Platform.select({ ios: space(14), android: space(10) }),
    paddingBottom: space(3),
    paddingHorizontal: space(4),
  },
  quitBtn: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    paddingVertical: space(2),
    paddingHorizontal: space(3),
  },
  quitPressed: { backgroundColor: colors.inkRaised },
  quitText: { color: colors.paperDim, fontFamily: type.mono, fontSize: 12, letterSpacing: 1 },

  hudMid: { flex: 1 },
  hudRight: { alignItems: 'flex-end' },
  hudLabel: {
    color: colors.paperDim, fontFamily: type.mono,
    fontSize: 9, letterSpacing: 1.5,
  },
  hudPage: {
    color: colors.link, fontFamily: type.display, fontSize: 14,
    textDecorationLine: 'underline',
  },
  clicks: { color: colors.paper, fontFamily: type.mono, fontSize: 18, lineHeight: 22 },
  clicksUnit: { color: colors.paperDim, fontSize: 9, letterSpacing: 1 },
  timer: { color: colors.paper, fontFamily: type.mono, fontSize: 14, marginTop: 2 },

  nowReading: {
    paddingHorizontal: space(4),
    paddingBottom: space(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },

  webWrap: { flex: 1 },
  webview: { 
    flex: 1, 
    backgroundColor: colors.ink 
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(3),
  },
  loadingText: { color: colors.paperDim, fontFamily: type.mono, fontSize: 12 },

  raceTicker: {
    paddingVertical: space(2),
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    backgroundColor: colors.inkRaised,
  },
  raceTickerWaiting: {
    color: colors.paperDim,
    fontFamily: type.mono,
    fontSize: 11,
    letterSpacing: 1,
    textAlign: 'center',
    paddingHorizontal: space(4),
  },
  raceTickerScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space(3),
    gap: space(3),
  },
  racerBadge: {
    alignItems: 'center',
    gap: 2,
    minWidth: 44,
  },
  racerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  racerInitials: {
    color: '#fff',
    fontFamily: type.mono,
    fontSize: 11,
    fontWeight: '700',
  },
  racerClicks: {
    color: colors.paper,
    fontFamily: type.mono,
    fontSize: 10,
    fontWeight: '600',
  },
  racerCheck: {
    color: colors.gold,
    fontFamily: type.mono,
    fontSize: 9,
    marginTop: -2,
  },
});
