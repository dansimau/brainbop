// Ambient declarations for the app's top-level script bindings. They are `const`/`let`
// in a classic script, so they are reachable as bare identifiers inside page.evaluate()
// but are NOT properties of `window`.
declare const S: any;
declare const L: any;
declare const G: Record<string, any>;
declare const GAMES: any[];
declare const ACH: any[];
declare const CATS: string[];
declare const WORDS: Record<number, string[]>;
declare const CATEGORIES: string[][];
declare const sb: any;
declare let current: any;
declare let syncLast: number;
declare let syncUser: any;
declare const KEY: string;
declare function today(): string;
declare function yesterday(): string;
declare function dateStr(d: Date): string;
declare function esc(s: any): string;
declare function clamp(v: number, a: number, b: number): number;
declare function shuffle<T>(a: T[]): T[];
declare function rndInt(a: number, b: number): number;
declare function pick<T>(a: T[]): T;
declare function seeded(s: string): () => number;
declare function toast(msg: string): void;
declare function levelInfo(xp: number): { level: number; into: number; need: number };
declare function streakFrom(days: Record<string, number>): { count: number; last: string | null };
declare function derive(): void;
declare function save(): void;
declare function gs(id: string): any;
declare function dailyGames(): string[];
declare function dailyState(): { date: string; done: string[] };
declare function recentAvg(id: string, n?: number): number | null;
declare function catScores(): Record<string, number | null>;
declare function brainScore(): number | null;
declare function anagrams(w: string): string[];
declare function startGame(id: string): void;
declare function endGame(id: string, score: number, details: string[], extra: any): void;
declare function abortGame(): void;
declare function makeApi(id: string, diff: number): any;
declare function pushPending(): Promise<boolean>;
declare function pull(): Promise<number>;
declare function fullSync(): Promise<void>;
declare function maybeSync(): void;
declare function renderHome(): void;
declare function renderStats(): void;
declare function showScreen(id: string): void;
declare function openSyncModal(): void;
declare function syncPanelHtml(): string;

interface Window {
  __cloud: {
    rows: { id: string; t: number; data: any; created_at: string }[];
    upserts: { rows: any[]; opts: any }[];
    selects: number; signOuts: number; oauth: any;
    failUpsert: boolean; failSelect: boolean; seq: number; url: string | null; key: string | null; table?: string;
    stamp(): string;
  };
  __signIn(id: string): void;
}
