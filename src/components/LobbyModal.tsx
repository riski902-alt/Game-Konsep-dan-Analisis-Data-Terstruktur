import { useState } from 'react';
import type { PlayerIdentity, RoomState } from '../types/game.ts';

interface LobbyModalProps {
  room: RoomState;
  identity: PlayerIdentity;
  onStartMultiplayerGame: () => void;
  onLeaveRoom: () => void;
  onImportQuestionsJson: (rawJson: string) => Promise<string | null>;
  onResetAttachedQuestions: () => Promise<void>;
}

export function LobbyModal({
  room,
  identity,
  onStartMultiplayerGame,
  onLeaveRoom,
  onImportQuestionsJson,
  onResetAttachedQuestions,
}: LobbyModalProps) {
  const [copied, setCopied] = useState(false);
  const [showImportBox, setShowImportBox] = useState(false);
  const [rawJsonInput, setRawJsonInput] = useState('');
  const [importStatus, setImportStatus] = useState<{
    type: 'error' | 'ok';
    msg: string;
  } | null>(null);

  const isHost = room.hostPlayerId === identity.playerId;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRawJsonInput(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleApplyJson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawJsonInput.trim()) {
      setImportStatus({
        type: 'error',
        msg: 'Tempelkan isi JSON soal resmi atau pilih file .json terlebih dahulu.',
      });
      return;
    }
    const err = await onImportQuestionsJson(rawJsonInput);
    if (err) {
      setImportStatus({ type: 'error', msg: err });
    } else {
      setImportStatus({
        type: 'ok',
        msg: 'Bank soal terkonfirmasi berhasil dimuat ke dalam room!',
      });
      setShowImportBox(false);
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center p-4 bg-[#14213D]/86 overflow-y-auto">
      <section
        aria-label="Ruang Tunggu Multiplayer"
        className="w-full max-w-3xl bg-[#14213D] border border-[#38BDF8]/50 rounded-2xl p-6 md:p-7 shadow-2xl space-y-6 my-auto"
      >
        {/* Header & Room Code */}
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-[#426A9B]/35">
          <div>
            <p className="text-xs font-semibold text-[#6EE7B7]">
              Ruang Kompetisi Real-Time · {room.questionSetTitle}
            </p>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-[#F8FAFC] mt-1">
              Lobby Arena Multiplayer
            </h1>
          </div>

          <div className="flex items-center gap-3 bg-[#1E355E] border border-[#FBBF24]/60 rounded-xl px-4 py-2.5">
            <div>
              <div className="text-[11px] text-[#F8FAFC]/75">Kode Bergabung</div>
              <div
                data-testid="lobby-room-code"
                className="font-mono-num text-2xl font-bold tracking-widest text-[#FBBF24]"
              >
                {room.roomCode}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="px-3 py-1.5 text-xs font-semibold text-[#14213D] bg-[#38BDF8] hover:bg-[#6EE7B7] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {copied ? 'Tersalin!' : 'Salin Kode'}
            </button>
          </div>
        </div>

        {/* Two-Column Grid: Connected Players + Question Bank Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Connected Players */}
          <div className="bg-[#1B2D52] border border-[#426A9B]/40 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#38BDF8]">
                Pemain Terhubung ({room.players.length} Siswa)
              </h2>
              <span className="text-xs text-[#86C8A2]">Kapasitas Tanpa Batas</span>
            </div>

            <ul className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {room.players.map((p) => (
                <li
                  key={p.playerId}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#14213D]/90 border border-[#426A9B]/30 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[#F8FAFC] truncate">
                      {p.displayName}{' '}
                      {p.playerId === identity.playerId ? '(Anda)' : ''}
                      {p.playerId === room.hostPlayerId ? ' · Host' : ''}
                    </div>
                    <div className="text-xs text-[#F8FAFC]/65 font-mono-num">
                      Kelas {p.kelas || 'VII'} · {p.playerId}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-[#6EE7B7] shrink-0">
                    {p.isConnected ? 'Siap' : 'Terputus'}
                  </span>
                </li>
              ))}
            </ul>

            <p className="text-xs text-[#F8FAFC]/70 leading-relaxed pt-1">
              {room.lateJoinRuleDescription}
            </p>
          </div>

          {/* Question Bank & Category Audit */}
          <div className="bg-[#1B2D52] border border-[#426A9B]/40 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#FBBF24]">
                Integrasi Soal ({room.questions.length} Soal Berurutan)
              </h2>
              {isHost && (
                <button
                  type="button"
                  onClick={() => setShowImportBox((v) => !v)}
                  className="text-xs font-semibold text-[#38BDF8] hover:underline cursor-pointer"
                >
                  {showImportBox ? 'Tutup Impor JSON' : 'Impor JSON Guru'}
                </button>
              )}
            </div>

            <div className="space-y-2 text-xs">
              {room.categoryAudit.map((cat) => (
                <div
                  key={cat.category}
                  className="p-2.5 rounded-lg bg-[#14213D]/85 border border-[#426A9B]/30"
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-[#F8FAFC]">{cat.categoryLabel}</span>
                    <span
                      className={
                        cat.status === 'active'
                          ? 'text-[#6EE7B7] font-mono-num'
                          : 'text-[#FBBF24]'
                      }
                    >
                      {cat.status === 'active'
                        ? `${cat.countInAttachedFile} Soal Aktif`
                        : 'Perlu Konfirmasi'}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#38BDF8] mt-0.5">
                    Mekanik 3D: {cat.mechanicName}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Optional Teacher JSON Question Importer (Host only) */}
        {isHost && showImportBox && (
          <form
            onSubmit={handleApplyJson}
            className="bg-[#1B2D52] border border-[#38BDF8]/45 rounded-xl p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="teacher-json-textarea"
                className="text-xs font-bold text-[#F8FAFC]"
              >
                Unggah / Tempel Bank Soal JSON Terkonfirmasi (PG, PGK, Menjodohkan, Isian):
              </label>
              <input
                type="file"
                accept=".json,application/json"
                aria-label="Pilih file JSON soal"
                onChange={handleFileUpload}
                className="text-xs text-[#38BDF8]"
              />
            </div>
            <textarea
              id="teacher-json-textarea"
              rows={4}
              value={rawJsonInput}
              onChange={(e) => setRawJsonInput(e.target.value)}
              placeholder='{"title":"ATP Kelas VII","questions":[{"category":"pilihan_ganda","prompt":"...","options":["A","B","C","D"],"correctIndex":0}]}'
              className="w-full p-3 text-xs font-mono-num text-[#F8FAFC] bg-[#14213D] border border-[#426A9B]/50 rounded-lg focus:outline-none focus:border-[#38BDF8]"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={onResetAttachedQuestions}
                className="px-3 py-1.5 text-xs font-semibold text-[#F8FAFC]/80 hover:text-[#F8FAFC] border border-[#426A9B]/50 rounded-lg cursor-pointer"
              >
                Kembalikan ke Soal PDF Terlampir
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-bold text-[#14213D] bg-[#6EE7B7] hover:bg-[#86C8A2] rounded-lg cursor-pointer"
              >
                Validasi &amp; Terapkan Soal
              </button>
            </div>
          </form>
        )}

        {importStatus && (
          <div
            role="status"
            className={`text-xs px-4 py-2.5 rounded-lg border ${
              importStatus.type === 'ok'
                ? 'bg-[#064E3B]/80 border-[#6EE7B7]/50 text-[#6EE7B7]'
                : 'bg-[#7F1D1D]/80 border-[#F87171]/50 text-[#F8FAFC]'
            }`}
          >
            {importStatus.msg}
          </div>
        )}

        {/* Footer Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#426A9B]/35">
          <button
            type="button"
            onClick={onLeaveRoom}
            className="px-4 py-2.5 text-sm font-semibold text-[#F8FAFC]/85 hover:text-[#F8FAFC] bg-[#1E355E] rounded-xl transition-colors cursor-pointer"
          >
            Keluar Lobby
          </button>

          {isHost ? (
            <button
              type="button"
              data-start="true"
              onClick={onStartMultiplayerGame}
              className="px-6 py-3 text-base font-display font-bold text-[#14213D] bg-[#FBBF24] hover:bg-[#FCD34D] rounded-xl shadow-lg transition-transform active:scale-95 cursor-pointer"
            >
              Mulai Permainan Sekarang
            </button>
          ) : (
            <div className="text-sm font-semibold text-[#6EE7B7]">
              Menunggu Host memulai permainan...
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
