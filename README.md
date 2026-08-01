# Strongman Next

## Wersja testowa 0.3.0

Ta wersja jest przygotowana jako instalowalna aplikacja PWA dla telefonu, iPada i PC. Po wejściu na stronę z GitHub Pages można ją dodać do ekranu głównego lub zainstalować w przeglądarce na komputerze.

Najważniejsze do testów:

- obsługa wielu niezależnych imprez na jednym urządzeniu,
- możliwość prowadzenia Strong Man i Strong Women równolegle w osobnych kartach lub na osobnych urządzeniach,
- wspólna baza zawodników dla wszystkich imprez,
- pełny profil zawodnika otwierany ikoną `i` lub zdjęciem,
- aktualizowanie istniejących profili podczas importu JSON,
- zachowanie kolejności startowej remisujących zawodników z poprzedniej konkurencji,
- wbudowana baza zawodników z pliku `Baza Zawodników 26.json`,
- zdjęcia zawodników w wyborze i podczas wpisywania wyników,
- tryb `Słońce` o podwyższonym kontraście do pracy na zewnątrz,
- duże karty wyników z automatycznym zapisem,
- pełnoekranowy stoper przy zawodniku,
- pełne podsumowanie punktów za każdą konkurencję w klasyfikacji końcowej,
- eksport klasyfikacji końcowej do pliku HTML,
- PWA/offline shell z ikonami aplikacji.

Adres testowy po publikacji:

```text
https://jarekdymek.github.io/StrongNextGen/
```

## Równoległe zawody

Przycisk `Zawody` w nagłówku otwiera menedżer imprez. Można utworzyć, otworzyć, zmienić nazwę, skopiować, zarchiwizować lub usunąć zawody. Stan wyników i punkty kontrolne są oddzielne dla każdej imprezy, natomiast baza profili zawodników jest wspólna.

Dwie imprezy można prowadzić jednocześnie:

- na dwóch urządzeniach, albo
- w dwóch kartach tej samej przeglądarki — w każdej karcie należy otworzyć inną imprezę.

## Profile i import zawodników

Obsługiwane pola profilu:

```json
[
  {
    "id": 1,
    "name": "Adam Nowak",
    "birthDate": "1998-01-21",
    "residence": "Białystok",
    "height": "182",
    "weight": "135",
    "notes": "Osiągnięcia i rekordy",
    "category": "Aktywny zawodnik",
    "categories": ["Puchar Polski"],
    "photo": "data:image/jpeg;base64,..."
  }
]
```

Import rozpoznaje również alternatywne nazwy pól, m.in. `dateOfBirth`, `city`, `heightCm`, `weightKg`, `achievements`, `description`, `icon`, `image` i `avatar`. Rekord o tym samym imieniu i nazwisku aktualizuje istniejący profil, zachowując jego identyfikator.

## Instalacja

- Android/Chrome/Edge: użyj przycisku `Instaluj` lub opcji przeglądarki `Dodaj do ekranu głównego`.
- iPad/iPhone/Safari: użyj `Udostępnij` i `Do ekranu początkowego`.
- PC/Chrome/Edge: użyj ikony instalacji w pasku adresu albo przycisku `Instaluj`.

## Uruchomienie i testy

```bash
npm.cmd test
npm.cmd run serve
```

Podgląd lokalny:

```text
http://127.0.0.1:4174/
```

Testy obejmują punktację, tie-break klasyfikacji, kolejność finału, kolejność po remisie, normalizację profili, aktualizację importowanej bazy oraz migrację wielu imprez.

## Dalszy rozwój

- Tryb sędziego pomocniczego jako osobny moduł, najlepiej po stabilnym wyborze backendu.
- Synchronizacja chmurowa punktów kontrolnych między telefonem i iPadem.
- Widok publiczny/live scoring.
- Edycja zakończonych zawodów z pełnym dziennikiem zmian.
