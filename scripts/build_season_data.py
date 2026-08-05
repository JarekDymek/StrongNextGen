import argparse
import json
import re
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path


SOURCE_EVENTS = {
    "SIEWIERZ 1.05.2026": ("2026-05-01", "Siewierz"),
    "Czerwonak 30.05": ("2026-05-30", "Czerwonak"),
    "Kleszczów 1.06": ("2026-06-01", "Kleszczów"),
    "Ruciane-Nida 06.06.2026 r": ("2026-06-06", "Ruciane-Nida"),
    "Prabuty 07.06.2026 r": ("2026-06-07", "Prabuty"),
    "Tuszyn 12.06.2026 r": ("2026-06-12", "Tuszyn"),
    "Busko-Zdroj 27.06.2026 r": ("2026-06-27", "Busko-Zdrój"),
    "KLECZEW · 26.07.2026": ("2026-07-26", "Kleczew"),
    "LUBAWKA · 26.07.2026": ("2026-07-26", "Lubawka"),
    "RADWANICE 2.08.2026 r": ("2026-08-02", "Radwanice"),
}

COMPETITOR_ALIASES = {
    "adam wadolowski": "Adam Wądołowski",
    "bartlomiej babol": "Bartłomiej Bąbol",
    "bartlomiej posyoj": "Bartosz Postój",
    "bartosz postoj": "Bartosz Postój",
    "jakub szczechowski": "Jakub Szczechowski",
    "jaroslaw dymek": "Jarosław Dymek",
    "kamil lyszkowski": "Kamil Łyszkowski",
    "karol kolaszewski": "Karol Kołaszewski",
    "krystian klawikowski": "Krystian Klawikowski",
    "krzysztof kacnerski": "Krzysztof Kacnerski",
    "lukasz kieliszkowski": "Łukasz Kieliszkowski",
    "marcin schabowski": "Marcin Schabowski",
    "marcin stankiewicz": "Marcin Stankiewicz",
    "mariusz pachut": "Mariusz Pachut",
    "michal maruszewski": "Michał Maruszewski",
    "oskar ziolkowski": "Oskar Ziółkowski",
    "pawel kostrzewski": "Paweł Kostrzewski",
    "pawel piskorz": "Paweł Piskorz",
    "przemyslaw marczewski": "Przemysław Marczewski",
    "rafal sojc": "Rafał Sojc",
    "tomasz lademann": "Tomasz Lademann",
}

KNOWN_TYPES = {
    "Axel Gryf 130 kg - 60 sek.": "high",
    "Axel Gryf 130 kg - 90 sek.": "high",
    "Kegi x 6 - przerzucanie nad poprzeczką": "low",
    "Kule": "low",
    "Łączona: 4 worki + kula przez Yoke": "low",
    "Łączona barkowa: belka 140 kg, Axel 130 kg i hantel 90 kg": "low",
    "Łączona: walizki + Yoke": "low",
    "Łączona: worki + kowadło": "low",
    "Martwy ciąg - auto na platformie": "high",
    "Martwy ciąg (powtórzenia)": "high",
    "Martwy ciąg (powtórzenia) - boczne uchwyty": "high",
    "Martwy ciąg na platformie": "high",
    "Nosidło 300 kg - 2 x 20 m": "low",
    "Przeciąganie auta": "low",
    "Przeciąganie auta w siadzie": "low",
    "Przeciąganie łodzi w siadzie": "low",
    "Przerzucanie kuli przez Yoke - 140 kg, 60 sek.": "high",
    "Przerzucanie opony 360 kg - 6 obrotów": "low",
    "Przerzucanie opony 360 kg - 8 obrotów": "low",
    "Przerzucanie worków nad poprzeczką - 20-30 kg": "low",
    "Schody": "low",
    "Spacer Buszmena 360 kg - 20 m + załadunek": "low",
    "Spacer Buszmena 380 kg - 20 m": "low",
    "Spacer Farmera 130 kg - na dystans": "high",
    "Spacer Farmera 140 kg - 2 x 20 m": "low",
    "Spacer Farmera 140 kg - na dystans": "high",
    "Spacer Farmera na dystans": "high",
    "Tir w siadzie": "low",
    "Uchwyt Herkulesa": "high",
    "Uchwyt Herkulesa - auto": "high",
    "Waga płaczu przodem": "high",
    "Worki": "low",
    "Worki - załadunek 3 x 100 kg": "low",
    "Wyciskanie belek 140, 150 i 160 kg": "low",
    "Wyciskanie belki": "high",
    "Wyciskanie belki 140 kg - 60 sek.": "high",
    "Wyciskanie platformy na barki": "high",
    "Zegar": "high",
}


