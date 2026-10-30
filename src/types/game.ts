export type QuestionCategory =
  | 'pilihan_ganda'
  | 'pilihan_ganda_kompleks'
  | 'menjodohkan'
  | 'isian';

export interface MatchingLeftItem {
  id: string;
  statement: string;
}

export interface MatchingRightItem {
  id: string;
  label: string;
}

export interface PublicQuestionBase {
  id: string;
  orderIndex: number;
  category: QuestionCategory;
  categoryLabel: string;
  mechanicLabel: string;
  meetingLabel: string;
  prompt: string;
  instruction: string;
}

export interface PublicPGQuestion extends PublicQuestionBase {
  category: 'pilihan_ganda';
  options: string[];
}

export interface PublicPGKQuestion extends PublicQuestionBase {
  category: 'pilihan_ganda_kompleks';
  options: string[];
}

export interface PublicMatchingQuestion extends PublicQuestionBase {
  category: 'menjodohkan';
  leftItems: MatchingLeftItem[];
  rightItems: MatchingRightItem[];
}

export interface PublicFillQuestion extends PublicQuestionBase {
  category: 'isian';
  placeholder: string;
}

export type PublicQuestion =
  | PublicPGQuestion
  | PublicPGKQuestion
  | PublicMatchingQuestion
  | PublicFillQuestion;

export interface AuthoritativePGQuestion extends PublicPGQuestion {
  correctIndex: number;
}

export interface AuthoritativePGKQuestion extends PublicPGKQuestion {
  correctIndices: number[];
}

export interface AuthoritativeMatchingQuestion extends PublicMatchingQuestion {
  correctPairs: Record<string, string>;
}

export interface AuthoritativeFillQuestion extends PublicFillQuestion {
  acceptedAnswers: string[];
}

export type AuthoritativeQuestion =
  | AuthoritativePGQuestion
  | AuthoritativePGKQuestion
  | AuthoritativeMatchingQuestion
  | AuthoritativeFillQuestion;

export type IdentitySource =
  | 'informatika_fun_session'
  | 'url_bridge'
  | 'registered_student'
  | 'guest_fallback';

export interface PlayerIdentity {
  playerId: string;
  sessionToken: string;
  displayName: string;
  nisn: string;
  kelas: string;
  email: string;
  source: IdentitySource;
}

export type PlayerPlayStatus = 'waiting' | 'playing' | 'finished';

export interface PlayerProgress {
  playerId: string;
  displayName: string;
  nisn: string;
  kelas: string;
  avatarColor: string;
  levelName: string;
  currentCategory: QuestionCategory;
  currentQuestionIndex: number;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  score: number;
  progressPercent: number;
  elapsedMs: number;
  rank: number;
  previousRank: number;
  status: PlayerPlayStatus;
  joinedLate: boolean;
  isConnected: boolean;
  posX: number;
  posZ: number;
  lastCheer: string;
}

export interface CategoryAuditItem {
  category: QuestionCategory;
  categoryLabel: string;
  mechanicName: string;
  countInAttachedFile: number;
  status: 'active' | 'needs_confirmation';
  note: string;
}

export type RoomMode = 'solo' | 'multiplayer';
export type RoomLifecycleStatus = 'lobby' | 'playing' | 'finished';

export interface RoomState {
  roomCode: string;
  hostPlayerId: string;
  mode: RoomMode;
  status: RoomLifecycleStatus;
  lateJoinRuleDescription: string;
  questionSetTitle: string;
  isDefaultAttachedBank: boolean;
  categoryAudit: CategoryAuditItem[];
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  questions: PublicQuestion[];
  players: PlayerProgress[];
}

export type AnswerPayload =
  | { category: 'pilihan_ganda'; selectedIndex: number }
  | { category: 'pilihan_ganda_kompleks'; selectedIndices: number[] }
  | { category: 'menjodohkan'; pairs: Record<string, string> }
  | { category: 'isian'; textAnswer: string };

export interface AnswerFeedbackEvent {
  playerId: string;
  questionId: string;
  isCorrect: boolean;
  pointsAwarded: number;
  totalScore: number;
  cheerMessage: string;
  cheerType: 'correct' | 'wrong' | 'overtake' | 'level_up' | 'finish';
  overtookNames: string[];
  advancedToIndex: number;
  finishedGame: boolean;
}
