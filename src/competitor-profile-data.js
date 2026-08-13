export const COUNTRY_CODES = Object.freeze(`
  AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
  CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
  GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO
  JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR
  MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO
  RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV
  TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
`.trim().split(/\s+/));

export const NATIONAL_LEVEL_CODES = Object.freeze([
  'NATIONAL_CHAMPIONSHIP',
  'NATIONAL_CUP',
  'OTHER_NATIONAL'
]);

export const INTERNATIONAL_LEVEL_CODES = Object.freeze([
  'WORLD_CHAMPIONSHIP',
  'EUROPEAN_CHAMPIONSHIP',
  'CONTINENTAL_CHAMPIONSHIP',
  'INTERNATIONAL_EVENT'
]);

export const TITLE_CODES = Object.freeze([
  'NATIONAL_CHAMPION',
  'NATIONAL_VICE_CHAMPION',
  'NATIONAL_CUP_WINNER',
  'EUROPEAN_CHAMPION',
  'EUROPEAN_VICE_CHAMPION',
  'CONTINENTAL_CHAMPION',
  'CONTINENTAL_VICE_CHAMPION',
  'WORLD_CHAMPION',
  'WORLD_VICE_CHAMPION'
]);

export const SPORT_LABELS = Object.freeze({
  pl: {
    NATIONAL_CHAMPIONSHIP: 'Mistrzostwa kraju',
    NATIONAL_CUP: 'Puchar / cykl krajowy',
    OTHER_NATIONAL: 'Inne zawody krajowe',
    WORLD_CHAMPIONSHIP: 'Mistrzostwa świata',
    EUROPEAN_CHAMPIONSHIP: 'Mistrzostwa Europy',
    CONTINENTAL_CHAMPIONSHIP: 'Mistrzostwa kontynentu',
    INTERNATIONAL_EVENT: 'Inne zawody międzynarodowe',
    NATIONAL_CHAMPION: 'Mistrz kraju',
    NATIONAL_VICE_CHAMPION: 'Wicemistrz kraju',
    NATIONAL_CUP_WINNER: 'Zdobywca krajowego pucharu/cyklu',
    EUROPEAN_CHAMPION: 'Mistrz Europy',
    EUROPEAN_VICE_CHAMPION: 'Wicemistrz Europy',
    CONTINENTAL_CHAMPION: 'Mistrz kontynentu',
    CONTINENTAL_VICE_CHAMPION: 'Wicemistrz kontynentu',
    WORLD_CHAMPION: 'Mistrz świata',
    WORLD_VICE_CHAMPION: 'Wicemistrz świata'
  },
  en: {
    NATIONAL_CHAMPIONSHIP: 'National Championship',
    NATIONAL_CUP: 'National Cup / Series',
    OTHER_NATIONAL: 'Other national competition',
    WORLD_CHAMPIONSHIP: 'World Championship',
    EUROPEAN_CHAMPIONSHIP: 'European Championship',
    CONTINENTAL_CHAMPIONSHIP: 'Continental Championship',
    INTERNATIONAL_EVENT: 'Other international event',
    NATIONAL_CHAMPION: 'National champion',
    NATIONAL_VICE_CHAMPION: 'National vice-champion',
    NATIONAL_CUP_WINNER: 'National cup/series winner',
    EUROPEAN_CHAMPION: 'European champion',
    EUROPEAN_VICE_CHAMPION: 'European vice-champion',
    CONTINENTAL_CHAMPION: 'Continental champion',
    CONTINENTAL_VICE_CHAMPION: 'Continental vice-champion',
    WORLD_CHAMPION: 'World champion',
    WORLD_VICE_CHAMPION: 'World vice-champion'
  }
});

