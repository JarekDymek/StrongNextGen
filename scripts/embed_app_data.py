import argparse
import json
from pathlib import Path


def write_module(path, export_name, payload, header):
    content = f"{header}\nexport const {export_name} = " + json.dumps(
        payload,
        ensure_ascii=False,
        indent=2,
    ) + ";\n"
    path.write_text(content, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("competitors", type=Path)
    parser.add_argument("events", type=Path)
    parser.add_argument("season", type=Path)
    parser.add_argument("src_dir", type=Path)
    args = parser.parse_args()

    competitors = json.loads(args.competitors.read_text(encoding="utf-8"))
    events = json.loads(args.events.read_text(encoding="utf-8"))
    season = json.loads(args.season.read_text(encoding="utf-8"))
    args.src_dir.mkdir(parents=True, exist_ok=True)

    write_module(
        args.src_dir / "competitors.js",
        "DEFAULT_COMPETITORS",
        competitors,
        "// Generated from the canonical 2026 competitor database.",
    )
    write_module(
        args.src_dir / "events-data.js",
        "DEFAULT_EVENTS",
        events,
        "// Generated from the canonical 2026 competition database.",
    )
    write_module(
        args.src_dir / "season-data.js",
        "DEFAULT_SEASON",
        season,
        "// Generated from the verified 2026 Puchar Polski result sources.",
    )
    print(f"Embedded {len(competitors)} competitors, {len(events)} events and {len(season['events'])} season rounds.")


if __name__ == "__main__":
    main()
