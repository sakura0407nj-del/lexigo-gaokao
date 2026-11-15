import type {Word} from './learning-types';

export type GameQuestionKind='word'|'sentence'|'phrase';
export type GameDifficulty='foundation'|'standard'|'challenge';
export type GameChoice=0|1;
export interface GameQuestion {
  id:string;
  kind:GameQuestionKind;
  prompt:string;
  options:[string,string];
  answerIndex:GameChoice;
  explanation:string;
  knowledge:string;
  evidence?:string;
  difficulty?:GameDifficulty;
  word?:Word;
}
export interface GameSentenceBank {
  version:1;
  source:string;
  note:string;
  model?:string;
  items:GameQuestion[];
}
export interface GameConfig {
  kind:GameQuestionKind|'mix';
  length:10|15|20;
  seed:string|number;
  /** Authored sentence/phrase level only; word frequency is not a difficulty score. */
  difficulty?:'all'|GameDifficulty;
}
export interface GameState {
  crowd:number;
  combo:number;
  bestCombo:number;
  correct:number;
  wrong:number;
  answered:number;
  totalRounds:number;
  peakCrowd:number;
  obstacleHits:number;
  finished:boolean;
}
export interface GameAnswer {
  questionId:string;
  question:GameQuestion;
  selectedIndex:GameChoice|null;
  correct:boolean;
  selectedAnswer:string;
  correctAnswer:string;
  crowdDelta:number;
  comboBonus:number;
}
export interface GameAnswerResult {state:GameState;answer:GameAnswer}
export interface GameResult {
  correct:number;
  wrong:number;
  answered:number;
  total:number;
  /** Fraction in [0,1]; multiply by 100 for a percentage label. */
  accuracy:number;
  finalCrowd:number;
  peakCrowd:number;
  bestCombo:number;
  obstacleHits:number;
  completed:boolean;
}

// lib/game-engine.ts exports:
// buildGameQuestions(words:readonly Word[],bank:unknown,config:GameConfig):GameQuestion[]
// createGameState(totalRounds?:number):GameState
// applyAnswer(state:GameState,question:GameQuestion,choice:GameChoice|null):GameAnswerResult
// applyObstacle(state:GameState,loss?:number):GameState
// gameResult(state:GameState):GameResult
// Correct: +5; every third consecutive correct answer: an additional +2.
// Wrong or missed gate: -4 (floor zero); obstacle: -2 by default.
// The caller must disclose fewer usable questions when returned length < config.length.
// Book/unit scopes apply only to the supplied words; the bank is general high-school practice.
