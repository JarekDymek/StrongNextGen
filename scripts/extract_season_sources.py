import argparse
import json
from html.parser import HTMLParser
from pathlib import Path

import pdfplumber


class ResultsHtmlParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.capture = []
        self.text_parts = []
        self.headings = []
        self.tables = []
        self.current_table = None
        self.current_row = None
        self.current_cell = None

    def handle_starttag(self, tag, attrs):
        if tag in {"title", "h1", "h2", "h3", "h4", "p"}:
            self.capture.append({"tag": tag, "parts": []})
        if tag == "table":
            self.current_table = []
        elif tag == "tr" and self.current_table is not None:
            self.current_row = []
        elif tag in {"th", "td"} and self.current_row is not None:
            self.current_cell = []
        elif tag == "br":
            self._append_text("\n")

    def handle_endtag(self, tag):
        if tag in {"th", "td"} and self.current_cell is not None:
            self.current_row.append(clean_text(" ".join(self.current_cell)))
            self.current_cell = None
        elif tag == "tr" and self.current_row is not None:
            if any(self.current_row):
                self.current_table.append(self.current_row)
            self.current_row = None
        elif tag == "table" and self.current_table is not None:
            if self.current_table:
                self.tables.append(self.current_table)
            self.current_table = None

        if self.capture and self.capture[-1]["tag"] == tag:
            item = self.capture.pop()
            text = clean_text(" ".join(item["parts"]))
            if text:
                self.headings.append({"tag": tag, "text": text})

    def handle_data(self, data):
        self._append_text(data)

    def _append_text(self, data):
        if self.current_cell is not None:
            self.current_cell.append(data)
        if self.capture:
            self.capture[-1]["parts"].append(data)


def clean_text(value):
    return " ".join(str(value or "").replace("\xa0", " ").split())


def extract_html(path):
    parser = ResultsHtmlParser()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    return {"kind": "html", "headings": parser.headings, "tables": parser.tables}


def extract_pdf(path):
    pages = []
    with pdfplumber.open(path) as pdf:
        for index, page in enumerate(pdf.pages, start=1):
            tables = []
            for table in page.extract_tables() or []:
                cleaned = [[clean_text(cell) for cell in row] for row in table if row]
                if cleaned:
                    tables.append(cleaned)
            pages.append({
                "page": index,
                "text": page.extract_text(x_tolerance=2, y_tolerance=3) or "",
                "tables": tables,
            })
    return {"kind": "pdf", "pages": pages}


def extract(path):
    magic = path.read_bytes()[:8]
    if magic.startswith(b"%PDF"):
        payload = extract_pdf(path)
    else:
        payload = extract_html(path)
    return {"source": str(path), "name": path.name, **payload}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    sources = [extract(path) for path in sorted(args.source_dir.iterdir()) if path.is_file()]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Extracted {len(sources)} files to {args.output}")


if __name__ == "__main__":
    main()
