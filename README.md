# Strongman Next

## Wersja testowa 0.2.6

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
- Wybór zawodników działa kolejnością kliknięć: pierwszy wybrany startuje pierwszy, chyba że sędzia użyje losowania.
- Wybór konkurencji działa kolejnością kliknięć, z możliwością przesuwania wybranych konkurencji.
- Osobny etap ustawiania kolejności startowej przed zawodami.
- Wpisywanie wyników jako duże karty zawodników z automatycznym zapisem po wpisaniu.
- Guardy dla brakujących wyników, nadpisania podsumowania, cofnięcia konkurencji, importu stanu i resetu.
- Jawne wskazanie zwycięzcy remisu w klasyfikacji końcowej wraz z powodem tie-breaku.
- Finał jako ostatnia wybrana konkurencja: startuje top zawodników, w odwróconej kolejności klasyfikacji, z liderem na końcu.
- Reset wymaga wpisania `RESET` w osobnym polu.
- Punkty kontrolne z możliwością zaznaczania wielu i kasowania.
- Eksport/import pełnego stanu aplikacji.
- PWA/offline shell z service workerem.
- Testy reguł punktacji.

## Uruchomienie

```bash
npm.cmd test
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
  { "name": "Adam Nowak", "category": "Open" },
  { "name": "Bartek Kowalski" }
]
```

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
