import {
  countryDisplayName,
  COUNTRY_CODES,
  INTERNATIONAL_LEVEL_CODES,
  NATIONAL_LEVEL_CODES,
  SPORT_LABELS,
  TITLE_CODES
} from '../src/competitor-profile-data.js';
import { createPhotoCropper } from './cropper.js';
import { applyTranslations, translate } from './i18n.js';
import { privacyNotice } from './legal-config.js';
import { createSubmission, normalizeUpperText, submissionFilename } from './submission-data.js';

const form = document.querySelector('[data-submission-form]');
const photoInput = document.querySelector('[data-photo-input]');
const photoStatus = document.querySelector('[data-photo-status]');
const cropperElement = document.querySelector('[data-cropper]');
const cropControls = document.querySelector('[data-crop-controls]');
const resultPanel = document.querySelector('[data-result-panel]');
const submitButton = form.querySelector('[type="submit"]');
let locale = 'pl';
let preparedSubmission = null;
let photoBusy = false;

const cropper = createPhotoCropper({
  canvas: document.querySelector('[data-crop-canvas]'),
  zoomInput: document.querySelector('[data-crop-zoom]'),
  onChange: invalidatePreparedSubmission
});

applyLocale('pl');

document.querySelectorAll('[data-locale]').forEach(button => {
  button.addEventListener('click', () => applyLocale(button.dataset.locale));
});

form.addEventListener('input', event => {
  event.target.setCustomValidity?.('');
  invalidatePreparedSubmission();
});
form.addEventListener('invalid', event => {
  event.target.setCustomValidity?.(translate(locale, 'invalidRequired'));
}, true);

form.addEventListener('focusout', event => {
  if (!event.target.matches('[data-uppercase]')) return;
  event.target.value = normalizeUpperText(event.target.value);
});

photoInput.addEventListener('change', async () => {
  const file = photoInput.files?.[0];
  if (!file) return;
  invalidatePreparedSubmission();
  setPhotoBusy(true, translate(locale, 'processingPhoto'));
  try {
    await cropper.load(file);
    cropperElement.hidden = false;
    cropControls.hidden = false;
    updatePhotoButtonLabel();
    setPhotoBusy(false, translate(locale, 'photoReady'));
  } catch (error) {
    cropper.clear();
    photoInput.value = '';
    cropperElement.hidden = true;
    cropControls.hidden = true;
    updatePhotoButtonLabel();
    setPhotoBusy(false, translate(locale, error?.message || 'photoReadError'), true);
  }
});

document.querySelector('[data-reset-crop]').addEventListener('click', () => {
  cropper.reset();
  photoStatus.textContent = translate(locale, 'photoReady');
});

document.querySelector('[data-remove-photo]').addEventListener('click', () => {
  cropper.clear();
  photoInput.value = '';
  cropperElement.hidden = true;
  cropControls.hidden = true;
  updatePhotoButtonLabel();
  setPhotoBusy(false, translate(locale, 'photoRemoved'));
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  invalidatePreparedSubmission();
  if (!form.reportValidity() || photoBusy) return;
  setPhotoBusy(true, translate(locale, 'processingPhoto'));
  try {
    const photo = await cropper.exportPhoto();
    const data = new FormData(form);
    preparedSubmission = createSubmission({
      formLocale: locale,
      name: data.get('name'),
      birthDate: data.get('birthDate'),
      residence: data.get('residence'),
      countryCode: data.get('countryCode'),
      height: data.get('height'),
      weight: data.get('weight'),
      categories: data.getAll('categories'),
      customCategories: data.get('customCategories'),
      strengthRecords: {
        squatKg: data.get('squatKg'),
        benchPressKg: data.get('benchPressKg'),
        deadliftKg: data.get('deadliftKg')
      },
      career: {
        nationalBest: {
          level: data.get('nationalLevel'),
          place: data.get('nationalPlace'),
          year: data.get('nationalYear'),
          eventName: data.get('nationalEventName')
        },
        internationalBest: {
          level: data.get('internationalLevel'),
          place: data.get('internationalPlace'),
          year: data.get('internationalYear'),
          eventName: data.get('internationalEventName')
        },
        titleCodes: data.getAll('titleCodes')
      },
      declarations: {
        dataAndPhotoConfirmed: data.get('dataAndPhotoConfirmed') === 'on',
        riskAccepted: data.get('riskAccepted') === 'on',
        mediaPermissionAccepted: data.get('mediaPermissionAccepted') === 'on',
        privacyNoticeAcknowledged: data.get('privacyNoticeAcknowledged') === 'on'
      }
    }, photo.dataUrl);
    normalizeVisibleText(preparedSubmission);
    showPreparedSubmission(preparedSubmission);
    setPhotoBusy(false, `${translate(locale, 'generated')} ${photo.width} × ${photo.height} px, ${(photo.bytes / 1024).toFixed(1)} KB.`);
  } catch (error) {
    preparedSubmission = null;
    resultPanel.hidden = true;
    setPhotoBusy(false, '');
    showFormError(translate(locale, error?.message || 'invalidRequired'));
  }
});

