import type {
  AnswerPayload,
  AuthoritativeQuestion,
  PlayerProgress,
} from '../types/game.ts';

export function normalizeAnswerText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Mengevaluasi jawaban siswa berdasarkan jenis soal secara ketat & objektif.
 */
export function evaluateAnswer(
  question: AuthoritativeQuestion,
  payload: AnswerPayload
): boolean {
  if (question.category !== payload.category) {
    return false;
  }

  switch (question.category) {
    case 'pilihan_ganda': {
      if (payload.category !== 'pilihan_ganda') return false;
      return (
        Number.isInteger(payload.selectedIndex) &&
        payload.selectedIndex === question.correctIndex
      );
    }

    case 'pilihan_ganda_kompleks': {
      if (payload.category !== 'pilihan_ganda_kompleks') return false;
      if (!Array.isArray(payload.selectedIndices) || payload.selectedIndices.length === 0) {
        return false;
      }
      const uniqueSelected = Array.from(new Set(payload.selectedIndices)).sort(
        (a, b) => a - b
      );
      const expected = Array.from(new Set(question.correctIndices)).sort(
        (a, b) => a - b
      );
      if (uniqueSelected.length !== expected.length) return false;
      return uniqueSelected.every((val, idx) => val === expected[idx]);
    }

    case 'menjodohkan': {
      if (payload.category !== 'menjodohkan') return false;
      if (!payload.pairs || typeof payload.pairs !== 'object') return false;
      const expectedEntries = Object.entries(question.correctPairs);
      if (expectedEntries.length === 0) return false;
      if (Object.keys(payload.pairs).length !== expectedEntries.length) {
        return false;
      }
      return expectedEntries.every(
        ([leftId, rightId]) => payload.pairs[leftId] === rightId
      );
    }

    case 'isian': {
      if (payload.category !== 'isian') return false;
      const normalizedUser = normalizeAnswerText(payload.textAnswer || '');
      if (!normalizedUser) return false;
      return question.acceptedAnswers.some(
        (accepted) => normalizeAnswerText(accepted) === normalizedUser
      );
    }
  }
}

/**
 * Sistem Poin Adil & Transparan (Bagian H):
 * - Jawaban salah = 0 poin.
 * - Penguasaan materi (akurasi) adalah bobot utama (100 poin dasar).
 * - Kecepatan hanya menjadi bonus tambahan kecil (maks 20 poin jika dijawab pada percobaan pertama
 *   dalam <= 40 detik), sehingga siswa yang teliti dan memahami konsep tetap unggul atas siswa
 *   yang sekadar menekan tombol cepat tetapi salah.
 */
export function calculateQuestionScore(params: {
  isCorrect: boolean;
  questionElapsedMs: number;
  wrongAttemptsOnQuestion: number;
}): number {
  const { isCorrect, questionElapsedMs, wrongAttemptsOnQuestion } = params;
  if (!isCorrect) {
    return 0;
  }

  // Penguasaan konsep tetap bernilai besar meskipun sempat mencoba ulang
  const accuracyBase = Math.max(75, 100 - wrongAttemptsOnQuestion * 10);

  // Bonus waktu hanya diberikan jika langsung benar pada percobaan pertama
  if (wrongAttemptsOnQuestion > 0) {
    return accuracyBase;
  }

  const clampedSeconds = Math.max(0, Math.min(40, questionElapsedMs / 1000));
  const speedBonus = Math.round(((40 - clampedSeconds) / 40) * 20);
  return accuracyBase + speedBonus;
}

/**
 * Aturan Peringkat Kompetisi yang Transparan & Konsisten (Bagian H.9):
 * 1. Skor tertinggi lebih unggul.
 * 2. Jika skor sama -> jumlah jawaban benar (correctCount) lebih banyak unggul.
 * 3. Jika masih sama -> jumlah kesalahan (wrongCount) lebih sedikit unggul.
 * 4. Jika masih sama -> waktu penyelesaian/bermain (elapsedMs) lebih efisien unggul.
 * 5. Jika masih sama -> urutan deterministik berdasarkan playerId.
 */
