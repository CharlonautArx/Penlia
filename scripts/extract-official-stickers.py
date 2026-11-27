"""Extract the first pack from the verified original using Pillow, NumPy and SciPy."""
from hashlib import sha256
from pathlib import Path
import sys

from PIL import Image
import numpy as np
from scipy import ndimage as ndi

SOURCE = 'd229b4d021dedb951e4da4d39fea806f8746e05cf922a87212e8f15fd57d2bb5'
ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / 'assets/stickers/official'
# IDs are anchored to the original row and slot. Their presentation order is separate.
# An asterisk identifies an object, gesture, animal or full-body figure.
ROWS = [
    (99, [(70, '大哭'), (178, '心动捧脸'), (285, '捧心微笑'), (677, '墨镜'), (777, '睡着了'),
          (878, '闭眼掉泪'), (984, '紧张冒汗')]),
    (216, [(68, '探头'), (582, '轻戳脸颊'), (680, '*太阳'), (778, '抬眼担心'), (884, '偷笑'), (983, '眯眼微笑')]),
    (338, [(70, '*月亮'), (172, '*蛋糕'), (271, '*礼盒'), (373, '*礼花'), (476, '开怀大笑'),
           (579, '露齿笑'), (679, '嘘'), (780, '晕头转向'), (883, '惊得冒烟'), (985, '托腮微笑')]),
    (465, [(67, '微笑'), (168, '忍住眼泪'), (269, '爱心眼'), (373, '睁大眼睛'), (581, '安然'),
           (782, '无语冒汗'), (885, '若有所思'), (987, '对手指')]),
    (585, [(67, '困到冒泡'), (168, '皱眉掉泪'), (270, '脸红冒汗'), (680, '皱眉伤心'), (988, '笑出眼泪')]),
    (703, [(67, '嘴角下垂'), (374, '吃瓜'), (581, '*小狗'), (987, '放松')]),
    (815, [(66, '崩溃'), (171, '亮眼捧脸'), (372, '得意笑'), (474, '飞吻'), (575, '哭笑抱抱'),
           (673, '笑着冒汗'), (886, '斜眼笑'), (987, '圆眼镜')]),
    (923, [(64, '有点难过'), (164, '眼泪汪汪'), (576, '尖叫'), (675, '惊恐捂嘴'), (887, '笑着抱抱')]),
    (1029, [(63, '翻白眼'), (269, '不满'), (372, '摸下巴'), (477, '流口水'), (581, '气得冒烟'),
            (685, '眼里有星星'), (788, '被爱包围'), (888, '闭眼亲亲'), (985, '舔嘴唇')]),
    (1142, [(65, '捂嘴轻笑'), (165, '别出声'), (580, '*小猪'), (891, '乖巧微笑')]),
    (1255, [(61, '鼓气', 1286), (145, '乖巧', 1286), (370, '彩虹吐舌'), (475, '星星眼大笑'),
            (580, '*倒拇指'), (686, '*握手'), (789, '*比耶'), (891, '*交叉手指'), (991, '*捏手')]),
    (1373, [(62, '兴奋'), (145, '捧爱心'), (229, '红脸微笑'), (320, '圆眼微笑'), (448, '*摊手'),
            (568, '*爱心'), (675, '*玫瑰'), (800, '*垂下的玫瑰'), (924, '*拳头')]),
]


