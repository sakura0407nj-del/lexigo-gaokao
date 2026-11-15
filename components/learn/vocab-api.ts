import type { Word } from "@/lib/learning-types";
import { api, type Band, type WordsResponse } from "./api";

export type PosId = "noun" | "verb" | "adjective" | "adverb" | "preposition" | "conjunction" | "pronoun" | "determiner" | "number" | "phrase" | "other";
export type VocabSource = "gaokao" | "textbook" | "all";
export type VocabSort = "alpha" | "frequency" | "textbook";

export interface CatalogBook {
  id: string;
  title: string;
  wordCount: number;
  units: { id: string; title: string; count: number }[];
}

export interface CatalogFacet {
  id: string;
  label: string;
  count: number;
}

export interface VocabCatalog {
  total: number;
  combinedWords: number;
  textbookEntries: number;
  books: CatalogBook[];
  pos: CatalogFacet[];
  topics: CatalogFacet[];
  note: string;
}

export interface TextbookRef {
  bookId: string;
  bookTitle: string;
  unitId: string;
  unitTitle: string;
}

export type RichWord = Word & { pos?: string[]; topics?: string[]; textbooks?: TextbookRef[]; inGaokao?: boolean };

export type RichWordsResponse = Omit<WordsResponse, "items"> & { items: RichWord[] };

export interface WordQuery {
  band: Band;
  q?: string;
  page?: number;
  limit?: number;
  book?: string;
  unit?: string;
  pos?: "all" | PosId;
  topic?: string;
  source?: VocabSource;
  sort?: VocabSort;
  ids?: string[];
  sample?: number;
}

export interface CatalogResult {
  catalog: VocabCatalog;
  extended: boolean;
}

type ExtendedApi = {
  catalog?: (signal?: AbortSignal) => Promise<VocabCatalog>;
  words: (params: WordQuery, signal?: AbortSignal) => Promise<RichWordsResponse>;
};

const extendedApi = api as unknown as ExtendedApi;

export const POS_LABEL: Record<PosId, string> = {
  noun: "名词",
  verb: "动词",
  adjective: "形容词",
  adverb: "副词",
  preposition: "介词",
  conjunction: "连词",
  pronoun: "代词",
  determiner: "限定词",
  number: "数词",
  phrase: "短语",
  other: "其他",
};

export const SOURCE_LABEL: Record<VocabSource, string> = {
  gaokao: "高考词表",
  textbook: "教材词表",
  all: "全部来源",
};

export function hasCatalog() {
  return typeof extendedApi.catalog === "function";
}

export async function loadCatalog(signal?: AbortSignal): Promise<CatalogResult> {
  if (typeof extendedApi.catalog === "function") {
    const catalog = await extendedApi.catalog(signal);
    return {
      extended: true,
      catalog: {
        ...catalog,
        books: Array.isArray(catalog.books) ? catalog.books : [],
        pos: Array.isArray(catalog.pos) ? catalog.pos : [],
        topics: Array.isArray(catalog.topics) ? catalog.topics : [],
      },
    };
  }
  const [status, textbooks] = await Promise.all([api.status(signal), api.textbooks(signal)]);
  const textbookEntries = textbooks.books.reduce((sum, book) => sum + book.wordCount, 0);
  return {
    extended: false,
    catalog: {
      total: status.vocabulary,
      combinedWords: status.vocabulary,
      textbookEntries,
      books: textbooks.books.map((book) => ({ id: book.id, title: book.title, wordCount: book.wordCount, units: book.units })),
      pos: [],
      topics: [],
      note: textbooks.note,
    },
  };
}

export function queryWords(params: WordQuery, extended: boolean, signal?: AbortSignal): Promise<RichWordsResponse> {
  if (extended) {
    const clean: WordQuery = { band: params.band, q: params.q, page: params.page, limit: params.limit };
    if (params.book && params.book !== "all") clean.book = params.book;
    if (params.unit && params.unit !== "all") clean.unit = params.unit;
    if (params.pos && params.pos !== "all") clean.pos = params.pos;
    if (params.topic && params.topic !== "all") clean.topic = params.topic;
    if (params.source) clean.source = params.source;
    if (params.sort) clean.sort = params.sort;
    if (params.ids) clean.ids = params.ids;
    if (params.sample !== undefined) clean.sample = params.sample;
    return extendedApi.words(clean, signal);
  }
  return api.words({ band: params.band, q: params.q, page: params.page, limit: params.limit }, signal);
}

export function posLabel(id: string) {
  return POS_LABEL[id as PosId] ?? id;
}
