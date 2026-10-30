import { useState } from 'react';
import type { PlayerIdentity, RoomState } from '../types/game.ts';

interface TitleScreenProps {
  identity: PlayerIdentity | null;
  isBusy: boolean;
  errorMessage: string;
  onStartSolo: () => void;
  onCreateMultiplayerRoom: () => void;
  onJoinRoomByCode: (code: string) => void;
  onInspectRoom: (code: string) => Promise<RoomState | null>;
  onOpenAccountModal: () => void;
  onOpenTutorialModal: () => void;
}

export function TitleScreen({
  identity,
  isBusy,
  errorMessage,
  onStartSolo,
  onCreateMultiplayerRoom,
  onJoinRoomByCode,
  onInspectRoom,
  onOpenAccountModal,
  onOpenTutorialModal,
}: TitleScreenProps) {
  const [showRoomPanel, setShowRoomPanel] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [localError, setLocalError] = useState('');
  const [inspectedRoom, setInspectedRoom] = useState<RoomState | null>(null);
  const [inspecting, setInspecting] = useState(false);

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCode.trim().toUpperCase();
    if (cleaned.length !== 5) {
      setLocalError('Masukkan tepat 5 karakter kode room (contoh: AB7K9).');
      return;
    }
    setLocalError('');
    onJoinRoomByCode(cleaned);
  };

  const handleCheckStatus = async () => {
    const cleaned = joinCode.trim().toUpperCase();
    if (cleaned.length !== 5) {
      setLocalError('Masukkan 5 karakter kode room terlebih dahulu untuk memeriksa status.');
      return;
    }
    setLocalError('');
    setInspecting(true);
    const result = await onInspectRoom(cleaned);
    setInspecting(false);
    setInspectedRoom(result);
  };

  const sourceText =
    identity?.source === 'informatika_fun_session'
      ? 'Terhubung Otomatis · Sesi INFORMATIKA FUN'
      : identity?.source === 'registered_student'
        ? 'Terhubung Otomatis · Akun Siswa Terverifikasi'
        : identity?.source === 'url_bridge'
          ? 'Terhubung Otomatis · Portal Pembelajaran'
          : 'Mode Mandiri · Akun Tamu Otomatis';

  return (
    <main className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-6 md:p-10">
      {/* Left-weighted Measured Contrast Scrim preserving right 3D Hovercraft showcase */}
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          background:
            'linear-gradient(95deg, rgba(20, 33, 61, 0.94) 0%, rgba(20, 33, 61, 0.82) 42%, rgba(20, 33, 61, 0.18) 78%, rgba(20, 33, 61, 0.05) 100%)',
        }}
      />

      {/* Top Identity Status Strip */}
      <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-4 max-w-2xl">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-[#14213D]/92 border border-[#38BDF8]/35 rounded-xl px-4 py-2.5 shadow-lg">
          <div className="text-sm font-semibold text-[#F8FAFC]">
            {identity ? identity.displayName : 'Memuat identitas akun...'}
          </div>
          <span className="text-[#426A9B]" aria-hidden="true">
            ·
          </span>
          <div className="text-xs text-[#6EE7B7]">
            Kelas {identity?.kelas || 'VII'}
          </div>
          <span className="text-[#426A9B]" aria-hidden="true">
            ·
          </span>
          <div className="text-xs font-mono-num text-[#86C8A2]">
            {identity?.playerId || '---'}
          </div>
          <span className="text-[#426A9B]" aria-hidden="true">
            ·
          </span>
          <div className="text-xs text-[#F8FAFC]/75">{sourceText}</div>
        </div>

        <button
          type="button"
          onClick={onOpenAccountModal}
          className="px-3.5 py-2 text-xs font-semibold text-[#38BDF8] bg-[#14213D]/92 border border-[#38BDF8]/40 rounded-lg hover:bg-[#426A9B]/35 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Akun Siswa
        </button>
      </div>

      {/* Asymmetric Left-Third Hero Lockup & Primary Actions */}
      <div className="pointer-events-auto my-auto max-w-xl space-y-6">
        {/* Custom Inline SVG Emblem Lockup */}
        <div>
          <svg
            viewBox="0 0 540 132"
            className="w-full max-w-[490px] h-auto select-none"
            role="img"
            aria-label="Informatika Fun Cyber Arena 3D"
          >
            <polygon
              points="8,22 24,8 272,8 286,22 272,36 24,36"
              fill="#1E355E"
              stroke="#38BDF8"
              strokeWidth="2"
            />
            <text
              x="26"
              y="27"
              fill="#6EE7B7"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="13"
              fontWeight="700"
              letterSpacing="1.4"
            >
              SMP FASE D · 3D CHALLENGE
            </text>

            <text
              x="8"
              y="80"
              fill="#F8FAFC"
              fontFamily="'Chakra Petch', sans-serif"
              fontSize="44"
              fontWeight="700"
              letterSpacing="1"
            >
              INFORMATIKA FUN
            </text>
            <text
              x="8"
              y="120"
              fill="#FBBF24"
              fontFamily="'Chakra Petch', sans-serif"
              fontSize="34"
              fontWeight="700"
              letterSpacing="2"
            >
              CYBER ARENA 3D
            </text>
            <line
              x1="336"
              y1="108"
              x2="510"
              y2="108"
              stroke="#38BDF8"
              strokeWidth="3"
            />
            <polygon points="512,102 528,108 512,114" fill="#6EE7B7" />
          </svg>

          <p className="mt-2 text-sm md:text-base text-[#F8FAFC]/85 leading-relaxed max-w-lg">
            Kendalikan hovercraft 3D melintasi arena kepulauan siber, pecahkan misi
            materi Informatika secara berurutan, dan raih podium juara bersama
            teman sekelas secara real-time.
          </p>
        </div>

        {(errorMessage || localError) && (
          <div
            role="alert"
            className="bg-[#7F1D1D]/90 border border-[#F87171]/60 text-[#F8FAFC] text-sm px-4 py-3 rounded-xl"
          >
            {localError || errorMessage}
          </div>
        )}

        {!showRoomPanel ? (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              data-start="true"
              disabled={isBusy}
              onClick={onStartSolo}
              className="px-6 py-3.5 text-base font-display font-bold tracking-wide text-[#14213D] bg-[#FBBF24] hover:bg-[#FCD34D] disabled:opacity-50 rounded-xl shadow-lg transition-transform active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isBusy ? 'Menyiapkan Arena...' : 'Main Sendiri'}
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setLocalError('');
                setShowRoomPanel(true);
              }}
              className="px-5 py-3.5 text-sm font-semibold text-[#F8FAFC] bg-[#426A9B]/85 hover:bg-[#426A9B] border border-[#38BDF8]/50 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Multiplayer Room
            </button>

            <button
              type="button"
              onClick={onOpenTutorialModal}
              className="px-5 py-3.5 text-sm font-semibold text-[#6EE7B7] bg-[#14213D]/90 hover:bg-[#1E355E] border border-[#6EE7B7]/40 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Panduan &amp; Soal
            </button>
          </div>
        ) : (
          <div className="bg-[#14213D]/95 border border-[#38BDF8]/45 rounded-2xl p-5 space-y-4 shadow-2xl max-w-lg">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-[#38BDF8]">
                Mode Kompetisi Multiplayer Real-Time
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowRoomPanel(false);
                  setInspectedRoom(null);
                  setLocalError('');
                }}
                className="text-xs font-semibold text-[#F8FAFC]/75 hover:text-[#F8FAFC] px-2.5 py-1 rounded-md border border-[#426A9B]/50 cursor-pointer"
              >
                Kembali
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-[#426A9B]/35">
              <button
                type="button"
                disabled={isBusy}
                onClick={onCreateMultiplayerRoom}
                className="w-full sm:w-auto px-5 py-2.5 text-sm font-bold text-[#14213D] bg-[#6EE7B7] hover:bg-[#86C8A2] rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                Buat Room Baru (Host)
              </button>
              <span className="text-xs text-[#F8FAFC]/75">
                Tanpa batas jumlah siswa · Kode unik 5 karakter otomatis
              </span>
            </div>

            <form onSubmit={handleJoinSubmit} className="space-y-3">
              <label
                htmlFor="join-room-code-input"
                className="block text-xs font-semibold text-[#F8FAFC]/90"
              >
                Punya Kode dari Guru atau Teman? Masukkan Kode Room:
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  id="join-room-code-input"
                  type="text"
                  maxLength={5}
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(e.target.value.toUpperCase());
                    setInspectedRoom(null);
                  }}
                  placeholder="Contoh: EWAKO"
                  className="w-36 px-3.5 py-2.5 text-base font-mono-num font-bold tracking-widest uppercase text-center text-[#F8FAFC] bg-[#1E355E] border border-[#38BDF8]/50 rounded-xl focus:outline-none focus:border-[#FBBF24]"
                />
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-4 py-2.5 text-sm font-bold text-[#14213D] bg-[#FBBF24] hover:bg-[#FCD34D] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Gabung Room
                </button>
                <button
                  type="button"
                  disabled={inspecting}
                  onClick={handleCheckStatus}
                  className="px-3.5 py-2.5 text-xs font-semibold text-[#38BDF8] bg-[#1E355E] hover:bg-[#28467A] border border-[#38BDF8]/40 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {inspecting ? 'Memeriksa...' : 'Cek Status Room'}
                </button>
              </div>
            </form>

            {inspectedRoom && (
              <div className="bg-[#1E355E]/80 border border-[#6EE7B7]/40 rounded-xl p-3.5 text-xs space-y-1.5">
                <div className="flex items-center justify-between font-semibold text-[#6EE7B7]">
                  <span>Room {inspectedRoom.roomCode} Ditemukan</span>
                  <span>
                    Status:{' '}
                    {inspectedRoom.status === 'lobby'
                      ? 'Menunggu di Lobby'
                      : inspectedRoom.status === 'playing'
                        ? 'Sedang Bermain (Bisa Gabung Menyusul)'
                        : 'Permainan Selesai'}
                  </span>
                </div>
                <p className="text-[#F8FAFC]/85">
                  Pemain terhubung: {inspectedRoom.players.length} siswa · Total{' '}
                  {inspectedRoom.questions.length} soal
                </p>
                <p className="text-[#F8FAFC]/70 leading-relaxed">
                  Aturan bergabung: {inspectedRoom.lateJoinRuleDescription}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Single Flat Borderless Control Hint Line in Bottom Safe Margin */}
      <div className="pointer-events-none text-xs text-[#F8FAFC]/80 tracking-wide">
        WASD / Panah Bergerak · Spasi Tembak Target 3D · Klik Gerbang / Tombol Pilihan · Enter Lanjut · P Jeda
      </div>
    </main>
  );
}
