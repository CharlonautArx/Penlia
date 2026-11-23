import re
import sys
from xml.etree.ElementTree import parse

from PIL import Image

image = Image.open(sys.argv[1]).convert('RGB')
nodes = parse(sys.argv[2]).iter('node')
node = next(n for n in nodes if n.get('content-desc') == '一起' and n.get('clickable') == 'true')
left, top, right, bottom = (int(value) for value in re.findall(r'\d+', node.get('bounds')))
center = round(left + .64 * (right - left)) + 8
control_y = bottom - 24
blur_y = top + 68
def red(x, y):
    return sum(image.getpixel((x, y + dy))[0] for dy in range(-3, 4)) / 7

control_edge = red(center - 35, control_y)
control_center = red(center, control_y)
blur_edge = red(center - 80, blur_y)
blur_center = red(center, blur_y)
wing = red(center - 16, blur_y)
wing_expected = (red(center - 80, blur_y) * 96 + red(center + 80, blur_y) * 64) / 160
print(f'Android blur diagnostic: unblurred center={control_center:.1f}, unblurred background={control_edge:.1f}; '
      f'blurred center={blur_center:.1f}, blurred background={blur_edge:.1f}; '
      f'left wing={wing:.1f}, expected flat background there={wing_expected:.1f}.')
assert control_edge - control_center > 100, 'The reference stripe must remain sharp in the region without blur'
assert blur_center - control_center > 35, 'The blur must lighten the black stripe'
assert blur_edge - blur_center > 8, 'The stripe must still contribute to the blurred output'
assert wing_expected - wing > 5, 'The stripe must spread beyond its 8dp width'
print('The same card spatially blurs the stripe and preserves a sharp control, with native API 35 rendering.')