def ascii_key(value):
    value = str(value or "").translate(str.maketrans({
        "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "Ø": "O", "ø": "o",
    }))
    value = unicodedata.normalize("NFKD", value)
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = value.casefold()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


def slug(value):
    return ascii_key(value).replace(" ", "-")


def canonical_competitor(raw_name):
    value = re.split(r"\s+\(i\)\s+", str(raw_name or ""), maxsplit=1)[0]
    key = ascii_key(value)
    if key in COMPETITOR_ALIASES:
        return COMPETITOR_ALIASES[key]
    return " ".join(part.capitalize() for part in value.split())


def strip_event_decorations(raw_name):
    value = re.sub(r"^\s*\d+\.\s*", "", str(raw_name or "").strip())
    value = re.sub(r"\s*\((?:FINAL|FINAŁ)\)\s*", " ", value, flags=re.I)
    value = re.sub(r"\s*\((?:Więcej|Mniej)\s*=\s*lepiej\)\s*", " ", value, flags=re.I)
    return " ".join(value.split()).strip(" .")


def canonical_event_name(raw_name, event_type=""):
    clean = strip_event_decorations(raw_name)
    key = ascii_key(clean)

    if "axel gryf 130" in key:
        return "Axel Gryf 130 kg - 90 sek." if "90 sek" in key else "Axel Gryf 130 kg - 60 sek."
    if key == "kule":
        return "Kule"
    if "kegi" in key and "6" in key:
        return "Kegi x 6 - przerzucanie nad poprzeczką"
    if "laczona" in key and "4 worki" in key and "kula" in key:
        return "Łączona: 4 worki + kula przez Yoke"
    if "laczona" in key and "barkowa" in key:
        return "Łączona barkowa: belka 140 kg, Axel 130 kg i hantel 90 kg"
    if "laczona" in key and "walizki" in key and "yoke" in key:
        return "Łączona: walizki + Yoke"
    if "laczona" in key and "worki" in key and "kowad" in key:
        return "Łączona: worki + kowadło"
    if "martwy ciag" in key and "boczne" in key:
        return "Martwy ciąg (powtórzenia) - boczne uchwyty"
    if "martwy ciag" in key and "auto" in key and "platform" in key:
        return "Martwy ciąg - auto na platformie"
    if "martwy ciag" in key and "platform" in key:
        return "Martwy ciąg na platformie"
    if "martwy ciag" in key:
        return "Martwy ciąg (powtórzenia)"
    if "nosidlo" in key and "300" in key:
        return "Nosidło 300 kg - 2 x 20 m"
    if "przeciaganie lodzi" in key:
        return "Przeciąganie łodzi w siadzie"
    if "przeciaganie auta" in key and "siad" in key:
        return "Przeciąganie auta w siadzie"
    if "przeciaganie auta" in key:
        return "Przeciąganie auta"
    if "kuli" in key and "yoke" in key and "140" in key:
        return "Przerzucanie kuli przez Yoke - 140 kg, 60 sek."
    if "opony" in key and "360" in key:
        return "Przerzucanie opony 360 kg - 8 obrotów" if "8 obrot" in key else "Przerzucanie opony 360 kg - 6 obrotów"
    if "przerzucanie" in key and "work" in key and "poprzeczk" in key:
        return "Przerzucanie worków nad poprzeczką - 20-30 kg"
    if key == "schody":
        return "Schody"
    if "spacer buszmena" in key and "360" in key and "zalad" in key:
        return "Spacer Buszmena 360 kg - 20 m + załadunek"
    if "spacer buszmena" in key:
        return "Spacer Buszmena 380 kg - 20 m"
    if "spacer farmera" in key:
        if "130" in key:
            return "Spacer Farmera 130 kg - na dystans"
        if "na dystans" in key and "140" not in key:
            return "Spacer Farmera na dystans"
        if "na dystans" in key or event_type == "high":
            return "Spacer Farmera 140 kg - na dystans"
        return "Spacer Farmera 140 kg - 2 x 20 m"
    if key == "tir w siadzie":
        return "Tir w siadzie"
    if "uchwyt herkulesa" in key and "auto" in key:
        return "Uchwyt Herkulesa - auto"
    if "uchwyt herkulesa" in key:
        return "Uchwyt Herkulesa"
    if "waga placzu" in key:
        return "Waga płaczu przodem"
    if key == "worki":
        return "Worki"
    if ("worki" in key and "zalad" in key) or key == "worki 3x100 kg":
        return "Worki - załadunek 3 x 100 kg"
    if "wyciskanie belek" in key and all(weight in key for weight in ("140", "150", "160")):
        return "Wyciskanie belek 140, 150 i 160 kg"
    if "wyciskanie platform" in key:
        return "Wyciskanie platformy na barki"
    if "wyciskanie belki" in key and "140" in key:
        return "Wyciskanie belki 140 kg - 60 sek."
    if "wyciskanie belki" in key:
        return "Wyciskanie belki"
    if key == "zegar":
        return "Zegar"
    return clean[:1].upper() + clean[1:]


