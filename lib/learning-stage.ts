import type {PrimaryGrade} from './primary-types';

export type LearningStage = 'high' | 'primary';

function searchOf(url?: string | URL): URLSearchParams {
  const source = url === undefined ? (typeof window === 'undefined' ? '' : window.location?.search || '') : String(url);
  try {return new URL(source || '/', 'https://learning.local').searchParams;} catch {return new URLSearchParams();}
}

/** Passing a URL makes these parsers pure; omitted URLs use the current browser location. */
export function getLearningStage(url?: string | URL): LearningStage {
  return searchOf(url).get('stage') === 'primary' ? 'primary' : 'high';
}

export function getPrimaryGrade(url?: string | URL): PrimaryGrade {
  const value = Number(searchOf(url).get('grade'));
  return value === 4 || value === 5 || value === 6 ? value : 3;
}

/** High-school keys stay byte-for-byte compatible. An explicit grade selects primary storage. */
export function scopedStorageKey(base: string, primaryGrade?: PrimaryGrade): string {
  if (primaryGrade !== undefined && ![3, 4, 5, 6].includes(primaryGrade)) throw new RangeError('Primary grade must be 3–6');
  if (primaryGrade !== undefined) return `${base}.primary.g${primaryGrade}`;
  return getLearningStage() === 'primary' ? `${base}.primary.g${getPrimaryGrade()}` : base;
}
