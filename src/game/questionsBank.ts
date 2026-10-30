import type {
  AuthoritativeQuestion,
  CategoryAuditItem,
  PublicQuestion,
  QuestionCategory,
} from '../types/game.ts';

export const CATEGORY_ORDER: QuestionCategory[] = [
  'pilihan_ganda',
  'pilihan_ganda_kompleks',
  'menjodohkan',
  'isian',
];

export const CATEGORY_METADATA: Record<
  QuestionCategory,
  { label: string; mechanic: string; defaultInstruction: string }
> = {
  pilihan_ganda: {
    label: 'Pilihan Ganda',
    mechanic: 'Cyber-Hovercraft Racing & Target Gate',
    defaultInstruction:
      'Arahkan hovercraft dan tembak gerbang target dengan 1 pilihan jawaban yang paling tepat!',
  },
  pilihan_ganda_kompleks: {
    label: 'Pilihan Ganda Kompleks',
    mechanic: 'Multi-Target Laser Lock Arena',
    defaultInstruction:
      'Kunci seluruh kristal target jawaban yang benar, lalu tekan Kirim Kombinasi!',
  },
  menjodohkan: {
    label: 'Menjodohkan',
    mechanic: '3D Energy Conduit Puzzle',
    defaultInstruction:
      'Hubungkan setiap node pernyataan di jalur kiri ke node jawaban yang tepat di jalur kanan!',
  },
  isian: {
    label: 'Isian',
    mechanic: '3D Data Vault Mission',
    defaultInstruction:
      'Ketik jawaban mandiri pada terminal dekoder untuk membuka Kunci Inti Data 3D!',
  },
};

/**
 * SOAL DARI FILE TERLAMPIR (Halaman 17 PDF Lampiran:
 * JSON_Validation_and_Completion_Report...pdf)
 *
 * Ketentuan ketat F.1 - F.10:
 * - Kalimat soal, pilihan jawaban, urutan soal, dan kunci jawaban dipertahankan
 *   100% persis sebagaimana tertulis di dalam file lampiran tanpa menambah,
 *   mengubah, atau menghilangkan karakter/kata apa pun.
 */
export const ATTACHED_PDF_QUESTIONS: AuthoritativeQuestion[] = [
  {
    id: 'pdf-pg-1',
    orderIndex: 0,
    category: 'pilihan_ganda',
    categoryLabel: CATEGORY_METADATA.pilihan_ganda.label,
    mechanicLabel: CATEGORY_METADATA.pilihan_ganda.mechanic,
    meetingLabel: 'Pertemuan 1 · Bab 1 Pilihan Ganda',
    prompt:
      'Saat Budi pergi ke minimarket, ia menerima struk belanja yang berisi nama barang, harga',
    instruction: CATEGORY_METADATA.pilihan_ganda.defaultInstruction,
    options: [
      'Tercetak di atas kertas thermal',
      'Memiliki format, kolom, dan baris yang jelas',
      'Dapat dibaca oleh semua orang',
      'Dihasilkan oleh mesin kasir',
    ],
    correctIndex: 1,
  },
  {
    id: 'pdf-pg-2',
    orderIndex: 1,
    category: 'pilihan_ganda',
    categoryLabel: CATEGORY_METADATA.pilihan_ganda.label,
    mechanicLabel: CATEGORY_METADATA.pilihan_ganda.mechanic,
    meetingLabel: 'Pertemuan 1 · Bab 1 Pilihan Ganda',
    prompt:
      'Manakah dari data berikut yang paling sulit dianalisis secara langsung oleh komputer ta',
    instruction: CATEGORY_METADATA.pilihan_ganda.defaultInstruction,
    options: [
      'Daftar hadir siswa format Excel',
      'Rekaman suara wawancara',
      'Tabel nilai ujian tengah semester',
      'Jadwal kereta api di website resmi',
    ],
    correctIndex: 1,
  },
  {
    id: 'pdf-pg-3',
    orderIndex: 2,
    category: 'pilihan_ganda',
    categoryLabel: CATEGORY_METADATA.pilihan_ganda.label,
    mechanicLabel: CATEGORY_METADATA.pilihan_ganda.mechanic,
    meetingLabel: 'Pertemuan 1 · Bab 1 Pilihan Ganda',
    prompt:
      'Siti merapikan kamarnya dan menemukan tumpukan foto liburan, buku harian, dan tabel jad',
    instruction: CATEGORY_METADATA.pilihan_ganda.defaultInstruction,
    options: [
      'Tabel jadwal pelajaran',
      'Foto liburan dan buku harian',
      'Tabel jadwal dan buku harian',
      'Hanya foto liburan',
    ],
    correctIndex: 1,
  },
];

