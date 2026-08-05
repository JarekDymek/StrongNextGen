import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [inputPath, outputDir] = process.argv.slice(2);
if (!inputPath || !outputDir) {
  throw new Error("Usage: node inspect_reference_workbook.mjs <input.xlsx> <output-dir>");
}

await fs.mkdir(outputDir, { recursive: true });
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const sheets = await workbook.inspect({ kind: "sheet", include: "id,name" });
await fs.writeFile(
  path.join(outputDir, "reference-sheet-list.ndjson"),
  `${sheets.ndjson ?? sheets}\n`,
  "utf8",
);

const sheetRows = String(sheets.ndjson ?? sheets)
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

for (const sheetInfo of sheetRows) {
  const sheetName = sheetInfo.name;
  const slug = sheetName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const detail = await workbook.inspect({
    kind: "table",
    range: `${sheetName}!A1:AZ200`,
    include: "values,formulas,styles",
  });
  await fs.writeFile(
    path.join(outputDir, `reference-${slug}.ndjson`),
    `${detail.ndjson ?? detail}\n`,
    "utf8",
  );
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1.25,
    format: "png",
  });
  await fs.writeFile(
    path.join(outputDir, `reference-${slug}.png`),
    new Uint8Array(await preview.arrayBuffer()),
  );
}

console.log(`Inspected and rendered ${sheetRows.length} sheets.`);
