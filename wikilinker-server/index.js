const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Listen on all network interfaces

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// ─── In-memory state ───────────────────────────────────────────────────────
const rooms = {}; // code -> { hostId, players: [{id, name, isHost}], track: {start, target} }

const ADJ = ['Turbo', 'Sneaky', 'Cosmic', 'Feral', 'Dapper', 'Chaotic', 'Silent', 'Golden'];
const NOUN = ['Llama', 'Falcon', 'Badger', 'Comet', 'Wombat', 'Pixel', 'Otter', 'Mongoose'];

const randomName = () =>
  ADJ[Math.floor(Math.random() * ADJ.length)] + NOUN[Math.floor(Math.random() * NOUN.length)];

const START_PAGES = [
  'Banana', 'Moon', 'Coffee', 'Penguin', 'Guitar',
  'Pizza', 'Dragon', 'Ocean', 'Mountain', 'Robot',
];
const TARGET_PAGES = [
  'Philosophy', 'Mathematics', 'Music', 'Space exploration',
  'Ancient Egypt', 'Quantum mechanics', 'Renaissance',
  'Evolution', 'Democracy', 'Artificial intelligence',
];

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const generateTrack = () => ({
  start: pickRandom(START_PAGES),
  target: pickRandom(TARGET_PAGES),
});

const generateCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms[code]);
  return code;
};

