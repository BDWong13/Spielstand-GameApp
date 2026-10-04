import dart from './dart.js';
import wizard from './wizard.js';
import phase10 from './phase10.js';
import kniffel from './kniffel.js';
import skipbo from './skipbo.js';
import romme from './romme.js';
import custom from './custom.js';

export const GAME_LIST = [dart, wizard, phase10, kniffel, skipbo, romme, custom];
export const GAMES = Object.fromEntries(GAME_LIST.map(g => [g.id, g]));
