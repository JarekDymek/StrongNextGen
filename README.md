# Strongman Next

## Wersja stabilna 1.3.1

### Klasyfikacja sezonu po 11 imprezach

Wbudowana baza sezonu 2026 obejmuje 11 imprez do Skalbmierza z 9 sierpnia 2026. Kanonicznym źródłem jest `data/KGpo11.json`; baza uwzględnia 3. miejsce Marcina Stankiewicza w Busku-Zdroju oraz datę Kleczewa 25 lipca. Migracja zastępuje wcześniejsze błędne imprezy 1–11, zachowując prawidłowe lokalne imprezy od numeru 12. Klasyfikacja nadal liczy cztery najlepsze starty według punktacji 5-4-3-2-1.

### Zewnętrzny formularz zawodnika

Formularz pod adresem `/formularz/` działa po polsku i angielsku. Generuje plik zgłoszenia schema v3 z prywatnym telefonem i adresem e-mail, kodem reprezentowanego kraju, rekordami siłowymi, wieloma wynikami kariery krajowej i międzynarodowej, wersjonowanymi oświadczeniami i wykadrowanym zdjęciem JPEG 120 × 120 px. Kategorie nadaje wyłącznie organizator podczas importu lub edycji bazy. Import starszych plików schema v1 i v2 pozostaje obsługiwany.

### Pomoc podczas zawodów

Menu aplikacji zawiera kontekstową funkcję **Pomoc awaryjna**. Przed rozpoczęciem procedury aplikacja automatycznie tworzy punkt bezpieczeństwa, pokazuje co zostanie zachowane i przeliczone oraz prowadzi sędziego po jednym kroku. Procedury obejmują między innymi:

- korektę wyniku poprzedniej konkurencji z zachowaniem szkicu i faktycznej kolejności konkurencji już rozpoczętej;
- zmianę kolejności wyłącznie przyszłych konkurencji, z blokadą etapów zakończonych i rozpoczętych;
- cofnięcie przypadkowego podsumowania;
- odzyskiwanie danych, przeniesienie zawodów na inne urządzenie oraz tryb awaryjny offline.

Anulowanie aktywnej procedury przywraca automatyczny punkt bezpieczeństwa.

Ta wersja jest przygotowana jako instalowalna aplikacja PWA dla telefonu, iPada i PC. Po wejściu na stronę z GitHub Pages można ją dodać do ekranu głównego lub zainstalować w przeglądarce na komputerze.

Najważniejsze funkcje:

- wbudowana baza zawodników z pliku `Baza Zawodników 26.json`,
- zdjęcia zawodników w wyborze i podczas wpisywania wyników,
- tryb `Słońce` o podwyższonym kontraście do pracy na zewnątrz,
- duże karty wyników z automatycznym zapisem,
- pełnoekranowy stoper przy zawodniku,
- pełne podsumowanie punktów za każdą konkurencję w klasyfikacji końcowej,
- eksport klasyfikacji końcowej do pliku HTML,
- PWA/offline shell z ikonami aplikacji.
- zakładka `Sezon` z klasyfikacją generalną Pucharu Polski 2026,
- edycja, usuwanie i dodawanie kolejnych imprez sezonu,
- import klasyfikacji zawodów z plików JSON i HTML,
- samodzielny eksport klasyfikacji sezonu do responsywnego pliku HTML do wysyłania i publikacji,
- ujednolicona baza 20 zawodników i 37 konkurencji z audytem normalizacji.

Adres aplikacji:

```text
https://jarekdymek.github.io/StrongNextGen/
```

Instalacja:

- Android/Chrome/Edge: użyj przycisku `Instaluj` lub opcji przeglądarki `Dodaj do ekranu głównego`.
- iPad/iPhone/Safari: użyj `Udostępnij` i `Do ekranu początkowego`.
- PC/Chrome/Edge: użyj ikony instalacji w pasku adresu albo przycisku `Instaluj`.

Nowa aplikacja do prowadzenia zawodów Strong Man, zbudowana od zera jako osobne repo. Stary projekt służył tylko jako podgląd domeny, bazy konkurencji, logo i zasad punktacji.

## Co jest gotowe

