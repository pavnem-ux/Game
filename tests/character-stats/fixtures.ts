import type { CharacterClass } from '../../src/character-stats';

// Fixed approved reference values; order is documented by the keys in the test.
// Task 40: levels 10 / 25 / 50 follow the owner's growth ×2/15 (level 1 unchanged); fractional
// attributes are kept unrounded (6 decimals here).
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
    primary: [6.6, 2.2, 2.2, 6.6, 2.2],
    combat: [166, 43, 21, 13.2, 101.1, 10.44, 201.1, 101.1, 5.22, 0.22, 100.66],
  },
  {
    characterClass: 'warrior',
    level: 25,
    primary: [12.6, 4.2, 4.2, 12.6, 4.2],
    combat: [226, 73, 31, 25.2, 102.1, 10.84, 202.1, 102.1, 5.42, 0.42, 101.26],
  },
  {
    characterClass: 'warrior',
    level: 50,
    primary: [22.6, 7.533333, 7.533333, 22.6, 7.533333],
    combat: [
      326, 123, 47.666667, 45.2, 103.766667, 11.506667, 203.766667, 103.766667, 5.753333, 0.753333,
      102.26,
    ],
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
    primary: [2.2, 11, 3.4, 4.4, 2.2],
    combat: [144, 21, 65, 6.6, 101.7, 10.68, 201.7, 101.1, 5.22, 1.1, 103.3],
  },
  {
    characterClass: 'mage',
    level: 25,
    primary: [4.2, 21, 7.4, 8.4, 4.2],
    combat: [184, 31, 115, 12.6, 103.7, 11.48, 203.7, 102.1, 5.42, 2.1, 106.3],
  },
  {
    characterClass: 'mage',
    level: 50,
    primary: [7.533333, 37.666667, 14.066667, 15.066667, 7.533333],
    combat: [
      250.666667, 47.666667, 198.333333, 22.6, 107.033333, 12.813333, 207.033333, 103.766667,
      5.753333, 3.766667, 111.3,
    ],
  },
  {
    characterClass: 'archer',
    level: 1,
    primary: [5, 1, 2, 1, 2],
    combat: [110, 35, 15, 6, 101, 10.4, 201, 101, 5.2, 0.1, 100.3],
  },
  {
    characterClass: 'archer',
    level: 10,
    primary: [11, 2.2, 4.4, 2.2, 4.4],
    combat: [122, 65, 21, 13.2, 102.2, 10.88, 202.2, 102.2, 5.44, 0.22, 100.66],
  },
  {
    characterClass: 'archer',
    level: 25,
    primary: [21, 4.2, 8.4, 4.2, 8.4],
    combat: [142, 115, 31, 25.2, 104.2, 11.68, 204.2, 104.2, 5.84, 0.42, 101.26],
  },
  {
    characterClass: 'archer',
    level: 50,
    primary: [37.666667, 7.533333, 15.066667, 7.533333, 15.066667],
    combat: [
      175.333333, 198.333333, 47.666667, 45.2, 107.533333, 13.013333, 207.533333, 107.533333,
      6.506667, 0.753333, 102.26,
    ],
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
    primary: [6.6, 2.2, 6.6, 4.4, 6.6],
    combat: [144, 43, 21, 11, 103.3, 11.32, 203.3, 103.3, 5.66, 0.22, 100.66],
  },
  {
    characterClass: 'rogue',
    level: 25,
    primary: [12.6, 4.2, 12.6, 8.4, 12.6],
    combat: [184, 73, 31, 21, 106.3, 12.52, 206.3, 106.3, 6.26, 0.42, 101.26],
  },
  {
    characterClass: 'rogue',
    level: 50,
    primary: [22.6, 7.533333, 22.6, 15.066667, 22.6],
    combat: [
      250.666667, 123, 47.666667, 37.666667, 111.3, 14.52, 211.3, 111.3, 7.26, 0.753333, 102.26,
    ],
  },
];
