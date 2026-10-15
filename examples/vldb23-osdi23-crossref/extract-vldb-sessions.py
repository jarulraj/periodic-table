#!/usr/bin/env python3
"""Extract auditable session metadata from a saved official VLDB 2023 program."""

import argparse
from collections import Counter
from datetime import date
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urljoin, urlsplit

SOURCE_URL = "https://www.vldb.org/2023/?program-schedule"
HERE = Path(__file__).resolve().parent
# Add only verified spelling aliases here, never inferred research-area labels.
LABEL_ALIASES = {
    "Spatial and Multi-Dimesnional Indexing": "Spatial and Multi-Dimensional Indexing",
}
TITLE_REVIEWS = {
    "vldb2023-114": "Same PDF; the program includes the subtitle omitted from the card.",
    "vldb2023-123": "Same PDF; equivalent mathematical title rendered as LaTeX versus Unicode.",
    "vldb2023-165": "Same PDF; program uses 'Graphs', card uses 'Graph'.",
    "vldb2023-166": "Same PDF; program uses 'Graph', card uses 'Graphs'.",
}


def normalize_label(label):
    label = " ".join(label.split()).replace(" & ", " and ")
    label = re.sub(r"\s+(?:[IVX]+|[0-9]+)$", "", label)
    return LABEL_ALIASES.get(label, label)


def normalize_title(title):
    title = re.sub(r"\[(?:sds|eab)\]", "", title, flags=re.I)
    title = unicodedata.normalize("NFKD", title).casefold()
    return "".join(c for c in title if c.isalnum())


def pdf_key(url):
    # Retain the volume: a filename alone is not a globally unique paper ID.
    parts = urlsplit(url)
    return parts.path.lower().rstrip("/") if parts.hostname in {"vldb.org", "www.vldb.org"} else url


class ProgramParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.session_id = ""
        self.label = ""
        self.in_heading = False
        self.in_title = False
        self.heading = []
        self.title = []
        self.paper_url = ""
        self.records = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "a" and re.fullmatch(r"[A-Z][0-9]+", attrs.get("id", "")):
            self.session_id = attrs["id"]
            self.label = ""
        if tag == "h3":
            self.in_heading = True
            self.heading = []
        if tag == "p":
            self.title = []
            self.paper_url = ""
        if tag == "strong":
            self.in_title = True
        if tag == "a" and urlsplit(attrs.get("href", "")).path.lower().endswith(".pdf"):
            self.paper_url = urljoin(SOURCE_URL, attrs["href"])

    def handle_data(self, data):
        if self.in_heading:
            self.heading.append(data)
        if self.in_title:
            self.title.append(data)

    def handle_endtag(self, tag):
        if tag == "h3":
            self.label = " ".join("".join(self.heading).split())
            self.in_heading = False
        if tag == "strong":
            self.in_title = False
        if tag == "p" and self.session_id and self.label and self.title and self.paper_url:
            self.records.append({
                "session_id": self.session_id,
                "raw_label": self.label,
                "category": normalize_label(self.label),
                "paper_title": " ".join("".join(self.title).split()),
                "paper_url": self.paper_url,
                "source_url": SOURCE_URL + "#" + self.session_id,
            })


def match_cards(cards, records):
    by_pdf, by_title = {}, {}
    for record in records:
        by_pdf.setdefault(pdf_key(record["paper_url"]), []).append(record)
        by_title.setdefault(normalize_title(record["paper_title"]), []).append(record)
    matches = {}
    for card in cards:
        if card.get("source_id") != "vldb2023":
            continue
        candidates = by_pdf.get(pdf_key(card.get("paper_url", "")), [])
        method = "pdf_url"
        if not candidates:
            candidates = by_title.get(normalize_title(card["paper_title"]), [])
            method = "normalized_title"
        # Multiple sessions for one paper are valid; multiple papers are ambiguous.
        ambiguous = len({pdf_key(c["paper_url"]) for c in candidates}) > 1
        sessions = [] if ambiguous else [dict(t) for t in {json.dumps(c, sort_keys=True): c for c in candidates}.values()]
        matches[card["paper_id"]] = {
            "paper_title": card["paper_title"],
            "paper_url": card.get("paper_url", ""),
            "status": "ambiguous" if ambiguous else "matched" if sessions else "unmatched",
            "match_method": method if candidates else None,
            "sessions": sessions,
            "categories": sorted({s["category"] for s in sessions}),
            "title_differs": bool(sessions) and any(normalize_title(s["paper_title"]) != normalize_title(card["paper_title"]) for s in sessions),
            "title_review": TITLE_REVIEWS.get(card["paper_id"], ""),
            "candidates": candidates if ambiguous else [],
        }
    return matches


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("html", type=Path)
    parser.add_argument("--cards", type=Path, default=HERE / "paper-cards.json")
    parser.add_argument("--output", type=Path, default=HERE / "vldb2023-sessions.json")
    parser.add_argument("--retrieved-on", default=date.today().isoformat())
    args = parser.parse_args()
    html = args.html.read_bytes()
    program = ProgramParser()
    program.feed(html.decode("utf-8"))
    if not program.records:
        raise SystemExit("No session/paper records found; check the saved program page.")
    cards = json.loads(args.cards.read_text())["cards_by_id"].values()
    matches = match_cards(cards, program.records)
    output = {
        "source_url": SOURCE_URL,
        "retrieved_on": args.retrieved_on,
        "source_html_sha256": hashlib.sha256(html).hexdigest(),
        "normalization": "Whitespace, ampersand to 'and', trailing Roman/Arabic session number; reviewed spelling aliases only.",
        "category_caveat": "Conference session categories are scheduling labels, not validated research areas. Mixed and miscellaneous sessions are retained.",
        "program_records": program.records,
        "papers": matches,
    }
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"records": len(program.records), "coverage": dict(Counter(p["status"] for p in matches.values())), "title_differences": [k for k, v in matches.items() if v["title_differs"]]}, indent=2))


if __name__ == "__main__":
    main()
