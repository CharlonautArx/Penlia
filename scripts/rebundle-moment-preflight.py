from pathlib import Path
import sys
from zipfile import ZipFile

base, output, replacement = map(Path, sys.argv[1:])
entry = 'assets/index.android.bundle'
content = replacement.read_bytes()
with ZipFile(base) as before, ZipFile(output, 'w', allowZip64=False) as after:
    original = before.read(entry)
    assert len(content) > 1_000_000 and original[:12] == content[:12]
    assert original != content
    for info in before.infolist():
        if info.filename.startswith('META-INF/') and info.filename.upper().endswith(('.SF', '.RSA', '.DSA', 'MANIFEST.MF')):
            continue
        after.writestr(info, content if info.filename == entry else before.read(info))
