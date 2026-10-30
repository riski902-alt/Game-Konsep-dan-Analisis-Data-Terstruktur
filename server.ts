import express from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  AnswerFeedbackEvent,
  AnswerPayload,
  AuthoritativeQuestion,
  IdentitySource,
  PlayerIdentity,
  PlayerPlayStatus,
  PlayerProgress,
  RoomLifecycleStatus,
  RoomMode,
  RoomState,
} from './src/types/game.ts';
import {
  ATTACHED_PDF_QUESTIONS,
  buildCategoryAudit,
  parseAndValidateQuestionBank,
  stripAnswerKey,
} from './src/game/questionsBank.ts';
import {
  calculateQuestionScore,
  evaluateAnswer,
  rankPlayers,
  selectMakassarCheer,
} from './src/game/rules.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const AVATAR_PALETTE = [
  '#38BDF8',
  '#FBBF24',
  '#6EE7B7',
  '#86C8A2',
  '#60A5FA',
  '#F472B6',
  '#A78BFA',
  '#34D399',
];

interface ServerPlayerRecord {
  playerId: string;
  displayName: string;
  nisn: string;
  kelas: string;
  avatarColor: string;
  currentQuestionIndex: number;
  correctCount: number;
  wrongCount: number;
  wrongAttemptsOnCurrent: number;
  score: number;
  joinedAt: number;
  startedPlayingAt: number | null;
  questionStartedAt: number | null;
  finishedAt: number | null;
  status: PlayerPlayStatus;
  joinedLate: boolean;
  isConnected: boolean;
  posX: number;
  posZ: number;
  rank: number;
  previousRank: number;
  lastCheer: string;
  cheerCounter: number;
}

interface ServerRoomRecord {
  roomCode: string;
  hostPlayerId: string;
  mode: RoomMode;
  status: RoomLifecycleStatus;
  questionSetTitle: string;
  isDefaultAttachedBank: boolean;
  questions: AuthoritativeQuestion[];
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  players: Map<string, ServerPlayerRecord>;
}

const sessionsByToken = new Map<string, PlayerIdentity>();
const roomsByCode = new Map<string, ServerRoomRecord>();
const socketsByRoom = new Map<string, Set<WebSocket>>();
const socketMeta = new WeakMap<WebSocket, { roomCode: string; playerId: string }>();

const DATA_DIR = path.join(__dirname, '.data');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'arena_leaderboard_history.json');

function persistRoomSummary(room: ServerRoomRecord): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const summary = serializeRoomState(room);
    let history: Record<string, unknown> = {};
    if (fs.existsSync(SNAPSHOT_FILE)) {
      try {
        history = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8'));
      } catch {
        history = {};
      }
    }
    history[room.roomCode] = {
      roomCode: summary.roomCode,
      mode: summary.mode,
      status: summary.status,
      questionSetTitle: summary.questionSetTitle,
      updatedAt: Date.now(),
      players: summary.players,
    };
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(history, null, 2), 'utf-8');
  } catch {
    // Non-fatal in ephemeral or read-only containers
  }
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars[crypto.randomInt(0, chars.length)];
    }
    if (!roomsByCode.has(code)) {
      return code;
    }
  }
  return crypto.randomBytes(3).toString('hex').slice(0, 5).toUpperCase();
}

function createUniqueIdentity(params: {
  existingToken?: string;
  displayName?: string;
  nisn?: string;
  kelas?: string;
  email?: string;
  source?: IdentitySource;
}): PlayerIdentity {
  if (params.existingToken && sessionsByToken.has(params.existingToken)) {
    const existing = sessionsByToken.get(params.existingToken)!;
    if (params.displayName && params.displayName.trim()) {
      existing.displayName = params.displayName.trim().slice(0, 48);
    }
    if (params.nisn !== undefined) existing.nisn = String(params.nisn).trim().slice(0, 24);
    if (params.kelas !== undefined) existing.kelas = String(params.kelas).trim().slice(0, 24);
    if (params.email !== undefined) existing.email = String(params.email).trim().slice(0, 80);
    if (params.source) existing.source = params.source;
    return existing;
  }

  const shortSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  const playerId = `PLR-${shortSuffix}`;
  const sessionToken = crypto.randomBytes(24).toString('hex');
  const cleanName =
    params.displayName && params.displayName.trim().length > 0
      ? params.displayName.trim().slice(0, 48)
      : `Siswa SMP ${shortSuffix.slice(0, 4)}`;

  const identity: PlayerIdentity = {
    playerId,
    sessionToken,
    displayName: cleanName,
    nisn: (params.nisn || '').trim().slice(0, 24),
    kelas: (params.kelas || 'VII').trim().slice(0, 24),
    email: (params.email || '').trim().slice(0, 80),
    source: params.source || 'guest_fallback',
  };

  sessionsByToken.set(sessionToken, identity);
  return identity;
}

