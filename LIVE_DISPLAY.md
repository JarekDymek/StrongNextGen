# Live Display — uruchomienie

Warstwa telebimu jest niezależna od lokalnego zapisu i scoringu. Przechowuje w Redisie ostatni publiczny snapshot i aktualne media sesji. Sesja wygasa po 48 godzinach bez publikacji. Nie przechowuje historii transmisji.

## Konfiguracja istniejącego projektu Vercel

Połącz projekt strong-next-gen z Upstash Redis przez Vercel Marketplace. Udostępnij funkcjom zmienne:
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN

Obsługiwane są również nazwy nadawane przez integrację Vercel: KV_REST_API_URL oraz KV_REST_API_TOKEN. Nie używaj tokenu tylko do odczytu — backend zapisuje stan. Klucze pozostają wyłącznie w środowisku serwera.
Opcjonalne ALLOWED_ORIGIN wskazuje origin PWA; domyślnie https://jarekdymek.github.io. Origin bieżącego wdrożenia Vercel także jest dozwolony.

REST API: https://upstash.com/docs/redis/features/restapi

Wdrożenie musi zawierać api/, lib/, src/ oraz display/ i istniejące assets/. Publiczny adres:
https://strong-next-gen.vercel.app/display/

Kod sesji jest dopisywany przez iPada: /display/?room=KOD_SESJI.
Zmiany źródeł nie są potwierdzeniem wdrożenia ani skonfigurowania Redis. Produkcja wymaga osobnego uruchomienia wdrożenia.

## iPad i operator

1. Otwórz aktualną wersję PWA. Na dole rozwiń „Live Display — telebim”.
2. Wybierz „Uruchom sesję”. iPad zachowa osobny sekret publikacji; nie trafia on do linku operatora ani eksportu zawodów.
3. Przekaż operatorowi wyświetlony link HTTPS albo 10-znakowy kod. Operator nie loguje się.
4. Wpisuj i podsumowuj wyniki jak dotychczas. „Wyślij teraz” wymusza odczyt najnowszego stanu, z zachowaniem limitu jednej wysyłki na sekundę.
5. „Przerwa” włącza rotację; „Wznów LIVE” przywraca automatyczny tryb. Zmiana konkurencji przywraca automatyczny tryb.
6. Zostaw PWA na pierwszym planie i iPada odblokowanego — iPadOS może wstrzymać timery w tle. Wznowienie aplikacji wyzwala synchronizację.

Podsumowanie konkurencji jest widoczne przez 12 sekund, następnie rotują overall, wcześniejsze konkurencje i zapowiedź następnej. Długie tabele mają strony po 8 zawodników, zmieniane co 8 sekund. Zakończenie zawodów pokazuje końcowy ranking.

Po zerwaniu sieci iPad zachowuje tylko informację, że należy wysłać aktualny stan. Serwer odrzuca spóźnione żądania. Po utracie odpowiedzi ponownie wysyłany jest pełny najnowszy stan, co chroni również korekty cofające wynik do wcześniejszej wartości.
Telebim zachowuje ostatni poprawny obraz, także po błędzie API; przy zmianach zapisuje kopię lokalną na wypadek przeładowania. Zdjęcia i logo idą ponownie tylko po zmianie lub niepotwierdzonej wysyłce. Heartbeat i niezmieniony odczyt nie zawierają mediów ani pełnego snapshotu.

Przycisk „Zatrzymaj transmisję” zatrzymuje publikowanie z tego iPada. Telebim pozostawia ostatni stan. Wygasłą sesję należy zatrzymać i uruchomić nową.
Limity: do 100 zawodników i 100 konkurencji w snapshotcie, do 3 MB na publikację, 10 nowych sesji na godzinę z jednego adresu IP. Kod ma 50 bitów losowości; sekret publikacji 256 bitów.

## Sprawdzenie przed zawodami

- iPad: PWA na hotspocie; telebim: inna sieć, link bez logowania.
- Kod/link z iPada otwiera właściwą sesję; zdjęcia i logo są widoczne.
- 039, 015, 005 pokazują odpowiednio 39 m, 15 m, 5 m; 15,24 pokazuje 15,24 s; brak ukończenia pokazuje DNF.
- Wyniki zmieniają się po około sekundzie; ostatnio zmieniony zawodnik jest wyróżniony.
- Podsumowanie, przerwa, zmiana konkurencji i końcowy ranking działają.
- Odłącz hotspot, wpisz kilka wyników, podsumuj i przejdź dalej. Lokalna praca pozostaje płynna, telebim zachowuje obraz.
- Przywróć hotspot. Telebim dostaje najnowszy stan bez odtwarzania starej kolejki.
- Na ekranie 16:9 sprawdź wszystkie strony długiej tabeli i czytelność nazwisk.
- Próba POST bez sekretu lub ze złym sekretem jest odrzucana.

## Weryfikacja zmian

node --test tests/live-display.test.js — 12 testów PASS.
Sprawdzono składnię zmienionych app.js, sw.js i display.js oraz lokalny widok tabeli w przeglądarce.
Testy endpointów używają zastępczego wykonawcy komend Redis; test na rzeczywistym Vercel/Upstash i dwóch urządzeniach pozostaje częścią powyższej checklisty.
scoring.js, storage.js, dane zawodników oraz pozostałe moduły nie zostały zmienione.

