export type EditSubMode = 'car-heading' | 'car-speed' | 'ball-speed' | 'free-cam';

export const MAX_SHOTS_PER_PACK = 99;

export interface StaticTrainingCarConfig {
  location: [number, number, number];
  headingYaw: number;
  headingPitch: number;
  airRoll: number;
  speed: number;
  speedYaw: number;
  speedPitch: number;
  speedFollowsHeading: boolean;
  snapToGround: boolean;
  hasFlip: boolean;
  initialBoost: number;
  unlimitedBoost: boolean;
}

export interface StaticTrainingBallConfig {
  location: [number, number, number];
  speed: number;
  speedYaw: number;
  speedPitch: number;
  kickoffState: boolean;
  randomAngularVelocity: boolean;
  angularVelocity: [number, number, number];
}

export interface StaticTrainingShotItem {
  id: string;
  index: number;
  name: string;
  timeoutSeconds: number;
  car: StaticTrainingCarConfig;
  ball: StaticTrainingBallConfig;
}

export const createDefaultShotItem = (index = 0): StaticTrainingShotItem => ({
  id: `shot-${Date.now()}-${index}`,
  index,
  name: `Shot ${index + 1}`,
  timeoutSeconds: 10,
  car: {
    location: [0, -2400, 17.05],
    headingYaw: Math.PI / 2,
    headingPitch: 0,
    airRoll: 0,
    speed: 0,
    speedYaw: Math.PI / 2,
    speedPitch: 0,
    speedFollowsHeading: true,
    snapToGround: true,
    hasFlip: true,
    initialBoost: 100,
    unlimitedBoost: true,
  },
  ball: {
    location: [0, 600, 320],
    speed: 1150,
    speedYaw: Math.PI / 2,
    speedPitch: 0.32,
    kickoffState: false,
    randomAngularVelocity: true,
    angularVelocity: [0, 2.4, 0.8],
  },
});

export const INITIAL_TRAINING_SHOTS: StaticTrainingShotItem[] = [
  {
    id: 'starter-shot-0',
    index: 0,
    name: 'Midfield Lob Volley',
    timeoutSeconds: 10,
    car: {
      location: [0, -2400, 17.05],
      headingYaw: Math.PI / 2,
      headingPitch: 0,
      airRoll: 0,
      speed: 650,
      speedYaw: Math.PI / 2,
      speedPitch: 0,
      speedFollowsHeading: true,
      snapToGround: true,
      hasFlip: true,
      initialBoost: 100,
      unlimitedBoost: true,
    },
    ball: {
      location: [0, 300, 260],
      speed: 1180,
      speedYaw: Math.PI / 2,
      speedPitch: 0.36,
      kickoffState: false,
      randomAngularVelocity: true,
      angularVelocity: [0, 2.5, 0.6],
    },
  },
  {
    id: 'starter-shot-1',
    index: 1,
    name: 'High Floating Kickoff-State Aerial',
    timeoutSeconds: 12,
    car: {
      location: [-1100, -1800, 17.05],
      headingYaw: 1.18,
      headingPitch: 0,
      airRoll: 0,
      speed: 0,
      speedYaw: 1.18,
      speedPitch: 0,
      speedFollowsHeading: true,
      snapToGround: true,
      hasFlip: true,
      initialBoost: 100,
      unlimitedBoost: true,
    },
    ball: {
      location: [0, 2900, 820],
      speed: 0,
      speedYaw: Math.PI / 2,
      speedPitch: 0,
      kickoffState: true,
      randomAngularVelocity: true,
      angularVelocity: [0, 0, 1.8],
    },
  },
  {
    id: 'starter-shot-2',
    index: 2,
    name: 'Backboard Double Tap Read',
    timeoutSeconds: 10,
    car: {
      location: [850, -1200, 17.05],
      headingYaw: 1.72,
      headingPitch: 0,
      airRoll: 0,
      speed: 900,
      speedYaw: 1.72,
      speedPitch: 0,
      speedFollowsHeading: true,
      snapToGround: true,
      hasFlip: true,
      initialBoost: 85,
      unlimitedBoost: false,
    },
    ball: {
      location: [-1400, 1500, 240],
      speed: 1950,
      speedYaw: 1.24,
      speedPitch: 0.28,
      kickoffState: false,
      randomAngularVelocity: true,
      angularVelocity: [1.5, 2.2, -1.0],
    },
  },
  {
    id: 'starter-shot-3',
    index: 3,
    name: 'Ceiling Pinch Setup (Airborne No-Flip)',
    timeoutSeconds: 8,
    car: {
      location: [-420, -600, 480],
      headingYaw: 1.57,
      headingPitch: 0.18,
      airRoll: 0.25,
      speed: 1120,
      speedYaw: 1.57,
      speedPitch: 0.18,
      speedFollowsHeading: false,
      snapToGround: false,
      hasFlip: false,
      initialBoost: 60,
      unlimitedBoost: false,
    },
    ball: {
      location: [-380, 420, 610],
      speed: 980,
      speedYaw: 1.57,
      speedPitch: 0.42,
      kickoffState: false,
      randomAngularVelocity: false,
      angularVelocity: [0.5, 3.2, -0.4],
    },
  },
];

export const formatShotSubtitle = (shot: StaticTrainingShotItem): string => {
  const boostText = shot.car.unlimitedBoost
    ? 'Boost INF'
    : `Boost ${Math.round(shot.car.initialBoost)}%`;
  const groundText = shot.car.snapToGround
    ? 'Ground'
    : shot.car.hasFlip !== false
    ? 'Air (Has Flip)'
    : 'Air (No Flip)';
  const ballText = shot.ball.kickoffState
    ? 'Ball Freeze'
    : `Ball ${Math.round(shot.ball.speed)} UU/s`;
  return `Time Limit ${shot.timeoutSeconds}s • ${boostText} • ${groundText} • ${ballText}`;
};
