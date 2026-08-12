import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const [seasonPath, competitorsPath, outputPath, previewDir] = process.argv.slice(2);
if (!seasonPath || !competitorsPath || !outputPath || !previewDir) {
  throw new Error("Usage: node build_season_workbook.mjs <season.json> <competitors.json> <output.xlsx> <preview-dir>");
}

const season = JSON.parse(await fs.readFile(seasonPath, "utf8"));
const competitors = JSON.parse(await fs.readFile(competitorsPath, "utf8"));
const competitorNames = new Set(competitors.map(competitor => competitor.name.toLocaleLowerCase("pl-PL")));
const seasonOnlyCompetitors = season.events
  .flatMap(event => event.ranking)
  .filter(result => {
    const key = result.name.toLocaleLowerCase("pl-PL");
    if (competitorNames.has(key)) return false;
    competitorNames.add(key);
    return true;
  })
  .map(result => ({
    id: result.competitorId,
    name: result.name,
    categories: ["Puchar Polski"],
    residence: "",
    height: "",
    weight: "",
    dataWarnings: ["Dane profilu do uzupełnienia."],
  }));
const workbookCompetitors = [...competitors, ...seasonOnlyCompetitors];
const workbook = Workbook.create();
const MAX_EVENTS = 20;
const MAX_COMPETITORS = 50;
const MAX_RESULTS = 205;
const FIRST_DATA_ROW = 6;
const LAST_COMPETITOR_ROW = FIRST_DATA_ROW + MAX_COMPETITORS - 1;

const colors = {
  navy: "#0B2545",
  blue: "#1E5A85",
  paleBlue: "#EAF2F8",
  orange: "#F04A23",
  paleOrange: "#FFF1E8",
  green: "#168354",
  paleGreen: "#E5F4EB",
  gold: "#F3C74F",
  paleGold: "#FFF6CF",
  ink: "#162333",
  muted: "#5D6D7E",
  line: "#C9D6E2",
  white: "#FFFFFF",
};

