import { useEffect, useMemo, useState } from 'react';
import { getCurrentLeaderboardTop3, rankPlayers } from '../game/rules.ts';
import type {
  AnswerFeedbackEvent,
  AnswerPayload,
  PlayerProgress,
  PublicQuestion,
  RoomState,
} from '../types/game.ts';

interface PlayingHUDProps {
  room: RoomState;
  me: PlayerProgress;
  activeQuestion: PublicQuestion | null;
  lockedPGKIndices: number[];
  activeFeedback: AnswerFeedbackEvent | null;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenPause: () => void;
  onOpenTutorial: () => void;
  onSelectPGOption: (optionIndex: number) => void;
  onTogglePGKOption: (optionIndex: number) => void;
  onSubmitAnswer: (payload: AnswerPayload) => void;
  onTrigger3DShoot: () => void;
  onMobileSteer: (dir: -1 | 0 | 1) => void;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function PlayingHUD({
  room,
  me,
  activeQuestion,
  lockedPGKIndices,
  activeFeedback,
  isMuted,
  onToggleMute,
  onOpenPause,
  onOpenTutorial,
  onSelectPGOption,
  onTogglePGKOption,
  onSubmitAnswer,
  onTrigger3DShoot,
  onMobileSteer,
}: PlayingHUDProps) {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [mobileLbOpen, setMobileLbOpen] = useState(false);
  const [liveElapsedMs, setLiveElapsedMs] = useState(me.elapsedMs);

  const rankedPlayers = useMemo(() => rankPlayers(room.players), [room.players]);
  const topThreePlayers = useMemo(
    () => getCurrentLeaderboardTop3(room.players, 3),
    [room.players]
  );

  // Matching state for 'menjodohkan'
  const [selectedLeftId, setSelectedLeftId] = useState<string | null>(null);
  const [pairs, setPairs] = useState<Record<string, string>>({});

  // Fill-in state for 'isian'
  const [fillText, setFillText] = useState('');
  const [validationHint, setValidationHint] = useState('');

  // Reset local inputs whenever activeQuestion changes
  useEffect(() => {
    setSelectedLeftId(null);
    setPairs({});
    setFillText('');
    setValidationHint('');
  }, [activeQuestion?.id]);

  // Live 1Hz clock display so play time ticks smoothly without 60Hz re-renders
  useEffect(() => {
    if (me.status !== 'playing' || !room.startedAt) {
      setLiveElapsedMs(me.elapsedMs);
      return;
    }
    const baseServerElapsed = me.elapsedMs;
    const mountedAt = Date.now();
    const timer = window.setInterval(() => {
      setLiveElapsedMs(baseServerElapsed + (Date.now() - mountedAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [me.elapsedMs, me.status, room.startedAt]);

  const handlePGKConfirm = () => {
    if (lockedPGKIndices.length === 0) {
      setValidationHint('Pilih minimal 1 target jawaban terlebih dahulu.');
      return;
    }
    setValidationHint('');
    onSubmitAnswer({
      category: 'pilihan_ganda_kompleks',
      selectedIndices: lockedPGKIndices,
    });
  };

  const handleMatchingConfirm = () => {
    if (activeQuestion?.category !== 'menjodohkan') return;
    if (Object.keys(pairs).length < activeQuestion.leftItems.length) {
      setValidationHint('Pasangkan seluruh pernyataan di kolom kiri terlebih dahulu.');
      return;
    }
    setValidationHint('');
    onSubmitAnswer({
      category: 'menjodohkan',
      pairs,
    });
  };

  const handleFillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fillText.trim()) {
      setValidationHint('Ketik jawaban terlebih dahulu sebelum membuka Inti Data.');
      return;
    }
    setValidationHint('');
    onSubmitAnswer({
      category: 'isian',
      textAnswer: fillText,
    });
  };

  // Keyboard Enter shortcut for confirming PGK / Menjodohkan
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'KeyH') {
        setDockCollapsed((v) => !v);
      } else if (e.code === 'Enter' && activeQuestion) {
        if (activeQuestion.category === 'pilihan_ganda_kompleks') {
          handlePGKConfirm();
        } else if (activeQuestion.category === 'menjodohkan') {
          handleMatchingConfirm();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 md:p-5">
      {/* TOP PERIMETER ROW: Player Progress (Left) · Question Prompt (Center) · Live Leaderboard & Utilities (Right) */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-start justify-between gap-3">
        {/* Cluster 1: Player Score & Real-Time Progress */}
        <section
          aria-label="Progres Pemain"
          className="pointer-events-auto lg:w-72 shrink-0 bg-[#14213D]/92 border border-[#38BDF8]/40 rounded-xl px-3.5 py-2.5 shadow-lg space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-wider uppercase text-[#38BDF8]">
                {me.levelName}
              </div>
              <div className="text-sm font-bold text-[#F8FAFC] truncate">
                {me.displayName}
              </div>
              <div className="text-[11px] text-[#F8FAFC]/65 font-mono-num">
                Posisi #{me.rank} · {me.status === 'finished' ? 'Selesai' : 'Bermain'}
                {me.joinedLate ? ' · Menyusul' : ''}
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#FBBF24]">
                SKOR
              </div>
              <div
                data-testid="hud-player-score"
                className="font-display font-mono-num text-2xl font-bold text-[#FBBF24] leading-none hud-stroke"
              >
                {Math.round(me.score)}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono-num text-[#F8FAFC]/85">
              <span>
                Dijawab {me.answeredCount}/{me.totalQuestions} ({me.progressPercent}%)
              </span>
              <span>{formatDuration(liveElapsedMs)}</span>
            </div>
            <div className="w-full h-2 bg-[#0D172C] rounded-full overflow-hidden border border-[#426A9B]/40">
              <div
                className="h-full bg-[#6EE7B7] transition-transform duration-200 origin-left"
                style={{
                  transform: `scaleX(${Math.max(0.02, me.progressPercent / 100)})`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono-num">
              <span className="text-[#6EE7B7]">Benar: {me.correctCount}</span>
              <span className="text-[#FCA5A5]">Salah: {me.wrongCount}</span>
              {room.mode === 'multiplayer' && (
                <span className="text-[#38BDF8]">Room: {room.roomCode}</span>
              )}
            </div>
          </div>
        </section>

        {/* Cluster 2: Active Question Prompt (Clear & Uncluttered for SMP Students) */}
        <section
          aria-label="Soal Aktif"
          className="pointer-events-auto flex-1 max-w-2xl mx-auto bg-[#14213D]/94 border-2 border-[#6EE7B7]/55 rounded-xl px-4 py-3 shadow-xl"
        >
          {activeQuestion ? (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-display font-bold text-[#6EE7B7]">
                  Soal {me.currentQuestionIndex + 1} dari {me.totalQuestions} ·{' '}
                  {activeQuestion.categoryLabel}
                </span>
                <span className="text-[#38BDF8] font-medium">
                  {activeQuestion.mechanicLabel}
                </span>
              </div>
              <p
                data-testid="active-question-prompt"
                className="text-sm md:text-base font-semibold text-[#F8FAFC] leading-snug"
              >
                {activeQuestion.prompt}
              </p>
              <p className="text-xs text-[#FBBF24]/90">{activeQuestion.instruction}</p>
            </div>
          ) : (
            <div className="text-center py-2 space-y-1">
              <div className="font-display text-base font-bold text-[#6EE7B7]">
                Seluruh Soal Telah Kamu Selesaikan!
              </div>
              <p className="text-xs text-[#F8FAFC]/80">
                Menunggu pemain lain di room ini menuntaskan soal terakhir sebelum menuju Podium 3D...
              </p>
            </div>
          )}
        </section>

        {/* Cluster 3: Persistent Floating Current Leaderboard + Square SVG Utility Controls */}
        <div className="pointer-events-auto w-full lg:w-auto flex items-start justify-between lg:flex-col lg:items-end gap-2 shrink-0">
          {/* Compact Utility Icon Buttons */}
          <div className="order-2 lg:order-1 flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              tabIndex={-1}
              aria-label={isMuted ? 'Aktifkan Suara (M)' : 'Matikan Suara (M)'}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center bg-[#14213D]/92 hover:bg-[#1E355E] border border-[#38BDF8]/40 rounded-lg text-[#F8FAFC] cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                {isMuted ? (
                  <>
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </>
                ) : (
                  <>
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </>
                )}
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Panduan Kontrol"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenTutorial();
              }}
              className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center bg-[#14213D]/92 hover:bg-[#1E355E] border border-[#38BDF8]/40 rounded-lg text-[#6EE7B7] font-display font-bold text-sm cursor-pointer"
            >
              ?
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Jeda Permainan (P)"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenPause();
              }}
              className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center bg-[#14213D]/92 hover:bg-[#1E355E] border border-[#38BDF8]/40 rounded-lg text-[#FBBF24] cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            </button>
          </div>

          {/* Persistent Floating 'Current Leaderboard' Top-3 Summary */}
          <aside
            aria-label="Current Leaderboard"
            data-testid="current-leaderboard"
            className="order-1 lg:order-2 flex-1 min-w-0 lg:flex-none lg:w-64 bg-[#14213D]/92 border border-[#38BDF8]/40 rounded-xl px-3 py-2 shadow-lg space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <h2 className="font-display font-bold text-[#FBBF24] tracking-wide whitespace-nowrap">
                Current Leaderboard
              </h2>
              {room.players.length > 3 ? (
                <button
                  type="button"
                  onClick={() => setMobileLbOpen((v) => !v)}
                  className="font-mono-num tabular-nums text-[11px] text-[#38BDF8] hover:text-[#6EE7B7] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {mobileLbOpen ? 'Top 3' : `Semua (${room.players.length})`}
                </button>
              ) : (
                <span className="font-mono-num tabular-nums text-[11px] text-[#86C8A2] whitespace-nowrap shrink-0">
                  Top 3 · {room.players.length} Siswa
                </span>
              )}
            </div>

            <div
              className={
                mobileLbOpen
                  ? 'space-y-1 max-h-36 overflow-y-auto pr-0.5'
                  : topThreePlayers.length >= 3
                    ? 'grid grid-cols-3 sm:grid-cols-1 gap-1'
                    : topThreePlayers.length === 2
                      ? 'grid grid-cols-2 sm:grid-cols-1 gap-1'
                      : 'grid grid-cols-1 gap-1'
              }
            >
              {(mobileLbOpen ? rankedPlayers.slice(0, 8) : topThreePlayers).map(
                (p, idx) => {
                  const displayRank = p.rank || idx + 1;
                  const isMe = p.playerId === me.playerId;
                  const climbed = p.rank < p.previousRank;
                  const rankColor =
                    displayRank === 1
                      ? 'text-[#FBBF24]'
                      : displayRank === 2
                        ? 'text-[#E2E8F0]'
                        : displayRank === 3
                          ? 'text-[#F59E0B]'
                          : 'text-[#86C8A2]';

                  return (
                    <div
                      key={p.playerId}
                      data-testid={`current-leaderboard-row-${displayRank}`}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 sm:gap-2 px-2 py-1 rounded-lg text-[11px] sm:text-xs ${
                        isMe
                          ? 'bg-[#426A9B]/45 border border-[#38BDF8]/55 text-[#F8FAFC]'
                          : 'bg-[#0D172C]/75 text-[#F8FAFC]/90'
                      }`}
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <span
                          className={`font-mono-num tabular-nums font-bold shrink-0 ${rankColor}`}
                        >
                          #{displayRank}
                        </span>
                        <span className="truncate font-medium">
                          {p.displayName}
                        </span>
                        {climbed && (
                          <span
                            className="text-[#6EE7B7] font-bold shrink-0"
                            title="Naik Peringkat"
                          >
                            ▲
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0 font-mono-num tabular-nums">
                        <span className="hidden sm:inline text-[#86C8A2] text-[10px]">
                          {p.progressPercent}%
                        </span>
                        <span className="font-bold text-[#6EE7B7] sm:text-[#F8FAFC]">
                          {Math.round(p.score)} pts
                        </span>
                      </div>
                    </div>
                  );
                }
              )}
            </div>

            {!mobileLbOpen && me.rank > 3 && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#426A9B]/35 text-[11px] text-[#F8FAFC]/85">
                <span className="truncate">
                  <span className="font-mono-num tabular-nums font-bold text-[#38BDF8]">
                    #{me.rank}
                  </span>{' '}
                  {me.displayName} (Kamu)
                </span>
                <span className="font-mono-num tabular-nums font-bold text-[#6EE7B7] shrink-0">
                  {Math.round(me.score)} pts
                </span>
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* AUTOMATIC MAKASSAR-SINJAI ENCOURAGEMENT TOAST (Non-blocking center-upper feedback) */}
      {activeFeedback && (
        <div
          role="status"
          aria-live="polite"
          data-testid="makassar-cheer-banner"
          className={`pointer-events-none mx-auto my-auto px-6 py-3.5 rounded-2xl border-2 shadow-2xl text-center max-w-lg transition-opacity duration-150 ${
            activeFeedback.isCorrect
              ? 'bg-[#14213D]/95 border-[#FBBF24] text-[#FBBF24]'
              : 'bg-[#14213D]/95 border-[#38BDF8] text-[#F8FAFC]'
          }`}
        >
          <div className="font-display text-lg md:text-xl font-bold">
            {activeFeedback.cheerMessage}
          </div>
          <div className="text-xs font-mono-num text-[#6EE7B7] mt-1">
            {activeFeedback.isCorrect
              ? `+${activeFeedback.pointsAwarded} Poin · Total ${activeFeedback.totalScore} Poin`
              : '0 Poin · Ayo bidik ulang gerbang target yang tepat!'}
            {activeFeedback.overtookNames.length > 0
              ? ` · Melampaui ${activeFeedback.overtookNames.join(', ')}!`
              : ''}
          </div>
        </div>
      )}

      {/* BOTTOM UNIFIED INTERACTIVE ANSWER DOCK + MOBILE JOYSTICK CONTROLS */}
      {activeQuestion && (
        <div className="pointer-events-auto w-full max-w-4xl mx-auto space-y-2">
          {/* Mobile / Tablet Touch Steering Bar */}
          <div className="flex md:hidden items-center justify-between gap-3 px-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Gerak Kiri"
                onTouchStart={(e) => {
                  e.preventDefault();
                  onMobileSteer(-1);
                }}
                onTouchEnd={() => onMobileSteer(0)}
                onMouseDown={() => onMobileSteer(-1)}
                onMouseUp={() => onMobileSteer(0)}
                className="w-12 h-12 rounded-full bg-[#14213D]/92 border-2 border-[#38BDF8] text-[#F8FAFC] font-bold text-lg flex items-center justify-center active:scale-95"
              >
                ◀
              </button>
              <button
                type="button"
                aria-label="Gerak Kanan"
                onTouchStart={(e) => {
                  e.preventDefault();
                  onMobileSteer(1);
                }}
                onTouchEnd={() => onMobileSteer(0)}
                onMouseDown={() => onMobileSteer(1)}
                onMouseUp={() => onMobileSteer(0)}
                className="w-12 h-12 rounded-full bg-[#14213D]/92 border-2 border-[#38BDF8] text-[#F8FAFC] font-bold text-lg flex items-center justify-center active:scale-95"
              >
                ▶
              </button>
            </div>

            {(activeQuestion.category === 'pilihan_ganda' ||
              activeQuestion.category === 'pilihan_ganda_kompleks') && (
              <button
                type="button"
                onClick={onTrigger3DShoot}
                className="px-5 h-12 rounded-full bg-[#FBBF24] text-[#14213D] font-display font-bold text-sm shadow-lg active:scale-95"
              >
                TEMBAK TARGET
              </button>
            )}
          </div>

          {/* Collapsible Answer Dock */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => setDockCollapsed((v) => !v)}
              className="px-3.5 py-1 text-[11px] font-semibold text-[#38BDF8] bg-[#14213D]/94 border border-b-0 border-[#38BDF8]/40 rounded-t-lg hover:text-[#6EE7B7] cursor-pointer"
            >
              {dockCollapsed
                ? '▴ Tampilkan Panel Jawaban (H)'
                : '▾ Sembunyikan Panel (Lihat Arena Penuh)'}
            </button>

            {!dockCollapsed && (
              <div className="w-full bg-[#14213D]/94 border border-[#38BDF8]/45 rounded-2xl p-3 md:p-4 shadow-2xl space-y-2.5">
                {validationHint && (
                  <div className="text-xs text-[#FBBF24] font-semibold text-center">
                    {validationHint}
                  </div>
                )}

                {/* 1. PILIHAN GANDA */}
                {activeQuestion.category === 'pilihan_ganda' && (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-2.5">
                    {activeQuestion.options.map((opt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => onSelectPGOption(idx)}
                        className="group flex items-start gap-2 text-left p-2 md:p-2.5 rounded-xl bg-[#1B2D52] hover:bg-[#274275] border border-[#38BDF8]/35 hover:border-[#FBBF24] transition-colors cursor-pointer"
                      >
                        <span className="w-6 h-6 md:w-7 md:h-7 rounded-lg bg-[#38BDF8] group-hover:bg-[#FBBF24] text-[#14213D] font-display font-bold text-xs md:text-sm flex items-center justify-center shrink-0">
                          {LETTERS[idx]}
                        </span>
                        <span className="text-xs md:text-sm text-[#F8FAFC] leading-snug">
                          {opt}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* 2. PILIHAN GANDA KOMPLEKS */}
                {activeQuestion.category === 'pilihan_ganda_kompleks' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-2.5">
                      {activeQuestion.options.map((opt, idx) => {
                        const locked = lockedPGKIndices.includes(idx);
                        return (
                          <button
                            key={idx}
                            type="button"
                            aria-pressed={locked}
                            onClick={() => onTogglePGKOption(idx)}
                            className={`flex items-start gap-2 text-left p-2 md:p-2.5 rounded-xl border transition-colors cursor-pointer ${
                              locked
                                ? 'bg-[#134E4A] border-[#FBBF24] text-[#F8FAFC]'
                                : 'bg-[#1B2D52] border-[#38BDF8]/35 text-[#F8FAFC]'
                            }`}
                          >
                            <span
                              className={`w-7 h-7 rounded-lg font-display font-bold text-sm flex items-center justify-center shrink-0 ${
                                locked
                                  ? 'bg-[#FBBF24] text-[#14213D]'
                                  : 'bg-[#38BDF8]/25 text-[#38BDF8]'
                              }`}
                            >
                              {locked ? '✓' : LETTERS[idx]}
                            </span>
                            <span className="text-xs md:text-sm leading-snug">
                              {opt}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handlePGKConfirm}
                        className="px-5 py-2 text-sm font-display font-bold text-[#14213D] bg-[#FBBF24] hover:bg-[#FCD34D] rounded-xl cursor-pointer"
                      >
                        Kirim Kombinasi Jawaban ({lockedPGKIndices.length} Dipilih)
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. MENJODOHKAN */}
                {activeQuestion.category === 'menjodohkan' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-44 overflow-y-auto pr-1">
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-[#38BDF8]">
                          1. Pilih Pernyataan Kiri:
                        </div>
                        {activeQuestion.leftItems.map((left) => {
                          const pairedRightId = pairs[left.id];
                          const pairedRight = activeQuestion.rightItems.find(
                            (r) => r.id === pairedRightId
                          );
                          const isSelected = selectedLeftId === left.id;
                          return (
                            <button
                              key={left.id}
                              type="button"
                              onClick={() => setSelectedLeftId(left.id)}
                              className={`w-full text-left px-3 py-2 rounded-lg text-xs border cursor-pointer ${
                                isSelected
                                  ? 'bg-[#274275] border-[#FBBF24] text-[#F8FAFC]'
                                  : 'bg-[#1B2D52] border-[#426A9B]/40 text-[#F8FAFC]'
                              }`}
                            >
                              <div className="font-semibold">{left.statement}</div>
                              {pairedRight && (
                                <div className="text-[11px] text-[#6EE7B7] mt-0.5">
                                  Terhubung → {pairedRight.label}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-[#6EE7B7]">
                          2. Pasangkan ke Jawaban Kanan:
                        </div>
                        {activeQuestion.rightItems.map((right) => (
                          <button
                            key={right.id}
                            type="button"
                            onClick={() => {
                              const targetLeft =
                                selectedLeftId || activeQuestion.leftItems[0]?.id;
                              if (!targetLeft) return;
                              setPairs((prev) => ({
                                ...prev,
                                [targetLeft]: right.id,
                              }));
                              setSelectedLeftId(null);
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg text-xs bg-[#1B2D52] hover:bg-[#274275] border border-[#6EE7B7]/35 text-[#F8FAFC] cursor-pointer"
                          >
                            {right.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#F8FAFC]/75">
                        Terpasang {Object.keys(pairs).length}/
                        {activeQuestion.leftItems.length} pasangan
                      </span>
                      <button
                        type="button"
                        onClick={handleMatchingConfirm}
                        className="px-5 py-2 text-sm font-display font-bold text-[#14213D] bg-[#FBBF24] hover:bg-[#FCD34D] rounded-xl cursor-pointer"
                      >
                        Kunci Pasangan Konduit
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. ISIAN */}
                {activeQuestion.category === 'isian' && (
                  <form
                    onSubmit={handleFillSubmit}
                    className="flex flex-wrap items-center gap-3"
                  >
                    <label htmlFor="isian-answer-input" className="sr-only">
                      Jawaban Isian
                    </label>
                    <input
                      id="isian-answer-input"
                      type="text"
                      value={fillText}
                      onChange={(e) => setFillText(e.target.value)}
                      placeholder={activeQuestion.placeholder}
                      className="flex-1 min-w-[220px] px-4 py-2.5 text-sm text-[#F8FAFC] bg-[#1B2D52] border border-[#38BDF8]/50 rounded-xl focus:outline-none focus:border-[#FBBF24]"
                    />
                    <button
                      type="submit"
                      className="px-5 py-2.5 text-sm font-display font-bold text-[#14213D] bg-[#FBBF24] hover:bg-[#FCD34D] rounded-xl whitespace-nowrap cursor-pointer"
                    >
                      Buka Inti Data
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