def infer_event_type(raw_name, canonical_name):
    key = ascii_key(raw_name)
    if "wiecej lepiej" in key:
        return "high"
    if "mniej lepiej" in key:
        return "low"
    return KNOWN_TYPES.get(canonical_name, "low")


def find_final_table(source):
    if source["kind"] == "html":
        return source["tables"][0]
    return source["pages"][0]["tables"][0]


def find_competition_headings(source):
    if source["kind"] == "html":
        return [item["text"] for item in source.get("headings", []) if re.match(r"^\d+\.\s+", item["text"])]
    text = "\n".join(page.get("text", "") for page in source.get("pages", []))
    return re.findall(r"(?m)^\d+\.\s+.+$", text)


def parse_position(value):
    match = re.search(r"\d+", str(value or ""))
    return int(match.group()) if match else 0


def safe_float(value):
    try:
        return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return 0.0


def is_plausible_adult_birth_date(value):
    try:
        born = date.fromisoformat(value)
    except (TypeError, ValueError):
        return True
    return born <= date(2008, 12, 31)


def merge_profiles(raw_profiles, season_names):
    merged = {}
    audit = defaultdict(list)
    for raw in raw_profiles:
        canonical = canonical_competitor(raw.get("name"))
        audit[canonical].append(raw.get("name", ""))
        existing = merged.get(canonical, {})
        categories = []
        for item in [*(existing.get("categories") or []), *(raw.get("categories") or []), raw.get("category")]:
            if item and item not in categories:
                categories.append(item)
        profile = {
            "id": f"competitor-{slug(canonical)}",
            "name": canonical,
            "category": raw.get("category") or existing.get("category") or "",
            "categories": categories,
            "birthDate": raw.get("birthDate") or existing.get("birthDate") or "",
            "residence": raw.get("residence") or existing.get("residence") or "",
            "height": str(raw.get("height") or existing.get("height") or ""),
            "weight": str(raw.get("weight") or existing.get("weight") or ""),
            "notes": raw.get("notes") or existing.get("notes") or "",
            "photo": raw.get("photo") or existing.get("photo") or "",
        }
        merged[canonical] = profile

    for canonical in season_names:
        profile = merged.setdefault(canonical, {
            "id": f"competitor-{slug(canonical)}",
            "name": canonical,
            "category": "Puchar Polski",
            "categories": ["Puchar Polski"],
            "birthDate": "",
            "residence": "",
            "height": "",
            "weight": "",
            "notes": "",
            "photo": "",
        })
        if "Puchar Polski" not in profile["categories"]:
            profile["categories"].append("Puchar Polski")
        if not profile["category"]:
            profile["category"] = "Puchar Polski"

    warnings = []
    for profile in merged.values():
        if profile["birthDate"] and not is_plausible_adult_birth_date(profile["birthDate"]):
            warnings.append({
                "competitor": profile["name"],
                "field": "birthDate",
                "value": profile["birthDate"],
                "warning": "Data wskazuje na osobę niepełnoletnią i wymaga weryfikacji.",
            })
            profile["dataWarnings"] = ["Data urodzenia wymaga weryfikacji."]
    profiles = sorted(merged.values(), key=lambda item: ascii_key(item["name"]))
    return profiles, dict(audit), warnings


