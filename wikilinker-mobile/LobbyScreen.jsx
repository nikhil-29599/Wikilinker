import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, ScrollView, Animated,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ThemeContext } from './ThemeContext';
import { type, space, radii } from './theme';

const MAX_PLAYERS = 8;

export default function LobbyScreen({
  lobbyCode = '----',
  players = [],
  isHost = false,
  track = { start: '…', target: '…' },
  onStartRace,
  onLeaveLobby,
  onChangeTrack,
  onEditTrack,
  socket,
}) {
  console.log('[LobbyScreen] RENDER — lobbyCode:', lobbyCode, 'players:', JSON.stringify(players?.map(p => ({name: p.name, isHost: p.isHost}))), 'isHost:', isHost);
  const { colors } = useContext(ThemeContext);
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(null);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  // ── Lobby Re-hydration: re-join the socket room on mount if needed ──
  // This prevents "ghost lobby" issues when navigating back from the game.
  // The server now has a duplicate guard (checks if socket.id already exists
  // in the players list), so even if this fires twice, no duplicate is created.
  const hasRejoined = useRef(false);
  useEffect(() => {
    if (!lobbyCode || !socket) return;
    if (hasRejoined.current) return;
    hasRejoined.current = true;

    // Check if the socket is already in the room by looking at its rooms
    // If not, emit a re-join to re-hydrate the lobby state.
    const roomName = lobbyCode; // Socket.io room names are the code itself
    const myRooms = socket.rooms;
    if (!myRooms || !myRooms.has(roomName)) {
      console.log('[LobbyScreen] Re-joining room', lobbyCode, '(ghost lobby prevention)');
      socket.emit('room:join', { code: lobbyCode }, (res) => {
        if (!res?.ok) {
          console.warn('[LobbyScreen] Re-join failed:', res?.error);
        }
      });
    }
  }, [lobbyCode, socket]);

  // ── Cleanup on unmount: ensure we leave the socket room to prevent
  //    zombie players persisting in the server's player list.
  useEffect(() => {
    return () => {
      if (lobbyCode && socket) {
        console.log('[LobbyScreen] Cleanup — leaving room', lobbyCode);
        socket.emit('room:leave', { code: lobbyCode });
      }
    };
  }, [lobbyCode, socket]);

  // ── Edit Track Modal ──
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editStart, setEditStart] = useState(track.start);
  const [editTarget, setEditTarget] = useState(track.target);
  const [editError, setEditError] = useState(null);

  // Sync modal inputs when track prop changes (e.g. from server broadcast)
  useEffect(() => {
    setEditStart(track.start);
    setEditTarget(track.target);
  }, [track.start, track.target]);

  const handleEditTrack = () => {
    const start = editStart.trim();
    const target = editTarget.trim();
    if (!start || !target) {
      setEditError('Both start and target pages are required');
      return;
    }
    setEditError(null);
    setEditModalVisible(false);
    onEditTrack?.({ start, target });
  };

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

  const canStart = players.length >= 1; // TODO: Revert to 2+ players for production
  const slots = [...players, ...Array(Math.max(0, MAX_PLAYERS - players.length)).fill(null)];

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.headRow}>
          <Text style={s.promptLine}>
            {'>'} LOBBY OPEN
          </Text>
          <Pressable onPress={onLeaveLobby} hitSlop={10} style={s.leaveBtn}>
            <Text style={s.leaveText}>← LEAVE</Text>
          </Pressable>
        </View>

        <Text style={s.label}>ROOM CODE</Text>
        <View style={s.codeCard}>
          <Text style={s.code}>{lobbyCode}</Text>
          <Pressable
            onPress={copyCode}
            style={({ pressed }) => [s.copyBtn, pressed && s.copyPressed]}
          >
            <Text style={[s.copyText, copied && { color: colors.gold }]}>
              {copied ? '✓ COPIED!' : '⧉ COPY'}
            </Text>
          </Pressable>
        </View>

        <Text style={s.label}>GAME TRACK</Text>
        <View style={s.trackCard}>
          <View style={s.trackRow}>
            <Text style={s.trackRole}>START</Text>
            <Text style={s.trackStart} numberOfLines={1}>{track.start}</Text>
          </View>
          <View style={s.trackConnector} />
          <View style={s.trackRow}>
            <Text style={s.trackRole}>TARGET</Text>
            <Text style={s.trackTarget} numberOfLines={1}>{track.target}</Text>
          </View>
          {isHost && (
            <View style={s.trackActions}>
              <Pressable
                onPress={onChangeTrack}
                style={({ pressed }) => [s.changeBtn, pressed && s.changePressed]}
              >
                <Text style={s.changeText}>⟳ SHUFFLE</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setEditStart(track.start);
                  setEditTarget(track.target);
                  setEditError(null);
                  setEditModalVisible(true);
                }}
                style={({ pressed }) => [s.changeBtn, pressed && s.changePressed]}
              >
                <Text style={s.changeText}>✎ EDIT</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Text style={s.label}>RACERS — {players.length}/{MAX_PLAYERS}</Text>
        <View style={s.roster}>
          {slots.map((p, i) => (
            <View key={p?.id ? p.id + '-' + i : 'empty-' + i} style={[s.slot, !p && s.slotEmpty]}>
              <Text style={s.slotNum}>P{i + 1}</Text>
              {p ? (
                <Text style={s.slotName} numberOfLines={1}>
                  {p.name}{p.isHost ? '  👑' : ''}
                </Text>
              ) : (
                <Text style={s.slotWaiting}>awaiting racer…</Text>
              )}
              {p && <View style={s.liveDot} />}
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
            s.startBtn,
            pressed && { backgroundColor: colors.linkPressed },
            !canStart && s.startDisabled,
          ]}
        >
          <Text style={s.startText}>
            {canStart ? 'START THE RACE' : 'NEED 2+ RACERS TO START'}
          </Text>
        </Pressable>
      ) : (
        <View style={s.waitBtn}>
          <Animated.View style={[s.waitDot, { opacity: pulse }]} />
          <Text style={s.waitText}>READY — WAITING FOR HOST…</Text>
        </View>
      )}

      {/* ── Edit Track Modal ── */}
      <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.modalOverlay}
        >
          <View style={[s.modalContent, { backgroundColor: colors.inkRaised, borderColor: colors.hairline }]}>
            <Text style={[s.modalTitle, { color: colors.paper, fontFamily: type.displayBlack }]}>
              Edit Track
            </Text>

            <Text style={[s.modalLabel, { color: colors.paperDim }]}>START PAGE</Text>
            <TextInput
              style={[s.modalInput, { borderColor: colors.link, color: colors.paper, fontFamily: type.display }]}
              value={editStart}
              onChangeText={setEditStart}
              placeholder="Banana"
              placeholderTextColor={colors.paperDim}
              autoCapitalize="words"
              autoCorrect={false}
            />

            <Text style={[s.modalLabel, { color: colors.paperDim }]}>TARGET PAGE</Text>
            <TextInput
              style={[s.modalInput, { borderColor: colors.gold, color: colors.paper, fontFamily: type.display }]}
              value={editTarget}
              onChangeText={setEditTarget}
              placeholder="Philosophy"
              placeholderTextColor={colors.paperDim}
              autoCapitalize="words"
              autoCorrect={false}
            />

            {editError && (
              <Text style={[s.modalError, { color: colors.danger }]}>{editError}</Text>
            )}

            <View style={s.modalActions}>
              <Pressable
                onPress={() => setEditModalVisible(false)}
                style={({ pressed }) => [s.modalBtn, s.modalCancelBtn, pressed && { backgroundColor: colors.ink }]}
              >
                <Text style={[s.modalBtnText, { color: colors.paperDim }]}>CANCEL</Text>
              </Pressable>
              <Pressable
                onPress={handleEditTrack}
                style={({ pressed }) => [s.modalBtn, { backgroundColor: colors.link }, pressed && { backgroundColor: colors.linkPressed }]}
              >
                <Text style={[s.modalBtnText, { color: colors.ink }]}>SAVE</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
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
  trackActions: { flexDirection: 'row', gap: space(2), marginTop: space(3) },
  changeBtn: { borderWidth: 1, borderColor: colors.link, borderRadius: 8, paddingVertical: space(2), paddingHorizontal: space(3) },
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

  // ── Edit Track Modal ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', maxWidth: 340, borderWidth: 1, borderRadius: radii.card, padding: space(6), gap: space(3) },
  modalTitle: { fontSize: 22, textAlign: 'center' },
  modalLabel: { fontFamily: type.mono, fontSize: 10, letterSpacing: 2, marginTop: space(1) },
  modalInput: { borderWidth: 2, borderRadius: radii.card, paddingVertical: space(3), paddingHorizontal: space(4), fontSize: 17 },
  modalError: { fontFamily: type.mono, fontSize: 12, textAlign: 'center' },
  modalActions: { flexDirection: 'row', gap: space(3), marginTop: space(3) },
  modalBtn: { flex: 1, paddingVertical: space(4), borderRadius: radii.card, alignItems: 'center' },
  modalCancelBtn: { borderWidth: 1, borderColor: colors.hairline },
  modalBtnText: { fontFamily: type.display, fontSize: 16, fontWeight: '700', letterSpacing: 1 },
});
