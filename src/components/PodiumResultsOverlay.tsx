import type { PlayerProgress, RoomState } from '../types/game.ts';
import { getPodiumAppreciationMessage } from '../game/rules.ts';

interface PodiumResultsOverlayProps {
  room: RoomState;
  currentPlayerId: string;
  isHost: boolean;
  onPlayAgain: () => void;
  onReturnToTitle: () => void;
}

function TrophySVG({ tier }: { tier: 1 | 2 | 3 }) {
  const colors =
    tier === 1
      ? { primary: '#FBBF24', highlight: '#FEF08A', dark: '#B45309' }
      : tier === 2
        ? { primary: '#CBD5E1', highlight: '#F8FAFC', dark: '#64748B' }
        : { primary: '#D97706', highlight: '#FDBA74', dark: '#78350F' };

  return (
    <svg
      viewBox="0 0 64 64"
      className="w-12 h-12 mx-auto shrink-0"
      aria-hidden="true"
    >
      <path
        d="M18 12h28v14c0 9-6 16-14 16s-14-7-14-16V12z"
        fill={colors.primary}
        stroke="#14213D"
        strokeWidth="2"
      />
      <path
        d="M18 16H10c0 8 4 12 9 12M46 16h8c0 8-4 12-9 12"
        fill="none"
        stroke={colors.primary}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="M23 15h5v14c0 4-5 4-5 0V15z" fill={colors.highlight} opacity="0.7" />
      <rect x="28" y="42" width="8" height="9" fill={colors.dark} />
      <rect x="20" y="50" width="24" height="6" rx="2" fill={colors.primary} />
    </svg>
  );
}

export function PodiumResultsOverlay({
  room,
  currentPlayerId,
  isHost,
  onPlayAgain,
  onReturnToTitle,
}: PodiumResultsOverlayProps) {
  const sorted = room.players;
  const me = sorted.find((p) => p.playerId === currentPlayerId) || sorted[0];

  const podiumCards: {
    tier: 1 | 2 | 3;
    title: string;
    awardLabel: string;
    borderClass: string;
    player?: PlayerProgress;
  }[] = [
    {
      tier: 1,
      title: 'Juara 1',
      awardLabel: 'Piala Emas',
      borderClass: 'border-[#FBBF24]',
      player: sorted[0],
    },
    {
      tier: 2,
      title: 'Juara 2',
      awardLabel: 'Piala Perak',
      borderClass: 'border-[#CBD5E1]',
      player: sorted[1],
    },
    {
      tier: 3,
      title: 'Juara 3',
      awardLabel: 'Piala Perunggu',
      borderClass: 'border-[#D97706]',
      player: sorted[2],
    },
  ];

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 md:p-6 overflow-y-auto">
      {/* Top Celebration Banner leaving central 3D Podium & Rotating 3D Trophies unobstructed */}
      <header className="pointer-events-auto mx-auto text-center bg-[#14213D]/92 border border-[#FBBF24]/60 rounded-2xl px-6 py-3 shadow-2xl max-w-2xl">
        <h1 className="font-display text-2xl md:text-3xl font-bold text-[#FBBF24]">
          Podium Pemenang Cyber Arena 3D
        </h1>
        <p className="text-xs md:text-sm text-[#6EE7B7] font-semibold mt-0.5">
          {me
            ? getPodiumAppreciationMessage(me.rank, me.score)
            : 'Mantap Jiwa! Seluruh tantangan pembelajaran telah selesai!'}
        </p>
      </header>

      {/* Bottom Results Dock: Top 3 Trophy Cards + Full Participant Appreciation Table */}
      <section
        aria-label="Hasil Akhir Permainan"
        className="pointer-events-auto w-full max-w-4xl mx-auto bg-[#14213D]/94 border border-[#38BDF8]/45 rounded-2xl p-4 md:p-5 shadow-2xl space-y-4 mt-auto"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {podiumCards.map((card) => (
            <div
              key={card.tier}
              data-testid={`podium-rank-${card.tier}`}
              className={`bg-[#1B2D52]/95 border-2 ${card.borderClass} rounded-xl p-3 text-center space-y-1`}
            >
              <TrophySVG tier={card.tier} />
              <div className="font-display text-sm font-bold text-[#FBBF24]">
                {card.title} · {card.awardLabel}
              </div>
              {card.player ? (
                <>
                  <div className="text-base font-bold text-[#F8FAFC] truncate">
                    {card.player.displayName}
                  </div>
                  <div className="font-mono-num text-sm font-bold text-[#6EE7B7]">
                    {Math.round(card.player.score)} Poin
                  </div>
                  <div className="text-[11px] font-mono-num text-[#F8FAFC]/75">
                    Benar {card.player.correctCount}/{card.player.totalQuestions} · Salah{' '}
                    {card.player.wrongCount}
                  </div>
                </>
              ) : (
                <div className="text-xs text-[#F8FAFC]/50 py-2">
                  Menunggu Penantang Berikutnya
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Appreciation & Full Standings for all students (including Ranks 4+) */}
        {sorted.length > 3 && (
          <div className="bg-[#0D172C]/85 border border-[#426A9B]/35 rounded-xl p-3 space-y-1.5 max-h-28 overflow-y-auto">
            <div className="text-xs font-bold text-[#38BDF8]">
              Apresiasi Seluruh Peserta Kompetisi ({sorted.length} Siswa)
            </div>
            {sorted.slice(3).map((p) => (
              <div
                key={p.playerId}
                className="flex items-center justify-between text-xs text-[#F8FAFC]/90 py-1 border-b border-[#426A9B]/20 last:border-0"
              >
                <span>
                  #{p.rank} {p.displayName} · Semangat terus nak, sedikit lagi tembus podium!
                </span>
                <span className="font-mono-num font-semibold text-[#6EE7B7]">
                  {Math.round(p.score)} Poin ({p.correctCount}/{p.totalQuestions} Benar)
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="text-xs text-[#F8FAFC]/75">
            Penilaian adil berbasis akurasi penguasaan materi + bonus efisiensi waktu.
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onReturnToTitle}
              className="px-4 py-2.5 text-sm font-semibold text-[#F8FAFC] bg-[#1E355E] hover:bg-[#2A487D] rounded-xl cursor-pointer"
            >
              Menu Utama
            </button>
            {(isHost || room.mode === 'solo') && (
              <button
                type="button"
                data-start="true"
                onClick={onPlayAgain}
                className="px-5 py-2.5 text-sm font-display font-bold text-[#14213D] bg-[#FBBF24] hover:bg-[#FCD34D] rounded-xl shadow-lg cursor-pointer"
              >
                Main Lagi
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