function columnName(number) {
  let result = "";
  let value = number;
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function displayDate(isoDate) {
  return String(isoDate || "").split("-").reverse().join(".");
}

function baseSheet(name, lastColumn, title, subtitle) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  const titleRange = sheet.getRange(`A1:${lastColumn}1`);
  titleRange.merge();
  titleRange.values = [[title]];
  titleRange.format = {
    fill: colors.navy,
    font: { bold: true, color: colors.white, size: 16 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
  };
  titleRange.format.rowHeight = 30;
  const subtitleRange = sheet.getRange(`A2:${lastColumn}3`);
  subtitleRange.merge();
  subtitleRange.values = [[subtitle]];
  subtitleRange.format = {
    fill: colors.paleBlue,
    font: { italic: true, color: colors.ink, size: 10 },
    wrapText: true,
    verticalAlignment: "center",
  };
  subtitleRange.format.rowHeight = 24;
  return sheet;
}

function styleHeader(range) {
  range.format = {
    fill: colors.blue,
    font: { bold: true, color: colors.white, size: 10 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: colors.white },
  };
  range.format.rowHeight = 44;
}

function styleGrid(range) {
  range.format = {
    font: { color: colors.ink, size: 10 },
    verticalAlignment: "center",
    borders: { preset: "all", style: "thin", color: colors.line },
  };
}

const classification = baseSheet(
  "Klasyfikacja",
  "Z",
  "PUCHAR POLSKI STRONGMAN TYBERIAN TEAM 2026 - KLASYFIKACJA GENERALNA",
  "Punktacja 5-4-3-2-1 za miejsca 1-5. Do sumy sezonu liczą się maksymalnie cztery najlepsze starty zawodnika. Wspólna liczba punktów oznacza wspólne miejsce.",
);
const calculation = baseSheet(
  "Obliczenia",
  "AA",
  "OBLICZENIA KLASYFIKACJI GENERALNEJ",
  "Arkusz pomocniczy. Formuły pobierają wyniki z arkusza Wyniki zawodów, zliczają starty i wybierają cztery najwyższe zdobycze punktowe.",
);
const results = baseSheet(
  "Wyniki zawodów",
  "I",
  "WYNIKI ZAWODÓW - DANE WEJŚCIOWE",
  "Wpisuj numer zawodów, lokatę 1-5, nazwisko ze źródła, nazwisko ujednolicone, sumę punktów konkurencji i nazwę pliku. Punkty sezonu obliczają się automatycznie.",
);
const eventsSheet = baseSheet(
  "Zawody",
  "F",
  "REJESTR ZAWODÓW - SEZON 2026",
  `Wpisano chronologicznie ${season.events.length} imprez. Pozostałe wiersze są gotowe na kolejne zawody sezonu 2026.`,
);
const competitorsSheet = baseSheet(
  "Zawodnicy",
  "F",
  "UJEDNOLICONA BAZA ZAWODNIKÓW",
  "Nazwiska w tej tabeli są kluczami obliczeń. Nowego zawodnika dopisz w pierwszym pustym wierszu i użyj identycznej pisowni w arkuszu Wyniki zawodów.",
);
const instruction = baseSheet(
  "Instrukcja",
  "F",
  "INSTRUKCJA AKTUALIZACJI SEZONU 2026",
  "Plik jest edytowalny i przygotowany na kolejne imprezy. Najbezpieczniej uzupełniać go w kolejności opisanej poniżej.",
);

eventsSheet.getRange("A5:F5").values = [["Nr", "Data", "Miejscowość", "Nazwa ujednolicona", "Status", "Plik źródłowy"]];
styleHeader(eventsSheet.getRange("A5:F5"));
const eventRows = Array.from({ length: MAX_EVENTS }, (_, index) => {
  const event = season.events[index];
  return event
    ? [event.number, displayDate(event.date), event.location, event.name, "Rozegrane", event.sourceFile]
    : [index + 1, null, "", "", "Planowane", ""];
});
eventsSheet.getRange(`A6:F${FIRST_DATA_ROW + MAX_EVENTS - 1}`).values = eventRows;
styleGrid(eventsSheet.getRange(`A6:F${FIRST_DATA_ROW + MAX_EVENTS - 1}`));
eventsSheet.getRange(`A6:A${FIRST_DATA_ROW + MAX_EVENTS - 1}`).format.horizontalAlignment = "center";
eventsSheet.getRange("A:A").format.columnWidth = 7;
eventsSheet.getRange("B:B").format.columnWidth = 14;
eventsSheet.getRange("C:C").format.columnWidth = 20;
eventsSheet.getRange("D:D").format.columnWidth = 30;
eventsSheet.getRange("E:E").format.columnWidth = 14;
eventsSheet.getRange("F:F").format.columnWidth = 34;
eventsSheet.getRange(`A6:F${FIRST_DATA_ROW + season.events.length - 1}`).format.fill = colors.paleGold;
eventsSheet.freezePanes.freezeRows(5);

results.getRange("A5:I5").values = [[
  "Nr zawodów", "Data", "Miejscowość", "Lokata", "Zapis w źródle",
  "Zawodnik ujednolicony", "Punkty sezonu", "Suma pkt konkurencji", "Plik źródłowy",
]];
styleHeader(results.getRange("A5:I5"));
const sourceRows = season.events.flatMap(event => event.ranking.map(result => ({ event, result })));
const resultRows = Array.from({ length: MAX_RESULTS - FIRST_DATA_ROW + 1 }, (_, index) => {
  const source = sourceRows[index];
  if (!source) return ["", "", "", "", "", "", "", "", ""];
  return [
    source.event.number,
    displayDate(source.event.date),
    source.event.location,
    source.result.position,
    source.result.sourceName,
    source.result.name,
    source.result.seasonPoints,
    source.result.competitionPoints,
    source.event.sourceFile,
  ];
});
results.getRange(`A6:I${MAX_RESULTS}`).values = resultRows;
const firstFutureResultRow = FIRST_DATA_ROW + sourceRows.length;
results.getRange(`B${firstFutureResultRow}`).formulas = [[`=IFERROR(VLOOKUP(A${firstFutureResultRow},Zawody!$A$6:$F$25,2,FALSE),"")`]];
results.getRange(`B${firstFutureResultRow}:B${MAX_RESULTS}`).fillDown();
results.getRange(`C${firstFutureResultRow}`).formulas = [[`=IFERROR(VLOOKUP(A${firstFutureResultRow},Zawody!$A$6:$F$25,3,FALSE),"")`]];
results.getRange(`C${firstFutureResultRow}:C${MAX_RESULTS}`).fillDown();
results.getRange(`G${firstFutureResultRow}`).formulas = [[`=IF(OR(A${firstFutureResultRow}="",D${firstFutureResultRow}=""),"",IF(AND(D${firstFutureResultRow}>=1,D${firstFutureResultRow}<=5),6-D${firstFutureResultRow},0))`]];
results.getRange(`G${firstFutureResultRow}:G${MAX_RESULTS}`).fillDown();
styleGrid(results.getRange(`A6:I${MAX_RESULTS}`));
results.getRange(`A6:A${MAX_RESULTS}`).format.horizontalAlignment = "center";
results.getRange(`D6:D${MAX_RESULTS}`).format.horizontalAlignment = "center";
results.getRange(`G6:H${MAX_RESULTS}`).format.horizontalAlignment = "center";
results.getRange(`G6:G${MAX_RESULTS}`).setNumberFormat("0");
results.getRange(`H6:H${MAX_RESULTS}`).setNumberFormat("0.00");
results.getRange("A:A").format.columnWidth = 11;
results.getRange("B:B").format.columnWidth = 14;
results.getRange("C:C").format.columnWidth = 18;
results.getRange("D:D").format.columnWidth = 10;
results.getRange("E:E").format.columnWidth = 26;
results.getRange("F:F").format.columnWidth = 26;
results.getRange("G:G").format.columnWidth = 14;
results.getRange("H:H").format.columnWidth = 18;
results.getRange("I:I").format.columnWidth = 30;
results.getRange(`A6:I${firstFutureResultRow - 1}`).format.fill = colors.paleGold;
results.getRange(`G6:G${MAX_RESULTS}`).format.fill = colors.paleBlue;
results.getRange(`E6:F${firstFutureResultRow - 1}`).format.wrapText = true;
results.freezePanes.freezeRows(5);
results.freezePanes.freezeColumns(1);
results.dataValidations.add({ range: `A6:A${MAX_RESULTS}`, rule: { type: "whole", operator: "between", formula1: 1, formula2: MAX_EVENTS } });
results.dataValidations.add({ range: `D6:D${MAX_RESULTS}`, rule: { type: "whole", operator: "between", formula1: 1, formula2: 5 } });

competitorsSheet.getRange("A5:F5").values = [["Zawodnik", "Puchar Polski", "Miejscowość", "Wzrost", "Waga", "Status danych"]];
styleHeader(competitorsSheet.getRange("A5:F5"));
const competitorRows = Array.from({ length: MAX_COMPETITORS }, (_, index) => {
  const competitor = workbookCompetitors[index];
  if (!competitor) return ["", "", "", "", "", ""];
  const warnings = competitor.dataWarnings?.join(" ") || "Zweryfikowane ze źródła";
  return [
    competitor.name,
    competitor.categories?.includes("Puchar Polski") ? "Tak" : "Nie",
    competitor.residence || "",
    competitor.height || "",
    competitor.weight || "",
    warnings,
  ];
});
competitorsSheet.getRange(`A6:F${LAST_COMPETITOR_ROW}`).values = competitorRows;
styleGrid(competitorsSheet.getRange(`A6:F${LAST_COMPETITOR_ROW}`));
competitorsSheet.getRange("A:A").format.columnWidth = 28;
competitorsSheet.getRange("B:B").format.columnWidth = 15;
competitorsSheet.getRange("C:C").format.columnWidth = 26;
competitorsSheet.getRange("D:E").format.columnWidth = 11;
competitorsSheet.getRange("F:F").format.columnWidth = 35;
competitorsSheet.getRange(`A6:F${FIRST_DATA_ROW + workbookCompetitors.length - 1}`).format.fill = colors.paleGold;
competitorsSheet.freezePanes.freezeRows(5);

const eventHeaderValues = Array.from({ length: MAX_EVENTS }, (_, index) => index + 1);
calculation.getRange("A4:AA4").values = [["", "", "", ...eventHeaderValues, "", "", "", ""]];
calculation.getRange("A5:AA5").values = [[
  "M-ce", "Zawodnik", "Liczba startów",
  ...eventHeaderValues.map(number => `${String(number).padStart(2, "0")}\n${season.events[number - 1]?.location || `Slot ${number}`}\n${season.events[number - 1]?.date?.split("-").reverse().join(".") || ""}`),
  "Suma wszystkich", "Suma 4 najlepszych", "Punkty odrzucone", "Klucz sortowania",
]];
styleHeader(calculation.getRange("A5:AA5"));
calculation.getRange("D4:W4").format.font = { color: colors.white, size: 1 };
calculation.getRange("D4:W4").format.rowHeight = 2;
for (let row = FIRST_DATA_ROW; row <= LAST_COMPETITOR_ROW; row += 1) {
  calculation.getRange(`A${row}`).formulas = [[`=IF(B${row}="","",1+COUNTIF($Y$6:$Y$55,">"&Y${row}))`]];
  calculation.getRange(`B${row}`).formulas = [[`=IF(COUNTIF('Wyniki zawodów'!$F$6:$F$205,Zawodnicy!A${row})=0,"",Zawodnicy!A${row})`]];
  calculation.getRange(`C${row}`).formulas = [[`=IF(B${row}="","",COUNTIF('Wyniki zawodów'!$F$6:$F$205,B${row}))`]];
  for (let eventIndex = 0; eventIndex < MAX_EVENTS; eventIndex += 1) {
    const column = columnName(4 + eventIndex);
    calculation.getRange(`${column}${row}`).formulas = [[
      `=IF($B${row}="",0,SUMIFS('Wyniki zawodów'!$G$6:$G$205,'Wyniki zawodów'!$F$6:$F$205,$B${row},'Wyniki zawodów'!$A$6:$A$205,${column}$4))`,
    ]];
  }
  calculation.getRange(`X${row}`).formulas = [[`=IF(B${row}="","",SUM(D${row}:W${row}))`]];
  calculation.getRange(`Y${row}`).formulas = [[`=IF(B${row}="","",LARGE(D${row}:W${row},1)+LARGE(D${row}:W${row},2)+LARGE(D${row}:W${row},3)+LARGE(D${row}:W${row},4))`]];
  calculation.getRange(`Z${row}`).formulas = [[`=IF(B${row}="","",X${row}-Y${row})`]];
  calculation.getRange(`AA${row}`).formulas = [[`=IF(B${row}="",0,Y${row}*1000+(100-ROW()))`]];
}
styleGrid(calculation.getRange(`A6:AA${LAST_COMPETITOR_ROW}`));
calculation.getRange(`D6:W${LAST_COMPETITOR_ROW}`).setNumberFormat("0;-0;;@");
calculation.getRange(`Y6:Y${LAST_COMPETITOR_ROW}`).format.fill = colors.paleGreen;
calculation.getRange("A:A").format.columnWidth = 8;
calculation.getRange("B:B").format.columnWidth = 27;
calculation.getRange("C:C").format.columnWidth = 12;
calculation.getRange("D:W").format.columnWidth = 12;
calculation.getRange("X:Z").format.columnWidth = 17;
calculation.getRange("AA:AA").format.columnWidth = 2;
calculation.freezePanes.freezeRows(5);
calculation.freezePanes.freezeColumns(3);

classification.getRange("A4:Z4").values = [["", "", "", ...eventHeaderValues, "", "", ""]];
classification.getRange("A5:Z5").values = [[
  "M-ce", "Zawodnik", "Liczba startów",
  ...eventHeaderValues.map(number => `${String(number).padStart(2, "0")}\n${season.events[number - 1]?.location || `Slot ${number}`}\n${season.events[number - 1]?.date?.split("-").reverse().join(".") || ""}`),
  "Suma wszystkich", "Suma 4 najlepszych", "Punkty odrzucone",
]];
styleHeader(classification.getRange("A5:Z5"));
classification.getRange("D4:W4").format.font = { color: colors.white, size: 1 };
classification.getRange("D4:W4").format.rowHeight = 2;
for (let row = FIRST_DATA_ROW; row <= LAST_COMPETITOR_ROW; row += 1) {
  const order = row - FIRST_DATA_ROW + 1;
  classification.getRange(`B${row}`).formulas = [[
    `=IFERROR(INDEX(Obliczenia!$B$6:$B$55,MATCH(LARGE(Obliczenia!$AA$6:$AA$55,${order}),Obliczenia!$AA$6:$AA$55,0)),"")`,
  ]];
  classification.getRange(`A${row}`).formulas = [[`=IF(B${row}="","",1+COUNTIF($Y$6:$Y$55,">"&Y${row}))`]];
  classification.getRange(`C${row}`).formulas = [[`=IF(B${row}="","",INDEX(Obliczenia!$C$6:$C$55,MATCH(B${row},Obliczenia!$B$6:$B$55,0)))`]];
  for (let eventIndex = 0; eventIndex < MAX_EVENTS; eventIndex += 1) {
    const column = columnName(4 + eventIndex);
    classification.getRange(`${column}${row}`).formulas = [[
      `=IF(B${row}="","",INDEX(Obliczenia!$${column}$6:$${column}$55,MATCH(B${row},Obliczenia!$B$6:$B$55,0)))`,
    ]];
  }
  for (const column of ["X", "Y", "Z"]) {
    classification.getRange(`${column}${row}`).formulas = [[
      `=IF(B${row}="","",INDEX(Obliczenia!$${column}$6:$${column}$55,MATCH(B${row},Obliczenia!$B$6:$B$55,0)))`,
    ]];
  }
}
styleGrid(classification.getRange(`A6:Z${LAST_COMPETITOR_ROW}`));
classification.getRange(`D6:W${LAST_COMPETITOR_ROW}`).setNumberFormat("0;-0;;@");
classification.getRange(`Y6:Y${LAST_COMPETITOR_ROW}`).format.fill = colors.paleGreen;
classification.getRange(`Z6:Z${LAST_COMPETITOR_ROW}`).format.fill = colors.paleOrange;
classification.getRange("A:A").format.columnWidth = 8;
classification.getRange("B:B").format.columnWidth = 28;
classification.getRange("C:C").format.columnWidth = 12;
classification.getRange("D:W").format.columnWidth = 12;
classification.getRange("X:Z").format.columnWidth = 17;
classification.freezePanes.freezeRows(5);
classification.freezePanes.freezeColumns(3);
classification.getRange(`A6:Z6`).format.fill = colors.paleGold;
classification.getRange(`A6:A${LAST_COMPETITOR_ROW}`).format.font = { bold: true, color: colors.navy };

instruction.getRange("A5:F5").values = [["Krok", "Działanie", "Miejsce", "Co wpisać", "Kontrola", "Ważne"]];
styleHeader(instruction.getRange("A5:F5"));
instruction.getRange("A6:F12").values = [
  [1, "Dodaj imprezę", "Zawody", "Data, miejscowość, nazwa i plik źródłowy", "Nadaj kolejny numer", "Nie zmieniaj numerów rozegranych imprez"],
  [2, "Dodaj nowego zawodnika", "Zawodnicy", "Jedna, ujednolicona pisownia imienia i nazwiska", "Sprawdź duplikaty", "Ta sama pisownia musi trafić do wyników"],
  [3, "Dodaj klasyfikację końcową", "Wyniki zawodów", "Pięć wierszy: lokaty 1-5", "Punkty sezonu wyliczą się automatycznie", "Przy remisie zachowaj tę samą lokatę"],
  [4, "Sprawdź klasyfikację", "Klasyfikacja", "Bez ręcznego wpisywania", "Suma 4 najlepszych ma zielone tło", "Punkty odrzucone są pokazane osobno"],
  [5, "Zachowaj kopię", "Plik", "Nowa nazwa z aktualną datą", "Otwórz plik ponownie", "Nie nadpisuj jedynej kopii"],
  [6, "Import do aplikacji", "Sezon", "Plik JSON wyeksportowany z aplikacji", "Porównaj liczbę imprez", "PDF nie jest formatem wymiany danych"],
  [7, "Rozbieżność danych", "Audyt", "Wróć do oryginalnego pliku wyników", "Nie zgaduj nazwiska ani lokaty", "Dwie daty urodzenia wymagają weryfikacji"],
];
styleGrid(instruction.getRange("A6:F12"));
instruction.getRange("A6:F12").format.wrapText = true;
instruction.getRange("A:A").format.columnWidth = 8;
instruction.getRange("B:B").format.columnWidth = 24;
instruction.getRange("C:C").format.columnWidth = 20;
instruction.getRange("D:D").format.columnWidth = 38;
instruction.getRange("E:E").format.columnWidth = 35;
instruction.getRange("F:F").format.columnWidth = 42;
instruction.freezePanes.freezeRows(5);

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(previewDir, { recursive: true });
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);

const inspect = await workbook.inspect({ kind: "table", range: "Klasyfikacja!A1:Z25", include: "values,formulas" });
await fs.writeFile(path.join(previewDir, "klasyfikacja-inspect.ndjson"), `${inspect.ndjson ?? inspect}\n`, "utf8");
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#(REF!|DIV/0!|VALUE!|NAME\\?|N/A|NUM!)",
  options: { useRegex: true, maxResults: 200 },
});
await fs.writeFile(path.join(previewDir, "formula-errors.ndjson"), `${errors.ndjson ?? errors}\n`, "utf8");

for (const sheetName of ["Klasyfikacja", "Obliczenia", "Wyniki zawodów", "Zawody", "Zawodnicy", "Instrukcja"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  const filename = sheetName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  await fs.writeFile(path.join(previewDir, `${filename}.png`), new Uint8Array(await preview.arrayBuffer()));
}

console.log(`Workbook written to ${outputPath}`);
