# Strongman Next

## Wersja stabilna 1.0.0

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

- `sezon_2026.json` - dziesięć zweryfikowanych imprez i klasyfikacje 1-5,
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

Formularz przetwarza dane i zdjęcie wyłącznie w przeglądarce zawodnika. Generuje jeden plik `zawodnik_IMIE_NAZWISKO.json` typu `competitor-submission`. Organizator dodaje go zwykłym przyciskiem importu bazy zawodników. Aplikacja pokazuje podgląd i pozwala dodać nowy rekord albo zaktualizować istniejący bez zmiany jego identyfikatora.

## Format importu konkurencji

```json
[
  { "name": "Kule", "type": "low" },
  { "name": "Wyciskanie belki", "type": "high" }
]
```

`high` oznacza więcej = lepiej. `low` oznacza mniej = lepiej.

## Status wydania

Wersja 1.0.0 przeszła testy reguł punktacji, importu i eksportu, trwałej bazy zawodników, pełnego przebiegu zawodów, widoków telefonu i iPada oraz uruchomienia PWA offline. Projekt nie wymaga procesu bundlowania: publikowany katalog jest bezpośrednio produkcyjną aplikacją statyczną GitHub Pages.