function computeElapsedMs(player: ServerPlayerRecord, now: number): number {
  if (!player.startedPlayingAt) return 0;
  const end = player.finishedAt ?? now;
  return Math.max(0, end - player.startedPlayingAt);
}

function recalculateRanks(room: ServerRoomRecord, now = Date.now()): Map<string, number> {
  const previousRanks = new Map<string, number>();
  for (const p of room.players.values()) {
    previousRanks.set(p.playerId, p.rank);
  }

  const sortable = Array.from(room.players.values()).map((p) => ({
    playerId: p.playerId,
    score: p.score,
    correctCount: p.correctCount,
    wrongCount: p.wrongCount,
    elapsedMs: computeElapsedMs(p, now),
  }));

  const sorted = rankPlayers(sortable);
  sorted.forEach((entry, index) => {
    const rec = room.players.get(entry.playerId);
    if (rec) {
      rec.previousRank = previousRanks.get(entry.playerId) || index + 1;
      rec.rank = index + 1;
    }
  });

  return previousRanks;
}

function serializeRoomState(room: ServerRoomRecord): RoomState {
  const now = Date.now();
  recalculateRanks(room, now);

  const totalQuestions = room.questions.length;
  const playersList: PlayerProgress[] = Array.from(room.players.values())
    .sort((a, b) => a.rank - b.rank)
    .map((p) => {
      const clampedIdx = Math.min(p.currentQuestionIndex, Math.max(0, totalQuestions - 1));
      const activeQ = room.questions[clampedIdx];
      const answeredCount = p.correctCount;
      const progressPercent =
        totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

      return {
        playerId: p.playerId,
        displayName: p.displayName,
        nisn: p.nisn,
        kelas: p.kelas,
        avatarColor: p.avatarColor,
        levelName: activeQ ? activeQ.meetingLabel : 'Selesai',
        currentCategory: activeQ ? activeQ.category : 'pilihan_ganda',
        currentQuestionIndex: p.currentQuestionIndex,
        totalQuestions,
        answeredCount,
        correctCount: p.correctCount,
        wrongCount: p.wrongCount,
        score: p.score,
        progressPercent,
        elapsedMs: computeElapsedMs(p, now),
        rank: p.rank,
        previousRank: p.previousRank,
        status: p.status,
        joinedLate: p.joinedLate,
        isConnected: p.isConnected,
        posX: p.posX,
        posZ: p.posZ,
        lastCheer: p.lastCheer,
      };
    });

  return {
    roomCode: room.roomCode,
    hostPlayerId: room.hostPlayerId,
    mode: room.mode,
    status: room.status,
    lateJoinRuleDescription:
      'Siswa yang bergabung saat sesi aktif berlangsung tetap dapat masuk mandiri mulai dari Soal 1 dengan status Gabung Menyusul. Peringkat dihitung adil berdasarkan akurasi penguasaan materi + bonus efisiensi waktu masing-masing.',
    questionSetTitle: room.questionSetTitle,
    isDefaultAttachedBank: room.isDefaultAttachedBank,
    categoryAudit: buildCategoryAudit(room.questions, room.isDefaultAttachedBank),
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    finishedAt: room.finishedAt,
    questions: room.questions.map(stripAnswerKey),
    players: playersList,
  };
}

function broadcastToRoom(roomCode: string, message: unknown): void {
  const clients = socketsByRoom.get(roomCode);
  if (!clients) return;
  const serialized = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  }
}

