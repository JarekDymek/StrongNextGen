import { processPhoto } from './image-tools.js';
import { createSubmission, normalizeUpperText, submissionFilename } from './submission-data.js';

const form = document.querySelector('[data-submission-form]');
const photoInput = document.querySelector('[data-photo-input]');
const photoPreview = document.querySelector('[data-photo-preview]');
const photoStatus = document.querySelector('[data-photo-status]');
const removePhotoButton = document.querySelector('[data-remove-photo]');
const resultPanel = document.querySelector('[data-result-panel]');
let processedPhoto = '';
let preparedSubmission = null;

form.addEventListener('input', () => {
  invalidatePreparedSubmission();
});

form.addEventListener('focusout', event => {
  if (!event.target.matches('[data-uppercase]')) return;
  event.target.value = normalizeUpperText(event.target.value);
});

photoInput.addEventListener('change', async () => {
  const file = photoInput.files?.[0];
  if (!file) return;
  invalidatePreparedSubmission();
  processedPhoto = '';
  photoPreview.innerHTML = '<span>Przetwarzanie...</span>';
  removePhotoButton.hidden = true;
  setPhotoBusy(true, 'Przetwarzam zdjęcie...');
  try {
    const result = await processPhoto(file);
    processedPhoto = result.dataUrl;
    photoPreview.innerHTML = `<img src="${result.dataUrl}" alt="Podgląd zdjęcia zawodnika">`;
    removePhotoButton.hidden = false;
    setPhotoBusy(false, `Gotowe: ${result.width} x ${result.height} px, ${(result.bytes / 1024).toFixed(1)} KB.`);
  } catch (error) {
    photoInput.value = '';
    photoPreview.innerHTML = '<span>Brak zdjęcia</span>';
    setPhotoBusy(false, error?.message || 'Nie udało się przetworzyć zdjęcia.', true);
  }
});

removePhotoButton.addEventListener('click', () => {
  invalidatePreparedSubmission();
  processedPhoto = '';
  photoInput.value = '';
  photoPreview.innerHTML = '<span>Brak zdjęcia</span>';
  photoStatus.textContent = 'Zdjęcie usunięte.';
  removePhotoButton.hidden = true;
  resultPanel.hidden = true;
});

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  try {
    preparedSubmission = createSubmission({
      name: data.get('name'),
      birthDate: data.get('birthDate'),
      residence: data.get('residence'),
      height: data.get('height'),
      weight: data.get('weight'),
      notes: data.get('notes'),
      categories: data.getAll('categories'),
      customCategories: data.get('customCategories')
    }, processedPhoto);
  } catch (error) {
    preparedSubmission = null;
    resultPanel.hidden = true;
    showFormError(error?.message || 'Sprawdź dane formularza.');
    return;
  }

  const formStatus = document.querySelector('[data-form-status]');
  formStatus.textContent = '';
  formStatus.classList.remove('is-error');

  form.elements.name.value = preparedSubmission.competitor.name;
  form.elements.residence.value = preparedSubmission.competitor.residence;
  form.elements.height.value = preparedSubmission.competitor.height;
  form.elements.weight.value = preparedSubmission.competitor.weight;
  form.elements.notes.value = preparedSubmission.competitor.notes;
  form.elements.customCategories.value = normalizeUpperText(form.elements.customCategories.value);
  document.querySelector('[data-result-name]').textContent = preparedSubmission.competitor.name;
  document.querySelector('[data-result-details]').textContent = [
    preparedSubmission.competitor.birthDate,
    preparedSubmission.competitor.residence,
    `${preparedSubmission.competitor.height} cm`,
    `${preparedSubmission.competitor.weight} kg`,
    preparedSubmission.competitor.categories.join(', ') || 'BEZ KATEGORII'
  ].join(' · ');
  resultPanel.hidden = false;
  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
});

function setPhotoBusy(busy, message, isError = false) {
  photoStatus.textContent = message;
  photoStatus.classList.toggle('is-error', isError);
  form.querySelector('[type="submit"]').disabled = busy;
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