def calculate_standings(season_events, max_counted_starts=4):
    by_competitor = defaultdict(list)
    for season_event in season_events:
        for result in season_event["ranking"]:
            by_competitor[result["name"]].append({
                "eventId": season_event["id"],
                "eventNumber": season_event["number"],
                "date": season_event["date"],
                "location": season_event["location"],
                "position": result["position"],
                "points": result["seasonPoints"],
            })

    rows = []
    for competitor_name, starts in by_competitor.items():
        counted = sorted(starts, key=lambda item: (-item["points"], item["date"], item["eventNumber"]))[:max_counted_starts]
        counted_ids = {item["eventId"] for item in counted}
        rows.append({
            "competitorId": f"competitor-{slug(competitor_name)}",
            "name": competitor_name,
            "starts": len(starts),
            "results": sorted(starts, key=lambda item: item["eventNumber"]),
            "allPoints": sum(item["points"] for item in starts),
            "countedPoints": sum(item["points"] for item in counted),
            "rejectedPoints": sum(item["points"] for item in starts if item["eventId"] not in counted_ids),
        })

    rows.sort(key=lambda item: (-item["countedPoints"], ascii_key(item["name"])))
    previous_total = None
    previous_rank = 0
    for index, row in enumerate(rows, start=1):
        if row["countedPoints"] != previous_total:
            previous_rank = index
            previous_total = row["countedPoints"]
        row["rank"] = previous_rank
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("raw_sources", type=Path)
    parser.add_argument("competitors", type=Path)
    parser.add_argument("events", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()

    raw_sources = json.loads(args.raw_sources.read_text(encoding="utf-8"))
    raw_profiles = json.loads(args.competitors.read_text(encoding="utf-8-sig"))
    raw_events = json.loads(args.events.read_text(encoding="utf-8-sig"))
    sources_by_name = {item["name"]: item for item in raw_sources}

    season_events = []
    competitor_alias_audit = defaultdict(set)
    competition_alias_audit = defaultdict(set)
    season_names = set()

    for event_number, (source_name, metadata) in enumerate(SOURCE_EVENTS.items(), start=1):
        event_date, location = metadata
        source = sources_by_name[source_name]
        ranking = []
        for row in find_final_table(source)[1:]:
            position = parse_position(row[0])
            if position < 1 or position > 5:
                continue
            raw_name = row[1]
            canonical_name = canonical_competitor(raw_name)
            season_names.add(canonical_name)
            competitor_alias_audit[canonical_name].add(raw_name)
            ranking.append({
                "position": position,
                "competitorId": f"competitor-{slug(canonical_name)}",
                "name": canonical_name,
                "sourceName": raw_name,
                "seasonPoints": 6 - position,
                "competitionPoints": safe_float(row[2]) if len(row) > 2 else 0.0,
            })

        competitions = []
        for index, raw_heading in enumerate(find_competition_headings(source), start=1):
            cleaned = strip_event_decorations(raw_heading)
            provisional_type = infer_event_type(raw_heading, cleaned)
            canonical_name = canonical_event_name(raw_heading, provisional_type)
            event_type = infer_event_type(raw_heading, canonical_name)
            competition_alias_audit[canonical_name].add(cleaned)
            competitions.append({
                "id": f"event-{slug(canonical_name)}",
                "name": canonical_name,
                "type": event_type,
                "final": index == len(find_competition_headings(source)) or bool(re.search(r"FINAL|FINAŁ", raw_heading, re.I)),
                "sourceName": cleaned,
            })

        season_events.append({
            "id": f"season-2026-{event_number:02d}",
            "number": event_number,
            "date": event_date,
            "location": location,
            "name": f"{location} · {date.fromisoformat(event_date).strftime('%d.%m.%Y')}",
            "sourceFile": source_name,
            "ranking": ranking,
            "competitions": competitions,
        })

    profiles, profile_aliases, data_warnings = merge_profiles(raw_profiles, season_names)
    for canonical, aliases in profile_aliases.items():
        competitor_alias_audit[canonical].update(aliases)

    event_records = {}
    for raw in raw_events:
        raw_type = raw.get("type") if raw.get("type") in {"high", "low"} else ""
        canonical_name = canonical_event_name(raw.get("name", ""), raw_type)
        event_type = raw_type or KNOWN_TYPES.get(canonical_name, "low")
        competition_alias_audit[canonical_name].add(raw.get("name", ""))
        event_records[canonical_name] = {
            "id": f"event-{slug(canonical_name)}",
            "name": canonical_name,
            "type": event_type,
        }
    for season_event in season_events:
        for competition in season_event["competitions"]:
            event_records[competition["name"]] = {
                "id": competition["id"],
                "name": competition["name"],
                "type": competition["type"],
            }

    canonical_events = sorted(event_records.values(), key=lambda item: ascii_key(item["name"]))
    cup_profiles = [item for item in profiles if "Puchar Polski" in item.get("categories", [])]

    season_payload = {
        "schemaVersion": 1,
        "season": 2026,
        "seriesName": "Puchar Polski Strongman Tyberian Team",
        "maxCountedStarts": 4,
        "pointsByPosition": {"1": 5, "2": 4, "3": 3, "4": 2, "5": 1},
        "updatedThrough": max(item["date"] for item in season_events),
        "events": season_events,
        "standings": calculate_standings(season_events, 4),
    }

    audit_payload = {
        "excludedSources": [item["name"] for item in raw_sources if item["name"] not in SOURCE_EVENTS],
        "competitorAliases": {
            key: sorted(values, key=ascii_key) for key, values in sorted(competitor_alias_audit.items(), key=lambda item: ascii_key(item[0]))
        },
        "competitionAliases": {
            key: sorted(values, key=ascii_key) for key, values in sorted(competition_alias_audit.items(), key=lambda item: ascii_key(item[0]))
        },
        "dataWarnings": data_warnings,
    }

    args.output_dir.mkdir(parents=True, exist_ok=True)
    outputs = {
        "sezon_2026.json": season_payload,
        "zawodnicy_2026_ujednoliceni.json": profiles,
        "zawodnicy_puchar_polski_2026.json": cup_profiles,
        "konkurencje_2026_ujednolicone.json": canonical_events,
        "audyt_normalizacji_2026.json": audit_payload,
    }
    for filename, payload in outputs.items():
        (args.output_dir / filename).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    print(
        f"Built {len(season_events)} season events, {len(profiles)} competitors "
        f"({len(cup_profiles)} Puchar Polski) and {len(canonical_events)} competition definitions."
    )


if __name__ == "__main__":
    main()
