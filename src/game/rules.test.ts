import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTACHED_PDF_QUESTIONS,
  buildCategoryAudit,
  parseAndValidateQuestionBank,
  stripAnswerKey,
} from './questionsBank.ts';
import {
  calculateQuestionScore,
  evaluateAnswer,
  getCurrentLeaderboardTop3,
  rankPlayers,
  selectMakassarCheer,
} from './rules.ts';

test('attached PDF questions preserve exact count, order, prompts, options, and keys', () => {
  assert.equal(ATTACHED_PDF_QUESTIONS.length, 3);
  assert.equal(ATTACHED_PDF_QUESTIONS[0].category, 'pilihan_ganda');
  assert.equal(
    ATTACHED_PDF_QUESTIONS[0].prompt,
    'Saat Budi pergi ke minimarket, ia menerima struk belanja yang berisi nama barang, harga'
  );
  assert.deepEqual(ATTACHED_PDF_QUESTIONS[0].options, [
    'Tercetak di atas kertas thermal',
    'Memiliki format, kolom, dan baris yang jelas',
    'Dapat dibaca oleh semua orang',
    'Dihasilkan oleh mesin kasir',
  ]);
  assert.equal(ATTACHED_PDF_QUESTIONS[0].correctIndex, 1);

  assert.equal(ATTACHED_PDF_QUESTIONS[1].category, 'pilihan_ganda');
  assert.equal(
    ATTACHED_PDF_QUESTIONS[1].prompt,
    'Manakah dari data berikut yang paling sulit dianalisis secara langsung oleh komputer ta'
  );
  assert.equal(ATTACHED_PDF_QUESTIONS[1].correctIndex, 1);

  assert.equal(ATTACHED_PDF_QUESTIONS[2].category, 'pilihan_ganda');
  assert.equal(
    ATTACHED_PDF_QUESTIONS[2].prompt,
    'Siti merapikan kamarnya dan menemukan tumpukan foto liburan, buku harian, dan tabel jad'
  );
  assert.equal(ATTACHED_PDF_QUESTIONS[2].correctIndex, 1);

  const audit = buildCategoryAudit(ATTACHED_PDF_QUESTIONS, true);
  assert.equal(audit[0].status, 'active');
  assert.equal(audit[0].countInAttachedFile, 3);
  assert.equal(audit[1].status, 'needs_confirmation');
  assert.equal(audit[2].status, 'needs_confirmation');
  assert.equal(audit[3].status, 'needs_confirmation');

  const publicQ = stripAnswerKey(ATTACHED_PDF_QUESTIONS[0]);
  assert.equal('correctIndex' in publicQ, false);
});

test('evaluateAnswer validates PG, PGK, Menjodohkan, and Isian accurately', () => {
  // PG
  assert.equal(
    evaluateAnswer(ATTACHED_PDF_QUESTIONS[0], {
      category: 'pilihan_ganda',
      selectedIndex: 1,
    }),
    true
  );
  assert.equal(
    evaluateAnswer(ATTACHED_PDF_QUESTIONS[0], {
      category: 'pilihan_ganda',
      selectedIndex: 0,
    }),
    false
  );

  // Importer + PGK + Menjodohkan + Isian
  const sampleBank = JSON.stringify({
    title: 'Uji 4 Kategori AKM',
    questions: [
      {
        category: 'pilihan_ganda_kompleks',
        prompt: 'Pilih dua data terstruktur!',
        options: ['Tabel Excel', 'Rekaman Suara', 'Database SQL', 'Foto Bebas'],
        correctIndices: [0, 2],
      },
      {
        category: 'menjodohkan',
        prompt: 'Pasangkan perangkat keras dengan fungsinya!',
        leftItems: [
          { id: 'L1', statement: 'Keyboard' },
          { id: 'L2', statement: 'Monitor' },
        ],
        rightItems: [
          { id: 'R1', label: 'Output Visual' },
          { id: 'R2', label: 'Input Ketikan' },
        ],
        correctPairs: { L1: 'R2', L2: 'R1' },
      },
      {
        category: 'isian',
        prompt: 'Sebutkan ekstensi standar lembar kerja Microsoft Excel modern!',
        acceptedAnswers: ['xlsx', '.xlsx'],
      },
    ],
  });

  const parsed = parseAndValidateQuestionBank(sampleBank);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.questions?.length, 3);

  const [pgkQ, matchQ, fillQ] = parsed.questions!;

  // PGK must match exact combination
  assert.equal(
    evaluateAnswer(pgkQ, {
      category: 'pilihan_ganda_kompleks',
      selectedIndices: [2, 0],
    }),
    true
  );
  assert.equal(
    evaluateAnswer(pgkQ, {
      category: 'pilihan_ganda_kompleks',
      selectedIndices: [0],
    }),
    false
  );

  // Menjodohkan must match all pairs
  assert.equal(
    evaluateAnswer(matchQ, {
      category: 'menjodohkan',
      pairs: { L1: 'R2', L2: 'R1' },
    }),
    true
  );
  assert.equal(
    evaluateAnswer(matchQ, {
      category: 'menjodohkan',
      pairs: { L1: 'R1', L2: 'R2' },
    }),
    false
  );

  // Isian case & whitespace insensitive against accepted answers
  assert.equal(
    evaluateAnswer(fillQ, {
      category: 'isian',
      textAnswer: '  .XLSX ',
    }),
    true
  );
  assert.equal(
    evaluateAnswer(fillQ, {
      category: 'isian',
      textAnswer: 'docx',
    }),
    false
  );
});

