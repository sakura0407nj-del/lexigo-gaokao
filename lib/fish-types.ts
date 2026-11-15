export type FishPos='noun'|'verb'|'adjective'|'adverb';
export type FishPrimaryGrade=3|4|5|6;
export interface FishWord {id:string;word:string;pos:FishPos;meaning:string;example:string;exampleZh?:string}
export interface FishConfig {duration?:60|120|180;primaryGrade?:FishPrimaryGrade}
export interface FishPoint {x:number;y:number}
export interface FishInput {direction?:FishPoint;target?:FishPoint|null}
export interface FishPlayer extends FishPoint {radius:number;facing:1|-1;invulnerableUntil:number}
export interface FishEntity extends FishPoint {id:number;word:FishWord;vx:number;vy:number;radius:number;facing:1|-1}
export interface FishEvent extends FishPoint {
  id:number;elapsed:number;type:'correct'|'wrong'|'change';word:FishWord;target:FishWord;scoreDelta:number;comboBonus:number;
}
export interface FishRun {
  version:1;stage:'high'|'primary';primaryGrade?:FishPrimaryGrade;seed:string;rng:number;duration:60|120|180;elapsed:number;finished:boolean;
  score:number;combo:number;bestCombo:number;correct:number;wrong:number;growth:number;
  target:FishWord;targetIndex:number;targetHistory:string[];nextChangeAt:number;graceUntil:number;
  player:FishPlayer;fish:FishEntity[];events:FishEvent[];fishSerial:number;eventSerial:number;
}
export interface FishResult {
  version:1;stage:'high'|'primary';primaryGrade?:FishPrimaryGrade;id:string;completedAt:string;duration:60|120|180;elapsed:number;
  score:number;correct:number;wrong:number;bestCombo:number;growth:number;accuracy:number;completed:boolean;
}

// fish-engine.ts exports WORLD_WIDTH=1000, WORLD_HEIGHT=600, TARGET_INTERVAL=10,
// POS_LABEL, createFishRun(config:FishConfig,seed:string|number):FishRun,
// advanceFishRun(state:FishRun,dtSeconds:number,input?:FishInput):FishRun,
// fishResult(state:FishRun,completedAt:string):FishResult,
// parseFishRun(raw:unknown,expected?:FishPrimaryGrade|'high'):FishRun|null,
// parseFishResult(raw:unknown,expected?:FishPrimaryGrade|'high'):FishResult|null.
// elapsed / nextChangeAt / graceUntil / invulnerableUntil / event.elapsed use ACTIVE seconds.
// UI pauses by not advancing. Events keep the latest 200 entries; id increases monotonically.
// Correct: +10, growth; every fifth combo: extra +10. Wrong: -5 (floor0), combo reset,
// and 0.8 seconds immunity. Each target change grants 1 second collision grace.
