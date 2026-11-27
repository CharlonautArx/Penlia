"""Collect comparable, on-device screenshots and interaction evidence from the pilot Release."""
import argparse
import contextlib
import hashlib
import io
import itertools
import os
from pathlib import Path
import re
import shlex
import subprocess
import time
from xml.etree import ElementTree

from PIL import Image, ImageChops, ImageStat


PACKAGE = 'app.penlia.mobile.designpilot'
SCREENS = ('inbox', 'chat', 'moments', 'world', 'gathering')
VARIANTS = ('original', 'A', 'B', 'C', 'D')
CONTENTS = {
    'inbox': ('小满',), 'chat': ('表情',), 'moments': ('发布动态', '日志', '相册'),
    'world': ('晚风小院', '共同世界', '共同小宠物'), 'gathering': ('周末到河边喝杯咖啡',),
}


def adb(*args, timeout=45, binary=False, check=True):
    result = subprocess.run(['adb', *args], capture_output=True, check=check, timeout=timeout)
    return result.stdout if binary else result.stdout.decode(errors='replace').strip()


def shell(*args, **kwargs):
    # adb joins shell arguments on the device. Quote the entire URI, including its ampersand.
    return adb('shell', shlex.join(args), **kwargs)


def tree():
    result = shell('uiautomator', 'dump', '/sdcard/design-pilot.xml')
    if 'dumped to' not in result:
        raise ValueError('Android accessibility tree temporarily unavailable')
    return ElementTree.fromstring(adb('exec-out', 'cat', '/sdcard/design-pilot.xml', binary=True).strip())


def labels(node):
    return (node.get('text', ''), node.get('content-desc', ''))


