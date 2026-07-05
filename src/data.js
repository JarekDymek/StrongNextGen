import { DEFAULT_COMPETITORS } from './competitors.js';

export const APP_VERSION = '0.2.6';
export { DEFAULT_COMPETITORS };

export const DEFAULT_EVENTS = [
  { name: 'Kule', type: 'low' },
  { name: 'Martwy ciąg (powtórzenia)', type: 'high' },
  { name: 'Przerzucanie opony 360 kg - 6 obrotów.', type: 'low' },
  { name: 'Schody', type: 'low' },
  { name: 'Spacer Buszmena 380 kg - 20m.', type: 'low' },
  { name: 'Spacer Farmera 140 kg - 2 x 20m.', type: 'low' },
  { name: 'Spacer Farmera na dystans', type: 'high' },
  { name: 'Uchwyt Herkulesa', type: 'high' },
  { name: 'Waga płaczu przodem', type: 'high' },
  { name: 'Worki - załadunek 3 x 100 kg.', type: 'low' },
  { name: 'Wyciskanie belki 140 kg - 60 sek.', type: 'high' },
  { name: 'Zegar', type: 'high' }
];

export const EVENT_TYPE_LABEL = {
  high: 'Więcej = lepiej',
  low: 'Mniej = lepiej'
};
