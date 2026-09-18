// motsuyoku-sensor-core (app/core, 素のJS ESM) 用の薄いTypeScript型宣言。
//
// 重要: これはCoreのロジックをTypeScriptへ移植・再実装したものではない。
// app/core/src 以下の実装が返す値の「形」を記述するアダプタであり、
// DrawEngine / ProbabilityEngine / TargetMatcher 等の計算ロジック自体は
// 引き続きCore側(JS)にのみ存在する。Web側はこれらの関数を呼び出すだけ。
declare module "motsuyoku-sensor-core" {
  // ---- errors ----
  export class MissingPoolDataError extends Error {
    details: Record<string, unknown>;
  }
  export class InvalidTargetError extends Error {
    details: Record<string, unknown>;
  }
  export class InvalidDatasetError extends Error {
    details: Record<string, unknown>;
  }

  // ---- rng ----
  export interface Rng {
    next(): number;
  }
  export function createSeededRng(seed: number): Rng;
  export function createDefaultRng(): Rng;

  // ---- shared pool entry shapes ----
  export type VerificationStatus = "confirmed" | "provisional" | "unknown";
  export type Evidence = "game_param_datamined" | "reverse_engineered" | "farm_validated" | "provisional";

  export interface EffectPoolEntry {
    effectId: string;
    weight?: number;
    probabilityPct?: number;
    verificationStatus: VerificationStatus;
    evidence?: Evidence[];
  }

  export interface EffectPool {
    effectPoolId: string;
    researchUseStatus: "allowed" | "allowed_with_note" | "disallowed";
    researchUseNote?: string;
    nativeEntries: EffectPoolEntry[];
    ooeEntries: EffectPoolEntry[];
    __blocked?: boolean;
    __blockedReason?: string;
  }

  // そのプール内でのeffectIdの(排他前の)raw確率。0〜1。見つからなければ0。
  // UI側での並び替え(例: カテゴリ内を出現確率順に)にのみ用い、画面へ数値そのものを
  // 表示する用途には使わない(研究モードでは実験終了まで確率を非公開にするため)。
  export function effectProbability(pool: EffectPool, effectId: string): number;

  export interface CursePoolEntry {
    curseId: string;
    weight: number;
    evidence?: Evidence[];
  }

  export interface CursePool {
    cursePoolId: string;
    entries: CursePoolEntry[];
  }

  export interface ConflictGroup {
    conflictGroupId: string;
    positiveEffectId: string;
    negativeCurseId: string;
  }

  export interface ConflictGroupSet {
    conflictGroupSetId: string;
    groups: ConflictGroup[];
  }

  export interface ShapeTableEntry {
    shapeId: string;
    weight: number;
  }

  export interface ShapeTable {
    shapeTableId: string;
    entries: ShapeTableEntry[];
  }

  // ---- EnemyDefinition / GemDataset (spec 1.1節) ----
  export type SecondarySlot = "none" | "selectable" | "fixed";

  export interface EnemyDefinition {
    enemyId: string;
    displayName: string;
    secondarySlot: SecondarySlot;
    fixedSecondaryEffectId?: string;
    allowDuplicateSecondary: boolean;
  }

  export interface EffectValueBinding {
    slot: "primary" | "secondary";
    effectId: string;
    valueSeriesId: string;
    unit: "percent" | "percent_reduction" | "scaling" | "buildup" | "hp_regen";
    displayFormat?: { suffix?: string; decimalPlaces?: number; showSign?: boolean };
  }

  export interface ValueSeriesRankEntry {
    value: number | null;
    verificationStatus: VerificationStatus;
    evidence?: Evidence[];
  }

  export interface ValueSeries {
    valueSeriesId: string;
    valuesByRank: Record<number, ValueSeriesRankEntry>;
  }

  export interface GemDataset {
    datasetId: string;
    enemyId: string;
    enemy: EnemyDefinition;
    chaliceProfile: string;
    shapeTable: ShapeTable;
    effectPools: { primary: EffectPool; secondary?: EffectPool };
    cursePool: CursePool;
    conflictGroups: ConflictGroupSet;
    primaryRankTiers: number[];
    secondaryRankTiers: number[] | null;
    rankTierDistribution: { primary: number[] | null; secondary: number[] | null };
    effectValueBindings: EffectValueBinding[];
    valueSeriesById: Record<string, ValueSeries>;
    completeness: { probability: "not_started" | "partial" | "complete"; displayValues: "not_started" | "partial" | "complete" };
    dataVersion: string;
  }

  export const WatchersDataset: GemDataset;
  export const MadmanDataset: GemDataset;
  export const EvilSpiritDataset: GemDataset;
  export const GemDatasets: Record<string, GemDataset>;
  export function getDataset(datasetId: string): GemDataset;
  export function getEnemyDefinition(enemyId: string): EnemyDefinition;
  export function lookupDisplayValue(
    dataset: GemDataset,
    slot: "primary" | "secondary",
    effectId: string,
    rank: number
  ): { value: number | null; verificationStatus: VerificationStatus; evidence: Evidence[]; unit?: string; displayFormat?: EffectValueBinding["displayFormat"] };

  export const EnemyDefinitions: Record<string, EnemyDefinition>;

