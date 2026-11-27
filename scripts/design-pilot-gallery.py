"""Package the real, uniform emulator captures as a lossless screenshot archive and legible comparison PDF."""
import argparse
import hashlib
import json
from pathlib import Path
from shutil import copyfile
from zipfile import ZipFile, ZIP_DEFLATED

from PIL import Image, ImageDraw, ImageFont

PAGES = {
    'inbox': '聊天', 'chat': '与小满聊天', 'moments': '好友动态',
    'world': '共同世界 · 晚风小院', 'gathering': '约局详情 · 周末到河边喝杯咖啡',
}
LABELS = {'original': '原版', 'A': 'A · 温润生活主义', 'B': 'B · 现代原生极简主义', 'C': 'C · Apple 风格', 'D': 'D · Claude 风格'}


def package(light, dark, out, source):
    out.mkdir(parents=True, exist_ok=True)
    fontpath = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
    title = ImageFont.truetype(fontpath, 52, index=2)
    sub = ImageFont.truetype(fontpath, 34, index=2)
    cols = len(LABELS)
    comparison = out / 'Penlia-design-comparison.pdf'
    with ZipFile(out / 'Penlia-native-screens.zip', 'w', ZIP_DEFLATED) as archive:
        pages = []
        for folder, prefix, condition in [(light, '', 'Android 15 · 默认字号 · 浅色'),
                                                (dark, 'compact-dark-', 'Android 11 · 130% 字号 · 深色')]:
            with Image.open(folder / (prefix + 'original-inbox.png')) as first:
                size = first.size
            w, h = size
            assert h > w >= 300, 'Expected portrait emulator capture'
            condition += f' · {w} × {h}'
            outer, gutter = 44, 20
            board_w = 2 * outer + cols * w + (cols - 1) * gutter
            for screen, label in PAGES.items():
                board = Image.new('RGB', (board_w, h + 218), '#FFFFFF')
                draw = ImageDraw.Draw(board)
                draw.text((outer, 12), label, font=title, fill='#222629')
                draw.text((board_w - outer, 40), condition, font=sub, fill='#4F5657', anchor='rm')
                for i, (variant, caption) in enumerate(LABELS.items()):
                    path = folder / (prefix + variant + '-' + screen + '.png')
                    with Image.open(path) as frame:
                        assert frame.size == size, (path.name, frame.size)
                        x = outer + i * (w + gutter)
                        draw.text((x, 103), caption, font=sub, fill='#33383B')
                        board.paste(frame.convert('RGB'), (x, 165))
                    archive.write(path, path.name)
                    if not prefix:
                        copyfile(path, out / ('native-' + path.name))
                # Append one full-resolution page at a time to bound peak memory use.
                board.save(comparison, 'PDF', append=bool(pages), resolution=190.0, quality=93)
                board.close()
                pages.append(screen)
            archive.write(folder / 'checks.txt', ('compact-dark-' if prefix else '') + 'checks.txt')
    for variant in 'ABCD':
        copyfile(light / (variant + '-interaction.mp4'), out / (variant + '-interaction.mp4'))
    copyfile(light / 'checks.txt', out / 'Android-15.txt')
    copyfile(dark / 'checks.txt', out / 'Android-11.txt')
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.iterdir()) if p.is_file()}
    (out / 'SHA256SUMS.txt').write_text(''.join(f'{digest}  {name}\n' for name, digest in hashes.items()))
    print(json.dumps({'source': source, 'real_screens': 50, 'videos': 4, 'assets': list(hashes)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ('light', 'dark', 'output'):
        parser.add_argument(name, type=Path)
    parser.add_argument('source')
    args = parser.parse_args()
    package(args.light, args.dark, args.output, args.source)