function ensurePlayerInRoom(
  room: ServerRoomRecord,
  identity: PlayerIdentity
): ServerPlayerRecord {
  const now = Date.now();
  const existing = room.players.get(identity.playerId);
  if (existing) {
    existing.displayName = identity.displayName;
    existing.nisn = identity.nisn;
    existing.kelas = identity.kelas;
    existing.isConnected = true;
    return existing;
  }

  const indexSeed = room.players.size;
  const joinedLate = room.status === 'playing';
  const initialStatus: PlayerPlayStatus =
    room.status === 'playing'
      ? 'playing'
      : room.status === 'finished'
        ? 'finished'
        : 'waiting';

  const laneOffset = ((indexSeed % 5) - 2) * 2.2;
  const record: ServerPlayerRecord = {
    playerId: identity.playerId,
    displayName: identity.displayName,
    nisn: identity.nisn,
    kelas: identity.kelas,
    avatarColor: AVATAR_PALETTE[indexSeed % AVATAR_PALETTE.length],
    currentQuestionIndex: 0,
    correctCount: 0,
    wrongCount: 0,
    wrongAttemptsOnCurrent: 0,
    score: 0,
    joinedAt: now,
    startedPlayingAt: room.status === 'playing' ? now : null,
    questionStartedAt: room.status === 'playing' ? now : null,
    finishedAt: room.status === 'finished' ? now : null,
    status: initialStatus,
    joinedLate,
    isConnected: true,
    posX: laneOffset,
    posZ: 0,
    rank: indexSeed + 1,
    previousRank: indexSeed + 1,
    lastCheer: '',
    cheerCounter: 0,
  };

  room.players.set(identity.playerId, record);
  recalculateRanks(room, now);
  return record;
}

function startRoomExecution(room: ServerRoomRecord): void {
  if (room.status !== 'lobby') return;
  const now = Date.now();
  room.status = 'playing';
  room.startedAt = now;
  for (const p of room.players.values()) {
    p.status = 'playing';
    p.currentQuestionIndex = 0;
    p.correctCount = 0;
    p.wrongCount = 0;
    p.wrongAttemptsOnCurrent = 0;
    p.score = 0;
    p.startedPlayingAt = now;
    p.questionStartedAt = now;
    p.finishedAt = null;
  }
  recalculateRanks(room, now);
  persistRoomSummary(room);
}

