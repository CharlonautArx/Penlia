#!/usr/bin/env python3
"""Inspect ZIP/APK/AAB contents with Gitleaks without extracting paths or printing matches."""
import argparse
import io
import json
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path


MAX_MEMBER = 128 * 1024 * 1024
MAX_EXPANSION = 384 * 1024 * 1024
ARCHIVES = {'.apk', '.aab', '.zip', '.jar'}
MEDIA = {'.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webm', '.gif', '.otf', '.ttf', '.wav', '.ogg'}
PRIVATE = {'.key', '.jks', '.keystore', '.p12', '.pfx', '.p8', '.mobileprovision'}
PEM_KEY = re.compile(rb'-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----')


def prepare(data, member, entries, workspace, budget, depth=0):
    extension = Path(member).suffix.lower()
    if extension in PRIVATE or Path(member).name.lower() in {'credentials.json', '.env', '.env.production'}:
        entries['private-paths'].append(member)
    if extension in ARCHIVES:
        if depth >= 4:
            raise ValueError('Archive nesting limit exceeded')
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for child in archive.infolist():
                if child.is_dir() or Path(child.filename).suffix.lower() in MEDIA:
                    continue
                budget[0] -= child.file_size
                if child.file_size > MAX_MEMBER or budget[0] < 0:
                    raise ValueError('Archive inspection byte limit exceeded')
                prepare(archive.read(child), member + '!' + child.filename, entries, workspace, budget, depth + 1)
        return
    if extension in MEDIA:
        return
    if PEM_KEY.search(data) or data.startswith(b'\xfe\xed\xfe\xed'):
        entries['private-paths'].append(member)
    if b'\0' in data:
        data = subprocess.run(['strings', '-a', '-n', '6'], input=data, capture_output=True, check=True).stdout
    if not data.strip():
        return
    name = str(len(entries['files'])) + '.txt'
    entries['files'][name] = member
    (workspace / name).write_bytes(data)


def scan(path, scanner, config):
    if path.stat().st_size > MAX_MEMBER:
        raise ValueError('Input exceeds inspection byte limit')
    with tempfile.TemporaryDirectory(prefix='inspect-release-') as directory:
        root = Path(directory)
        payload = root / 'payload'
        payload.mkdir()
        entries = {'files': {}, 'private-paths': []}
        prepare(path.read_bytes(), path.name, entries, payload, [MAX_EXPANSION])
        report = root / 'findings.json'
        cmd = [scanner, 'dir', '--no-banner', '--redact=100', '--report-format=json',
               '--report-path=' + str(report), '--max-decode-depth=2', str(payload)]
        if config:
            cmd.insert(2, '--config=' + config)
        result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        if result.returncode not in {0, 1} or not report.is_file():
            raise ValueError('Secret scanner did not produce a complete report')
        findings = [{'rule': 'private-key-material', 'member': name} for name in set(entries['private-paths'])]
        findings.extend(
            {'rule': item['RuleID'], 'member': entries['files'].get(Path(item['File']).name), 'line': item['StartLine']}
            for item in json.loads(report.read_text())
        )
        return {'artifact': path.name, 'files': len(entries['files']), 'findings': findings}


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('paths', type=Path, nargs='+')
    cli.add_argument('--scanner', default='gitleaks')
    cli.add_argument('--config')
    args = cli.parse_args()
    status = 0
    for path in args.paths:
        try:
            result = scan(path, args.scanner, args.config)
            print(json.dumps(result, ensure_ascii=True))
            if result['findings']:
                status = max(status, 1)
        except (OSError, ValueError, RuntimeError, zipfile.BadZipFile, subprocess.CalledProcessError) as error:
            print(json.dumps({'artifact': path.name, 'error': type(error).__name__}))
            status = 2
    raise SystemExit(status)