// ─── Socket handlers ───────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id} (${io.engine.clientsCount} clients)`);

  // ── CREATE ROOM ──────────────────────────────────────────────────────────
  socket.on('room:create', ({ name }, ack) => {
    try {
      const code = generateCode();
      const playerName = name || randomName();
      const track = generateTrack();

      rooms[code] = {
        hostId: socket.id,
        players: [{ id: socket.id, name: playerName, isHost: true }],
        track,
      };

      socket.join(code);
      console.log(`[room:create] ${code} by ${playerName} (${socket.id})`);

      ack({
        ok: true,
        code,
        players: rooms[code].players,
        track: rooms[code].track,
        hostId: socket.id,
      });
    } catch (err) {
      console.error('[room:create] error:', err);
      ack({ ok: false, error: 'Internal server error' });
    }
  });

  // ── JOIN ROOM ────────────────────────────────────────────────────────────
  socket.on('room:join', ({ code, name }, ack) => {
    try {
      const room = rooms[code];
      if (!room) {
        return ack({ ok: false, error: 'Room not found' });
      }

      // ── DUPLICATE GUARD: If this socket is already in the room, do NOT
      //    add a second entry. This prevents "ghost player" duplicates caused
      //    by lobby re-hydration on re-mount.
      const existingPlayer = room.players.find((p) => p.id === socket.id);
      if (existingPlayer) {
        console.log(`[room:join] ${code} — socket ${socket.id} already in room, skipping duplicate`);
        socket.join(code);
        return ack({
          ok: true,
          code,
          players: room.players,
          track: room.track,
          hostId: room.hostId,
        });
      }

      if (room.players.length >= 8) {
        return ack({ ok: false, error: 'Room is full (max 8 players)' });
      }

      const playerName = name || randomName();
      room.players.push({ id: socket.id, name: playerName, isHost: false });
      socket.join(code);

      console.log(`[room:join] ${code} by ${playerName} (${socket.id})`);

      // Broadcast updated player list to the room
      io.to(code).emit('room:update', {
        players: room.players,
        track: room.track,
        hostId: room.hostId,
      });

      ack({
        ok: true,
        code,
        players: room.players,
        track: room.track,
        hostId: room.hostId,
      });
    } catch (err) {
      console.error('[room:join] error:', err);
      ack({ ok: false, error: 'Internal server error' });
    }
  });

  // ── LEAVE ROOM ───────────────────────────────────────────────────────────
  socket.on('room:leave', ({ code }) => {
    try {
      const room = rooms[code];
      if (!room) return;

      room.players = room.players.filter((p) => p.id !== socket.id);
      socket.leave(code);

      console.log(`[room:leave] ${code} by ${socket.id}`);

      if (room.players.length === 0) {
        delete rooms[code];
        console.log(`[room:leave] ${code} deleted (empty)`);
      } else {
        // If the host left, assign a new host
        if (room.hostId === socket.id) {
          room.hostId = room.players[0].id;
          room.players[0].isHost = true;
        }
        io.to(code).emit('room:update', {
          players: room.players,
          track: room.track,
          hostId: room.hostId,
        });
      }
    } catch (err) {
      console.error('[room:leave] error:', err);
    }
  });

  // ── SHUFFLE TRACK (host only) ────────────────────────────────────────────
  socket.on('room:shuffle', ({ code }) => {
    try {
      const room = rooms[code];
      if (!room) return;
      if (room.hostId !== socket.id) return;

      room.track = generateTrack();
      console.log(`[room:shuffle] ${code} → ${room.track.start} → ${room.track.target}`);

      io.to(code).emit('room:update', {
        players: room.players,
        track: room.track,
        hostId: room.hostId,
      });
    } catch (err) {
      console.error('[room:shuffle] error:', err);
    }
  });

  // ── TRACK CHANGE (host only, custom pages) ───────────────────────────────
  socket.on('track:change', ({ code, start, target }, ack) => {
    try {
      const room = rooms[code];
      if (!room) return ack?.({ ok: false, error: 'Room not found' });
      if (room.hostId !== socket.id) return ack?.({ ok: false, error: 'Only the host can change the track' });

      const cleanStart = String(start || '').trim();
      const cleanTarget = String(target || '').trim();
      if (!cleanStart || !cleanTarget) {
        return ack?.({ ok: false, error: 'Both start and target pages are required' });
      }

      room.track = { start: cleanStart, target: cleanTarget };
      console.log(`[track:change] ${code} → ${cleanStart} → ${cleanTarget}`);

      io.to(code).emit('room:update', {
        players: room.players,
        track: room.track,
        hostId: room.hostId,
      });

      ack?.({ ok: true });
    } catch (err) {
      console.error('[track:change] error:', err);
      ack?.({ ok: false, error: 'Internal server error' });
    }
  });

  // ── START RACE (host only) ───────────────────────────────────────────────
  socket.on('race:start', ({ code }) => {
    try {
      const room = rooms[code];
      if (!room) return;
      if (room.hostId !== socket.id) return;

      console.log(`[race:start] ${code} → ${room.track.start} → ${room.track.target}`);

      io.to(code).emit('race:start', { track: room.track });
    } catch (err) {
      console.error('[race:start] error:', err);
    }
  });

  // ── PLAYER NAVIGATE ──────────────────────────────────────────────────────
  socket.on('player:navigate', ({ code, title, clicks }) => {
    try {
      const room = rooms[code];
      if (!room) return;
      console.log(`[player:navigate] ${code} ${socket.id} → ${title} (${clicks} clicks)`);

      // Update the navigating player's click count in the room state
      const player = room.players.find((p) => p.id === socket.id);
      if (player) player.clicks = clicks;

      // Broadcast the full updated players list (source of truth) to all
      io.to(code).emit('room:update', {
        players: room.players,
        track: room.track,
        hostId: room.hostId,
      });
    } catch (err) {
      console.error('[player:navigate] error:', err);
    }
  });

  // ── PLAYER FINISH ────────────────────────────────────────────────────────
  socket.on('player:finish', ({ code, clicks, seconds, path }) => {
    try {
      const room = rooms[code];
      if (!room) return;
      console.log(`[player:finish] ${code} ${socket.id} — ${clicks} clicks, ${seconds}s`);
    } catch (err) {
      console.error('[player:finish] error:', err);
    }
  });

  // ── DISCONNECT ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    // Clean up any rooms this socket was in
    for (const code of Object.keys(rooms)) {
      const room = rooms[code];
      const wasInRoom = room.players.some((p) => p.id === socket.id);
      if (wasInRoom) {
        room.players = room.players.filter((p) => p.id !== socket.id);
        if (room.players.length === 0) {
          delete rooms[code];
          console.log(`[disconnect] ${code} deleted (empty)`);
        } else {
          if (room.hostId === socket.id) {
            room.hostId = room.players[0].id;
            room.players[0].isHost = true;
          }
          io.to(code).emit('room:update', {
            players: room.players,
            track: room.track,
            hostId: room.hostId,
          });
        }
      }
    }
  });
});

// ─── Health check endpoint ─────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    rooms: Object.keys(rooms).length,
    clients: io.engine.clientsCount,
  });
});

// ─── Start server ──────────────────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  console.log(`\n🚀 WikiLinker Server`);
  console.log(`   Listening on http://${HOST}:${PORT}`);
  console.log(`   Local:      http://127.0.0.1:${PORT}`);
  console.log(`   Network:    http://192.168.1.80:${PORT}`);
  console.log(`   Clients:    ${io.engine.clientsCount}\n`);
});