export function buildCategoryAudit(
  questions: AuthoritativeQuestion[],
  isDefaultAttachedBank: boolean
): CategoryAuditItem[] {
  return CATEGORY_ORDER.map((cat) => {
    const count = questions.filter((q) => q.category === cat).length;
    const meta = CATEGORY_METADATA[cat];
    if (count > 0) {
      return {
        category: cat,
        categoryLabel: meta.label,
        mechanicName: meta.mechanic,
        countInAttachedFile: count,
        status: 'active',
        note: isDefaultAttachedBank
          ? 'Dimuat 100% sesuai teks asli pada Halaman 17 PDF terlampir (ujung kanan kalimat pada PDF sumber tercetak terpotong, dipertahankan tanpa modifikasi sesuai aturan F.2).'
          : `${count} butir soal aktif dan siap dimainkan secara berurutan.`,
      };
    }
    return {
      category: cat,
      categoryLabel: meta.label,
      mechanicName: meta.mechanic,
      countInAttachedFile: 0,
      status: 'needs_confirmation',
      note: 'Menunggu Konfirmasi: Butir soal & kunci jawaban kategori ini belum tercantum di dalam PDF transkrip terlampir (tidak dikarang sesuai aturan F). Guru dapat mengunggah JSON soal resmi untuk mengaktifkan level ini.',
    };
  });
}

export function stripAnswerKey(question: AuthoritativeQuestion): PublicQuestion {
  switch (question.category) {
    case 'pilihan_ganda': {
      const { correctIndex: _ci, ...rest } = question;
      return rest;
    }
    case 'pilihan_ganda_kompleks': {
      const { correctIndices: _cis, ...rest } = question;
      return rest;
    }
    case 'menjodohkan': {
      const { correctPairs: _cp, ...rest } = question;
      return rest;
    }
    case 'isian': {
      const { acceptedAnswers: _aa, ...rest } = question;
      return rest;
    }
  }
}

export interface ValidatedBankResult {
  ok: boolean;
  error?: string;
  title?: string;
  questions?: AuthoritativeQuestion[];
}

/**
 * Memvalidasi file JSON bank soal yang diunggah Guru tanpa mengubah isi kalimat,
 * opsi, kunci jawaban, maupun urutan soal di setiap kategori.
 */
