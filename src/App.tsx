/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnswerFeedbackEvent,
  AnswerPayload,
  PlayerIdentity,
  PublicQuestion,
  RoomState,
} from './types/game.ts';
import {
  initializeAutomaticIdentity,
  saveStoredSession,
} from './utils/identity.ts';
import { soundFX } from './utils/audio.ts';
import {
  CyberArenaCanvas,
  type CyberArenaCanvasHandle,
  type SceneMode,
} from './components/CyberArenaCanvas.tsx';
import { TitleScreen } from './components/TitleScreen.tsx';
import { LobbyModal } from './components/LobbyModal.tsx';
import { PlayingHUD } from './components/PlayingHUD.tsx';
import { PodiumResultsOverlay } from './components/PodiumResultsOverlay.tsx';
import {
  PauseModal,
  StudentAccountModal,
  TutorialAndAuditModal,
} from './components/Modals.tsx';

type UIPhase = 'title' | 'lobby' | 'playing' | 'paused' | 'gameover';

export default function App() {
  const [identity, setIdentity] = useState<PlayerIdentity | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [uiPhase, setUiPhase] = useState<UIPhase>('title');
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [lockedPGKIndices, setLockedPGKIndices] = useState<number[]>([]);
  const [activeFeedback, setActiveFeedback] =
    useState<AnswerFeedbackEvent | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showTutorialModal, setShowTutorialModal] = useState(false);

  const canvasRef = useRef<CyberArenaCanvasHandle | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const playedVictoryForRoomRef = useRef<string>('');
  const autostartTriggeredRef = useRef(false);

  // Mirror game state machine to document.body.dataset.state
  useEffect(() => {
    const bodyState =
      uiPhase === 'lobby' || uiPhase === 'title' ? 'title' : uiPhase;
    document.body.dataset.state = bodyState;
  }, [uiPhase]);

  const startRoomSession = useCallback(
    async (mode: 'solo' | 'multiplayer', currentIdentity: PlayerIdentity) => {
      setIsBusy(true);
      setErrorMessage('');
      try {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        const res = await fetch('/api/rooms/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionToken: currentIdentity.sessionToken,
            mode,
          }),
        });
        const data = (await res.json()) as {
          room?: RoomState;
          identity?: PlayerIdentity;
          error?: string;
        };
        if (!res.ok || !data.room) {
          setErrorMessage(data.error || 'Gagal menyiapkan ruang permainan.');
          setIsBusy(false);
          return;
        }
        if (data.identity) {
          setIdentity(data.identity);
          saveStoredSession(data.identity);
        }
        setLockedPGKIndices([]);
        setActiveFeedback(null);
        playedVictoryForRoomRef.current = '';
        setRoom(data.room);
        setUiPhase(data.room.status === 'playing' ? 'playing' : 'lobby');
      } catch {
        setErrorMessage('Koneksi ke server arena terputus. Coba lagi sesaat.');
      } finally {
        setIsBusy(false);
      }
    },
    []
  );

  const joinExistingRoom = useCallback(
    async (code: string, currentIdentity: PlayerIdentity) => {
      setIsBusy(true);
      setErrorMessage('');
      try {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(code.trim().toUpperCase())}/join`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionToken: currentIdentity.sessionToken,
            }),
          }
        );
        const data = (await res.json()) as {
          room?: RoomState;
          identity?: PlayerIdentity;
          error?: string;
        };
        if (!res.ok || !data.room) {
          setErrorMessage(
            data.error || 'Gagal bergabung ke room. Periksa kembali 5 karakter kode.'
          );
          setIsBusy(false);
          return;
        }
        if (data.identity) {
          setIdentity(data.identity);
          saveStoredSession(data.identity);
        }
        setLockedPGKIndices([]);
        setActiveFeedback(null);
        setRoom(data.room);
        if (data.room.status === 'playing') {
          setUiPhase('playing');
        } else if (data.room.status === 'finished') {
          setUiPhase('gameover');
        } else {
          setUiPhase('lobby');
        }
      } catch {
        setErrorMessage('Tidak dapat terhubung ke server room.');
      } finally {
        setIsBusy(false);
      }
    },
    []
  );

  // Initialize Automatic Student Identity + Check ?autostart=1 or ?room=CODE
  useEffect(() => {
    let cancelled = false;
    initializeAutomaticIdentity()
      .then((ident) => {
        if (cancelled) return;
        setIdentity(ident);

        if (!autostartTriggeredRef.current) {
          const params = new URLSearchParams(window.location.search);
          const auto = params.get('autostart');
          const roomParam = params.get('room');
          if (auto === '1') {
            autostartTriggeredRef.current = true;
            startRoomSession('solo', ident);
          } else if (roomParam && roomParam.trim().length === 5) {
            autostartTriggeredRef.current = true;
            joinExistingRoom(roomParam.trim().toUpperCase(), ident);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage('Gagal memuat sesi otomatis. Silakan muat ulang halaman.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [joinExistingRoom, startRoomSession]);

  // Connect & Synchronize Authoritative WebSocket for Active Room
  useEffect(() => {
    if (!room?.roomCode || !identity?.sessionToken) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const activeRoomCode = room.roomCode;
    const activeToken = identity.sessionToken;
    let disposed = false;
    let reconnectTimer = 0;

    function connectSocket() {
      if (disposed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'room:subscribe',
            roomCode: activeRoomCode,
            sessionToken: activeToken,
          })
        );
      };

      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }

        if (msg.type === 'room:state' && msg.room) {
          const nextRoom = msg.room as RoomState;
          setRoom(nextRoom);

          setUiPhase((prevPhase) => {
            if (nextRoom.status === 'finished') {
              if (playedVictoryForRoomRef.current !== `${nextRoom.roomCode}:${nextRoom.finishedAt}`) {
                playedVictoryForRoomRef.current = `${nextRoom.roomCode}:${nextRoom.finishedAt}`;
                soundFX.playVictoryFanfare();
              }
              return 'gameover';
            }
            if (nextRoom.status === 'playing') {
              return prevPhase === 'paused' ? 'paused' : 'playing';
            }
            return 'lobby';
          });
        } else if (msg.type === 'player:moved') {
          const movedId = String(msg.playerId || '');
          const posX = Number(msg.posX);
          const posZ = Number(msg.posZ);
          if (movedId && Number.isFinite(posX)) {
            setRoom((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                players: prev.players.map((p) =>
                  p.playerId === movedId ? { ...p, posX, posZ } : p
                ),
              };
            });
          }
        } else if (msg.type === 'player:feedback' && msg.feedback) {
          const fb = msg.feedback as AnswerFeedbackEvent;
          setActiveFeedback(fb);
          canvasRef.current?.triggerFeedbackBurst(fb.isCorrect);

          if (fb.isCorrect) {
            setLockedPGKIndices([]);
            if (fb.overtookNames.length > 0) {
              soundFX.playOvertake();
            } else {
              soundFX.playCorrect();
            }
          } else {
            soundFX.playWrong();
          }

          if (feedbackTimerRef.current) {
            window.clearTimeout(feedbackTimerRef.current);
          }
          feedbackTimerRef.current = window.setTimeout(() => {
            setActiveFeedback(null);
          }, 2600);
        }
      };

      ws.onclose = () => {
        if (!disposed) {
          reconnectTimer = window.setTimeout(connectSocket, 1200);
        }
      };
    }

    connectSocket();

    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [room?.roomCode, identity?.sessionToken]);

  const me = useMemo(() => {
    if (!room || !identity) return null;
    return (
      room.players.find((p) => p.playerId === identity.playerId) ||
      room.players[0] ||
      null
    );
  }, [room, identity]);

  const activeQuestion: PublicQuestion | null = useMemo(() => {
    if (!room || !me) return null;
    if (me.status === 'finished') return null;
    return room.questions[me.currentQuestionIndex] || null;
  }, [room, me]);

  const sendAnswerToServer = useCallback(
    (payload: AnswerPayload) => {
      if (!room || !identity || !activeQuestion) return;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'player:answer',
            roomCode: room.roomCode,
            sessionToken: identity.sessionToken,
            questionId: activeQuestion.id,
            payload,
          })
        );
      }
    },
    [room, identity, activeQuestion]
  );

  // Called when 3D laser projectile hits a 3D gate OR user clicks a gate
  const handleGateHitIn3D = useCallback(
    (optionIndex: number) => {
      if (!activeQuestion) return;
      if (activeQuestion.category === 'pilihan_ganda') {
        sendAnswerToServer({
          category: 'pilihan_ganda',
          selectedIndex: optionIndex,
        });
      } else if (activeQuestion.category === 'pilihan_ganda_kompleks') {
        setLockedPGKIndices((prev) =>
          prev.includes(optionIndex)
            ? prev.filter((i) => i !== optionIndex)
            : [...prev, optionIndex]
        );
      }
    },
    [activeQuestion, sendAnswerToServer]
  );

  const handleSelectPGOptionButton = useCallback((optionIndex: number) => {
    // Fires physical 3D laser from Hovercraft into the chosen 3D gate; on impact, notifies server!
    canvasRef.current?.fireAtOption(optionIndex);
  }, []);

  const handleTogglePGKOptionButton = useCallback((optionIndex: number) => {
    canvasRef.current?.fireAtOption(optionIndex);
  }, []);

  const handlePlayerMove = useCallback((posX: number, posZ: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'player:move',
          posX,
          posZ,
        })
      );
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      soundFX.setMuted(next);
      return next;
    });
  }, []);

  // Global Keyboard Shortcuts (Title Enter/Space, Pause P/Escape, Mute M)
  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (showAccountModal || showTutorialModal) return;

      if (e.code === 'KeyM' && !e.repeat) {
        handleToggleMute();
        return;
      }

      if (
        uiPhase === 'title' &&
        !e.repeat &&
        (e.code === 'Enter' || e.code === 'Space')
      ) {
        if (identity && !isBusy) {
          e.preventDefault();
          startRoomSession('solo', identity);
        }
        return;
      }

      if (
        (uiPhase === 'playing' || uiPhase === 'paused') &&
        !e.repeat &&
        (e.code === 'KeyP' || e.code === 'Escape')
      ) {
        e.preventDefault();
        setUiPhase((prev) => (prev === 'playing' ? 'paused' : 'playing'));
      }
    };

    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [
    uiPhase,
    identity,
    isBusy,
    showAccountModal,
    showTutorialModal,
    handleToggleMute,
    startRoomSession,
  ]);

  const handleSaveIdentity = async (formData: {
    displayName: string;
    kelas: string;
    nisn: string;
    email: string;
  }): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          sessionToken: identity?.sessionToken,
        }),
      });
      const data = (await res.json()) as {
        identity?: PlayerIdentity;
        error?: string;
      };
      if (!res.ok || !data.identity) {
        return data.error || 'Gagal menyimpan data akun siswa.';
      }
      setIdentity(data.identity);
      saveStoredSession(data.identity);
      return null;
    } catch {
      return 'Gagal menghubungi server autentikasi.';
    }
  };

  const handleInspectRoom = async (code: string): Promise<RoomState | null> => {
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
      const data = (await res.json()) as { room?: RoomState; error?: string };
      if (!res.ok || !data.room) {
        setErrorMessage(data.error || 'Room tidak ditemukan.');
        return null;
      }
      setErrorMessage('');
      return data.room;
    } catch {
      setErrorMessage('Gagal memeriksa status room.');
      return null;
    }
  };

  const handleImportQuestionsJson = async (
    rawJson: string
  ): Promise<string | null> => {
    if (!room || !identity) return 'Room belum siap.';
    try {
      const res = await fetch(`/api/rooms/${room.roomCode}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken: identity.sessionToken,
          rawJson,
        }),
      });
      const data = (await res.json()) as { room?: RoomState; error?: string };
      if (!res.ok || !data.room) {
        return data.error || 'Validasi soal gagal.';
      }
      setRoom(data.room);
      return null;
    } catch {
      return 'Gagal mengunggah bank soal ke server.';
    }
  };

  const handleResetAttachedQuestions = async () => {
    if (!room || !identity) return;
    const res = await fetch(`/api/rooms/${room.roomCode}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken: identity.sessionToken,
        resetToAttached: true,
      }),
    });
    const data = (await res.json()) as { room?: RoomState };
    if (res.ok && data.room) {
      setRoom(data.room);
    }
  };

  const handleStartMultiplayerFromLobby = () => {
    if (!room || !identity) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'room:start',
          roomCode: room.roomCode,
          sessionToken: identity.sessionToken,
        })
      );
    }
  };

  const handleRestartCurrentRoom = () => {
    if (!room || !identity) return;
    setActiveFeedback(null);
    setLockedPGKIndices([]);
    playedVictoryForRoomRef.current = '';
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'room:restart',
          roomCode: room.roomCode,
          sessionToken: identity.sessionToken,
        })
      );
      setUiPhase('playing');
    } else {
      startRoomSession(room.mode, identity);
    }
  };

  const handleLeaveToTitle = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setRoom(null);
    setActiveFeedback(null);
    setLockedPGKIndices([]);
    setUiPhase('title');
  };

  const canvasSceneMode: SceneMode =
    uiPhase === 'lobby' || uiPhase === 'title' ? 'title' : uiPhase;

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      {/* Persistent Isolated 3D WebGL Arena & Champions Podium */}
      <CyberArenaCanvas
        ref={canvasRef}
        sceneMode={canvasSceneMode}
        playerName={me?.displayName || identity?.displayName || 'Siswa SMP'}
        playerId={identity?.playerId || ''}
        playerColor={me?.avatarColor || '#38BDF8'}
        activeQuestion={uiPhase === 'playing' || uiPhase === 'paused' ? activeQuestion : null}
        lockedPGKIndices={lockedPGKIndices}
        otherPlayers={room?.players || []}
        topWinners={room?.players || []}
        onGateShotOrClicked={handleGateHitIn3D}
        onPlayerMove={handlePlayerMove}
      />

      {/* 1. TITLE SCREEN */}
      {uiPhase === 'title' && (
        <TitleScreen
          identity={identity}
          isBusy={isBusy || !identity}
          errorMessage={errorMessage}
          onStartSolo={() => {
            if (identity) startRoomSession('solo', identity);
          }}
          onCreateMultiplayerRoom={() => {
            if (identity) startRoomSession('multiplayer', identity);
          }}
          onJoinRoomByCode={(code) => {
            if (identity) joinExistingRoom(code, identity);
          }}
          onInspectRoom={handleInspectRoom}
          onOpenAccountModal={() => setShowAccountModal(true)}
          onOpenTutorialModal={() => setShowTutorialModal(true)}
        />
      )}

      {/* 2. MULTIPLAYER LOBBY */}
      {uiPhase === 'lobby' && room && identity && (
        <LobbyModal
          room={room}
          identity={identity}
          onStartMultiplayerGame={handleStartMultiplayerFromLobby}
          onLeaveRoom={handleLeaveToTitle}
          onImportQuestionsJson={handleImportQuestionsJson}
          onResetAttachedQuestions={handleResetAttachedQuestions}
        />
      )}

      {/* 3. ACTIVE 3D GAMEPLAY HUD */}
      {(uiPhase === 'playing' || uiPhase === 'paused') && room && me && (
        <PlayingHUD
          room={room}
          me={me}
          activeQuestion={activeQuestion}
          lockedPGKIndices={lockedPGKIndices}
          activeFeedback={activeFeedback}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onOpenPause={() => setUiPhase('paused')}
          onOpenTutorial={() => setShowTutorialModal(true)}
          onSelectPGOption={handleSelectPGOptionButton}
          onTogglePGKOption={handleTogglePGKOptionButton}
          onSubmitAnswer={sendAnswerToServer}
          onTrigger3DShoot={() => canvasRef.current?.triggerAlignedShot()}
          onMobileSteer={(dir) => canvasRef.current?.setMobileSteer(dir)}
        />
      )}

      {/* 4. 3D CHAMPIONS PODIUM & RESULTS */}
      {uiPhase === 'gameover' && room && identity && (
        <PodiumResultsOverlay
          room={room}
          currentPlayerId={identity.playerId}
          isHost={room.hostPlayerId === identity.playerId}
          onPlayAgain={handleRestartCurrentRoom}
          onReturnToTitle={handleLeaveToTitle}
        />
      )}

      {/* PAUSE MODAL */}
      {uiPhase === 'paused' && me && (
        <PauseModal
          score={me.score}
          answeredCount={me.answeredCount}
          totalQuestions={me.totalQuestions}
          onResume={() => setUiPhase('playing')}
          onRestart={handleRestartCurrentRoom}
          onExitToTitle={handleLeaveToTitle}
        />
      )}

      {/* STUDENT ACCOUNT MODAL */}
      {showAccountModal && (
        <StudentAccountModal
          identity={identity}
          onClose={() => setShowAccountModal(false)}
          onSaveIdentity={handleSaveIdentity}
        />
      )}

      {/* TUTORIAL & QUESTION AUDIT MODAL */}
      {showTutorialModal && (
        <TutorialAndAuditModal
          categoryAudit={room?.categoryAudit}
          onClose={() => setShowTutorialModal(false)}
        />
      )}
    </div>
  );
}
