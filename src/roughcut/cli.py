"""``roughcut`` command-line entry point (the rough-cut assembler pipeline).

    roughcut validate    [PROJECT_DIR]            load & validate events.yaml
    roughcut events      [PROJECT_DIR]            print the ordered card list
    roughcut portraits   [PROJECT_DIR]             portrait-hint coverage report
    roughcut roughcut    ...                       transcribe/align/beats/direct/pages/check/subs/vision
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from roughcut import __version__
from dragonball_db import config
from roughcut.model import EventsError, load_events
from roughcut.portraits import resolve_portrait


def _resolve_events_path(project_dir: str | None) -> Path:
    root = Path(project_dir).resolve() if project_dir else Path.cwd()
    if root.is_file():  # a direct path to an events yaml (any name)
        return root
    return config.events_path(root)


def _load(project_dir: str | None):
    path = _resolve_events_path(project_dir)
    try:
        return load_events(path)
    except EventsError as exc:
        print(f"INVALID  {path}", file=sys.stderr)
        for p in exc.problems:
            print(f"  ! {p}", file=sys.stderr)
        raise SystemExit(2)


# --------------------------------------------------------------------
def cmd_validate(args) -> int:
    doc = _load(args.project_dir)
    print(f"OK  {doc.source_path}")
    print(f"    video_id : {doc.meta.video_id}")
    print(f"    theme    : {doc.meta.theme}")
    print(f"    events   : {len(doc.events)}   grids: {len(doc.grids)}")
    for w in doc.warnings:
        print(f"    ~ {w}")
    return 0


def cmd_events(args) -> int:
    doc = _load(args.project_dir)
    for e in doc.ordered():
        chap = f"ch {e.chapter_start}-{e.chapter_end or '?'}" if e.chapter_start is not None else ""
        flags = ("T" if e.kind == "tie" else "") + ("F" if e.kind == "fusion" else "") + ("!" if e.disputed else "")
        print(f"  {e.order:>4}  {e.id:<26} {e.series:<3} {e.nameplate:<30} {chap:<12} {flags}")
    return 0


def cmd_portraits(args) -> int:
    doc = _load(args.project_dir)
    roots = config.render_roots()
    for r in (r for r in roots if not r.is_dir()):
        print(f"~ render root not found: {r}", file=sys.stderr)

    hints = doc.portrait_hints()
    resolved = partial = missing = 0
    for h in hints:
        m = resolve_portrait(h, roots)
        if m.status == "resolved":
            resolved += 1
            print(f"  [ok]   {h:<22} -> {m.path.name}")
        elif m.status == "partial":
            partial += 1
            print(f"  [~{m.score:.2f}] {h:<22} -> {'  |  '.join(p.name for p in m.candidates[:3])}")
        else:
            missing += 1
            print(f"  [MISS] {h:<22}")
    print(f"\n{len(hints)} hints: {resolved} resolved, {partial} partial, {missing} missing")
    return 0 if missing == 0 else 1


# --------------------------------------------------------------------
def _roughcut_check(out: Path, transcript_json: Path, timed_json: Path, beats_yaml: Path, doc) -> int:
    """Static wiring / gap check over whatever artifacts exist in --out."""
    from roughcut import beats as rc_beats

    problems: list[str] = []
    warns: list[str] = []

    if not transcript_json.exists():
        warns.append("no transcript.json (run `transcribe`)")

    rows = None
    if timed_json.exists():
        rows = json.loads(timed_json.read_text(encoding="utf-8"))
        low = [r for r in rows if r["conf"] < 0.5]
        run = mx = 0
        for r in rows:
            run = run + 1 if r["conf"] < 0.5 else 0
            mx = max(mx, run)
        if low:
            warns.append(f"align: {len(low)}/{len(rows)} paragraphs conf<0.5 (longest run {mx})")
        for a, b in zip(rows, rows[1:]):
            if b["start"] < a["start"] - 1e-6:
                problems.append(f"align: not monotonic at paragraph {b['idx']}")
    else:
        problems.append("no script_timed.json (run `align`)")

    beats = None
    if beats_yaml.exists():
        beats = rc_beats.load(beats_yaml)
        ids = [b.id for b in beats]
        dup = sorted({i for i in ids if ids.count(i) > 1})
        if dup:
            problems.append(f"beats: duplicate ids {dup}")
        evids = {e.id for e in doc.events}
        for b in beats:
            if b.event and b.event not in evids:
                problems.append(f"beats: {b.id} references unknown event {b.event!r}")
            if rows is not None:
                for p in b.paras:
                    if not (0 <= p < len(rows)):
                        problems.append(f"beats: {b.id} paragraph {p} out of range 0..{len(rows) - 1}")
        undone = rc_beats.undirected(beats)
        warns.append(f"beats: {len(undone)}/{len(beats)} undirected (no shot spec)")
    else:
        problems.append("no beats.yaml (run `beats`)")

    tl_path = out / "timeline.json"
    if tl_path.exists():
        tl = json.loads(tl_path.read_text(encoding="utf-8"))
        dur = tl["durationInFrames"]
        tids = [b["id"] for b in tl["beats"]]
        if len(set(tids)) != len(tids):
            problems.append("timeline: duplicate beat ids")
        cardcount: dict[str, int] = {}
        prev_end = -1
        for b in tl["beats"]:
            if b["kind"] == "manga" and not b["pages"]:
                warns.append(f"timeline: {b['id']} manga with 0 pages -> renders as slate")
            if b["kind"] == "slate":
                warns.append(f"timeline: {b['id']} slate - no footage resolved")
            for c in b["captions"]:
                if c["end"] > dur:
                    problems.append(f"timeline: {b['id']} caption ends {c['end']}f > durationInFrames {dur}")
            for rel in b["pages"]:
                if not (out / rel).exists():
                    problems.append(f"timeline: {b['id']} missing page file {rel}")
            if b["card"]:
                cardcount[b["card"]] = cardcount.get(b["card"], 0) + 1
            if prev_end >= 0 and b["start"] < prev_end - 1:
                warns.append(f"timeline: {b['id']} overlaps previous by {prev_end - b['start']}f")
            prev_end = b["end"]
        for ev, n in cardcount.items():
            if n != 1:
                problems.append(f"timeline: card {ev} set on {n} beats (expected exactly 1)")
    else:
        warns.append("no timeline.json (run `pages`)")

    for w in warns:
        print(f"  ~ {w}")
    for p in problems:
        print(f"  ! {p}")
    print(f"\n{'FAIL' if problems else 'OK'} - {len(problems)} problem(s), {len(warns)} warning(s)")
    return 1 if problems else 0


# --------------------------------------------------------------------
def cmd_roughcut(args) -> int:
    """Rough-cut assembler steps. See docs/plans/video-assembler/."""
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    transcript_json = out / "transcript.json"
    timed_json = out / "script_timed.json"
    beats_yaml = out / "beats.yaml"

    if args.rc_action == "transcribe":
        from roughcut import transcribe as rc_transcribe

        r = rc_transcribe.transcribe(args.audio, transcript_json, model=args.model, force=args.force)
        print(
            f"transcript -> {transcript_json}  "
            f"({len(r['words'])} words, {r['duration']:.1f}s, {r['device']}/{r['compute_type']})"
        )
        return 0

    if args.rc_action == "align":
        from roughcut import align as rc_align

        rows = rc_align.run(args.script, transcript_json, timed_json)
        low = [r for r in rows if r["conf"] < 0.6]
        print(f"script_timed -> {timed_json}  ({len(rows)} paragraphs, {len(low)} low-confidence)")
        for r in low[:12]:
            print(f"  ~conf {r['conf']:.2f}  [{r['start']:.1f}s] {r['text'][:70]}")
        return 0

    if args.rc_action == "subs":
        from dragonball_db.roughcut import subs as rc_subs

        if args.query:
            try:
                sys.stdout.reconfigure(encoding="utf-8")  # subtitle text is UTF-8
            except Exception:
                pass
            if args.lexical_only and args.semantic_only:
                print("! --lexical-only and --semantic-only are mutually exclusive", file=sys.stderr)
                return 2
            try:
                if args.semantic_only:
                    from dragonball_db.roughcut import embeddings as rc_emb

                    hits = rc_emb.search(args.query, k=args.limit)
                    rows = [rc_subs.hydrate_line(i, {}, db=rc_subs.index_path()) for i, _sim in hits]
                    rows = [r for r in rows if r is not None]
                elif args.lexical_only:
                    rows = rc_subs.query(args.query, series=args.series, limit=args.limit, all_terms=args.all)
                else:
                    rows = rc_subs.hybrid_query(args.query, series=args.series, limit=args.limit)
            except FileNotFoundError as exc:
                print(f"! {exc}", file=sys.stderr)
                return 2
            if not rows:
                print("(no matches)")
                return 1
            for r in rows:
                what = r["label"] or f"ep {r['episode']}"
                print(f"  {r['series']:<10} {what:<40} [{r['tc']}]  {r['text']}")
            return 0
        try:
            res = rc_subs.build(
                anime_root=args.anime_root, series=args.series,
                episodes=args.episodes, force=args.force,
            )
        except (RuntimeError, ValueError) as exc:
            print(f"! {exc}", file=sys.stderr)
            return 2
        print(
            f"subtitle index -> {res['db']}  "
            f"({res['extracted']}/{res['selected']} episodes extracted, {res['failed']} failed; "
            f"index has {res['episodes']} episodes / {res['lines']} lines)"
        )
        return 0 if not res["failed"] else 1

    if args.rc_action == "vision":
        from dragonball_db.roughcut import vision_index as rc_vision

        if args.vision_query or args.compile:
            try:
                sys.stdout.reconfigure(encoding="utf-8")
            except Exception:
                pass
            try:
                if args.compile:
                    from dragonball_db.roughcut import query_compiler as rc_compile

                    spec, note = rc_compile.compile_cached(args.compile)
                    if note is not None:
                        print(f"! compile failed ({note}), plain search", file=sys.stderr)
                    print(json.dumps(spec))
                    rows = rc_compile.run_compiled(spec, limit=args.limit)
                    qtext = args.compile
                elif args.expand:
                    rows = rc_vision.query_with_traits(args.vision_query, source=args.vision_source,
                                                       limit=args.limit, include_links=args.show_links)
                    qtext = args.vision_query
                else:
                    rows = rc_vision.query(args.vision_query, source=args.vision_source, limit=args.limit,
                                           include_links=args.show_links)
                    qtext = args.vision_query
            except FileNotFoundError as exc:
                print(f"! {exc}", file=sys.stderr)
                return 2
            counts = rc_vision.index_counts()
            by = ", ".join(f"{s} {n}" for s, n in sorted(counts["by_source"].items())) or "empty"
            print(f"index: {counts['total']} rows ({by}) @ {counts['db']}", file=sys.stderr)
            warn = rc_vision.twin_warning(counts=counts)
            if warn is not None:
                print(f"! {warn}", file=sys.stderr)
            if args.export:
                res = rc_vision.export_rows(rows, args.export)
                print(f"exported {res['rows']} rows -> {res['file']}")
            if args.rerank:
                from dragonball_db.roughcut import vision_rerank as rc_rerank

                rows = rc_rerank.rerank(rows, qtext, top_n=args.rerank)
                for r in rows:
                    v = r.get("vlm")
                    if v is not None:
                        mark = "+" if v["keep"] else "-"
                        print(f"  [{mark}] {v['reason'][:80]}")
            if not rows:
                print("(no matches)")
                return 1
            for r in rows:
                if r["source"] == "anime":
                    where = f"{r['series']} ep {r['episode']} [{r['start_ms']/1000:.1f}s]"
                elif r["source"] == "manga":
                    where = f"{r['arc']} / {r['chapter']} p{r['page_num']}"
                else:
                    where = f"{r['book']} p{r['page_num']}"
                print(f"  {r['source']:<10} {where}")
                if args.show_links:
                    if r.get("chapter_link"):
                        cl = r["chapter_link"]
                        print(f"    chapter -> {cl['chapter_num']} ({cl['manga_title']})")
                    elif r.get("source") == "anime":
                        print("    chapter -> no chapter map")
                    for el in r.get("episode_links") or []:
                        print(f"    episode -> {el['series']} ep {el['episode']}")
                    for tag, ent in (r.get("entity_links") or {}).items():
                        print(f"    link [{tag}] -> {ent.get('wiki_title')}")
            return 0
        if args.export and not args.vision_query:
            if not rc_vision.index_path().exists():
                print(f"! no vision index at {rc_vision.index_path()} - run the vision build first",
                      file=sys.stderr)
                return 2
            rows = rc_vision.dump()
            res = rc_vision.export_rows(rows, args.export)
            print(f"exported {res['rows']} rows -> {res['file']}")
            return 0
        sources = (args.vision_source,) if args.vision_source else ("anime", "manga", "guidebook")
        res = rc_vision.build(
            keep_frames=args.keep_frames, max_workers=args.max_workers, gpu_fraction=args.gpu_fraction,
            sources=sources, series=args.series, episodes=args.episodes,
            chapters=args.chapters, book=args.book,
            guidebook_root=args.guidebook_root, reindex=args.reindex,
        )
        print(
            f"vision index -> {res['db']}  ({res['items']} items, {res['failed']} failures)"
        )
        return 0 if not res["failed"] else 1

    doc = _load(args.project_dir)

    if args.rc_action == "beats":
        from roughcut import beats as rc_beats

        rows = json.loads(timed_json.read_text(encoding="utf-8"))
        seeded = rc_beats.seed(doc.ordered(), rows)
        rc_beats.write(seeded, beats_yaml)
        titles = sum(1 for b in seeded if b.kind == "title")
        print(f"beats.yaml -> {beats_yaml}  ({len(seeded)} beats, {titles} title, {len(seeded) - titles} manga)")
        return 0

    if args.rc_action == "direct":
        # seed a blank shot spec on every undirected beat (the "direction pass" worksheet)
        from roughcut import beats as rc_beats

        beats = rc_beats.load(beats_yaml)
        rows = json.loads(timed_json.read_text(encoding="utf-8"))
        undone = rc_beats.undirected(beats)
        if args.report:
            print(f"{len(undone)}/{len(beats)} beats undirected:")
            for b in undone:
                txt = " ".join(rows[i]["text"] for i in b.paras if i < len(rows))
                print(f"  {b.id:<26} {b.kind:<6} {txt[:76]}")
            return 0
        if args.anime_suggest:
            from dragonball_db.roughcut import subs as rc_subs

            try:
                sugg = rc_subs.suggest_for_beats(beats, rows, doc, limit=args.anime_limit)
            except FileNotFoundError as exc:
                print(f"! {exc}", file=sys.stderr)
                return 2
            payload = {
                bid: [
                    {"series": h["series"], "what": h["label"] or f"ep {h['episode']}",
                     "tc": h["tc"], "text": h["text"], "score": round(h["score"], 2)}
                    for h in hits
                ]
                for bid, hits in sugg.items()
            }
            sugg_path = out / "anime_suggestions.yaml"
            import yaml as _yaml

            sugg_path.write_text(_yaml.safe_dump(payload, sort_keys=False, allow_unicode=True), encoding="utf-8")
            print(f"anime suggestions -> {sugg_path}  ({len(sugg)}/{len(undone)} undirected beats matched)")
        for b in beats:
            if b in undone:
                b.spec = rc_beats.blank_spec()
        rc_beats.write(beats, beats_yaml)
        print(f"beats.yaml <- blank spec added to {len(undone)} beat(s). Fill visual/motion/fx/source, then re-run pages.")
        return 0

    if args.rc_action == "check":
        return _roughcut_check(out, transcript_json, timed_json, beats_yaml, doc)

    if args.rc_action == "pages":
        from roughcut import beats as rc_beats
        from roughcut import pages as rc_pages
        import yaml as _yaml

        rows = json.loads(timed_json.read_text(encoding="utf-8"))
        beats = rc_beats.load(beats_yaml)
        manga = args.manga_root or str(config.manga_root())
        ov_path = Path(args.overrides) if args.overrides else out / "overrides.yaml"
        overrides = _yaml.safe_load(ov_path.read_text(encoding="utf-8")) or {} if ov_path.exists() else {}
        dur = None
        if transcript_json.exists():
            dur = json.loads(transcript_json.read_text(encoding="utf-8")).get("duration")
        tl = rc_pages.build_timeline(
            beats=beats, script_rows=rows, doc=doc, manga_root=manga,
            out_dir=out, fps=args.fps, duration_seconds=dur, audio_path=args.audio,
            overrides=overrides,
        )
        kinds = {}
        for b in tl["beats"]:
            kinds[b["kind"]] = kinds.get(b["kind"], 0) + 1
        directed = sum(1 for b in tl["beats"] if b.get("spec"))
        print(
            f"timeline.json -> {out / 'timeline.json'}  "
            f"({len(tl['beats'])} beats {dict(kinds)}, {directed} directed, {tl['durationInFrames']}f)"
        )
        return 0

    print(f"unknown roughcut action: {args.rc_action}", file=sys.stderr)
    return 2


# --------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="roughcut", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)

    specs = [
        ("validate", cmd_validate, "load & validate events.yaml", True),
        ("events", cmd_events, "print the ordered card list", True),
        ("portraits", cmd_portraits, "portrait-hint coverage report", True),
    ]
    for name, fn, help_, takes_project in specs:
        sp = sub.add_parser(name, help=help_)
        if takes_project:
            sp.add_argument("project_dir", nargs="?", default=None,
                            help="project root or path to events.yaml (default: cwd)")
        sp.set_defaults(func=fn)

    rc = sub.add_parser("roughcut", help="rough-cut assembler (transcribe / align / beats / direct / pages / check / subs / vision)")
    rc.add_argument("rc_action", choices=["transcribe", "align", "beats", "direct", "pages", "check", "subs", "vision"])
    rc.add_argument("project_dir", nargs="?", default=None,
                    help="project root or path to events.yaml (for beats/pages)")
    rc.add_argument("--out", default="roughcut_out", help="output/cache directory")
    rc.add_argument("--audio", default=None, help="VO file (transcribe; also recorded into timeline.json)")
    rc.add_argument("--script", default=None, help="script .md (align)")
    rc.add_argument("--model", default="small.en", help="faster-whisper model (transcribe)")
    rc.add_argument("--force", action="store_true", help="ignore the transcript / SRT cache (transcribe, subs)")
    rc.add_argument("--manga-root", default=None, help="override the manga page library root (pages)")
    rc.add_argument("--fps", type=int, default=30, help="comp fps for timeline.json (pages)")
    rc.add_argument("--overrides", default=None, help="overrides.yaml pinning exact pages per beat (pages)")
    rc.add_argument("--report", action="store_true", help="list undirected beats instead of editing (direct)")
    rc.add_argument("--anime-suggest", action="store_true",
                    help="write anime_suggestions.yaml from the subtitle index for undirected beats (direct)")
    rc.add_argument("--anime-limit", type=int, default=5, help="candidates per beat (direct --anime-suggest)")
    rc.add_argument("--anime-root", default=None, help="override the anime library root (subs)")
    rc.add_argument("--query", default=None, help="search the subtitle index instead of building it (subs)")
    rc.add_argument("--series", default=None, help="limit to series keys, comma-separated e.g. DB,DBZ (subs)")
    rc.add_argument("--episodes", default=None, help="limit to an episode range e.g. 1-50 (subs build)")
    rc.add_argument("--limit", type=int, default=20, help="max search results (subs --query, vision --vision-query)")
    rc.add_argument("--all", action="store_true", help="require every query term (subs --query; default OR)")
    rc.add_argument("--lexical-only", action="store_true",
                    help="BM25 only, skip the semantic index (subs --query; for comparison)")
    rc.add_argument("--semantic-only", action="store_true",
                    help="embeddings only, skip BM25 (subs --query; for comparison)")
    rc.add_argument("--vision-query", default=None,
                    help="search the vision tag index instead of building it (vision)")
    rc.add_argument("--vision-source", default=None, choices=["anime", "manga", "guidebook"],
                    help="limit to one source (vision --vision-query, or which source(s) to build)")
    rc.add_argument("--max-workers", type=int, default=1,
                    help="parallelize anime shot detection/extraction across episodes (vision build); "
                         "measured sweet spot on the dev box was 8 - re-measure per machine")
    rc.add_argument("--gpu-fraction", type=float, default=0.0,
                    help="share of anime frame extraction routed to GPU (-hwaccel cuda) (vision build); "
                         "measured sweet spot on the dev box was 0.5 - re-measure per machine/GPU")
    rc.add_argument("--keep-frames", action="store_true",
                     help="don't delete extracted anime frames after tagging (vision build; debugging)")
    rc.add_argument("--reindex", action="store_true",
                     help="wipe and rebuild the whole vision index instead of the incremental scope write (vision build)")
    rc.add_argument("--export", default=None,
                     help="write vision rows as JSON Lines instead of/in addition to printing them: "
                          "with --vision-query exports those hits, alone exports the whole index (vision)")
    rc.add_argument("--rerank", type=int, default=0, metavar="N",
                     help="VLM second opinion on the top N vision hits (needs the llama server up; "
                          "KEEPs float above DROPs, verdicts printed inline) (vision --vision-query)")
    rc.add_argument("--show-links", action="store_true",
                     help="attach chapter/entity links to vision hits (vision --vision-query)")
    rc.add_argument("--expand", action="store_true",
                     help="expand race mentions to trait tags before searching, e.g. --vision-query \"metamoran fusion\" finds vest-tagged pages (vision --vision-query; off by default)")
    rc.add_argument("--compile", default=None, metavar="BEAT",
                     help="compile a beat sentence to a structured search first, e.g. --compile \"Vegeta's first armored appearance\" (vision --vision-query; needs the llama server up; falls back to plain search)")
    rc.add_argument("--chapters", default=None,
                     help="limit manga to a chapter range e.g. 100 or 95-105, global numbering (vision build)")
    rc.add_argument("--book", default=None,
                     help="limit guidebooks to one book dir e.g. Daizenshuu (vision build)")
    rc.add_argument("--guidebook-root", default=None,
                     help="override the guidebook/art-book scans root, e.g. the artbooks dir (vision build)")
    rc.set_defaults(func=cmd_roughcut)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except NotImplementedError as exc:
        print(f"not implemented: {exc}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