test('scoring rewards mastery over blind speed and gives 0 for wrong answers', () => {
  assert.equal(
    calculateQuestionScore({
      isCorrect: false,
      questionElapsedMs: 1000,
      wrongAttemptsOnQuestion: 0,
    }),
    0
  );

  // Careful student: 3/3 right, 35s per question -> 3 * (100 + 3) = 309
  const carefulTotal =
    3 *
    calculateQuestionScore({
      isCorrect: true,
      questionElapsedMs: 35000,
      wrongAttemptsOnQuestion: 0,
    });

  // Rushing student: 2/3 right in 2s -> 2 * (100 + 19) = 238
  const rushingTotal =
    2 *
    calculateQuestionScore({
      isCorrect: true,
      questionElapsedMs: 2000,
      wrongAttemptsOnQuestion: 0,
    });

  assert.ok(
    carefulTotal > rushingTotal,
    `Careful mastery (${carefulTotal}) must beat careless speed (${rushingTotal})`
  );
});

test('rankPlayers applies clear tie-breaking rules and cheers avoid immediate repetition', () => {
  const ranked = rankPlayers([
    { playerId: 'p2', score: 220, correctCount: 2, wrongCount: 1, elapsedMs: 18000 },
    { playerId: 'p1', score: 220, correctCount: 2, wrongCount: 0, elapsedMs: 25000 },
    { playerId: 'p3', score: 310, correctCount: 3, wrongCount: 0, elapsedMs: 42000 },
  ]);

  assert.deepEqual(
    ranked.map((p) => p.playerId),
    ['p3', 'p1', 'p2']
  );

  const firstCheer = selectMakassarCheer('correct', '', 0);
  const secondCheer = selectMakassarCheer('correct', firstCheer, 0);
  assert.notEqual(firstCheer, secondCheer);
  assert.ok(firstCheer.length > 5);
});

test('getCurrentLeaderboardTop3 returns strictly the top 3 ranked players in real-time', () => {
  const players = [
    { playerId: 'p4', score: 105, correctCount: 1, wrongCount: 1, elapsedMs: 14000 },
    { playerId: 'p2', score: 230, correctCount: 2, wrongCount: 0, elapsedMs: 22000 },
    { playerId: 'p1', score: 345, correctCount: 3, wrongCount: 0, elapsedMs: 28000 },
    { playerId: 'p3', score: 230, correctCount: 2, wrongCount: 1, elapsedMs: 19000 },
  ];

  const top3 = getCurrentLeaderboardTop3(players);
  assert.equal(top3.length, 3);
  assert.deepEqual(
    top3.map((p) => p.playerId),
    ['p1', 'p2', 'p3']
  );
});
