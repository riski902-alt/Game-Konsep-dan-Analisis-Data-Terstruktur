import { useState } from 'react';
import type { CategoryAuditItem, PlayerIdentity } from '../types/game.ts';
import {
  ATTACHED_PDF_QUESTIONS,
  buildCategoryAudit,
} from '../game/questionsBank.ts';

interface AccountModalProps {
  identity: PlayerIdentity | null;
  onClose: () => void;
  onSaveIdentity: (data: {
    displayName: string;
    kelas: string;
    nisn: string;
    email: string;
  }) => Promise<string | null>;
}

export function StudentAccountModal({
  identity,
  onClose,
  onSaveIdentity,
}: AccountModalProps) {
  const [displayName, setDisplayName] = useState(
    identity?.source === 'guest_fallback' ? '' : identity?.displayName || ''
  );
  const [kelas, setKelas] = useState(identity?.kelas || 'VII-A');
  const [nisn, setNisn] = useState(identity?.nisn || '');
  const [email, setEmail] = useState(identity?.email || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (displayName.trim().length < 2) {
      setError('Nama lengkap akun siswa wajib diisi (minimal 2 huruf).');
      return;
    }
    if (!kelas.trim()) {
      setError('Kelas siswa wajib diisi.');
      return;
    }
    if (nisn.trim() && !/^[0-9]{4,16}$/.test(nisn.trim())) {
      setError('NISN harus berupa angka 4–16 digit.');
      return;
    }
    setError('');
    setSaving(true);
    const serverErr = await onSaveIdentity({
      displayName: displayName.trim(),
      kelas: kelas.trim(),
      nisn: nisn.trim(),
      email: email.trim(),
    });
    setSaving(false);
    if (serverErr) {
      setError(serverErr);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#14213D]/88">
      <dialog
        open
        aria-label="Identitas Akun Siswa"
        className="relative m-0 w-full max-w-md bg-[#14213D] text-[#F8FAFC] border border-[#38BDF8]/55 rounded-2xl p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-[#38BDF8]">
            Identitas Akun Siswa Otomatis
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-[#F8FAFC]/75 hover:text-[#F8FAFC] px-2.5 py-1 rounded border border-[#426A9B]/50 cursor-pointer"
          >
            Tutup
          </button>
        </div>

        <p className="text-xs text-[#F8FAFC]/80 leading-relaxed">
          Sistem membaca sesi login website <strong>INFORMATIKA FUN</strong>{' '}
          secara otomatis (<code>namaSiswa</code>, <code>nisnSiswa</code>,{' '}
          <code>kelasSiswa</code>) dan menetapkan ID unik{' '}
          <span className="font-mono-num text-[#6EE7B7]">
            {identity?.playerId}
          </span>{' '}
          agar data antar-siswa tidak pernah tertukar. Jika dibuka mandiri di luar
          portal login, konfirmasi akun siswa di bawah ini:
        </p>

        {error && (
          <div
            role="alert"
            className="bg-[#7F1D1D]/90 border border-[#F87171]/60 text-xs text-[#F8FAFC] px-3.5 py-2.5 rounded-lg"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label
              htmlFor="student-name-input"
              className="block text-xs font-semibold mb-1"
            >
              Nama Akun Siswa *
            </label>
            <input
              id="student-name-input"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Contoh: Nur Wafiqah"
              className="w-full px-3.5 py-2 text-sm bg-[#1B2D52] border border-[#38BDF8]/45 rounded-xl text-[#F8FAFC] focus:outline-none focus:border-[#FBBF24]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="student-kelas-input"
                className="block text-xs font-semibold mb-1"
              >
                Kelas *
              </label>
              <input
                id="student-kelas-input"
                type="text"
                value={kelas}
                onChange={(e) => setKelas(e.target.value)}
                placeholder="VII-A"
                className="w-full px-3.5 py-2 text-sm bg-[#1B2D52] border border-[#38BDF8]/45 rounded-xl text-[#F8FAFC] focus:outline-none focus:border-[#FBBF24]"
              />
            </div>
            <div>
              <label
                htmlFor="student-nisn-input"
                className="block text-xs font-semibold mb-1"
              >
                NISN (Opsional)
              </label>
              <input
                id="student-nisn-input"
                type="text"
                value={nisn}
                onChange={(e) => setNisn(e.target.value)}
                placeholder="136633563"
                className="w-full px-3.5 py-2 text-sm font-mono-num bg-[#1B2D52] border border-[#38BDF8]/45 rounded-xl text-[#F8FAFC] focus:outline-none focus:border-[#FBBF24]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="student-email-input"
              className="block text-xs font-semibold mb-1"
            >
              Email Belajar.id (Opsional)
            </label>
            <input
              id="student-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama.siswa@smp.belajar.id"
              className="w-full px-3.5 py-2 text-sm bg-[#1B2D52] border border-[#38BDF8]/45 rounded-xl text-[#F8FAFC] focus:outline-none focus:border-[#FBBF24]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold bg-[#1E355E] rounded-xl cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-bold text-[#14213D] bg-[#FBBF24] hover:bg-[#FCD34D] rounded-xl cursor-pointer"
            >
              {saving ? 'Menyimpan...' : 'Simpan Sesi Akun'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

interface TutorialModalProps {
  categoryAudit?: CategoryAuditItem[];
  onClose: () => void;
}

export function TutorialAndAuditModal({
  categoryAudit,
  onClose,
}: TutorialModalProps) {
  const audit =
    categoryAudit || buildCategoryAudit(ATTACHED_PDF_QUESTIONS, true);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#14213D]/88 overflow-y-auto">
      <dialog
        open
        aria-label="Panduan Bermain dan Integrasi Soal"
        className="relative m-0 w-full max-w-2xl bg-[#14213D] text-[#F8FAFC] border border-[#38BDF8]/55 rounded-2xl p-6 shadow-2xl space-y-5 my-auto"
      >
        <div className="flex items-center justify-between border-b border-[#426A9B]/35 pb-3">
          <h2 className="font-display text-xl font-bold text-[#FBBF24]">
            Panduan Kontrol &amp; Analisis Soal Terlampir
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-bold text-[#14213D] bg-[#38BDF8] rounded-lg cursor-pointer"
          >
            Mengerti
          </button>
        </div>

        {/* Kontrol Desktop vs Smartphone */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-[#1B2D52] border border-[#426A9B]/40 rounded-xl p-4 space-y-2">
            <h3 className="font-display text-sm font-bold text-[#38BDF8]">
              Komputer / Laptop / Chromebook
            </h3>
            <ul className="space-y-1.5 text-[#F8FAFC]/85">
              <li>
                <strong>A / D atau Panah Kiri / Kanan:</strong> Menggerakkan
                Hovercraft 3D berpindah jalur gerbang.
              </li>
              <li>
                <strong>Spasi:</strong> Menembakkan laser ke gerbang jawaban di
                depan pesawat.
              </li>
              <li>
                <strong>Klik Gerbang 3D / Tombol Pilihan:</strong> Membidik &amp;
                menembak gerbang pilihan secara langsung.
              </li>
              <li>
                <strong>Enter &amp; P:</strong> Mengirim kombinasi jawaban &amp;
                membuka menu Jeda.
              </li>
            </ul>
          </div>

          <div className="bg-[#1B2D52] border border-[#426A9B]/40 rounded-xl p-4 space-y-2">
            <h3 className="font-display text-sm font-bold text-[#6EE7B7]">
              Smartphone &amp; Tablet
            </h3>
            <ul className="space-y-1.5 text-[#F8FAFC]/85">
              <li>
                <strong>Tombol Sentuh ◀ / ▶:</strong> Mengarahkan Hovercraft 3D
                ke jalur kiri atau kanan.
              </li>
              <li>
                <strong>Tombol TEMBAK TARGET:</strong> Menembakkan laser ke
                gerbang yang sedang dibidik.
              </li>
              <li>
                <strong>Panel Pilihan Interaktif:</strong> Sentuh langsung kartu
                jawaban A/B/C/D atau pasangan konduit di bagian bawah layar.
              </li>
            </ul>
          </div>
        </div>

        {/* Status Integrasi File Terlampir */}
        <div className="bg-[#1B2D52] border border-[#426A9B]/40 rounded-xl p-4 space-y-2.5 text-xs">
          <h3 className="font-display text-sm font-bold text-[#FBBF24]">
            Status Integrasi Soal dari File Lampiran
          </h3>
          <div className="space-y-2">
            {audit.map((item) => (
              <div
                key={item.category}
                className="p-2.5 rounded-lg bg-[#14213D]/85 border border-[#426A9B]/30"
              >
                <div className="flex items-center justify-between font-semibold">
                  <span>
                    {item.categoryLabel} ({item.mechanicName})
                  </span>
                  <span
                    className={
                      item.status === 'active'
                        ? 'text-[#6EE7B7]'
                        : 'text-[#FBBF24]'
                    }
                  >
                    {item.status === 'active'
                      ? `${item.countInAttachedFile} Soal Terintegrasi`
                      : 'Ditandai untuk Konfirmasi'}
                  </span>
                </div>
                <p className="text-[#F8FAFC]/75 mt-1 leading-relaxed">
                  {item.note}
                </p>
              </div>
            ))}
          </div>
        </div>
      </dialog>
    </div>
  );
}

interface PauseModalProps {
  score: number;
  answeredCount: number;
  totalQuestions: number;
  onResume: () => void;
  onRestart: () => void;
  onExitToTitle: () => void;
}

export function PauseModal({
  score,
  answeredCount,
  totalQuestions,
  onResume,
  onRestart,
  onExitToTitle,
}: PauseModalProps) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#14213D]/88">
      <dialog
        open
        aria-label="Permainan Dijeda"
        className="relative m-0 w-full max-w-sm bg-[#14213D] text-[#F8FAFC] border border-[#38BDF8]/55 rounded-2xl p-6 shadow-2xl text-center space-y-5"
      >
        <h2 className="font-display text-2xl font-bold text-[#FBBF24]">
          Permainan Dijeda
        </h2>

        <div className="grid grid-cols-2 gap-3 bg-[#1B2D52] rounded-xl p-3 font-mono-num">
          <div>
            <div className="text-[11px] text-[#38BDF8]">SKOR SAAT INI</div>
            <div className="text-xl font-bold text-[#F8FAFC]">
              {Math.round(score)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#6EE7B7]">PROGRES SOAL</div>
            <div className="text-xl font-bold text-[#F8FAFC]">
              {answeredCount}/{totalQuestions}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-3 text-sm font-display font-bold text-[#14213D] bg-[#FBBF24] hover:bg-[#FCD34D] rounded-xl cursor-pointer"
          >
            Lanjutkan Bermain
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 text-sm font-semibold text-[#F8FAFC] bg-[#426A9B]/70 hover:bg-[#426A9B] rounded-xl cursor-pointer"
          >
            Ulangi Sesi
          </button>
          <button
            type="button"
            onClick={onExitToTitle}
            className="w-full py-2.5 text-sm font-semibold text-[#F8FAFC]/80 hover:text-[#F8FAFC] bg-[#1E355E] rounded-xl cursor-pointer"
          >
            Menu Utama
          </button>
        </div>
      </dialog>
    </div>
  );
}
