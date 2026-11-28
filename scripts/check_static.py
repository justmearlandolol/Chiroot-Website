#!/usr/bin/env python3
"""Dependency-free checks for Chiroot's static entry points.

This deliberately checks only explicit local scripts, stylesheets, icons and
manifests. It is not a browser, an HTML conformance validator, or an E2E test.
"""
import json
import subprocess
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
ERRORS = []


def check_js(source, label, module=False):
    mode = 'module' if module else 'commonjs'
    result = subprocess.run(
        ['node', '--check', '--input-type=' + mode], input=source,
        text=True, capture_output=True, cwd=ROOT, check=False,
    )
    if result.returncode:
        ERRORS.append(f'{label}: JavaScript syntax error\n{result.stderr}')


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.ids = []
        self.refs = []
        self.script = None
        self.script_count = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        if tag == 'script':
            kind = attrs.get('type', '').strip().lower()
            executable = kind in ('', 'module', 'text/javascript', 'application/javascript')
            if attrs.get('src'):
                self.refs.append(attrs['src'])
            elif executable:
                self.script_count += 1
                self.script = [kind == 'module', []]
        elif tag == 'link' and attrs.get('href'):
            rel = set(attrs.get('rel', '').lower().split())
            if rel.intersection({'stylesheet', 'icon', 'manifest'}):
                self.refs.append(attrs['href'])

    def handle_data(self, data):
        if self.script is not None:
            self.script[1].append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self.script is not None:
            module, chunks = self.script
            check_js(''.join(chunks), f'{self.path.name}: inline script {self.script_count}', module)
            self.script = None

    def validate(self):
        for id_value, count in Counter(self.ids).items():
            if count > 1:
                ERRORS.append(f'{self.path.name}: duplicate id {id_value!r}')
        for ref in self.refs:
            url = urlsplit(ref)
            if url.scheme or url.netloc or not url.path:
                continue
            path = (ROOT / unquote(url.path.lstrip('/'))) if url.path.startswith('/') else (self.path.parent / unquote(url.path))
            path = path.resolve()
            if not path.is_relative_to(ROOT) or not path.is_file():
                ERRORS.append(f'{self.path.name}: missing or invalid local asset {ref!r}')


def main():
    pages = sorted(ROOT.glob('*.html'))
    if not pages:
        ERRORS.append('No root HTML entry points found')
    for path in pages:
        parser = Page(path)
        parser.feed(path.read_text(encoding='utf-8'))
        parser.close()
        parser.validate()
    scripts = sorted((ROOT / 'js').glob('*.js'))
    for path in scripts:
        # These two files form the site's ES-module pair; the rest are classic scripts.
        check_js(path.read_text(encoding='utf-8'), str(path.relative_to(ROOT)), path.name in ('normal.js', 'egg.js'))
    try:
        json.loads((ROOT / 'manifest.webmanifest').read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        ERRORS.append(f'manifest.webmanifest: {exc}')
    if ERRORS:
        print('\n'.join(ERRORS), file=sys.stderr)
        return 1
    print(f'OK: {len(pages)} HTML entry points, {len(scripts)} JS files, referenced assets and manifest')
    return 0


if __name__ == '__main__':
    sys.exit(main())