- Mobile-first UI dla telefonu i iPada.
- Stałe logo Strong Man z możliwością podmiany.
- Baza konkurencji przeniesiona z dotychczasowej aplikacji, deduplikowana i sortowana alfabetycznie.
- Baza zawodników jest wbudowana na start, z importem JSON i ręcznym dodawaniem.
- Zawodnicy są zapisywani w osobnej trwałej bazie; import starszych zawodów odzyskuje brakujące rekordy bez zmiany identyfikatorów i wyników.
- Formularz zawodnika obsługuje podgląd, zmianę i usuwanie zdjęcia oraz automatyczny JPEG do 120 px i około 10 KB.
- Wyszukiwanie można łączyć z filtrami `Puchar Polski`, `Legenda`, `Tyberian Team`, `Inny` i `Bez kategorii`.
- Edycja kategorii zastępuje poprzedni zestaw, dlatego odznaczone i usunięte kategorie własne nie wracają.
- Starsza kategoria `Aktywny Zawodnik` jest automatycznie migrowana do `Inny` przy uruchomieniu i imporcie.
- Oddzielny formularz zgłoszeniowy tworzy niewielki plik pojedynczego zawodnika bez dostępu do bazy aplikacji.
- Wybór zawodników działa kolejnością kliknięć: pierwszy wybrany startuje pierwszy, chyba że sędzia użyje losowania.
- Wybór konkurencji działa kolejnością kliknięć, z możliwością przesuwania wybranych konkurencji.
- Osobny etap ustawiania kolejności startowej przed zawodami.
- Wpisywanie wyników jako duże karty zawodników z automatycznym zapisem po wpisaniu.
- Kolejność po remisie zachowuje wzajemną kolejność startu zawodników z poprzedniej konkurencji.
- Pełny profil zawodnika jest dostępny ze zdjęcia lub przycisku informacji podczas przygotowania, wpisywania wyników i w klasyfikacji.
- Guardy dla brakujących wyników, nadpisania podsumowania, cofnięcia konkurencji, importu stanu i resetu.
- Jawne wskazanie zwycięzcy remisu w klasyfikacji końcowej wraz z powodem tie-breaku.
- Finał jako ostatnia wybrana konkurencja: startuje top zawodników, w odwróconej kolejności klasyfikacji, z liderem na końcu.
- Reset wymaga wpisania `RESET` w osobnym polu.
- Punkty kontrolne z możliwością zaznaczania wielu i kasowania.
- Eksport/import pełnego stanu aplikacji.
- PWA/offline shell z service workerem.
- Testy reguł punktacji.
- Testy punktacji sezonu: pięć miejsc, cztery najlepsze starty i wspólne miejsca przy remisie.

## Sezon 2026 i pliki danych

Zakładka `Sezon` jest niezależna od aktualnie prowadzonych zawodów. Pokazuje klasyfikację generalną, wszystkie starty zawodnika, cztery wyniki zaliczane do sumy oraz punkty odrzucone. Zmiana lub usunięcie imprezy natychmiast przelicza tabelę.

Pliki wymiany i arkusz znajdują się w katalogu `data`:

- `KGpo11.json` - kanoniczna baza sezonu po 11 imprezach; jedyne źródło danych runtime,
- `KGpo11.html` - czytelny raport referencyjny odpowiadający bazie po 11 imprezach,
- `zawodnicy_2026_ujednoliceni.json` - pełna baza zawodników,
- `zawodnicy_puchar_polski_2026.json` - zawodnicy wydzieleni do Pucharu Polski,
- `konkurencje_2026_ujednolicone.json` - baza konkurencji bez duplikatów,
- `audyt_normalizacji_2026.json` - użyte aliasy i dane wymagające weryfikacji,
- `Klasyfikacja_generalna_Tyberian_Team_2026.xlsx` - edytowalny skoroszyt z formułami i miejscem na kolejne imprezy.

## Uruchomienie

```bash
npm.cmd test
npm.cmd run test:ui
npm.cmd run test:regression
npm.cmd run test:pwa
npm.cmd run serve
```

Podgląd lokalny:

```text
http://127.0.0.1:4174/
```

Jeśli PowerShell blokuje `npm`, test można uruchomić bezpośrednio:

