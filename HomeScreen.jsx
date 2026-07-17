// HomeScreen.jsx — WikiLinker (v3: consumes global ThemeContext)
//
// THEME REFACTOR NOTES:
//   • No more `colors` import from ./theme — the palette arrives via
//     React.useContext(ThemeContext), so toggling Dark Mode re-themes this
//     screen (and its Play Solo modal) instantly and atomically.
//   • Styles are built by makeStyles(colors) / makeModalStyles(colors)
//     factories, memoized against the palette. Module-level
//     StyleSheet.create froze colors at import time — that was the root
//     of the "sub-screen stuck in the wrong theme" bug.
//   • Zero hard-coded hex values: containers use colors.ink / inkRaised,
//     text uses colors.paper / paperDim, actions use colors.link, roles only.

import React, { useCallback, useContext, useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { ThemeContext } from './ThemeContext';
import { type, space, radii } from './theme';

const USER_AGENT = 'WikiLinkerApp/1.0 (contact@domain.com)';
const SUMMARY_API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const RANDOM_API =
  'https://en.wikipedia.org/w/api.php?action=query&format=json&list=random&rnnamespace=0&rnlimit=2&origin=*';

const PRESETS = [
  { start: 'Apple', target: 'Steve Jobs' },
  { start: 'Banana', target: 'Philosophy' },
  { start: 'Pizza', target: 'Ancient Rome' },
  { start: 'Moon', target: 'Cheese' },
  { start: 'Velociraptor', target: 'Jazz' },
  { start: 'Coffee', target: 'World War II' },
];

// Validate a typed title against Wikipedia; returns the canonical form.
async function resolveTitle(raw) {
  const t = String(raw || '').trim();
  if (!t) return { ok: false, error: 'Type a page title' };
  try {
    const res = await fetch(
      SUMMARY_API + encodeURIComponent(t.replace(/ /g, '_')) + '?redirect=true',
      { headers: { 'Api-User-Agent': USER_AGENT, Accept: 'application/json' } }
    );
    if (!res.ok) return { ok: false, error: 'No article called "' + t + '"' };
    const data = await res.json();
    return { ok: true, title: data.title || t };
  } catch {
    return { ok: false, error: 'Network hiccup — try again' };
  }
}

// ---------------------------------------------------------------------------
// PLAY SOLO MODAL — pulls the live palette straight from context
// ---------------------------------------------------------------------------
const MODES = [
  { key: 'presets', label: 'PRESETS' },
  { key: 'custom', label: 'CUSTOM' },
  { key: 'random', label: 'RANDOM' },
];

function PlaySoloModal({ visible, onClose, onStart }) {
  const { colors } = useContext(ThemeContext);
  const m = useMemo(() => makeModalStyles(colors), [colors]);

  const [mode, setMode] = useState('presets');

  // custom
  const [customStart, setCustomStart] = useState('');
  const [customTarget, setCustomTarget] = useState('');
  const [customError, setCustomError] = useState(null);
  const [validating, setValidating] = useState(false);

  // random
  const [randomRun, setRandomRun] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [randomError, setRandomError] = useState(null);

  const startRun = (startPage, targetPage) => {
    onStart?.({ startPage, targetPage });
    onClose?.();
  };

  const handleCustomStart = useCallback(async () => {
    setValidating(true);
    setCustomError(null);
    const [a, b] = await Promise.all([resolveTitle(customStart), resolveTitle(customTarget)]);
    setValidating(false);
    if (!a.ok) return setCustomError('Start: ' + a.error);
    if (!b.ok) return setCustomError('Target: ' + b.error);
    if (a.title.toLowerCase() === b.title.toLowerCase()) {
      return setCustomError('Start and target are the same page — too easy.');
    }
    startRun(a.title, b.title);
  }, [customStart, customTarget]);

  const rollRandom = useCallback(async () => {
    setRolling(true);
    setRandomError(null);
    try {
      const res = await fetch(RANDOM_API, {
        headers: { 'Api-User-Agent': USER_AGENT, Accept: 'application/json' },
      });
      const data = await res.json();
      const pair = data?.query?.random;
      if (!pair || pair.length < 2) throw new Error('bad payload');
      setRandomRun({ start: pair[0].title, target: pair[1].title });
    } catch {
      setRandomError('Couldn\u2019t reach Wikipedia — try again');
    } finally {
      setRolling(false);
    }
  }, []);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <View style={m.backdrop}>
          <View style={m.sheet}>
            <View style={m.grabber} />
            <View style={m.headRow}>
              <Text style={m.title}>Play solo</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Text style={m.close}>✕</Text>
              </Pressable>
            </View>

            {/* Mode segments */}
            <View style={m.segments}>
              {MODES.map((s) => (
                <Pressable
                  key={s.key}
                  onPress={() => setMode(s.key)}
                  style={[m.segment, mode === s.key && m.segmentActive]}
                >
                  <Text style={[m.segmentText, mode === s.key && m.segmentTextActive]}>
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* PRESETS */}
            {mode === 'presets' && (
              <ScrollView style={m.body} showsVerticalScrollIndicator={false}>
                {PRESETS.map((p) => (
                  <Pressable
                    key={p.start + p.target}
                    onPress={() => startRun(p.start, p.target)}
                    style={({ pressed }) => [m.presetCard, pressed && m.presetPressed]}
                  >
                    <Text style={m.presetStart}>{p.start}</Text>
                    <Text style={m.presetArrow}>→</Text>
                    <Text style={m.presetTarget}>{p.target}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {/* CUSTOM */}
            {mode === 'custom' && (
              <View style={m.body}>
                <Text style={m.fieldLabel}>START PAGE</Text>
                <TextInput
                  style={m.input}
                  value={customStart}
                  onChangeText={setCustomStart}
                  placeholder="Chicago"
                  placeholderTextColor={colors.paperDim}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                />
                <Text style={m.fieldLabel}>TARGET PAGE</Text>
                <TextInput
                  style={m.input}
                  value={customTarget}
                  onChangeText={setCustomTarget}
                  placeholder="Pizza"
                  placeholderTextColor={colors.paperDim}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={handleCustomStart}
                />
                {customError && <Text style={m.error}>{customError}</Text>}
                <Pressable
                  onPress={handleCustomStart}
                  disabled={validating}
                  style={({ pressed }) => [
                    m.primaryBtn,
                    pressed && m.primaryPressed,
                    validating && m.disabled,
                  ]}
                >
                  {validating
                    ? <ActivityIndicator color={colors.ink} />
                    : <Text style={m.primaryText}>Start run</Text>}
                </Pressable>
                <Text style={m.hint}>
                  Titles are checked against Wikipedia first, so typos won't start a broken race.
                </Text>
              </View>
            )}

            {/* RANDOM */}
            {mode === 'random' && (
              <View style={m.body}>
                {randomRun ? (
                  <View style={m.presetCard}>
                    <Text style={m.presetStart} numberOfLines={1}>{randomRun.start}</Text>
                    <Text style={m.presetArrow}>→</Text>
                    <Text style={m.presetTarget} numberOfLines={1}>{randomRun.target}</Text>
                  </View>
                ) : (
                  <Text style={m.hint}>
                    Two totally random articles. Could be a medieval bishop. Could be a moth.
                  </Text>
                )}
                {randomError && <Text style={m.error}>{randomError}</Text>}
                <Pressable
                  onPress={rollRandom}
                  disabled={rolling}
                  style={({ pressed }) => [
                    m.secondaryBtn,
                    pressed && m.presetPressed,
                    rolling && m.disabled,
                  ]}
                >
                  {rolling
                    ? <ActivityIndicator color={colors.link} />
                    : <Text style={m.secondaryText}>
                        {randomRun ? '⟳ Re-roll' : 'Generate random run'}
                      </Text>}
                </Pressable>
                {randomRun && (
                  <Pressable
                    onPress={() => startRun(randomRun.start, randomRun.target)}
                    style={({ pressed }) => [m.primaryBtn, pressed && m.primaryPressed]}
                  >
                    <Text style={m.primaryText}>Start run</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// HOME SCREEN
// ---------------------------------------------------------------------------
export default function HomeScreen({ onJoin, onCreate, onStartSolo }) {
  const { colors } = useContext(ThemeContext);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [code, setCode] = useState('');
  const [soloOpen, setSoloOpen] = useState(false);
  const canJoin = code.length === 4;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.masthead}>
        <Text style={styles.kicker}>THE FREE RACE THAT ANYONE CAN RUN</Text>
        <Text style={styles.wordmark}>WikiLinker</Text>
        <View style={styles.rule} />
        <Text style={styles.tagline}>
          Sprint from one article to another using only the links.
        </Text>
      </View>

      <View style={styles.joinBlock}>
        <Text style={styles.label}>ROOM CODE</Text>
        <TextInput
          style={styles.codeInput}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().slice(0, 4))}
          placeholder="WIKI"
          placeholderTextColor={colors.hairline}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={4}
        />
        <Pressable
          onPress={() => canJoin && onJoin?.(code)}
          disabled={!canJoin}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.pressed,
            !canJoin && styles.disabled,
          ]}
        >
          <Text style={styles.primaryBtnText}>Join race</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => setSoloOpen(true)}
        style={({ pressed }) => [styles.soloBtn, pressed && styles.soloPressed]}
      >
        <Text style={styles.soloText}>PLAY SOLO</Text>
      </Pressable>

      <Pressable onPress={onCreate} style={styles.createLink} hitSlop={12}>
        <Text style={styles.createLinkText}>Create a race →</Text>
      </Pressable>

      <PlaySoloModal
        visible={soloOpen}
        onClose={() => setSoloOpen(false)}
        onStart={onStartSolo}
      />
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// STYLE FACTORIES — roles only, no hex codes anywhere
// ---------------------------------------------------------------------------
const makeStyles = (colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
    paddingHorizontal: space(6),
    justifyContent: 'center',
  },
  masthead: { marginBottom: space(10) },
  kicker: {
    color: colors.paperDim,
    fontFamily: type.mono,
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: space(2),
  },
  wordmark: {
    color: colors.paper,
    fontFamily: type.displayBlack,
    fontSize: 52,
    lineHeight: 56,
  },
  rule: {
    height: 1,
    backgroundColor: colors.hairline,
    marginTop: space(3),
    marginBottom: space(3),
  },
  tagline: { color: colors.paperDim, fontSize: 15, lineHeight: 22 },

  joinBlock: { marginBottom: space(5) },
  label: {
    color: colors.paperDim,
    fontFamily: type.mono,
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: space(2),
  },
  codeInput: {
    fontFamily: type.mono,
    fontSize: 44,
    letterSpacing: 16,
    color: colors.paper,
    backgroundColor: colors.inkRaised,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: space(4),
    textAlign: 'center',
    marginBottom: space(4),
  },
  primaryBtn: {
    backgroundColor: colors.link,
    borderRadius: radii.card,
    paddingVertical: space(4),
    alignItems: 'center',
  },
  primaryBtnText: { color: colors.ink, fontFamily: type.display, fontSize: 20 },
  pressed: { backgroundColor: colors.linkPressed },
  disabled: { opacity: 0.35 },

  soloBtn: {
    borderWidth: 1,
    borderColor: colors.link,
    borderRadius: radii.card,
    paddingVertical: space(4),
    alignItems: 'center',
    marginBottom: space(6),
  },
  soloPressed: { backgroundColor: colors.inkRaised },
  soloText: {
    color: colors.link,
    fontFamily: type.mono,
    fontSize: 15,
    letterSpacing: 2,
  },

  createLink: { alignSelf: 'center' },
  createLinkText: {
    color: colors.link,
    fontSize: 18,
    fontFamily: type.display,
    textDecorationLine: 'underline',
  },
});

const makeModalStyles = (colors) => StyleSheet.create({
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
  title: { color: colors.paper, fontFamily: type.displayBlack, fontSize: 28 },
  close: { color: colors.paperDim, fontSize: 20, padding: space(1) },

  segments: {
    flexDirection: 'row',
    backgroundColor: colors.inkRaised,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 4,
    marginTop: space(4),
    marginBottom: space(4),
  },
  segment: {
    flex: 1,
    paddingVertical: space(3),
    alignItems: 'center',
    borderRadius: radii.card - 4,
  },
  segmentActive: { backgroundColor: colors.link },
  segmentText: {
    color: colors.paperDim,
    fontFamily: type.mono,
    fontSize: 12,
    letterSpacing: 1,
  },
  segmentTextActive: { color: colors.ink },

  body: { paddingBottom: space(2) },

  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    backgroundColor: colors.inkRaised,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.card,
    padding: space(4),
    marginBottom: space(2),
  },
  presetPressed: { borderColor: colors.link },
  presetStart: {
    color: colors.link,
    fontFamily: type.display,
    fontSize: 16,
    textDecorationLine: 'underline',
    flexShrink: 1,
  },
  presetArrow: { color: colors.paperDim, fontSize: 16 },
  presetTarget: {
    color: colors.gold,
    fontFamily: type.display,
    fontSize: 16,
    textDecorationLine: 'underline',
    flexShrink: 1,
  },

  fieldLabel: {
    color: colors.paperDim,
    fontFamily: type.mono,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: space(1),
    marginTop: space(2),
  },
  input: {
    backgroundColor: colors.inkRaised,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.card,
    color: colors.paper,
    fontSize: 17,
    fontFamily: type.display,
    paddingVertical: space(3),
    paddingHorizontal: space(4),
    marginBottom: space(2),
  },
  error: {
    color: colors.danger,
    fontFamily: type.mono,
    fontSize: 12,
    marginVertical: space(2),
  },
  hint: {
    color: colors.paperDim,
    fontSize: 13,
    lineHeight: 19,
    marginTop: space(3),
  },

  primaryBtn: {
    backgroundColor: colors.link,
    borderRadius: radii.card,
    paddingVertical: space(4),
    alignItems: 'center',
    marginTop: space(3),
  },
  primaryPressed: { backgroundColor: colors.linkPressed },
  primaryText: { color: colors.ink, fontFamily: type.display, fontSize: 18 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.link,
    borderRadius: radii.card,
    paddingVertical: space(4),
    alignItems: 'center',
    marginTop: space(3),
  },
  secondaryText: {
    color: colors.link,
    fontFamily: type.mono,
    fontSize: 14,
    letterSpacing: 1,
  },
});
