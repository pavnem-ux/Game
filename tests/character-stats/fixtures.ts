import type { CharacterClass } from '../../src/character-stats';

// Fixed approved reference values; order is documented by the keys in the test.
export const REFERENCE_FIXTURES: readonly {
  characterClass: CharacterClass;
  level: number;
  primary: readonly number[];
  combat: readonly number[];
}[] = [
  {
    characterClass: 'warrior',
    level: 1,
    primary: [3, 1, 1, 3, 1],
    combat: [130, 25, 15, 6, 100.5, 10.2, 200.5, 100.5, 5.1, 0.1, 100.3],
  },
  {
    characterClass: 'warrior',
    level: 10,
    primary: [30, 10, 10, 30, 10],
    combat: [400, 160, 60, 60, 105.0, 12.0, 205.0, 105.0, 6.0, 1.0, 103.0],
  },
  {
    characterClass: 'warrior',
    level: 25,
    primary: [75, 25, 25, 75, 25],
    combat: [850, 385, 135, 150, 112.5, 15.0, 212.5, 112.5, 7.5, 2.5, 107.5],
  },
  {
    characterClass: 'warrior',
    level: 50,
    primary: [150, 50, 50, 150, 50],
    combat: [1600, 760, 260, 300, 125.0, 20.0, 225.0, 125.0, 10.0, 5.0, 115.0],
  },
  {
    characterClass: 'mage',
    level: 1,
    primary: [1, 5, 1, 2, 1],
    combat: [120, 15, 35, 3, 100.5, 10.2, 200.5, 100.5, 5.1, 0.5, 101.5],
  },
  {
    characterClass: 'mage',
    level: 10,
    primary: [10, 50, 19, 20, 10],
    combat: [300, 60, 260, 30, 109.5, 13.8, 209.5, 105.0, 6.0, 5.0, 115.0],
  },
  {
    characterClass: 'mage',
    level: 25,
    primary: [25, 125, 49, 50, 25],
    combat: [600, 135, 635, 75, 124.5, 19.8, 224.5, 112.5, 7.5, 12.5, 137.5],
  },
  {
    characterClass: 'mage',
    level: 50,
    primary: [50, 250, 99, 100, 50],
    combat: [1100, 260, 1260, 150, 149.5, 29.8, 249.5, 125.0, 10.0, 25.0, 175.0],
  },
  {
    characterClass: 'archer',
    level: 1,
    primary: [5, 1, 2, 1, 2],
    combat: [110, 35, 15, 6, 101.0, 10.4, 201.0, 101.0, 5.2, 0.1, 100.3],
  },
  {
    characterClass: 'archer',
    level: 10,
    primary: [50, 10, 20, 10, 20],
    combat: [200, 260, 60, 60, 110.0, 14.0, 210.0, 110.0, 7.0, 1.0, 103.0],
  },
  {
    characterClass: 'archer',
    level: 25,
    primary: [125, 25, 50, 25, 50],
    combat: [350, 635, 135, 150, 125.0, 20.0, 225.0, 125.0, 10.0, 2.5, 107.5],
  },
  {
    characterClass: 'archer',
    level: 50,
    primary: [250, 50, 100, 50, 100],
    combat: [600, 1260, 260, 300, 150.0, 30.0, 250.0, 150.0, 15.0, 5.0, 115.0],
  },
  {
    characterClass: 'rogue',
    level: 1,
    primary: [3, 1, 3, 2, 3],
    combat: [120, 25, 15, 5, 101.5, 10.6, 201.5, 101.5, 5.3, 0.1, 100.3],
  },
  {
    characterClass: 'rogue',
    level: 10,
    primary: [30, 10, 30, 20, 30],
    combat: [300, 160, 60, 50, 115.0, 16.0, 215.0, 115.0, 8.0, 1.0, 103.0],
  },
  {
    characterClass: 'rogue',
    level: 25,
    primary: [75, 25, 75, 50, 75],
    combat: [600, 385, 135, 125, 137.5, 25.0, 237.5, 137.5, 12.5, 2.5, 107.5],
  },
  {
    characterClass: 'rogue',
    level: 50,
    primary: [150, 50, 150, 100, 150],
    combat: [1100, 760, 260, 250, 175.0, 40.0, 275.0, 175.0, 20.0, 5.0, 115.0],
  },
];