def points(node):
    bounds = list(map(int, re.findall(r'-?\d+', node.get('bounds', ''))))
    if len(bounds) != 4: return None
    left, top, right, bottom = bounds
    return ((left + right) // 2, (top + bottom) // 2) if right > left and bottom > top else None


def visible(predicate, tries=4):
    for _ in range(tries):
        try:
            for node in tree().iter('node'):
                if predicate(node) and points(node):
                    return node
        except (ValueError, ElementTree.ParseError, subprocess.SubprocessError):
            pass
        time.sleep(.4)
    raise ValueError('Expected control unavailable')


def tap_label(label):
    node = visible(lambda n: any(v == label or v.startswith(label + '，') or v.startswith(label + ',') for v in labels(n)))
    x, y = points(node)
    shell('input', 'tap', str(x), str(y))
    time.sleep(.35)


def capture(name):
    data = adb('exec-out', 'screencap', '-p', binary=True)
    with Image.open(io.BytesIO(data)) as frame:
        assert frame.size == screen_size, (name, frame.size)
        assert max(ImageStat.Stat(frame.convert('RGB')).stddev) > 8, 'Empty frame'
    (output / (name + '.png')).write_bytes(data)


def log(message):
    with (output / 'checks.txt').open('a', encoding='utf-8') as report:
        print(message, file=report)
    print(message, flush=True)


def case(name, task):
    try:
        task()
    except Exception as exc:
        failures.append(name)
        log(f'INCOMPLETE {name}: {exc}')
        try: capture('incomplete-' + name)
        except Exception: pass
    else:
        log('PASS ' + name)


def settings_for_device():
    shell('wm', 'size', f'{screen_size[0]}x{screen_size[1]}')
    shell('wm', 'density', '270' if compact else '300')
    shell('settings', 'put', 'system', 'font_scale', '1.30' if compact else '1.0')
    shell('cmd', 'uimode', 'night', 'yes' if compact else 'no')
    shell('settings', 'put', 'system', 'accelerometer_rotation', '0')
    shell('settings', 'put', 'system', 'user_rotation', '0')
    shell('settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '1')
    shell('settings', 'put', 'global', 'hide_error_dialogs', '1')
    shell('settings', 'put', 'global', 'sysui_demo_allowed', '1')
    for args in [('enter',), ('clock', '--es', 'hhmm', '1000'), ('battery', '--es', 'level', '100', '--es', 'plugged', 'false')]:
        shell('am', 'broadcast', '-a', 'com.android.systemui.demo', '--es', 'command', *args)
    shell('svc', 'wifi', 'disable')
    shell('svc', 'data', 'disable')
    api = shell('getprop', 'ro.build.version.sdk')
    assert api == str(config.api)
    assert float(shell('settings', 'get', 'system', 'font_scale')) == (1.3 if compact else 1.0)
    log(f'Android API {api}; ABI {shell("getprop","ro.product.cpu.abi")}; size {screen_size}; density {shell("wm","density")}; font {shell("settings","get","system","font_scale")}; {shell("cmd","uimode","night")}; no network')


def reset_fixture():
    assert 'Success' in shell('pm', 'clear', PACKAGE)
    # The default AOSP SDK image permits a reproducible emulator clock. Only the phone's
    # isolated test clock is affected. Do not silently compare freshly seeded relative dates.
    shell('settings', 'put', 'global', 'auto_time', '0')
    shell('date', '-u', '112702002026.00', check=False)
    if shell('date', '-u', '+%Y%m%d%H%M') != '202611270200':
        if 'fixture-clock' not in failures: failures.append('fixture-clock')
        log('INCOMPLETE fixed fixture clock on this SDK image; thumbnails and texts still use the same offline fixture')
    info = shell('am', 'start', '-W', '-n', PACKAGE + '/.MainActivity')
    assert 'Status: ok' in info
    log('cold start ' + ', '.join(line.strip() for line in info.splitlines() if line.startswith(('LaunchState:', 'TotalTime:', 'WaitTime:'))))
    time.sleep(2)


def route(variant, screen):
    uri = f'penliapilot://design-pilot?variant={variant}&screen={screen}'
    info = shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', uri, PACKAGE)
    assert 'Error:' not in info and 'Status: ok' in info, info
    assert_page(variant, screen)


def assert_page(variant, screen):
    marker = f'pilot-{variant}-{screen}'
    found_ids = set()
    for _ in range(6):
        try:
            nodes = list(tree().iter('node'))
            ids = {n.get('resource-id', '').rsplit('/', 1)[-1] for n in nodes if points(n)}
            found_ids.update(i for i in ids if i.startswith('pilot-'))
            if marker in ids and any(term in v for n in nodes for v in labels(n) for term in CONTENTS[screen]):
                time.sleep(.35)
                return
        except (ElementTree.ParseError, ValueError, subprocess.SubprocessError):
            pass
        time.sleep(.6)
    raise ValueError(f'missing {marker} or fixture; visible pilot route markers {sorted(found_ids)}')


def swipe(up=True):
    width, height = screen_size
    start, end = (height * .72, height * .38) if up else (height * .38, height * .72)
    shell('input', 'swipe', str(width // 2), str(round(start)), str(width // 2), str(round(end)), '410')
    time.sleep(.25)


def screenshot_page(variant, screen):
    route(variant, screen)
    capture(('compact-dark-' if compact else '') + variant + '-' + screen)


@contextlib.contextmanager
def record(variant):
    remote = '/sdcard/penlia-pilot-' + variant + '.mp4'
    proc = subprocess.Popen(['adb', 'shell', 'screenrecord', '--time-limit', '125', '--bit-rate', '2400000', remote],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(.7)
        yield
    finally:
        if proc.poll() is None:
            shell('pkill', '-INT', 'screenrecord', check=False)
        proc.wait(timeout=12)
        dest = output / (variant + '-interaction.mp4')
        adb('pull', remote, str(dest))
        # Verify a decodable H.264 stream and real interaction duration.
        probe = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                                         '-show_entries', 'stream=codec_name,duration',
                                         '-of', 'default=noprint_wrappers=1', str(dest)], text=True)
        assert 'codec_name=h264' in probe and float(re.search(r'duration=([\d.]+)', probe).group(1)) >= 3


def interact(variant):
    # Navigate to the real conversation by touch; use the internal switch for distant destinations.
    route(variant, 'inbox')
    shell('dumpsys', 'gfxinfo', PACKAGE, 'reset')
    with record(variant):
        swipe(); swipe(False)
        friend = visible(lambda n: n.get('clickable') == 'true' and any('小满' in text for text in labels(n)))
        x, y = points(friend)
        shell('input', 'tap', str(x), str(y))
        assert_page(variant, 'chat')
        swipe(); swipe(False)
        tap_label('表情')
        visible(lambda n: '大哭' in labels(n))
        shell('input', 'keyevent', '4')
        assert_page(variant, 'chat')
        editor = visible(lambda n: n.get('class') == 'android.widget.EditText')
        x, y = points(editor)
        shell('input', 'tap', str(x), str(y))
        shell('input', 'text', 'See%syou')
        assert re.search(r'mInputShown=true|mIsInputViewShown=true', shell('dumpsys', 'input_method')), 'IME closed'
        shell('input', 'keyevent', '4')
        tap_label('发送')
        visible(lambda n: any('See you' in v for v in labels(n)))
        shell('input', 'keyevent', '4')
        assert_page(variant, 'inbox')
        route(variant, 'moments'); swipe(); swipe(False)
        route(variant, 'world'); swipe(); swipe(False)
        route(variant, 'gathering')
        tap_label('活动操作')
        visible(lambda n: any('预览分享内容' in v for v in labels(n)))
        shell('input', 'keyevent', '4')
        assert_page(variant, 'gathering')
    stats = shell('dumpsys', 'gfxinfo', PACKAGE)
    section = [s.strip() for s in stats.splitlines() if s.strip().startswith(('Total frames rendered:', 'Janky frames:', '90th percentile:', '95th percentile:'))]
    log(variant + ' emulator compositor sample: ' + ' / '.join(section[:4]))


def compare_frames(screen):
    prefix = 'compact-dark-' if compact else ''
    data = {}
    for variant in VARIANTS:
        with Image.open(output / (prefix + variant + '-' + screen + '.png')) as source:
            width, height = source.size
            data[variant] = source.crop((0, int(height * .04), width, int(height * .93))).convert('RGB').resize((96, 180))
    for a, b in itertools.combinations(VARIANTS, 2):
        delta = ImageChops.difference(data[a], data[b])
        fraction = sum(max(pixel) > 21 for pixel in delta.getdata()) / (delta.width * delta.height)
        log(f'{screen} {a}/{b} area differing by >21 in at least one RGB channel: {fraction:.1%}')
        assert fraction > .025, f'{a} and {b} appear almost identical'


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('apk', type=Path)
    parser.add_argument('out', type=Path)
    parser.add_argument('--api', type=int, choices=(30, 35), required=True)
    config = parser.parse_args()
    output = config.out
    output.mkdir(exist_ok=True)
    compact = config.api == 30
    screen_size = (540, 1080) if compact else (720, 1600)
    failures = []
    log(f'Build source {os.environ.get("PILOT_SOURCE_SHA", os.environ.get("GITHUB_SHA", "local"))}; harness {os.environ.get("GITHUB_SHA", "local")}; APK SHA256 {hashlib.sha256(config.apk.read_bytes()).hexdigest()}')
    adb('root')
    adb('wait-for-device')
    adb('install', '-r', str(config.apk), timeout=120)
    settings_for_device()
    for variant in VARIANTS:
        reset_fixture()
        for screen in SCREENS:
            case(variant + '-' + screen, lambda s=screen: screenshot_page(variant, s))
        if not compact and variant != 'original':
            case(variant + '-interaction', lambda: interact(variant))
    for screen in SCREENS:
        case(screen + '-comparison', lambda s=screen: compare_frames(s))
    if failures:
        raise SystemExit('Incomplete checks: ' + ', '.join(failures))
