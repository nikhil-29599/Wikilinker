import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import { ThemeContext } from './ThemeContext';
import { colors, type, space } from './theme';

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

  var css = document.createElement('style');
  css.textContent = 'a[rel~="mw:ExtLink"]{pointer-events:none;color:inherit;text-decoration:none;} .mw-editsection{display:none;} body{padding:12px;}';
  (document.head || document.documentElement).appendChild(css);
})();
true;
`;

export default function GameScreen({
  startPage = 'Banana',
  targetPage = 'Philosophy',
  onQuit,            
  onNavigate,        
  onReachedTarget,   
}) {
  const { isDarkMode, colors } = useContext(ThemeContext);
  const [currentTitle, setCurrentTitle] = useState(startPage);
  const [path, setPath] = useState([startPage]);
  const [loading, setLoading] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [raceActive, setRaceActive] = useState(true);
  const lastNavRef = useRef(0);
  const watchdogRef = useRef(null);

  const clicks = path.length - 1;

  const currentColors = isDarkMode
    ? { ink: '#101418', paper: '#F5F6F7', inkRaised: '#1A1F26', hairline: '#2A303A' }
    : { ink: '#FFFFFF', paper: '#111111', inkRaised: '#F8F9FA', hairline: '#EAECF0' };

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
    <View style={[styles.screen, { backgroundColor: currentColors.ink }]}>
      <View style={styles.hud}>
        <Pressable
          onPress={() => onQuit?.({ clicks, path, seconds })}
          hitSlop={10}
          style={({ pressed }) => [styles.quitBtn, pressed && styles.quitPressed]}
        >
          <Text style={styles.quitText}>← QUIT</Text>
        </Pressable>

        <View style={styles.hudMid}>
          <Text style={styles.hudLabel}>TARGET</Text>
          <Text style={[styles.hudPage, { color: colors.gold }]} numberOfLines={1}>
            {targetPage}
          </Text>
        </View>

        <View style={styles.hudRight}>
          <Text style={styles.clicks}>{clicks}<Text style={styles.clicksUnit}> CLICKS</Text></Text>
          <Text style={styles.timer}>{fmtClock(seconds)}</Text>
        </View>
      </View>

      <View style={[styles.nowReading, { borderBottomColor: currentColors.hairline }]}>
        <Text style={styles.hudLabel}>NOW READING</Text>
        <Text style={styles.hudPage} numberOfLines={1}>{currentTitle}</Text>
      </View>

      <View style={styles.webWrap}>
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
          style={styles.webview}
        />
        {loading && (
          <View style={[styles.loading, { backgroundColor: currentColors.ink }]}>
            <ActivityIndicator color={colors.link} size="large" />
            <Text style={styles.loadingText}>turning the page…</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
  },

  webWrap: { flex: 1 },
  webview: { flex: 1, backgroundColor: '#fff' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(3),
  },
  loadingText: { color: colors.paperDim, fontFamily: type.mono, fontSize: 12 },
});
