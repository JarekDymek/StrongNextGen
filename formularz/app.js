import {
  countryDisplayName,
  COUNTRY_CODES,
  INTERNATIONAL_LEVEL_CODES,
  NATIONAL_LEVEL_CODES,
  SPORT_LABELS
} from '../src/competitor-profile-data.js';
import { createPhotoCropper } from './cropper.js';
import { applyTranslations, translate } from './i18n.js';
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

initializeCareerLists();
applyLocale('pl');

document.querySelectorAll('[data-locale]').forEach(button => {
  button.addEventListener('click', () => applyLocale(button.dataset.locale));
});

document.querySelectorAll('[data-add-career]').forEach(button => {
  button.addEventListener('click', () => addCareerEntry(button.dataset.addCareer));
});

form.addEventListener('click', event => {
  const button = event.target.closest('[data-remove-career]');
  if (!button) return;
  const entry = button.closest('[data-career-entry]');
  const list = entry?.closest('[data-career-list]');
  if (!entry || !list) return;
  if (list.children.length === 1) {
    entry.querySelectorAll('input, select').forEach(control => { control.value = ''; });
  } else {
    entry.remove();
  }
  updateCareerEntryLabels(list.dataset.careerList);
  invalidatePreparedSubmission();
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
        nationalResults: readCareerEntries('national'),
        internationalResults: readCareerEntries('international')
      },
      declarations: {
        dataAndPhotoConfirmed: data.get('dataAndPhotoConfirmed') === 'on',
        riskAccepted: data.get('riskAccepted') === 'on',
        mediaPermissionAccepted: data.get('mediaPermissionAccepted') === 'on'
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
  document.querySelectorAll('[data-career-list]').forEach(list => updateCareerEntryLabels(list.dataset.careerList));
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
  form.querySelectorAll('[data-career-field="eventName"]').forEach(input => {
    input.value = normalizeUpperText(input.value);
  });
}

function initializeCareerLists() {
  addCareerEntry('national');
  addCareerEntry('international');
}

function addCareerEntry(kind) {
  const list = document.querySelector(`[data-career-list="${kind}"]`);
  if (!list || list.children.length >= 20) return;
  const entry = document.querySelector('[data-career-template]').content.firstElementChild.cloneNode(true);
  entry.dataset.careerKind = kind;
  entry.querySelector('[data-level-select]').dataset.levelSelect = kind;
  list.append(entry);
  applyTranslations(entry, locale);
  rebuildCareerOptions();
  updateCareerEntryLabels(kind);
  invalidatePreparedSubmission();
}

function updateCareerEntryLabels(kind) {
  const entries = [...document.querySelectorAll(`[data-career-list="${kind}"] [data-career-entry]`)];
  entries.forEach((entry, index) => {
    entry.querySelector('[data-career-entry-title]').textContent = `${translate(locale, 'careerResult')} ${index + 1}`;
    const removeButton = entry.querySelector('[data-remove-career]');
    removeButton.hidden = entries.length === 1;
    removeButton.title = translate(locale, 'removeResult');
    removeButton.setAttribute('aria-label', translate(locale, 'removeResult'));
  });
}

function readCareerEntries(kind) {
  return [...document.querySelectorAll(`[data-career-list="${kind}"] [data-career-entry]`)].map(entry => ({
    level: entry.querySelector('[data-career-field="level"]').value,
    place: entry.querySelector('[data-career-field="place"]').value,
    year: entry.querySelector('[data-career-field="year"]').value,
    eventName: entry.querySelector('[data-career-field="eventName"]').value
  }));
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