async function bootstrapServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // 1. Sesi Identitas Otomatis & Sinkronisasi Akun INFORMATIKA FUN
  app.post('/api/auth/session', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const existingToken =
      typeof body.sessionToken === 'string' ? body.sessionToken : undefined;
    const displayName =
      typeof body.displayName === 'string' ? body.displayName : undefined;
    const nisn = typeof body.nisn === 'string' ? body.nisn : undefined;
    const kelas = typeof body.kelas === 'string' ? body.kelas : undefined;
    const email = typeof body.email === 'string' ? body.email : undefined;
    const source = (body.source as IdentitySource) || undefined;

    const identity = createUniqueIdentity({
      existingToken,
      displayName,
      nisn,
      kelas,
      email,
      source,
    });

    // Perbarui nama pada room yang sedang diikuti pemain ini
    for (const room of roomsByCode.values()) {
      const rec = room.players.get(identity.playerId);
      if (rec) {
        rec.displayName = identity.displayName;
        rec.nisn = identity.nisn;
        rec.kelas = identity.kelas;
        broadcastToRoom(room.roomCode, {
          type: 'room:state',
          room: serializeRoomState(room),
        });
      }
    }

    res.json({ identity });
  });

  // 2. Login / Konfirmasi Akun Siswa Tervalidasi
  app.post('/api/auth/login', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const nisn = typeof body.nisn === 'string' ? body.nisn.trim() : '';
    const kelas = typeof body.kelas === 'string' ? body.kelas.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const existingToken =
      typeof body.sessionToken === 'string' ? body.sessionToken : undefined;

    if (displayName.length < 2) {
      res.status(400).json({
        error: 'Nama lengkap akun siswa wajib diisi (minimal 2 karakter).',
      });
      return;
    }
    if (!kelas) {
      res.status(400).json({
        error: 'Kelas siswa wajib dipilih atau diisi (contoh: VII-A).',
      });
      return;
    }
    if (nisn && !/^[0-9]{4,16}$/.test(nisn)) {
      res.status(400).json({
        error: 'NISN harus berupa angka 4 hingga 16 digit.',
      });
      return;
    }

    const identity = createUniqueIdentity({
      existingToken,
      displayName,
      nisn,
      kelas,
      email,
      source: 'registered_student',
    });

    for (const room of roomsByCode.values()) {
      const rec = room.players.get(identity.playerId);
      if (rec) {
        rec.displayName = identity.displayName;
        rec.nisn = identity.nisn;
        rec.kelas = identity.kelas;
        broadcastToRoom(room.roomCode, {
          type: 'room:state',
          room: serializeRoomState(room),
        });
      }
    }

    res.json({ identity });
  });

  // 3. Buat Room Permainan (Solo atau Multiplayer)
  app.post('/api/rooms/create', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken : '';
    const mode: RoomMode = body.mode === 'solo' ? 'solo' : 'multiplayer';

    const identity =
      (sessionToken && sessionsByToken.get(sessionToken)) ||
      createUniqueIdentity({});

    const roomCode = generateRoomCode();
    const now = Date.now();
    const room: ServerRoomRecord = {
      roomCode,
      hostPlayerId: identity.playerId,
      mode,
      status: 'lobby',
      questionSetTitle: 'Modul Informatika SMP · Bank Soal File Terlampir',
      isDefaultAttachedBank: true,
      questions: ATTACHED_PDF_QUESTIONS.map((q) => ({ ...q })),
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      players: new Map(),
    };

    ensurePlayerInRoom(room, identity);
    if (mode === 'solo') {
      startRoomExecution(room);
    }

    roomsByCode.set(roomCode, room);
    persistRoomSummary(room);

    res.json({
      identity,
      room: serializeRoomState(room),
    });
  });

  // 4. Periksa Status Room & Aturan Bergabung Sebelum Masuk
  app.get('/api/rooms/:code', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = roomsByCode.get(code);
    if (!room) {
      res.status(404).json({
        error: `Kode room "${code}" tidak ditemukan. Pastikan 5 karakter kode room sesuai dengan layar Host.`,
      });
      return;
    }
    res.json({ room: serializeRoomState(room) });
  });

  // 5. Gabung Room dengan Kode Unik via HTTP + WS Sync
  app.post('/api/rooms/:code/join', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const body = (req.body || {}) as Record<string, unknown>;
    const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken : '';

    if (!code || code.length !== 5) {
      res.status(400).json({
        error: 'Masukkan tepat 5 karakter kode room untuk bergabung.',
      });
      return;
    }

    const room = roomsByCode.get(code);
    if (!room) {
      res.status(404).json({
        error: `Room dengan kode "${code}" tidak ditemukan. Periksa kembali kode dari pembuat ruang.`,
      });
      return;
    }

    const identity =
      (sessionToken && sessionsByToken.get(sessionToken)) ||
      createUniqueIdentity({});

    ensurePlayerInRoom(room, identity);
    const state = serializeRoomState(room);
    persistRoomSummary(room);

    broadcastToRoom(room.roomCode, {
      type: 'room:state',
      room: state,
    });

    res.json({ identity, room: state });
  });

  // 6. Impor Bank Soal JSON Terkonfirmasi oleh Host / Guru (Sebelum Mulai)
  app.post('/api/rooms/:code/questions', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = roomsByCode.get(code);
    if (!room) {
      res.status(404).json({ error: 'Room tidak ditemukan.' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken : '';
    const identity = sessionsByToken.get(sessionToken);
    if (!identity || identity.playerId !== room.hostPlayerId) {
      res.status(403).json({ error: 'Hanya pembuat room (Host) yang dapat mengatur bank soal.' });
      return;
    }

    if (room.status !== 'lobby') {
      res.status(400).json({ error: 'Bank soal hanya dapat diubah sebelum permainan dimulai.' });
      return;
    }

    if (body.resetToAttached === true) {
      room.questions = ATTACHED_PDF_QUESTIONS.map((q) => ({ ...q }));
      room.questionSetTitle = 'Modul Informatika SMP · Bank Soal File Terlampir';
      room.isDefaultAttachedBank = true;
      const state = serializeRoomState(room);
      broadcastToRoom(room.roomCode, { type: 'room:state', room: state });
      res.json({ room: state });
      return;
    }

    const rawJson = typeof body.rawJson === 'string' ? body.rawJson : '';
    const validated = parseAndValidateQuestionBank(rawJson);
    if (!validated.ok || !validated.questions) {
      res.status(400).json({ error: validated.error || 'Gagal memvalidasi bank soal.' });
      return;
    }

    room.questions = validated.questions;
    room.questionSetTitle = validated.title || 'Bank Soal Informatika Terkonfirmasi';
    room.isDefaultAttachedBank = false;
    const state = serializeRoomState(room);
    broadcastToRoom(room.roomCode, { type: 'room:state', room: state });
    res.json({ room: state });
  });

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      const type = String(msg.type || '');

      if (type === 'room:subscribe') {
        const roomCode = String(msg.roomCode || '').trim().toUpperCase();
        const sessionToken = String(msg.sessionToken || '');
        const room = roomsByCode.get(roomCode);
        const identity = sessionsByToken.get(sessionToken);
        if (!room || !identity) {
          ws.send(
            JSON.stringify({
              type: 'room:error',
              error: 'Sesi atau kode room tidak valid.',
            })
          );
          return;
        }

        ensurePlayerInRoom(room, identity);
        if (!socketsByRoom.has(roomCode)) {
          socketsByRoom.set(roomCode, new Set());
        }
        socketsByRoom.get(roomCode)!.add(ws);
        socketMeta.set(ws, { roomCode, playerId: identity.playerId });

        broadcastToRoom(roomCode, {
          type: 'room:state',
          room: serializeRoomState(room),
        });
        return;
      }

      if (type === 'room:start') {
        const roomCode = String(msg.roomCode || '').trim().toUpperCase();
        const sessionToken = String(msg.sessionToken || '');
        const room = roomsByCode.get(roomCode);
        const identity = sessionsByToken.get(sessionToken);
        if (!room || !identity) return;
        if (room.hostPlayerId !== identity.playerId) return;

        startRoomExecution(room);
        broadcastToRoom(roomCode, {
          type: 'room:state',
          room: serializeRoomState(room),
        });
        return;
      }

      if (type === 'room:restart') {
        const roomCode = String(msg.roomCode || '').trim().toUpperCase();
        const sessionToken = String(msg.sessionToken || '');
        const room = roomsByCode.get(roomCode);
        const identity = sessionsByToken.get(sessionToken);
        if (!room || !identity) return;
        if (room.hostPlayerId !== identity.playerId && room.mode !== 'solo') return;

        room.status = 'lobby';
        room.finishedAt = null;
        startRoomExecution(room);
        broadcastToRoom(roomCode, {
          type: 'room:state',
          room: serializeRoomState(room),
        });
        return;
      }

      if (type === 'player:move') {
        const meta = socketMeta.get(ws);
        if (!meta) return;
        const room = roomsByCode.get(meta.roomCode);
        if (!room) return;
        const player = room.players.get(meta.playerId);
        if (!player) return;

        const posX = Number(msg.posX);
        const posZ = Number(msg.posZ);
        if (Number.isFinite(posX)) {
          player.posX = Math.max(-10, Math.min(10, posX));
        }
        if (Number.isFinite(posZ)) {
          player.posZ = Math.max(-200, Math.min(20, posZ));
        }

        broadcastToRoom(meta.roomCode, {
          type: 'player:moved',
          playerId: player.playerId,
          posX: player.posX,
          posZ: player.posZ,
        });
        return;
      }

      if (type === 'player:answer') {
        const roomCode = String(msg.roomCode || '').trim().toUpperCase();
        const sessionToken = String(msg.sessionToken || '');
        const questionId = String(msg.questionId || '');
        const payload = msg.payload as AnswerPayload | undefined;

        const room = roomsByCode.get(roomCode);
        const identity = sessionsByToken.get(sessionToken);
        if (!room || !identity || !payload) return;
        if (room.status !== 'playing') return;

        const player = room.players.get(identity.playerId);
        if (!player || player.status !== 'playing') return;

        const activeQuestion = room.questions[player.currentQuestionIndex];
        if (!activeQuestion || activeQuestion.id !== questionId) {
          // Cegah loncat urutan soal atau pengiriman duplikat
          return;
        }

        const now = Date.now();
        const oldRanks = new Map<string, number>();
        for (const p of room.players.values()) {
          oldRanks.set(p.playerId, p.rank);
        }

        const isCorrect = evaluateAnswer(activeQuestion, payload);
        let pointsAwarded = 0;
        let finishedGame = false;

        if (isCorrect) {
          const qElapsed = player.questionStartedAt ? now - player.questionStartedAt : 10000;
          pointsAwarded = calculateQuestionScore({
            isCorrect: true,
            questionElapsedMs: qElapsed,
            wrongAttemptsOnQuestion: player.wrongAttemptsOnCurrent,
          });
          player.score += pointsAwarded;
          player.correctCount += 1;
          player.currentQuestionIndex += 1;
          player.wrongAttemptsOnCurrent = 0;
          player.questionStartedAt = now;

          if (player.currentQuestionIndex >= room.questions.length) {
            player.status = 'finished';
            player.finishedAt = now;
            finishedGame = true;
          }
        } else {
          player.wrongCount += 1;
          player.wrongAttemptsOnCurrent += 1;
        }

        recalculateRanks(room, now);

        const prevRank = oldRanks.get(player.playerId) ?? player.rank;
        const overtookNames: string[] = [];
        if (isCorrect && player.rank < prevRank) {
          for (const other of room.players.values()) {
            if (other.playerId !== player.playerId) {
              const otherPrev = oldRanks.get(other.playerId) ?? other.rank;
              if (otherPrev < prevRank && other.rank > otherPrev) {
                overtookNames.push(other.displayName);
              }
            }
          }
        }

        const nextQuestion = room.questions[player.currentQuestionIndex];
        const categoryCompleted =
          isCorrect &&
          !finishedGame &&
          nextQuestion &&
          nextQuestion.category !== activeQuestion.category;

        const cheerType: AnswerFeedbackEvent['cheerType'] = finishedGame
          ? 'finish'
          : overtookNames.length > 0
            ? 'overtake'
            : categoryCompleted
              ? 'level_up'
              : isCorrect
                ? 'correct'
                : 'wrong';

        player.cheerCounter += 1;
        const cheerMessage = selectMakassarCheer(
          cheerType,
          player.lastCheer,
          player.cheerCounter
        );
        player.lastCheer = cheerMessage;

        // Jika di Solo mode pemain selesai, atau di Multiplayer semua pemain terhubung selesai -> akhiri room
        const activePlayers = Array.from(room.players.values()).filter(
          (p) => p.isConnected || p.score > 0 || p.correctCount > 0
        );
        const allFinished =
          activePlayers.length > 0 &&
          activePlayers.every((p) => p.status === 'finished');

        if (allFinished) {
          room.status = 'finished';
          room.finishedAt = now;
        }

        persistRoomSummary(room);

        const feedback: AnswerFeedbackEvent = {
          playerId: player.playerId,
          questionId: activeQuestion.id,
          isCorrect,
          pointsAwarded,
          totalScore: player.score,
          cheerMessage,
          cheerType,
          overtookNames,
          advancedToIndex: player.currentQuestionIndex,
          finishedGame,
        };

        ws.send(
          JSON.stringify({
            type: 'player:feedback',
            feedback,
          })
        );

        broadcastToRoom(roomCode, {
          type: 'room:state',
          room: serializeRoomState(room),
        });
      }
    });

    ws.on('close', () => {
      const meta = socketMeta.get(ws);
      if (!meta) return;
      const set = socketsByRoom.get(meta.roomCode);
      if (set) {
        set.delete(ws);
      }
      const room = roomsByCode.get(meta.roomCode);
      if (room) {
        const player = room.players.get(meta.playerId);
        if (player) {
          player.isConnected = false;
        }
        broadcastToRoom(meta.roomCode, {
          type: 'room:state',
          room: serializeRoomState(room),
        });
      }
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Informatika Fun 3D Arena server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrapServer();
