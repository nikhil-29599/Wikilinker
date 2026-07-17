import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Animated,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { colors, type, space, radii } from './theme';

const MAX_PLAYERS = 8;

export default function LobbyScreen({
  lobbyCode = '----',
  players = [],
  isHost = false,
  track = { start: '…', target: '…' },
  onStartRace,
  onLeaveLobby,
  onChangeTrack,
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(null);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const copyCode = async () => {
    try {
      await Clipboard.setStringAsync(lobbyCode);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isHost) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isHost, pulse]);

  const canStart = players.length >= 2;
  const slots = [...players, ...Array(Math.max(0, MAX_PLAYERS - players.length)).fill(null)];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headRow}>
          <Text style={styles.promptLine}>
            <Text style={styles.promptChar}>{'>'}</Text> LOBBY OPEN<Text style={styles.cursor}> ▮</Text>
          </Text>
          <Pressable onPress={onLeaveLobby} hitSlop={10} style={styles.leaveBtn}>
            <Text style={styles.leaveText}>← LEAVE</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>ROOM CODE</Text>
        <View style={styles.codeCard}>
          <Text style={styles.code}>{lobbyCode}</Text>
          <Pressable
            onPress={copyCode}
            style={({ pressed }) => [styles.copyBtn, pressed && styles.copyPressed]}
          >
            <Text style={[styles.copyText, copied && { color: colors.gold }]}>
              {copied ? '✓ COPIED!' : '⧉ COPY'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.label}>GAME TRACK</Text>
        <View style={styles.trackCard}>
          <View style={styles.trackRow}>
            <Text style={styles.trackRole}>START</Text>
            <Text style={styles.trackStart} numberOfLines={1}>{track.start}</Text>
          </View>
          <View style={styles.trackConnector} />
          <View style={styles.trackRow}>
            <Text style={styles.trackRole}>TARGET</Text>
            <Text style={styles.trackTarget} numberOfLines={1}>{track.target}</Text>
          </View>
          {isHost && (
            <Pressable
              onPress={onChangeTrack}
              style={({ pressed }) => [styles.changeBtn, pressed && styles.changePressed]}
            >
              <Text style={styles.changeText}>⟳ CHANGE TRACK</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.label}>RACERS — {players.length}/{MAX_PLAYERS}</Text>
        <View style={styles.roster}>
          {slots.map((p, i) => (
            <View key={p?.id ?? 'empty-' + i} style={[styles.slot, !p && styles.slotEmpty]}>
              <Text style={styles.slotNum}>P{i + 1}</Text>
              {p ? (
                <Text style={styles.slotName} numberOfLines={1}>
                  {p.name}{p.isHost ? '  👑' : ''}
                </Text>
              ) : (
                <Text style={styles.slotWaiting}>awaiting racer…</Text>
              )}
              {p && <View style={styles.liveDot} />}
            </View>
          ))}
        </View>
        <View style={{ height: space(28) }} />
      </ScrollView>

      {isHost ? (
        <Pressable
          onPress={() => canStart && onStartRace?.()}
          disabled={!canStart}
          style={({ pressed }) => [
            styles.startBtn,
            pressed && { backgroundColor: colors.linkPressed },
            !canStart && styles.startDisabled,
          ]}
        >
          <Text style={styles.startText}>
            {canStart ? 'START THE RACE' : 'NEED 2+ RACERS TO START'}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.waitBtn}>
          <Animated.View style={[styles.waitDot, { opacity: pulse }]} />
          <Text style={styles.waitText}>READY — WAITING FOR HOST…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  scroll: { paddingTop: space(14), paddingHorizontal: space(5) },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space(5) },
  promptLine: { color: colors.paper, fontFamily: type.mono, fontSize: 18, letterSpacing: 2 },
  promptChar: { color: colors.link },
  cursor: { color: colors.link },
  leaveBtn: { borderWidth: 1, borderColor: colors.hairline, borderRadius: 8, paddingVertical: space(1), paddingHorizontal: space(2) },
  leaveText: { color: colors.paperDim, fontFamily: type.mono, fontSize: 11, letterSpacing: 1 },
  label: { color: colors.paperDim, fontFamily: type.mono, fontSize: 10, letterSpacing: 2, marginBottom: space(2), marginTop: space(4) },
  codeCard: { backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.link, borderRadius: radii.card, padding: space(4), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  code: { color: colors.paper, fontFamily: type.mono, fontSize: 40, letterSpacing: 12 },
  copyBtn: { borderWidth: 1, borderColor: colors.hairline, borderRadius: 8, paddingVertical: space(2), paddingHorizontal: space(3) },
  copyPressed: { backgroundColor: colors.ink },
  copyText: { color: colors.link, fontFamily: type.mono, fontSize: 11, letterSpacing: 1 },
  trackCard: { backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.hairline, borderRadius: radii.card, padding: space(4) },
  trackRow: { flexDirection: 'row', alignItems: 'baseline', gap: space(3) },
  trackRole: { color: colors.paperDim, fontFamily: type.mono, fontSize: 10, width: 54, letterSpacing: 1 },
  trackStart: { color: colors.link, fontFamily: type.display, fontSize: 19, textDecorationLine: 'underline', flex: 1 },
  trackTarget: { color: colors.gold, fontFamily: type.display, fontSize: 19, textDecorationLine: 'underline', flex: 1 },
  trackConnector: { width: 2, height: space(4), backgroundColor: colors.hairline, marginLeft: 72, marginVertical: 2 },
  changeBtn: { borderWidth: 1, borderColor: colors.link, borderRadius: 8, paddingVertical: space(2), paddingHorizontal: space(3), alignSelf: 'flex-start', marginTop: space(3) },
  changePressed: { backgroundColor: colors.ink },
  changeText: { color: colors.link, fontFamily: type.mono, fontSize: 11, letterSpacing: 1 },
  roster: { gap: space(2) },
  slot: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.hairline || '#333', borderRadius: radii.card, paddingVertical: space(3), paddingHorizontal: space(3) },
  slotEmpty: { borderColor: colors.hairline, borderStyle: 'dashed', backgroundColor: 'transparent' },
  slotNum: { color: colors.paperDim, fontFamily: type.mono, fontSize: 11, width: 24 },
  slotName: { color: colors.paper, fontSize: 15, fontWeight: '600', flex: 1 },
  slotWaiting: { color: colors.paperDim, fontSize: 14, fontStyle: 'italic', flex: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.link },
  startBtn: { position: 'absolute', left: space(5), right: space(5), bottom: space(8), backgroundColor: colors.link, borderRadius: radii.card, paddingVertical: space(4), alignItems: 'center' },
  startDisabled: { backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.hairline },
  startText: { color: colors.ink, fontFamily: type.display, fontSize: 19, letterSpacing: 1 },
  waitBtn: { position: 'absolute', left: space(5), right: space(5), bottom: space(8), borderWidth: 1, borderColor: colors.link, borderRadius: radii.card, paddingVertical: space(4), alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: space(2), backgroundColor: colors.ink },
  waitDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.link },
  waitText: { color: colors.link, fontFamily: type.mono, fontSize: 13, letterSpacing: 2 },
});