export function rankPlayers<
  T extends Pick<
    PlayerProgress,
    'playerId' | 'score' | 'correctCount' | 'wrongCount' | 'elapsedMs'
  >,
>(players: T[]): T[] {
  return [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    if (a.wrongCount !== b.wrongCount) return a.wrongCount - b.wrongCount;
    if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
    return a.playerId.localeCompare(b.playerId);
  });
}

/**
 * Mengambil 3 pemain teratas secara real-time berdasarkan aturan peringkat kompetisi.
 */
export function getCurrentLeaderboardTop3<
  T extends Pick<
    PlayerProgress,
    'playerId' | 'score' | 'correctCount' | 'wrongCount' | 'elapsedMs'
  >,
>(players: T[], limit = 3): T[] {
  return rankPlayers(players).slice(0, Math.max(1, limit));
}

export type CheerContext = 'correct' | 'wrong' | 'overtake' | 'level_up' | 'finish';

export const MAKASSAR_SINJAI_CHEERS: Record<CheerContext, readonly string[]> = {
  correct: [
    "Mantap, nak! Gas terus, jangan ki' mundur!",
    'Ewako! Jawabanmu mantap sekali!',
    "Baji' sekali! Otak ta' makin tajam!",
    "Sipp! Lanjutki' ke tantangan berikutnya!",
    "Jago sekali! Pertahankan semangat ta'!",
  ],
  wrong: [
    "Tabe', jangan menyerah! Coba lagi, pasti bisa!",
    "Sabar ki' dulu nak, baca ulang soalnya pelan-pelan, pasti dapat ji!",
    "Tenang maki', belum tepat ki' itu—ayo bidik pilihan yang benar!",
    "Tetap semangat ki'! Setiap percobaan bikin pemahaman ta' makin kuat!",
  ],
  overtake: [
    "Ewako! Naik mi peringkat ta', pertahankan fokus ta' nak!",
    "Gassing sekali! Berhasil ki' melampaui teman di papan skor!",
    "Baji' sekali! Melaju ki' ke posisi atas, teruskan perjuangan ta'!",
  ],
  level_up: [
    "Keren! Teruski' berjuang, tinggal sedikit lagi!",
    'Mantap jiwa! Lanjut ke misi kategori berikutnya!',
    "Sipp sekali! Satu tahap tuntas mi, siap-siap tantangan baru!",
  ],
  finish: [
    'Mantap jiwa! Selesaikan semua tantangan!',
    "Ewako! Tuntas mi seluruh misi pembelajaran ta' hari ini!",
    "Luar biasa nak! Kerja keras dan ketelitian ta' patut dibanggakan!",
  ],
};

export function selectMakassarCheer(
  context: CheerContext,
  previousCheer = '',
  seedIndex = 0
): string {
  const pool = MAKASSAR_SINJAI_CHEERS[context];
  const safeIndex = Math.abs(seedIndex) % pool.length;
  const candidate = pool[safeIndex];
  if (candidate !== previousCheer || pool.length <= 1) {
    return candidate;
  }
  return pool[(safeIndex + 1) % pool.length];
}

export function getPodiumAppreciationMessage(rank: number, score: number): string {
  if (rank === 1) {
    return "Juara 1 Piala Emas! Ewako, penguasaan konsep Informatika ta' luar biasa mantap!";
  }
  if (rank === 2) {
    return "Juara 2 Piala Perak! Baji' sekali perjuangan ta', beda tipis ji di puncak!";
  }
  if (rank === 3) {
    return "Juara 3 Piala Perunggu! Keren sekali nak, podium tiga besar berhasil ki' amankan!";
  }
  if (score > 0) {
    return "Apresiasi Pejuang Hebat! Tabe', terima kasih sudah menyelesaikan tantangan dengan jujur dan semangat—terus asah pemahaman ta', pasti tembus podium berikutnya!";
  }
  return "Apresiasi Peserta Tangguh! Jangan ki' berkecil hati nak, belajar Informatika itu proses—ayo main lagi dan taklukkan tiap soalnya!";
}
