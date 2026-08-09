# Strongman Next

## Wersja testowa 0.4.0

Ta wersja jest przygotowana jako instalowalna aplikacja PWA dla telefonu, iPada i PC. Po wejściu na stronę z GitHub Pages można ją dodać do ekranu głównego lub zainstalować w przeglądarce na komputerze.

Najważniejsze do testów:

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

Adres testowy po publikacji:

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
- Wyszukiwanie można łączyć z filtrami `Puchar Polski`, `Legenda`, `Tyberian Team` i `Bez kategorii`.
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

Ponowny import uzupełnia i aktualizuje istniejące profile, nie usuwając danych, gdy odpowiadające im pole w pliku jest puste.

Obsługiwane są też tablice samych nazw:

```json
["Adam Nowak", "Bartek Kowalski"]
```

## Format importu konkurencji

```json
[
  { "name": "Kule", "type": "low" },
  { "name": "Wyciskanie belki", "type": "high" }
]
```

`high` oznacza więcej = lepiej. `low` oznacza mniej = lepiej.

## Kierunek dalszego rozwoju

- Tryb sędziego pomocniczego jako osobny moduł, najlepiej po stabilnym wyborze backendu.
- Synchronizacja chmurowa punktów kontrolnych między telefonem i iPadem.
- Widok publiczny/live scoring.
- Edycja zakończonych zawodów z pełnym dziennikiem zmian.
- Profil zawodnika ze zdjęciem, kategoriami i historią startów.