const COUNTRY_FALLBACKS = Object.freeze({
  pl: { PL: 'Polska', DE: 'Niemcy', GB: 'Wielka Brytania', UA: 'Ukraina', CZ: 'Czechy', SK: 'Słowacja', LT: 'Litwa', LV: 'Łotwa', EE: 'Estonia', SE: 'Szwecja', NO: 'Norwegia', FI: 'Finlandia', DK: 'Dania', US: 'Stany Zjednoczone' },
  en: { PL: 'Poland', DE: 'Germany', GB: 'United Kingdom', UA: 'Ukraine', CZ: 'Czechia', SK: 'Slovakia', LT: 'Lithuania', LV: 'Latvia', EE: 'Estonia', SE: 'Sweden', NO: 'Norway', FI: 'Finland', DK: 'Denmark', US: 'United States' }
});

const COUNTRY_CODE_SET = new Set(COUNTRY_CODES);
const NATIONAL_LEVEL_SET = new Set(NATIONAL_LEVEL_CODES);
const INTERNATIONAL_LEVEL_SET = new Set(INTERNATIONAL_LEVEL_CODES);
const TITLE_CODE_SET = new Set(TITLE_CODES);

export function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return COUNTRY_CODE_SET.has(code) ? code : '';
}

export function countryDisplayName(value, locale = 'pl') {
  const code = normalizeCountryCode(value);
  if (!code) return '';
  const language = locale === 'en' ? 'en' : 'pl';
  try {
    const displayNames = new Intl.DisplayNames([language], { type: 'region' });
    const label = displayNames.of(code);
    if (label && label !== code) return label;
  } catch {
    // The static fallback keeps the form usable in older browsers.
  }
  return COUNTRY_FALLBACKS[language][code] || code;
}

export function normalizeStrengthRecords(source) {
  const value = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  return {
    squatKg: normalizeOptionalNumber(value.squatKg, 1, 1000),
    benchPressKg: normalizeOptionalNumber(value.benchPressKg, 1, 1000),
    deadliftKg: normalizeOptionalNumber(value.deadliftKg, 1, 1000)
  };
}

export function normalizeCareer(source) {
  const value = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const nationalResults = normalizeCareerResults(
    Array.isArray(value.nationalResults) ? value.nationalResults : value.nationalBest ? [value.nationalBest] : [],
    NATIONAL_LEVEL_SET
  );
  const internationalResults = normalizeCareerResults(
    Array.isArray(value.internationalResults) ? value.internationalResults : value.internationalBest ? [value.internationalBest] : [],
    INTERNATIONAL_LEVEL_SET
  );
  return {
    nationalResults,
    internationalResults,
    titleCodes: normalizeEnumList(value.titleCodes, TITLE_CODE_SET)
  };
}

export function normalizeCareerResults(values, allowedLevels) {
  const results = [];
  const seen = new Set();
  (Array.isArray(values) ? values : []).forEach(value => {
    const result = normalizeCareerBest(value, allowedLevels);
    if (!result) return;
    const key = [result.level, result.place, result.year, result.eventName || ''].join(':');
    if (seen.has(key)) return;
    seen.add(key);
    results.push(result);
  });
  return results.slice(0, 20);
}

export function normalizeCareerBest(source, allowedLevels) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const level = String(source.level || '').trim().toUpperCase();
  const place = normalizeOptionalInteger(source.place, 1, 999);
  const year = normalizeOptionalInteger(source.year, 1900, 2100);
  const eventName = normalizeUpperText(source.eventName, 120);
  if (!allowedLevels.has(level) && place === null && year === null && !eventName) return null;
  return {
    level: allowedLevels.has(level) ? level : '',
    place,
    year,
    ...(eventName ? { eventName } : {})
  };
}

export function isCompleteCareerBest(value) {
  return value === null || Boolean(value.level && value.place !== null && value.year !== null);
}

export function normalizeOptionalNumber(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const text = String(value).trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

export function normalizeOptionalInteger(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  return parsed >= minimum && parsed <= maximum ? parsed : null;
}

export function normalizeUpperText(value, maximumLength = 500) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maximumLength)
    .toLocaleUpperCase('pl-PL');
}

function normalizeEnumList(values, allowed) {
  const result = [];
  const seen = new Set();
  (Array.isArray(values) ? values : []).forEach(value => {
    const code = String(value || '').trim().toUpperCase();
    if (!allowed.has(code) || seen.has(code)) return;
    seen.add(code);
    result.push(code);
  });
  return result;
}
