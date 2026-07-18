import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import ConfettiCannon from 'react-native-confetti-cannon';
import { ThemeContext } from './ThemeContext';
import { type, space, radii } from './theme';

const normalize = (t) => String(t || '').replace(/_/g, ' ').trim().toLowerCase();

const fmtTime = (s = 0) => {
  const m = Math.floor(s / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return m + ':' + sec;
};

const maskTitle = (title) =>
  String(title || '')
    .split(' ')
    .map((w) => (w.length ? w[0] + '_'.repeat(w.length - 1) : w))
    .join(' ');

const titleCase = (s) =>
  String(s || '').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

const buildClueLines = (intermediates) => {
  const masked = intermediates.map(maskTitle);
  if (masked.length > 4) {
    const hidden = masked.length - 3;
    return [
      '➔ 🔵 ' + masked[0] + '?',
      '➔ 🔵 ' + masked[1] + '?',
      '➔ 🔵 ... [' + hidden + ' hidden steps] ...',
      '➔ 🔵 ' + masked[masked.length - 1] + '?',
    ];
  }
  return masked.map((m) => '➔ 🔵 ' + m + '?');
};

function badgeFor(clicks, finished) {
  if (!finished) return { emoji: '🌀', label: 'LOST IN THE STACKS', blurb: 'The links go ever on and on…' };
  if (clicks <= 3) return { emoji: '👁️', label: 'WIKI ORACLE', blurb: 'You saw the whole graph at once.' };
  if (clicks <= 7) return { emoji: '🎓', label: 'EFFICIENT SCHOLAR', blurb: 'Clean lines. No wasted moves.' };
  return { emoji: '🗺️', label: 'SCENIC ROUTE EXPLORER', blurb: 'Not all who wander are lost. You were, though.' };
}

export default function RouteMapScreen({
  path = [],
  clicks = Math.max(0, path.length - 1),
  seconds = 0,
  startPage = '',
  targetPage = '',
  onRestart,
  onRaceAgain,
  onHome,
  finished,
  isMultiplayer = false,
  onBackToLobby,
}) {
  const { colors } = useContext(ThemeContext);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const didFinish = useMemo(() => {
    if (typeof finished === 'boolean') return finished;
    return path.length > 0 && normalize(path[path.length - 1]) === normalize(targetPage);
  }, [finished, path, targetPage]);

  const badge = badgeFor(clicks, didFinish);
  const accent = didFinish ? colors.link : colors.paperDim;

  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(null);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const shareText = useMemo(() => {
    const start = path[0] ?? '';
    const end = path[path.length - 1] ?? '';
    const intermediates = path.length > 2 ? path.slice(1, -1) : [];
    const lines = ['🧠 WikiLinker Challenge! 🏁'];

    if (didFinish) {
      lines.push('Can you get from ' + start + ' to ' + targetPage + '?');
      lines.push('🟢 ' + start);
      lines.push(...buildClueLines(intermediates));
      lines.push('➔ 🏆 ' + targetPage + ' (' + clicks + ' clicks)');
      lines.push('⏱️ Time: ' + fmtTime(seconds));
      lines.push(badge.emoji + ' Rank: ' + titleCase(badge.label));
      lines.push('Solve the link chain and beat my score!');
    } else {
      lines.push('I got lost trying to get from ' + start + ' to ' + targetPage + '!');
      lines.push('🟢 ' + start);
      lines.push(...buildClueLines(intermediates));
      lines.push('➔ 🔴 DNF (at "' + end + '")');
      lines.push('Can you find a better route?');
    }
    return lines.join('\n');
  }, [path, targetPage, clicks, seconds, didFinish, badge]);

  const handleShare = async () => {
    try {
      await Clipboard.setStringAsync(shareText);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const renderNode = ({ item, index }) => {
    const isFirst = index === 0;
    const isLast = index === path.length - 1;
    const isTarget = isLast && didFinish;
    const isDeadEnd = isLast && !didFinish;

    return (
      <View style={styles.nodeRow}>
        <Text style={styles.clickNum}>{isFirst ? 'GO' : String(index).padStart(2, '0')}</Text>
        <View style={styles.spineCol}>
          {!isFirst && <View style={[styles.spineSeg, { backgroundColor: accent }]} />}
          <View
            style={[
              styles.dot,
              { borderColor: accent },
              isTarget && { backgroundColor: colors.gold, borderColor: colors.gold },
              isDeadEnd && { borderColor: colors.paperDim, borderStyle: 'dashed' },
            ]}
          />
          {!isLast && <View style={[styles.spineSeg, { backgroundColor: accent }]} />}
        </View>
        <View style={styles.nodeLabelWrap}>
          <Text
            style={[
              styles.nodeLabel,
              isTarget && styles.nodeTarget,
              isDeadEnd && styles.nodeDead,
            ]}
            numberOfLines={2}
          >
            {item}
          </Text>
          {isDeadEnd && <Text style={styles.dnfTag}>▓ DID NOT FINISH</Text>}
          {isTarget && <Text style={styles.finishTag}>★ TARGET REACHED</Text>}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.ink }]}>
      {didFinish && (
        <ConfettiCannon
          count={80}
          origin={{ x: -10, y: 0 }}
          fallSpeed={2500}
          fadeOut={true}
        />
      )}
      <FlatList
        data={path}
        keyExtractor={(item, i) => item + '-' + i}
        renderItem={renderNode}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <Text style={styles.statusLine}>
              {didFinish ? 'RUN COMPLETE' : 'RUN TERMINATED'}
            </Text>

            <View style={[styles.card, !didFinish && styles.cardDnf]}>
              <View style={styles.statRow}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{clicks}</Text>
                  <Text style={styles.statLabel}>CLICKS</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{fmtTime(seconds)}</Text>
                  <Text style={styles.statLabel}>TIME</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{path.length}</Text>
                  <Text style={styles.statLabel}>PAGES</Text>
                </View>
              </View>

              <View style={styles.badge}>
                <Text style={styles.badgeEmoji}>{badge.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.badgeLabel, !didFinish && { color: colors.paperDim }]}>
                    {badge.label}
                  </Text>
                  <Text style={styles.badgeBlurb}>{badge.blurb}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionLabel}>— ROUTE LOG —</Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: space(38) }} />}
      />

      <View style={styles.actionStack}>
        <Pressable
          onPress={handleShare}
          style={({ pressed }) => [styles.shareBtn, pressed && styles.sharePressed]}
        >
          <Text style={[styles.shareText, copied && { color: colors.gold }]}>
            {copied ? '✓ COPIED!' : 'SHARE RUN'}
          </Text>
        </Pressable>

        {isMultiplayer ? (
          <Pressable
            onPress={onBackToLobby}
            style={({ pressed }) => [styles.raceBtn, pressed && { backgroundColor: colors.linkPressed }]}
          >
            <Text style={styles.raceBtnText}>BACK TO LOBBY</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => onRaceAgain?.({ startPage, targetPage })}
            style={({ pressed }) => [styles.raceBtn, pressed && { backgroundColor: colors.linkPressed }]}
          >
            <Text style={styles.raceBtnText}>RACE AGAIN?</Text>
          </Pressable>
        )}

        <Pressable
          onPress={onHome}
          style={({ pressed }) => [styles.homeBtn, pressed && styles.homePressed]}
        >
          <Text style={styles.homeBtnText}>HOME</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// STYLE FACTORY — colors come from the palette parameter, NOT module scope
