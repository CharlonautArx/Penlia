"""Match two native room landmarks while the pet continues animating."""
import base64
import json
from math import sqrt
from pathlib import Path
import zlib
from PIL import Image, ImageFilter

def edge_image(frame):
    return frame.convert('L').resize((400,888), Image.Resampling.LANCZOS).filter(ImageFilter.FIND_EDGES)

def patch(edge, box, dx=0, dy=0):
    left, top, right, bottom = box
    roi = edge.crop((2*(left+dx),2*(top+dy),2*(right+dx),2*(bottom+dy)))
    return list(roi.resize((28,12), Image.Resampling.BOX).getdata())

def unit(values):
    mean = sum(values)/len(values)
    centered = [v-mean for v in values]
    norm = sqrt(sum(v*v for v in centered))
    return [v/norm for v in centered] if norm else [0.]*len(values)

def assess(frame, api):
    path = Path(__file__).with_name('design-pilot-probe')/'world-anchors.json'
    refs = json.loads(path.read_text())[str(api)]
    edge = edge_image(frame)
    scores = {}
    for variant, stages in refs.items():
        best = (-1., -1.)
        for stage in stages:
            boxes = stage['boxes']
            targets = [unit(zlib.decompress(base64.b64decode(v))) for v in stage['edges']]
            # Some startup/IME sequences re-apply the OS insets. Both landmarks
            # must translate together; unrelated patches cannot pick offsets independently.
            for dy in range(-42, 43, 2):
                matches = []
                for box, target in zip(boxes, targets):
                    candidates = [unit(patch(edge, box, dx, dy)) for dx in (-1,0,1)]
                    matches.append(max(sum(x*y for x,y in zip(target,v)) for v in candidates))
                if sum(matches) > sum(best): best = tuple(matches)
        scores[variant] = best
    return sorted(scores.items(), key=lambda item: sum(item[1]), reverse=True)


def qualifies(ranking, expected):
    (winner, pair), (_, runner_up) = ranking[:2]
    gap = (sum(pair) - sum(runner_up)) / 2
    return winner == expected and min(pair) >= .61 and sum(pair)/2 >= .73 and gap >= .10
