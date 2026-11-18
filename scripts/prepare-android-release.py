#!/usr/bin/env python3
"""Allocate an Anivio version and generate release notes from the previous release.

Reads GitHub's release list from --releases, including draft metadata. Called under
the shared android-publication concurrency lock; never counts workflow run ids as versions.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

VERSION = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$")


def git(*args):
    return subprocess.check_output(["git", *args], text=True, encoding="utf-8").strip()


def allocate(source_version, source_code, releases, bump, prerelease):
    source = tuple(map(int, source_version.split(".")))
    versions = [(r, VERSION.fullmatch(r["tag_name"])) for r in releases]
    versions = [(r, m) for r, m in versions if m]
    stable = [tuple(map(int, m.groups()[:3])) for r, m in versions if not m[4]]
    base = max([source, *stable])
    major, minor, patch = base
    target = {"major": (major + 1, 0, 0), "minor": (major, minor + 1, 0), "patch": (major, minor, patch + 1)}[bump]
    # Continue a beta train or promote it to stable, instead of skipping its version.
    beta_targets = [tuple(map(int, m.groups()[:3])) for _, m in versions if m[4] and tuple(map(int, m.groups()[:3])) >= target]
    if bump == "patch" and beta_targets:
        target = max(beta_targets)
    text = ".".join(map(str, target))
    if prerelease:
        serial = max([0, *[int(m[4]) for _, m in versions if m[4] and tuple(map(int, m.groups()[:3])) == target]]) + 1
        text += f"-beta.{serial}"
    # Machine-readable marker survives drafts, pre-releases and deleted artifacts.
    codes = [int(n) for r in releases for n in re.findall(r"<!-- anivio-version-code:(\d+) -->", r.get("body") or "")]
    code = max([source_code, *codes]) + 1
    return text, code


def changelog(previous, commit, repository):
    groups = {"New features": [], "Fixes": [], "Improvements": [], "Maintenance": []}
    if previous:
        git("merge-base", "--is-ancestor", previous, commit)
    commits = git("log", f"{previous}..{commit}" if previous else commit, "--first-parent", "--format=%H%x1f%s").splitlines()
    for line in commits:
        sha, subject = line.split("\x1f", 1)
        if "[skip release notes]" in subject.lower() or re.match(r"^chore\(release\):", subject):
            continue
        prefix = re.match(r"^(\w+)(?:\([^)]*\))?!?:\s*(.*)", subject)
        kind, title = (prefix[1].lower(), prefix[2]) if prefix else ("", subject)
        group = "New features" if kind == "feat" else "Fixes" if kind == "fix" else "Maintenance" if kind in ("ci", "build", "chore", "test", "docs") else "Improvements"
        groups[group].append(f"- {title} ([{sha[:7]}](https://github.com/{repository}/commit/{sha}))")
    sections = [f"### {name}\n\n" + "\n".join(items) for name, items in groups.items() if items]
    if not sections:
        sections = ["No application changes since the previous release. This build updates packaging."]
    if previous:
        sections.append(f"[Full changelog](https://github.com/{repository}/compare/{previous}...{commit})")
    return "\n\n".join(sections)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--releases", required=True)
    parser.add_argument("--bump", choices=["patch", "minor", "major"], default="patch")
    parser.add_argument("--prerelease", choices=["true", "false"], default="true")
    parser.add_argument("--repository", required=True)
    parser.add_argument("--output", default="build/release")
    args = parser.parse_args()
    source = Path("iosApp/Configuration/Version.xcconfig").read_text()
    name = re.search(r"MARKETING_VERSION\s*=\s*(\S+)", source)[1]
    code = int(re.search(r"CURRENT_PROJECT_VERSION\s*=\s*(\d+)", source)[1])
    releases = json.loads(Path(args.releases).read_text())
    version, code = allocate(name, code, releases, args.bump, args.prerelease == "true")
    commit = git("rev-parse", "HEAD")
    # Only published ancestors can be the comparison baseline; drafts reserve numbers only.
    previous = None
    for release in sorted(releases, key=lambda r: r.get("published_at") or "", reverse=True):
        tag = release["tag_name"]
        if release.get("draft"):
            continue
        if subprocess.run(["git", "merge-base", "--is-ancestor", tag, commit], capture_output=True).returncode == 0:
            previous = tag
            break
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    metadata = dict(version=version, version_code=code, tag=f"v{version}", commit=commit, previous=previous)
    (out / "release.json").write_text(json.dumps(metadata, indent=2) + "\n")
    body = f"## Anivio {version}\n\n" + changelog(previous, commit, args.repository)
    body += f"\n\n### Install\n\nDownload the APK for your Android device below. Install over your existing Anivio app to keep your data.\n\n<!-- anivio-version-code:{code} -->\n"
    (out / "notes.md").write_text(body, encoding="utf-8")
    for key, value in metadata.items():
        print(f"{key}={value or ''}")


if __name__ == "__main__":
    main()