// ---------------------------------------------------------------------------
const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1 },
  listContent: { paddingTop: space(14), paddingHorizontal: space(5) },
  statusLine: {
    color: colors.paper, fontFamily: type.mono, fontSize: 18,
    letterSpacing: 2, marginBottom: space(4),
  },
  card: {
    backgroundColor: colors.inkRaised,
    borderWidth: 1, borderColor: colors.link,
    borderRadius: radii.card, padding: space(4),
  },
  cardDnf: { borderColor: colors.hairline },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: colors.paper, fontFamily: type.mono, fontSize: 26, lineHeight: 30 },
  statLabel: {
    color: colors.paperDim, fontFamily: type.mono, fontSize: 9,
    letterSpacing: 2, marginTop: 2,
  },
  statDivider: { width: 1, height: 34, backgroundColor: colors.hairline },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    borderTopWidth: 1, borderTopColor: colors.hairline,
    marginTop: space(4), paddingTop: space(4),
  },
  badgeEmoji: { fontSize: 32 },
  badgeLabel: {
    color: colors.gold, fontFamily: type.mono, fontSize: 14, letterSpacing: 2,
  },
  badgeBlurb: { color: colors.paperDim, fontSize: 12, marginTop: 2, lineHeight: 17 },
  sectionLabel: {
    color: colors.paperDim, fontFamily: type.mono, fontSize: 10,
    letterSpacing: 3, textAlign: 'center', marginVertical: space(5),
  },
  nodeRow: { flexDirection: 'row', alignItems: 'stretch', minHeight: 56 },
  clickNum: {
    width: 34, color: colors.paperDim, fontFamily: type.mono,
    fontSize: 11, textAlign: 'right', marginRight: space(3), paddingTop: 20,
  },
  spineCol: { width: 16, alignItems: 'center' },
  spineSeg: { flex: 1, width: 2, opacity: 0.5 },
  dot: {
    width: 12, height: 12, borderRadius: 6, borderWidth: 2,
    backgroundColor: colors.ink,
  },
  nodeLabelWrap: { flex: 1, justifyContent: 'center', paddingLeft: space(4), paddingVertical: space(2) },
  nodeLabel: {
    color: colors.link, fontSize: 17, fontFamily: type.display,
    textDecorationLine: 'underline',
  },
  nodeTarget: { color: colors.gold, fontFamily: type.displayBlack, textDecorationLine: 'none' },
  nodeDead: { color: colors.paperDim, textDecorationLine: 'none' },
  dnfTag: { color: colors.paperDim, fontFamily: type.mono, fontSize: 10, letterSpacing: 2, marginTop: 3 },
  finishTag: { color: colors.gold, fontFamily: type.mono, fontSize: 10, letterSpacing: 2, marginTop: 3 },
  actionStack: {
    position: 'absolute', left: space(5), right: space(5), bottom: space(8),
    gap: space(2),
  },
  shareBtn: {
    borderWidth: 1, borderColor: colors.link, borderRadius: radii.card,
    paddingVertical: space(3), alignItems: 'center',
    backgroundColor: colors.ink,
  },
  sharePressed: { backgroundColor: colors.inkRaised },
  shareText: {
    color: colors.link, fontFamily: type.mono, fontSize: 13, letterSpacing: 2,
  },
  raceBtn: {
    backgroundColor: colors.link, borderRadius: radii.card,
    paddingVertical: space(4), alignItems: 'center',
  },
  raceBtnText: {
    color: colors.ink, fontFamily: type.display, fontSize: 20, letterSpacing: 1,
  },
  homeBtn: {
    borderWidth: 1, borderColor: colors.hairline, borderRadius: radii.card,
    paddingVertical: space(3), alignItems: 'center',
    backgroundColor: colors.inkRaised,
  },
  homePressed: { backgroundColor: colors.inkRaised },
  homeBtnText: {
    color: colors.paperDim, fontFamily: type.mono, fontSize: 13, letterSpacing: 2,
  },
});
