import type {ExerciseType, Grade, Paper} from './learning-types';

export const EXAM_TYPES: ExerciseType[] = ['reading', 'grammar', 'seven', 'cloze'];
export const EXAM_TYPE_LABELS: Record<ExerciseType, string> = {
  reading: '阅读理解', grammar: '语法填空', seven: '七选五', cloze: '完形填空',
};
export const EXAM_SECTION_LIMITS: Record<ExerciseType, number> = {
  reading: 4, grammar: 2, seven: 2, cloze: 2,
};

export interface ExamConfig {
  source: 'bank' | 'ai';
  level: '基础' | '标准' | '挑战';
  topic: string;
  /** 5–180 minutes. This is a practice timer, not a verified exam clock. */
  minutes: number;
  /** Each count is a whole exercise section; total must be 1–8. */
  counts: Record<ExerciseType, number>;
  targeted?: boolean;
}

export interface CustomExam {
  id: string;
  title: string;
  createdAt: string;
  config: ExamConfig;
  sections: Paper[];
  /** Explain unavailable level/topic/weakness matches without claiming exact matches. */
  notes: string[];
}

export interface ExamAssembleInput {
  config: ExamConfig;
  /** Knowledge labels from the user's own mistakes; at most 12, each <=120 chars. */
  weaknesses?: string[];
}

export interface ExamGradeInput {
  examId: string;
  sections: {paperId: string; sealed?: string}[];
  answers: Record<string, Record<string, string>>;
  /** Integer 0–86400; reported by this browser. */
  elapsedSeconds: number;
  minutes: number;
}

export interface ExamSectionResult {
  paperId: string;
  title: string;
  type: ExerciseType;
  grade: Grade;
  totalQuestions: number;
  correctCount: number;
  unansweredCount: number;
}

export interface ExamTypeStats {
  type: ExerciseType;
  label: string;
  sections: number;
  totalQuestions: number;
  correctCount: number;
  unansweredCount: number;
  score: number;
  maxScore: number;
  /** Percentage, 0–100. */
  accuracy: number;
}

export interface ExamKnowledgeStats {
  name: string;
  type: ExerciseType;
  totalQuestions: number;
  correctCount: number;
  unansweredCount: number;
  lostPoints: number;
  accuracy: number;
}

export interface ExamDirection {
  priority: 1 | 2 | 3;
  title: string;
  evidence: string;
  actions: string[];
}

export interface ExamPlanDay {
  day: number;
  title: string;
  minutes: number;
  actions: string[];
}

export interface ExamReport {
  examId: string;
  gradedAt: string;
  score: number;
  maxScore: number;
  totalQuestions: number;
  correctCount: number;
  unansweredCount: number;
  /** Question accuracy, not percentage of points earned. */
  accuracy: number;
  sections: ExamSectionResult[];
  /** Only exercise types present in this exam. */
  perType: ExamTypeStats[];
  /** Sorted by lost points, then error count. Labels come from the actual questions. */
  knowledge: ExamKnowledgeStats[];
  pacing: {
    minutes: number;
    elapsedSeconds: number;
    allowedSeconds: number;
    remainingSeconds: number;
    overtimeSeconds: number;
    secondsPerAnsweredQuestion: number | null;
    completedWithinTime: boolean;
    completionRate: number;
    message: string;
  };
  /** Exactly three evidence-based priorities; all-correct exams get maintenance advice. */
  directions: ExamDirection[];
  /** Seven concrete days of practice; suggested durations, not score predictions. */
  plan: ExamPlanDay[];
  notes: string[];
}