  // ---- DrawEngine (spec 0節/2節/4節) ----
  export interface BloodGem {
    datasetId: string;
    shapeId: string;
    primaryEffectId: string;
    primaryValueRank: number;
    secondaryEffectId: string | null;
    secondaryValueRank: number | null;
    curseId: string;
  }

  export function drawOne(dataset: GemDataset, options?: { rng?: Rng }): BloodGem;
  export function draw(dataset: GemDataset, count?: number, options?: { rng?: Rng }): BloodGem[];
  export function getEligibleCurses(dataset: GemDataset, primaryEffectId: string, secondaryEffectId?: string | null): CursePoolEntry[];

  // ---- Target (spec 6節) ----
  export interface TargetBloodGem {
    datasetId: string;
    acceptedShapes: string[];
    primaryEffectId: string;
    acceptedPrimaryRanks: number[];
    secondaryEffectId?: string;
    acceptedSecondaryRanks?: number[];
    acceptedCurses: string[];
    desireScore?: 1 | 2 | 3 | 4 | 5;
  }

  // ---- ProbabilityEngine (spec 4節/7節) ----
  export interface ProbabilityBreakdownEntry {
    raw: number;
    effective: number;
  }

  export interface ProbabilityBreakdown {
    shape: ProbabilityBreakdownEntry;
    primaryEffect: ProbabilityBreakdownEntry;
    primaryRank: ProbabilityBreakdownEntry;
    secondaryEffect: ProbabilityBreakdownEntry;
    secondaryRank: ProbabilityBreakdownEntry;
    curse: ProbabilityBreakdownEntry;
  }

  export interface ProbabilityResult {
    p: number;
    approxOneInN: number;
    breakdown: ProbabilityBreakdown;
  }

  export function validateTarget(dataset: GemDataset, target: TargetBloodGem): void;
  export function computeProbability(dataset: GemDataset, target: TargetBloodGem): ProbabilityResult;
  // そのgem自身(の組み合わせぴったり)が出る確率。既存のcomputeProbabilityを
  // 単一値のTargetBloodGemで呼ぶだけの派生ヘルパー(新しい確率モデルの追加ではない)。
  export function computeGemProbability(dataset: GemDataset, gem: BloodGem): ProbabilityResult;

  // dataset全体の全canonical組み合わせとその正確なpを列挙する(p=0のものは除外済み)。
  export function enumerateGemProbabilities(dataset: GemDataset): { gem: BloodGem; p: number }[];
  // dataset全体のShannon entropy(bits/draw)。コインコスト式Dの分母として使う想定。
  export function computeDatasetEntropyBits(dataset: GemDataset): number;

  // ---- TargetMatcher (spec 6節) ----
  export function isMatch(gem: BloodGem, target: TargetBloodGem): boolean;

  // ---- research/targetEligibility (spec 7.1節) ----
  export function getEligibleTargetEffects(pool: EffectPool): string[];
  export interface ConfirmedRank {
    rank: number;
    value: number | null;
    evidence: Evidence[];
  }
  export interface ResearchTargetCatalogEntry {
    effectId: string;
    poolLevelGate: EffectPool["researchUseStatus"] | "not_applicable_fixed_slot";
    exactValueSelectable: boolean;
    confirmedRanks: ConfirmedRank[];
  }
  export function getEligibleTargetValues(dataset: GemDataset, slot: "primary" | "secondary", effectId: string): ConfirmedRank[];
  export function getResearchTargetCatalog(dataset: GemDataset, slot: "primary" | "secondary"): ResearchTargetCatalogEntry[];

  // ---- state (research/simulator mode) ----
  export const ResearchModePhases: {
    SETUP: "setup";
    RUNNING: "running";
    AWAITING_SURVEY: "awaiting_survey";
    REVEALED: "revealed";
  };

  export interface ResearchModeRevealResult {
    gem: BloodGem;
    rollCount: number;
    matched: boolean;
  }

  export interface ResearchModeSurveyAnswers {
    tediousnessScore: 1 | 2 | 3 | 4 | 5;
    painIfRepeatedScore: 1 | 2 | 3 | 4 | 5;
    sensorScore: 1 | 2 | 3 | 4 | 5;
  }

  export interface ResearchModeSummary {
    datasetId: string;
    target: TargetBloodGem;
    desireScore: 1 | 2 | 3 | 4 | 5;
    phase: "setup" | "running" | "awaiting_survey" | "revealed";
    rollCount: number;
    matched: boolean;
    matchedAt: number | null;
    censored: boolean;
    survey: ResearchModeSurveyAnswers | null;
    startedAt: number | null;
    finishedAt: number | null;
  }

  export function createResearchModeSession(args: {
    dataset: GemDataset;
    target: TargetBloodGem;
    desireScore: 1 | 2 | 3 | 4 | 5;
    rng?: Rng;
  }): {
    start(): void;
    revealNext(): ResearchModeRevealResult;
    giveUp(): void;
    submitSurvey(answers: ResearchModeSurveyAnswers): void;
    getTheoreticalProbability(): ProbabilityResult;
    getSummary(): ResearchModeSummary;
    readonly phase: "setup" | "running" | "awaiting_survey" | "revealed";
  };

  export function createSimulatorModeSession(args: { dataset: GemDataset; target: TargetBloodGem | null; rng?: Rng }): {
    pullTen(): BloodGem[];
    getProbabilityInfo(): ProbabilityResult | null;
    getLastResults(): BloodGem[];
  };
}
