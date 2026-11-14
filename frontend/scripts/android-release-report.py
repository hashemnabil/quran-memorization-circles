"""Inspect real APK/AAB ZIP entries and verify the R8 mapping for this exact build."""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
import zipfile


def inspect(path):
    groups = collections.defaultdict(lambda: {"bytes": 0, "zipBytes": 0, "files": 0})
    with zipfile.ZipFile(path) as archive:
        entries = [entry for entry in archive.infolist() if not entry.is_dir()]
        for entry in entries:
            name = entry.filename
            if "/mushaf/fonts/" in name:
                group = "Quran page fonts (all offline)"
            elif "/mushaf/" in name:
                group = "Quran text and page layout"
            elif name.endswith(".dex"):
                group = "Android DEX"
            elif "/brand-concepts/" in name:
                group = "Review-only assets"
            elif "/assets/public/" in name or name.startswith("assets/public/"):
                group = "Other bundled web assets"
            elif name.startswith("BUNDLE-METADATA/"):
                group = "Bundle metadata (not installed)"
            elif "/lib/" in name or name.startswith("lib/"):
                group = "Native libraries"
            else:
                group = "Android resources and manifest"
            groups[group]["bytes"] += entry.file_size
            groups[group]["zipBytes"] += entry.compress_size
            groups[group]["files"] += 1
        fonts = [entry for entry in entries if re.search(r"/mushaf/fonts/\d+\.woff2$", entry.filename)]
        pages = [entry for entry in entries if re.search(r"/mushaf/\d+\.json$", entry.filename)]
        metadata = "BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map"
        mapping = archive.read(metadata) if metadata in archive.namelist() else None
        duplicates = collections.defaultdict(list)
        # Exact duplicate assets are reported, never automatically removed.
        for entry in entries:
            if "/assets/" in entry.filename or entry.filename.startswith("assets/"):
                duplicates[(entry.file_size, hashlib.sha256(archive.read(entry)).hexdigest())].append(entry.filename)
        return {"file": Path(path).name, "bytes": Path(path).stat().st_size,
                "sha256": hashlib.sha256(Path(path).read_bytes()).hexdigest(),
                "groups": dict(groups), "quranFonts": len(fonts), "quranPages": len(pages),
                "embeddedMappingBytes": len(mapping or b""),
                "embeddedMappingSha256": hashlib.sha256(mapping).hexdigest() if mapping else None,
                "largest": [{"name": e.filename, "bytes": e.file_size, "zipBytes": e.compress_size}
                            for e in sorted(entries, key=lambda e: e.compress_size, reverse=True)[:20]],
                "duplicateAssets": [names for (size, _), names in duplicates.items() if size > 1024 and len(names) > 1]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--aab", required=True)
    parser.add_argument("--apk", required=True)
    parser.add_argument("--mapping", required=True)
    parser.add_argument("--baseline-aab")
    parser.add_argument("--baseline-apk")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    mapping = Path(args.mapping).read_bytes()
    if not re.search(rb"(?m)^\S.* -> \S+:\s*$", mapping):
        raise SystemExit("Missing, empty or invalid R8 mapping; release refused")
    report = {"aab": inspect(args.aab), "apk": inspect(args.apk)}
    if report["aab"]["embeddedMappingSha256"] != hashlib.sha256(mapping).hexdigest():
        raise SystemExit("AAB embedded mapping differs from mapping.txt; release refused")
    for kind in ("aab", "apk"):
        current = report[kind]
        if current["quranFonts"] != 604 or current["quranPages"] != 604:
            raise SystemExit(f"{kind}: offline Quran pages/fonts missing")
        if current["groups"].get("Review-only assets", {}).get("files", 0):
            raise SystemExit(f"{kind}: review-only assets still packaged")
        baseline = getattr(args, "baseline_" + kind)
        if baseline:
            previous = inspect(baseline)
            report["baseline_" + kind] = previous
            report[kind + "Comparison"] = {"savedBytes": previous["bytes"] - current["bytes"],
                "savedPercent": round(100 * (previous["bytes"] - current["bytes"]) / previous["bytes"], 2)}
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "size-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    lines = ["# Android release size report", "", "Actual archive sizes; these are not Google Play per-device download measurements.", "",
             "| File | Previous MiB | New MiB | Saved MiB |", "|---|---:|---:|---:|"]
    for kind in ("aab", "apk"):
        current, old = report[kind], report.get("baseline_" + kind)
        previous = f'{old["bytes"] / 1048576:.2f}' if old else "not measured"
        saved = f'{(old["bytes"] - current["bytes"]) / 1048576:.2f}' if old else "not measured"
        lines.append(f'| {kind.upper()} | {previous} | {current["bytes"] / 1048576:.2f} | {saved} |')
    lines += ["", "## Current AAB contents", "", "| Group | Raw MiB | ZIP MiB | Files |", "|---|---:|---:|---:|"]
    for group, values in sorted(report["aab"]["groups"].items(), key=lambda item: -item[1]["zipBytes"]):
        lines.append(f'| {group} | {values["bytes"] / 1048576:.2f} | {values["zipBytes"] / 1048576:.2f} | {values["files"]} |')
    lines += ["", f"R8 mapping verified against embedded AAB metadata: {len(mapping):,} bytes.",
              "All 604 Quran fonts and all 604 page data files remain bundled for offline use."]
    (out / "size-report.md").write_text("\n".join(lines) + "\n", encoding="utf8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
