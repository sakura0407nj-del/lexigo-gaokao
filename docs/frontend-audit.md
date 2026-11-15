# LexiGo frontend audit (Claude, scoped to components/learn/* + app/globals.css)

## Findings
- Vocabulary: only band + search. Starred/learned scopes filter local `progress.words` (fine), but there is no textbook/unit/POS/theme dimension, no sort, no flashcards. `WordCard` puts a vertical action column beside the text, which squeezes definitions into a narrow column on phones.
- Progress: learned/starred are flat lists; no review schedule, no per-day event log, so Today can only show total learned size (not actual daily work).
- Today: fixed 8 random high-frequency words, hero CTAs; no daily path, no due-review entry point, no mistakes shortcut. AI stat shows "可用" from a config boolean.
- Knowledge cards (12) are only reachable at the bottom of Records, after history.
- Practice bank: type/origin chips only; all 100 cards render at once (long on phones); no search/year/level filter. Leaving the tab or reloading loses answers + timer.
- Mistakes: no search, fixed sort, no review guidance; Today has no count.
- AI copy: "AI 服务可用" derived from `status.ai`; cancel text implies the server stopped.
- Mobile: inputs inherit ~15px (iOS zoom risk), `.icon-btn-sm` 36px and `.chip-btn` 36px tap targets; filters always expanded.

## Plan (this pass)
1. `vocab-api.ts` adapter for the new catalog/words contract with honest fallback when `api.catalog` is absent.
2. Vocabulary filters (source/book/unit/POS/topic/band/state/sort), chips, clear, result count, phone disclosure; full-width word card with detail disclosure.
3. Flashcards + spaced review (1/3/7/14/30 days, wrong → 1 day) stored backward-compatibly in Progress; daily goal 10/20/40 and per-day event log.
4. Today daily path 词汇→听写→练习→错题复盘 with real counts; Knowledge tab in nav.
5. Practice filters + load-more + local resumable draft (answer keys never stored; drafts cleared on grading).
6. Mistakes search/sort/review hints; AI status/cancel wording; mobile CSS polish.


## Integration review

Codex additionally corrected unknown frequency labels, full-pool flashcard sampling, large saved collections, legacy vocabulary-ID migration, spaced-review advancement, and immediate draft persistence. Browser and production checks are performed after integration.