def cut(source, box, shadow_start=None):
    crop = np.asarray(source.crop(box)).astype(float)
    edge = np.concatenate((crop[0], crop[-1], crop[:, 0], crop[:, -1]))
    white = np.maximum(246, np.quantile(edge, 0.75, axis=0))
    delta = np.maximum(white - crop, 0)
    contrast = delta.max(axis=2)
    labels, _ = ndi.label(contrast > 20, np.ones((3, 3)))
    enough = np.bincount(labels.ravel()) >= 10
    enough[0] = False
    core = ndi.binary_fill_holes(enough[labels])
    assert core.sum() > 1500, box
    reference = ndi.distance_transform_edt(core) > 1.4
    near = ndi.distance_transform_edt(~reference, return_distances=False, return_indices=True)
    foreground_delta = np.maximum(white - crop[tuple(near)], 0)
    alpha = np.sum(delta * foreground_delta, axis=2) / np.maximum(np.sum(foreground_delta ** 2, axis=2), 1)
    alpha = np.clip(np.maximum(alpha, (delta / white).max(axis=2)), 0, 1)
    # Only pixels close to an isolated subject can contribute to the exterior matte.
    exterior_distance = ndi.distance_transform_edt(~core)
    confidence = np.clip((contrast - 3) / 8, 0, 1) * np.clip((5.5 - exterior_distance) / 2.5, 0, 1)
    alpha *= confidence
    alpha[reference] = 1
    if shadow_start is not None:
        # These five rendered faces sit on a white floor. Keep only the translucent
        # contact shadow in the neutral pixels below the colored face.
        shadow = (np.arange(crop.shape[0])[:, None] + box[1] >= shadow_start) & (np.ptp(crop, axis=2) < 30)
        alpha[shadow] = ((delta / white).max(axis=2) * confidence)[shadow]
        reference &= ~shadow
    rgb = np.clip(white - delta / np.maximum(alpha[:, :, None], .001), 0, 255)
    rgb[reference] = crop[reference]
    rgba = Image.fromarray(np.rint(np.dstack((rgb, alpha * 255))).astype('uint8'))
    bounds = rgba.getbbox()
    assert bounds and 0 < bounds[0] < bounds[2] < rgba.width and 0 < bounds[1] < bounds[3] < rgba.height, (box, bounds)
    artwork = rgba.crop(bounds)
    canvas = Image.new('RGBA', (112, 112))
    canvas.paste(artwork, tuple((112 - length) // 2 for length in artwork.size))
    return canvas


def extract(path):
    assert sha256(path.read_bytes()).hexdigest() == SOURCE, 'Unexpected source image'
    source = Image.open(path).convert('RGB')
    assert source.size == (1055, 1491)
    records = []
    for row, (row_y, entries) in enumerate(ROWS, 1):
        for slot, (x, label, *center) in enumerate(entries, 1):
            y = center[0] if center else row_y
            left = max(x - 52, (entries[slot - 2][0] + x) // 2) if slot > 1 else x - 52
            right = min(x + 52, (entries[slot][0] + x) // 2) if slot < len(entries) else x + 52
            top = max(y - 52, 1329) if row == 12 and x < 190 else y - 52
            bottom = min(y + 52, 1329) if row == 11 and x < 190 else y + 52
            identifier = f'r{row:02d}s{slot:02d}'
            other = label.startswith('*')
            shadow_start = y + 25 if row == 11 and slot <= 2 or row == 12 and slot <= 3 else None
            canvas = cut(source, (left, top, right, bottom), shadow_start)
            canvas.save(PACK / f'{identifier}.png', optimize=True)
            records.append((other, identifier, label.lstrip('*')))
    records.sort(key=lambda entry: entry[0])
    assert len(records) == 84 and sum(r[0] for r in records) == 17
    output = [
        '// Generated by scripts/extract-official-stickers.py.',
        "import type { OfficialSticker } from './types';",
        '',
        'export const officialStickers: readonly OfficialSticker[] = [',
    ]
    for other, identifier, label in records:
        category = 'other' if other else 'faces'
        output.append(f"  {{ id: '{identifier}', label: '{label}', category: '{category}', source: require('../../../assets/stickers/official/{identifier}.png') }},")
    output += ['];', '']
    (ROOT / 'src/features/stickers/official.ts').write_text('\n'.join(output))
    print('67 faces, 17 others, 84 total')


if __name__ == '__main__':
    extract(Path(sys.argv[1]))
