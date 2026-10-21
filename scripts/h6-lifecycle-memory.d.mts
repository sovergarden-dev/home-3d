export interface LifecycleMemorySample {
  stage: string;
  Documents: number;
  Nodes: number;
  JSEventListeners: number;
  JSHeapUsedSize: number;
}

export interface LifecycleMemoryGrowth {
  Documents: number;
  Nodes: number;
  JSEventListeners: number;
  JSHeapUsedSize: number;
}

export interface LifecycleMemoryLimits {
  Documents: number;
  Nodes: number;
  JSEventListeners: number;
  JSHeapUsedSize: number;
}

export interface LifecycleMemoryAssessment {
  passed: boolean;
  warmStage: string;
  endStage: string;
  growth: LifecycleMemoryGrowth;
  limits: LifecycleMemoryLimits;
  reasonCodes: string[];
}

export function assessLifecycleMemory(samples: LifecycleMemorySample[]): LifecycleMemoryAssessment;
