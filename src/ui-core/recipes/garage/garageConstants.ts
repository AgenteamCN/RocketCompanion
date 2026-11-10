// 1. Car Tab: Canonical GLB vehicles replacing legacy whitebox placeholders
export interface CarDef {
  id: string;
  name: string;
  hitbox: 'Octane' | 'Dominus' | 'Breakout' | 'Plank' | 'Hybrid' | 'Merc' | 'Octane (Three-Wheeler)';
}

export const CARS: CarDef[] = [
  { id: 'fennec', name: 'Fennec', hitbox: 'Octane' },
  { id: 'octane', name: 'Octane', hitbox: 'Octane' },
  { id: 'insidio', name: 'Insidio', hitbox: 'Hybrid' },
  { id: 'ryza', name: 'Ryza', hitbox: 'Octane' },
  { id: 'dominus', name: 'Dominus', hitbox: 'Dominus' },
  { id: 'breakout-mini', name: 'Breakout', hitbox: 'Breakout' },
  { id: 'sentinel', name: 'Sentinel', hitbox: 'Plank' },
  { id: 'merc', name: 'Merc', hitbox: 'Merc' },
  { id: 'trioctane', name: 'TriOctane4', hitbox: 'Octane' },
  { id: 'trioctane-threewheel', name: 'TriOctane3', hitbox: 'Octane (Three-Wheeler)' },
];

// 2. Paint / Colour Tab: Compact numeric color ID (uint8, extensible up to 20 per team) for P2P bandwidth efficiency
export interface ColorDef {
  id: number;
  name: string;
  hex: string;
  team: 0 | 1; // 0 = Blue, 1 = Orange
  borderClass: string;
}

export const BLUE_TEAM_COLORS: ColorDef[] = [
  { id: 1, name: 'Emerald Green', hex: '#66bb6a', team: 0, borderClass: 'border-emerald-600' },
  { id: 5, name: 'Royal Purple', hex: '#ba68c8', team: 0, borderClass: 'border-purple-600' },
  { id: 3, name: 'Sky Blue', hex: '#42a5f5', team: 0, borderClass: 'border-sky-600' },
];

export const ORANGE_TEAM_COLORS: ColorDef[] = [
  { id: 2, name: 'Sunburst Yellow', hex: '#ffc107', team: 1, borderClass: 'border-amber-500' },
  { id: 4, name: 'Neon Pink', hex: '#fd6e9d', team: 1, borderClass: 'border-pink-500' },
  { id: 0, name: 'Flame Red', hex: '#ff7043', team: 1, borderClass: 'border-orange-600' },
];