```bash
node tests/scoring.test.js
```

## Format importu zawodników

```json
[
  {
    "name": "Adam Nowak",
    "birthDate": "1990-04-12",
    "residence": "Warszawa",
    "height": "188",
    "weight": "135",
    "category": "Open",
    "notes": "Najważniejsze osiągnięcia",
    "photo": "data:image/jpeg;base64,..."
  },
  { "name": "Bartek Kowalski" }
]
```

Ponowny import uzupełnia i aktualizuje istniejące profile. Jeżeli pełny rekord jawnie zawiera `category` lub `categories`, ten zestaw zastępuje poprzednie kategorie; dzięki temu import respektuje także ich usunięcie.

Obsługiwane są też tablice samych nazw:

```json
["Adam Nowak", "Bartek Kowalski"]
```

## Formularz zgłoszenia zawodnika

Publiczny formularz statyczny działa niezależnie od aplikacji zawodów:

```text
https://jarekdymek.github.io/StrongNextGen/formularz/
```

Formularz przetwarza dane i zdjęcie w przeglądarce zawodnika. Generuje jeden plik `zawodnik_IMIE_NAZWISKO.json` typu `competitor-submission` w schema v3. Pole `contact` zawiera znormalizowany telefon i e-mail; nie jest używane w wynikach, rankingach, listach startowych, publicznym profilu ani eksporcie HTML. Nowe zgłoszenie nie zawiera `category` ani `categories`.

Organizator dodaje plik zwykłym przyciskiem importu bazy zawodników. Podgląd importu pozwala nadać kategorie administracyjne. Dla istniejącego zawodnika formularz pokazuje aktualne kategorie, a samo zgłoszenie ich nie usuwa ani nie zastępuje. Identyfikator istniejącego zawodnika pozostaje bez zmian.

Po przygotowaniu zgłoszenia dostępne są:

- `Wyślij zgłoszenie` przez skonfigurowany bezpieczny endpoint,
- `Udostępnij zgłoszenie` przez Web Share API z rzeczywistym plikiem JSON, jeśli przeglądarka to obsługuje,
- `Pobierz plik JSON` jako zawsze dostępna kopia awaryjna.

GitHub Pages nie uruchamia kodu serwerowego. Repo zawiera minimalną funkcję `api/send-submission.js` dla środowiska serverless i dostawcy Resend, ale automatyczna poczta wymaga osobnego wdrożenia endpointu. Sekrety pozostają wyłącznie po stronie serwera. Wymagane zmienne środowiskowe:

```text
RESEND_API_KEY
SUBMISSION_FROM_EMAIL
SUBMISSION_TO_EMAIL=jarekdymek@gmail.com  # opcjonalne, ten adres jest domyślny
ALLOWED_ORIGIN=https://jarekdymek.github.io
```

Po wdrożeniu należy wpisać publiczny adres funkcji do znacznika `strongman-submission-endpoint` w `formularz/index.html`. Do czasu tej konfiguracji przycisk wysyłki jest jawnie nieaktywny, a download i Web Share działają bez backendu. Na Androidzie formularz automatycznie ponawia odrzucone udostępnienie JSON jako kompatybilny plik `*.json.txt`; jego zawartość nadal jest prawidłowym JSON-em i może zostać zaimportowana do aplikacji. Na platformie serverless należy dodatkowo ustawić limit żądań dla endpointu.

## Format importu konkurencji

```json
[
  { "name": "Kule", "type": "low" },
  { "name": "Wyciskanie belki", "type": "high" }
]
```

`high` oznacza więcej = lepiej. `low` oznacza mniej = lepiej.

## Status wydania

Wersja 1.3.1 przeszła testy reguł punktacji, klasyfikacji sezonu po 11 imprezach, formularza PL/EN z prywatnym kontaktem i cropperem, importu schema v1/v2/v3, zachowania kategorii organizatora, trwałej bazy zawodników, pełnego przebiegu zawodów, procedur Pomocy, widoków telefonu i iPada oraz uruchomienia PWA offline. Projekt nie wymaga procesu bundlowania: publikowany katalog jest bezpośrednio produkcyjną aplikacją statyczną GitHub Pages.
