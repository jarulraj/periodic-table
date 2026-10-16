#!/usr/bin/env python3
"""Extract auditable session metadata from a saved official OSDI 2023 program."""

import argparse
from collections import Counter
from datetime import date
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urljoin

SOURCE_URL = "https://www.usenix.org/conference/osdi23/technical-sessions"
PRESENTATION_PREFIX = "https://www.usenix.org/conference/osdi23/presentation/"
HERE = Path(__file__).resolve().parent


def normalize_label(label):
    label = " ".join(label.split()).replace(" & ", " and ")
    return re.sub(r"\s+(?:[IVX]+|[0-9]+)$", "", label)


def normalize_title(title):
    title = unicodedata.normalize("NFKD", title).casefold()
    return "".join(char for char in title if char.isalnum())


class ProgramParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.articles = []
        self.heading = None
        self.records = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "article":
            classes = attrs.get("class", "").split()
            kind = "session" if "node-session" in classes else "paper" if "node-paper" in classes else "other"
            self.articles.append({"kind": kind, "id": attrs.get("id", ""), "title": "", "url": ""})
        if tag == "h2" and self.articles:
            self.heading = []
        if tag == "a" and self.heading is not None and self.articles:
            url = urljoin(SOURCE_URL, attrs.get("href", ""))
            if url.startswith(PRESENTATION_PREFIX):
                self.articles[-1]["url"] = url

    def handle_data(self, data):
        if self.heading is not None:
            self.heading.append(data)

    def handle_endtag(self, tag):
        if tag == "h2" and self.heading is not None:
            self.articles[-1]["title"] = " ".join("".join(self.heading).split())
            self.heading = None
        if tag != "article" or not self.articles:
            return
        article = self.articles.pop()
        if article["kind"] != "paper" or not article["url"]:
            return
        session = next((item for item in reversed(self.articles) if item["kind"] == "session"), None)
        if session and session["title"] and article["title"]:
            self.records.append({
                "session_id": session["id"],
                "raw_label": session["title"],
                "category": normalize_label(session["title"]),
                "paper_title": article["title"],
                "paper_url": article["url"],
                "source_url": SOURCE_URL + "#" + session["id"],
            })


def match_cards(cards, records):
    by_title = {}
    for record in records:
        by_title.setdefault(normalize_title(record["paper_title"]), []).append(record)
    matches = {}
    for card in cards:
        if card.get("source_id") != "osdi23":
            continue
        candidates = by_title.get(normalize_title(card["paper_title"]), [])
        ambiguous = len({record["paper_url"] for record in candidates}) > 1
        sessions = [] if ambiguous else list({json.dumps(record, sort_keys=True): record for record in candidates}.values())
        matches[card["paper_id"]] = {
            "paper_title": card["paper_title"],
            "paper_url": card.get("paper_url", ""),
            "status": "ambiguous" if ambiguous else "matched" if sessions else "unmatched",
            "match_method": "normalized_title" if candidates else None,
            "sessions": sessions,
            "categories": sorted({session["category"] for session in sessions}),
            "candidates": candidates if ambiguous else [],
        }
    return matches


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("html", type=Path)
    parser.add_argument("--cards", type=Path, default=HERE / "paper-cards.json")
    parser.add_argument("--output", type=Path, default=HERE / "osdi23-sessions.json")
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
        "normalization": "Whitespace, ampersand to 'and', trailing Roman/Arabic session number only; original labels retained.",
        "matching": "Exact normalized title; presentation URLs distinguish ambiguous titles. No fuzzy or topic-inferred matches.",
        "category_caveat": "Official scheduling labels, not a common research-area taxonomy across conferences.",
        "program_records": program.records,
        "papers": matches,
    }
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"records": len(program.records), "coverage": dict(Counter(p["status"] for p in matches.values())),
                      "categories": dict(sorted(Counter(c for p in matches.values() for c in p["categories"]).items())),
                      "needs_review": [key for key, value in matches.items() if value["status"] != "matched"]}, indent=2))


if __name__ == "__main__":
    main()