export function parseAndValidateQuestionBank(rawJson: string): ValidatedBankResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: 'Format JSON tidak valid. Periksa tanda kurung dan kutip.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Struktur JSON harus berupa objek atau array soal.' };
  }

  const root = parsed as Record<string, unknown>;
  const rawList = Array.isArray(parsed)
    ? parsed
    : Array.isArray(root.questions)
      ? root.questions
      : null;

  if (!rawList || rawList.length === 0) {
    return { ok: false, error: 'Daftar soal kosong atau properti "questions" tidak ditemukan.' };
  }

  const title =
    typeof root.title === 'string' && root.title.trim().length > 0
      ? root.title.trim().slice(0, 120)
      : 'Bank Soal Informatika Terkonfirmasi';

  const byCategory: Record<QuestionCategory, AuthoritativeQuestion[]> = {
    pilihan_ganda: [],
    pilihan_ganda_kompleks: [],
    menjodohkan: [],
    isian: [],
  };

  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i] as Record<string, unknown>;
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `Soal indeks ke-${i + 1} bukan objek yang valid.` };
    }

    const category = item.category as QuestionCategory;
    if (!CATEGORY_ORDER.includes(category)) {
      return {
        ok: false,
        error: `Soal ke-${i + 1}: kategori "${String(item.category)}" tidak dikenali.`,
      };
    }

    const prompt = typeof item.prompt === 'string' ? item.prompt : '';
    if (!prompt.trim()) {
      return { ok: false, error: `Soal ke-${i + 1}: teks pertanyaan (prompt) wajib diisi.` };
    }

    const meta = CATEGORY_METADATA[category];
    const meetingLabel =
      typeof item.meetingLabel === 'string' && item.meetingLabel.trim()
        ? item.meetingLabel
        : `Pertemuan 1 · ${meta.label}`;
    const instruction =
      typeof item.instruction === 'string' && item.instruction.trim()
        ? item.instruction
        : meta.defaultInstruction;

    if (category === 'pilihan_ganda') {
      if (!Array.isArray(item.options) || item.options.length < 2) {
        return { ok: false, error: `Soal PG ke-${i + 1}: minimal harus memiliki 2 pilihan jawaban.` };
      }
      const options = item.options.map((o) => String(o));
      const correctIndex = Number(item.correctIndex);
      if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
        return {
          ok: false,
          error: `Soal PG ke-${i + 1}: kunci jawaban (correctIndex) belum valid. Harap konfirmasi kunci jawaban.`,
        };
      }
      byCategory.pilihan_ganda.push({
        id: typeof item.id === 'string' && item.id ? item.id : `imp-pg-${i + 1}`,
        orderIndex: 0,
        category: 'pilihan_ganda',
        categoryLabel: meta.label,
        mechanicLabel: meta.mechanic,
        meetingLabel,
        prompt,
        instruction,
        options,
        correctIndex,
      });
    } else if (category === 'pilihan_ganda_kompleks') {
      if (!Array.isArray(item.options) || item.options.length < 2) {
        return { ok: false, error: `Soal PGK ke-${i + 1}: minimal harus memiliki 2 pilihan jawaban.` };
      }
      const options = item.options.map((o) => String(o));
      if (!Array.isArray(item.correctIndices) || item.correctIndices.length === 0) {
        return {
          ok: false,
          error: `Soal PGK ke-${i + 1}: daftar kunci jawaban (correctIndices) wajib dikonfirmasi.`,
        };
      }
      const correctIndices = item.correctIndices.map((n) => Number(n));
      if (
        correctIndices.some(
          (idx) => !Number.isInteger(idx) || idx < 0 || idx >= options.length
        )
      ) {
        return { ok: false, error: `Soal PGK ke-${i + 1}: indeks kunci jawaban di luar batas opsi.` };
      }
      byCategory.pilihan_ganda_kompleks.push({
        id: typeof item.id === 'string' && item.id ? item.id : `imp-pgk-${i + 1}`,
        orderIndex: 0,
        category: 'pilihan_ganda_kompleks',
        categoryLabel: meta.label,
        mechanicLabel: meta.mechanic,
        meetingLabel,
        prompt,
        instruction,
        options,
        correctIndices,
      });
    } else if (category === 'menjodohkan') {
      if (!Array.isArray(item.leftItems) || !Array.isArray(item.rightItems) || item.leftItems.length === 0) {
        return { ok: false, error: `Soal Menjodohkan ke-${i + 1}: pasangan leftItems dan rightItems wajib ada.` };
      }
      const leftItems = item.leftItems.map((l: Record<string, unknown>, idx: number) => ({
        id: String(l.id ?? `L${idx + 1}`),
        statement: String(l.statement ?? ''),
      }));
      const rightItems = item.rightItems.map((r: Record<string, unknown>, idx: number) => ({
        id: String(r.id ?? `R${idx + 1}`),
        label: String(r.label ?? ''),
      }));
      if (!item.correctPairs || typeof item.correctPairs !== 'object') {
        return {
          ok: false,
          error: `Soal Menjodohkan ke-${i + 1}: kunci pasangan (correctPairs) wajib dikonfirmasi.`,
        };
      }
      const correctPairs: Record<string, string> = {};
      for (const l of leftItems) {
        const target = (item.correctPairs as Record<string, unknown>)[l.id];
        if (typeof target !== 'string' || !rightItems.some((r) => r.id === target)) {
          return {
            ok: false,
            error: `Soal Menjodohkan ke-${i + 1}: pasangan kunci untuk "${l.id}" belum valid.`,
          };
        }
        correctPairs[l.id] = target;
      }
      byCategory.menjodohkan.push({
        id: typeof item.id === 'string' && item.id ? item.id : `imp-match-${i + 1}`,
        orderIndex: 0,
        category: 'menjodohkan',
        categoryLabel: meta.label,
        mechanicLabel: meta.mechanic,
        meetingLabel,
        prompt,
        instruction,
        leftItems,
        rightItems,
        correctPairs,
      });
    } else if (category === 'isian') {
      if (!Array.isArray(item.acceptedAnswers) || item.acceptedAnswers.length === 0) {
        return {
          ok: false,
          error: `Soal Isian ke-${i + 1}: kunci jawaban (acceptedAnswers) wajib dikonfirmasi.`,
        };
      }
      const acceptedAnswers = item.acceptedAnswers
        .map((a) => String(a).trim())
        .filter((a) => a.length > 0);
      if (acceptedAnswers.length === 0) {
        return { ok: false, error: `Soal Isian ke-${i + 1}: kunci jawaban tidak boleh kosong.` };
      }
      byCategory.isian.push({
        id: typeof item.id === 'string' && item.id ? item.id : `imp-fill-${i + 1}`,
        orderIndex: 0,
        category: 'isian',
        categoryLabel: meta.label,
        mechanicLabel: meta.mechanic,
        meetingLabel,
        prompt,
        instruction,
        placeholder:
          typeof item.placeholder === 'string' && item.placeholder.trim()
            ? item.placeholder
            : 'Ketik jawabanmu di sini...',
        acceptedAnswers,
      });
    }
  }

  // Pertahankan urutan kategori resmi (PG -> PGK -> Menjodohkan -> Isian) dan urutan soal asli di dalamnya
  const ordered: AuthoritativeQuestion[] = [];
  for (const cat of CATEGORY_ORDER) {
    for (const q of byCategory[cat]) {
      ordered.push({
        ...q,
        orderIndex: ordered.length,
      });
    }
  }

  return {
    ok: true,
    title,
    questions: ordered,
  };
}
