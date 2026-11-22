export interface AutoEqProfileSpec {
  label: string;
  category: string;
  gains: number[]; // 10 bands matching EQ_FREQUENCIES [32..16000]
}

export const AUTOEQ_PROFILES: Record<string, AutoEqProfileSpec> = {
  Off: {
    label: 'Off',
    category: 'Bypass',
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  'AirPods Pro 2': {
    label: 'AirPods Pro 2',
    category: 'TWS',
    gains: [2, 1.5, 0, -1, 0, 1.5, 2, 1, 0.5, 1],
  },
  'Sony WH-1000XM5': {
    label: 'Sony WH-1000XM5',
    category: 'ANC Over-Ear',
    gains: [-2.5, -3, -2, -0.5, 1, 2, 2.5, 1.5, 1, 0],
  },
  'Sony WF-1000XM5': {
    label: 'Sony WF-1000XM5',
    category: 'TWS',
    gains: [-1.5, -2, -1, 0, 1, 2, 2.5, 2, 1.5, 0.5],
  },
  'Sennheiser HD 600': {
    label: 'Sennheiser HD 600',
    category: 'Open-Back',
    gains: [3.5, 2.5, 1, 0, -0.5, -1, -0.5, 0.5, 1, 1.5],
  },
  'ATH-M50x': {
    label: 'Audio-Technica M50x',
    category: 'Studio',
    gains: [-1, -1.5, -1, 1, 1.5, 1, -1, -1.5, 0, 1],
  },
  'Moondrop Chu II / Aria': {
    label: 'Moondrop Chu II / Aria',
    category: 'IEM',
    gains: [1.5, 1, 0, -0.5, 0, 0.5, 1, -1, 0, 1],
  },
  'Bose QC Ultra': {
    label: 'Bose QC Ultra',
    category: 'ANC Over-Ear',
    gains: [-2, -2, -1, 0.5, 1, 1.5, 2, 1, 0.5, 0.5],
  },
  'Galaxy Buds2 Pro': {
    label: 'Galaxy Buds2 Pro',
    category: 'TWS',
    gains: [1, 0.5, -0.5, 0, 0.5, 1, 0.5, -1.5, -1, 0.5],
  },
  'Gaming Headset': {
    label: 'Gaming Headset',
    category: 'Tuned',
    gains: [-2, -1.5, 0, 1, 2, 2.5, 2, 1.5, 1, 0],
  },
  'Laptop Speakers': {
    label: 'Laptop Speakers',
    category: 'Desktop',
    gains: [4, 3.5, 2, 0.5, -0.5, 0, 1, 1.5, 2, 1.5],
  },
};

export function combineEqWithAutoEq(userEqGains: number[], autoEqProfile: string): number[] {
  const auto = AUTOEQ_PROFILES[autoEqProfile]?.gains ?? AUTOEQ_PROFILES.Off.gains;
  const out: number[] = [];
  for (let i = 0; i < 10; i++) {
    const sum = (userEqGains[i] ?? 0) + (auto[i] ?? 0);
    out.push(Math.max(-12, Math.min(12, sum)));
  }
  return out;
}