document.querySelector('[data-download]').addEventListener('click', () => {
  if (!preparedSubmission) return;
  const blob = new Blob([JSON.stringify(preparedSubmission, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = submissionFilename(preparedSubmission.competitor.name);
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  document.querySelector('[data-form-status]').textContent = translate(locale, 'downloaded');
});

window.addEventListener('beforeunload', () => cropper.destroy());

function applyLocale(nextLocale) {
  locale = nextLocale === 'en' ? 'en' : 'pl';
  applyTranslations(document, locale);
  document.querySelectorAll('[data-locale]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.locale === locale));
  });
  rebuildCountryOptions();
  rebuildCareerOptions();
  rebuildTitleOptions();
  document.querySelector('[data-privacy-notice]').textContent = privacyNotice(locale);
  updatePhotoButtonLabel();
}

function rebuildCountryOptions() {
  const select = document.querySelector('[data-country-select]');
  const selected = select.value;
  const options = COUNTRY_CODES
    .map(code => ({ code, label: countryDisplayName(code, locale) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  select.replaceChildren(option('', translate(locale, 'chooseCountry')));
  options.forEach(item => select.append(option(item.code, item.label)));
  select.value = selected;
}

function rebuildCareerOptions() {
  document.querySelectorAll('[data-level-select]').forEach(select => {
    const selected = select.value;
    const codes = select.dataset.levelSelect === 'national' ? NATIONAL_LEVEL_CODES : INTERNATIONAL_LEVEL_CODES;
    select.replaceChildren(option('', translate(locale, 'chooseLevel')));
    codes.forEach(code => select.append(option(code, SPORT_LABELS[locale][code])));
    select.value = selected;
  });
}

function rebuildTitleOptions() {
  const container = document.querySelector('[data-title-options]');
  const checked = new Set(new FormData(form).getAll('titleCodes'));
  container.replaceChildren(...TITLE_CODES.map(code => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'titleCodes';
    input.value = code;
    input.checked = checked.has(code);
    const span = document.createElement('span');
    span.textContent = SPORT_LABELS[locale][code];
    label.append(input, span);
    return label;
  }));
}

function option(value, label) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  return element;
}

function normalizeVisibleText(submission) {
  form.elements.name.value = submission.competitor.name;
  form.elements.residence.value = submission.competitor.residence;
  form.elements.height.value = submission.competitor.height;
  form.elements.weight.value = submission.competitor.weight;
  form.elements.customCategories.value = normalizeUpperText(form.elements.customCategories.value);
  form.elements.nationalEventName.value = normalizeUpperText(form.elements.nationalEventName.value);
  form.elements.internationalEventName.value = normalizeUpperText(form.elements.internationalEventName.value);
}

function showPreparedSubmission(submission) {
  document.querySelector('[data-form-status]').textContent = '';
  document.querySelector('[data-form-status]').classList.remove('is-error');
  document.querySelector('[data-result-name]').textContent = submission.competitor.name;
  document.querySelector('[data-result-details]').textContent = [
    submission.competitor.birthDate,
    submission.competitor.residence,
    countryDisplayName(submission.competitor.countryCode, locale),
    `${submission.competitor.height} cm`,
    `${submission.competitor.weight} kg`
  ].join(' · ');
  resultPanel.hidden = false;
  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function updatePhotoButtonLabel() {
  document.querySelector('[data-photo-button-label]').textContent = translate(locale, cropper.hasImage() ? 'changePhoto' : 'choosePhoto');
}

function setPhotoBusy(busy, message, isError = false) {
  photoBusy = busy;
  photoStatus.textContent = message;
  photoStatus.classList.toggle('is-error', isError);
  submitButton.disabled = busy;
}

function showFormError(message) {
  const status = document.querySelector('[data-form-status]');
  status.textContent = message;
  status.classList.add('is-error');
  status.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function invalidatePreparedSubmission() {
  preparedSubmission = null;
  resultPanel.hidden = true;
  const status = document.querySelector('[data-form-status]');
  status.textContent = '';
  status.classList.remove('is-error');
}
