import type { MotionNormalizationContract, SourceClock } from './motion-preparation-runtime.d.ts';

export function motionSourceClockSha256(clock: SourceClock): string;
export function motionNormalizationContractSha256(contract: MotionNormalizationContract): string;
export function validateMotionNormalizationContract(contract: MotionNormalizationContract, input: {
  expected: { sourceSha256: string; targetRigSha256: string; targetRestSha256: string };
  sourceClock: SourceClock;
}): Readonly<{
  schemaVersion: MotionNormalizationContract['schemaVersion'];
  contractSha256: string;
  sourceMetric: MotionNormalizationContract['sourceMetric'];
  targetMetric: MotionNormalizationContract['targetMetric'];
  sourceClockSha256: string;
  rootMotionScale: number;
  rootMotionScaleUnit: string;
  rootMotionSpace: 'world';
  rootMotionAxes: 'all';
  rootMotionAnchor: 'start';
  travelPolicy: 'preserve-source-trajectory';
  fallback: 'reject-if-unknown';
}>;
