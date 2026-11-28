"""Validate the offline Android startup artwork and launcher on a clean emulator."""
import re
import statistics
import sys
import tempfile
import time
from pathlib import Path
from subprocess import CalledProcessError, Popen, run
from xml.etree import ElementTree

from PIL import Image, ImageChops, ImageOps, ImageStat

apk, output = map(Path, sys.argv[1:])
output.mkdir(exist_ok=True)
package = 'app.penlia.mobile.preview'
activity = package + '/.MainActivity'
source = Path('assets/startup/penlia_new_splash.jpg')
checks = output / 'android-checks.txt'


def adb(*args, binary=False):
    result = run(['adb', *args], capture_output=True, check=True, timeout=45).stdout
    return result if binary else result.decode().strip()


def shell(*args):
    return adb('shell', *args)


def record(message):
    print(message, flush=True)
    with checks.open('a', encoding='utf-8') as report:
        print(message, file=report)


def screenshot(name):
    (output / name).write_bytes(adb('exec-out', 'screencap', '-p', binary=True))


def find(label, attempts=5):
    for _ in range(attempts):
        try:
            shell('uiautomator', 'dump', '/sdcard/branding-ui.xml')
            tree = ElementTree.fromstring(shell('cat', '/sdcard/branding-ui.xml'))
        except (CalledProcessError, ElementTree.ParseError):
            continue
        for node in tree.iter('node'):
            if label in (node.get('text'), node.get('content-desc')):
                x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.attrib['bounds']))
                return (str((x1 + x2) // 2), str((y1 + y2) // 2))
    raise AssertionError(f'Missing Android control: {label}')


def cold_start():
    shell('am', 'force-stop', package)
    result = shell('am', 'start', '-W', '-n', activity)
    assert 'Status: ok' in result and 'LaunchState: COLD' in result, result
    return int(re.search(r'TotalTime:\s*(\d+)', result).group(1))


def select_startup_frame(video, directory):
    run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(video),
         str(directory / 'frame-%04d.png')], check=True, timeout=60)
    filenames = sorted(directory.glob('frame-*.png'))
    assert filenames, 'No emulator video frames'
    with Image.open(filenames[0]) as first:
        size = (first.width // 3, first.height // 3)
    reference = ImageOps.contain(Image.open(source).convert('RGB'), size, Image.Resampling.LANCZOS)
    left = (size[0] - reference.width) // 2
    top = (size[1] - reference.height) // 2
    regions = [(370, 850, 935, 1335), (500, 2230, 755, 2360)]
    templates = []
    for shift in range(-10, 11, 2):
        boxes = []
        for x1, y1, x2, y2 in regions:
            box = (round(x1 * reference.width / 1256), round(y1 * reference.height / 2760),
                   round(x2 * reference.width / 1256), round(y2 * reference.height / 2760))
            screen_box = (box[0] + left, box[1] + top + shift, box[2] + left, box[3] + top + shift)
            patch = reference.crop(box)
            blank = Image.new('RGB', patch.size, 'white')
            contrast = sum(ImageStat.Stat(ImageChops.difference(patch, blank)).mean)
            boxes.append((screen_box, patch, contrast))
        templates.append(boxes)
    best = (float('inf'), None)
    for filename in filenames:
        with Image.open(filename) as frame:
            thumbnail = frame.convert('RGB').resize(size, Image.Resampling.LANCZOS)
        for boxes in templates:
            scores = [sum(ImageStat.Stat(ImageChops.difference(thumbnail.crop(box), patch)).mean) / contrast
                      for box, patch, contrast in boxes]
            best = min(best, (max(scores), filename), key=lambda match: match[0])
    error, filename = best
    assert error < 0.8, f'Full splash artwork and wordmark did not both match. Error {error:.3f}'
    (output / 'android-offline-startup.png').write_bytes(filename.read_bytes())
    record(f'PASS logo and wordmark both visible on real startup frame (normalized error {error:.3f})')


def main():
    adb('install', str(apk))
    shell('svc', 'wifi', 'disable')
    shell('svc', 'data', 'disable')
    assert shell('settings', 'get', 'global', 'wifi_on') == '0'
    assert shell('settings', 'get', 'global', 'mobile_data') == '0'
    shell('input', 'keyevent', 'KEYCODE_HOME')
    time.sleep(1)
    height = int(re.findall(r'\d+x(\d+)', shell('wm', 'size'))[-1])
    width = int(re.findall(r'(\d+)x\d+', shell('wm', 'size'))[-1])
    shell('input', 'swipe', str(width // 2), str(83 * height // 100),
          str(width // 2), str(height // 4), '420')
    find('朋聊')
    screenshot('android-launcher.png')
    record('PASS Android app drawer shows 朋聊 on a fresh installation')

    remote_video = '/sdcard/penlia-branding-start.mp4'
    with tempfile.TemporaryDirectory() as temp:
        capture = Popen(['adb', 'shell', 'screenrecord', '--time-limit', '5',
                         '--bit-rate', '6000000', remote_video])
        try:
            time.sleep(1)
            first = cold_start()
            find('直接进入')
        finally:
            assert capture.wait(timeout=15) == 0, 'Android screenrecord failed'
        video = output / 'android-cold-start.mp4'
        adb('pull', remote_video, str(video))
        select_startup_frame(video, Path(temp))

    shell('input', 'tap', *find('直接进入'))
    find('玩乐')
    screenshot('android-after-launch.png')
    times = [cold_start() for _ in range(3)]
    find('玩乐')
    record(f'PASS demo entry and restored session without Wi-Fi or mobile data on Android API {shell("getprop", "ro.build.version.sdk")}')
    record(f'First cold start {first}ms. Restored cold starts {times}ms, median {statistics.median(times)}ms.')


if __name__ == '__main__':
    main()
