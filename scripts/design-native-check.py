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
from design_world_match import assess as world_rank, qualifies as world_matches


PACKAGE = 'app.penlia.mobile.designpilot'
PROBE = 'app.penlia.pilot.probe'
SCREENS = ('inbox', 'chat', 'moments', 'world', 'gathering')
VARIANTS = ('original', 'A', 'B', 'C', 'D')
VARIANT_LABELS = {'A': '温润生活主义', 'B': '现代原生极简主义', 'C': 'Apple 风格', 'D': 'Claude 风格'}
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


def animated_tree():
    # The pet keeps moving. Android's uiautomator dump refuses a non-idle tree,
    # so ask UiAutomation directly while the product's animation is still running.
    status = shell('am', 'instrument', '-w', PROBE + '/.WindowProbe')
    if 'probe=ready' not in status:
        reason = re.search(r'probe=([A-Za-z]+)', status)
        raise ValueError('Animated window probe: ' + (reason.group(1) if reason else 'no result'))
    xml = adb('exec-out', 'run-as', PROBE, 'cat', 'files/window.xml', binary=True)
    return ElementTree.fromstring(xml.strip())


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


def tap_label(label, tries=4):
    node = visible(lambda n: any(v == label or v.startswith(label + '，') or v.startswith(label + ',') for v in labels(n)), tries=tries)
    x, y = points(node)
    shell('input', 'tap', str(x), str(y))
    time.sleep(.35)


def capture(name):
    data = adb('exec-out', 'screencap', '-p', binary=True)
    with Image.open(io.BytesIO(data)) as frame:
        if not frame_sizes:
            log(f'Compositor capture {frame.width}×{frame.height}; logical viewport {screen_size[0]}×{screen_size[1]}')
        frame_sizes.add(frame.size)
        assert len(frame_sizes) == 1, 'Compositor size changed during the comparison'
        assert max(ImageStat.Stat(frame.convert('RGB')).stddev) > 8, 'Empty frame'
    (output / (name + '.png')).write_bytes(data)


def log(message):
    with (output / 'checks.txt').open('a', encoding='utf-8') as report:
        print(message, file=report)
    print(message, flush=True)


def debug_context():
    package_matches = re.findall(r'mCurrentFocus=[^\n]*? ([a-zA-Z][a-zA-Z0-9._]+)/', shell('dumpsys', 'window'))
    log('Focus package: ' + (package_matches[-1] if package_matches else 'unavailable'))
    nodes = list(tree().iter('node'))
    known = ('直接进入', '聊天', '好友', '我的', '动态', '小满', '晚风小院', '活动操作', '返回',
             '表情', '发送', '重试', '切换设计方案', '周末到河边喝杯咖啡', 'Unmatched Route', 'Something went wrong')
    names = [label for label in known if any(label in v for n in nodes for v in labels(n))]
    markers = [n.get('resource-id', '').rsplit('/', 1)[-1] for n in nodes if 'pilot-' in n.get('resource-id', '')]
    log('Known fixture/control labels: ' + ', '.join(names[:12]) + '; pilot markers: ' + ', '.join(markers[:3]))


def case(name, task):
    try:
        task()
    except Exception as exc:
        failures.append(name)
        log(f'INCOMPLETE {name}: {exc}')
        try: capture('incomplete-' + name)
        except Exception: pass
        try: debug_context()
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
        shell('cmd', 'alarm', 'set-time', '1795744800000', check=False)
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


def visual_world(variant):
    # Verify the live foreground window twice so a stale screenshot or transition
    # cannot be accepted. Actual delivered PNGs are captured afresh by capture().
    def sample():
        focus = shell('dumpsys', 'window')
        if not re.search(r'mCurrentFocus=[^\n]*\b' + re.escape(PACKAGE) + '/', focus):
            return None
        data = adb('exec-out', 'screencap', '-p', binary=True)
        with Image.open(io.BytesIO(data)) as frame:
            if frame.size != screen_size: return None
            return world_rank(frame, config.api)
    # Ask the standard native tree first where the OS can return it promptly;
    # its idle wait is normally unavailable on this intentionally animated page.
    try:
        dumped = shell('timeout', '3', 'uiautomator', 'dump', '/sdcard/design-room.xml', timeout=8, check=False)
        if 'dumped to' in dumped:
            root = ElementTree.fromstring(adb('exec-out','cat','/sdcard/design-room.xml', binary=True))
            nodes = [n for n in root.iter('node') if points(n)]
            ids = {n.get('resource-id','').rsplit('/',1)[-1] for n in nodes}
            values = [v for n in nodes for v in labels(n)]
            if ({'pilot-' + variant + '-world', 'world-title-' + variant} & ids and
                any('晚风小院' in v for v in values) and
                any(term in v for v in values for term in ('软风','摆件与纪念物','海岸'))):
                log('World verification: native ID + fixture title + secondary room content')
                return True
    except (ValueError, ElementTree.ParseError, subprocess.SubprocessError):
        pass
    last = None
    confirmed = 0
    for _ in range(4):
        last = sample()
        confirmed = confirmed + 1 if last and world_matches(last, variant) else 0
        if confirmed == 2:
            winner, (title, grid) = last[0]
            margin = (title + grid - sum(last[1][1])) / 2
            log(f'World verification: two fresh foreground frames, layout {winner}, title={title:.3f}, grid={grid:.3f}, margin={margin:.3f}')
            return True
        time.sleep(.35)
    if last: log('World visual candidates: ' + str([(v, round(a,2), round(b,2)) for v,(a,b) in last[:2]]))
    return False


def assert_page(variant, screen):
    marker = f'pilot-{variant}-{screen}'
    found_ids = set()
    if screen == 'world' and visual_world(variant):
        return
    inspector = animated_tree if screen == 'world' else tree
    probe_error = ''
    for _ in range(4):
        try:
            nodes = list(inspector().iter('node'))
            ids = {n.get('resource-id', '').rsplit('/', 1)[-1] for n in nodes if points(n)}
            found_ids.update(i for i in ids if i.startswith('pilot-'))
            values = tuple(v for n in nodes if points(n) for v in labels(n))
            content = any(term in v for v in values for term in CONTENTS[screen])
            if screen == 'world':
                content = any('晚风小院' in v for v in values) and any(
                    term in v for v in values for term in ('软风', '摆件与纪念物', '布景与宠物名字', '海岸'))
                matched = marker in ids or ('world-title-' + variant) in ids
            else:
                matched = marker in ids
            if matched and content:
                if screen == 'world': log('World verification: exact native accessibility ID, title and room content')
                time.sleep(.35)
                return
        except (ElementTree.ParseError, ValueError, subprocess.SubprocessError) as exc:
            probe_error = str(exc)[:100]
        time.sleep(.6)
    raise ValueError(f'missing {marker} or fixture; visible pilot route markers {sorted(found_ids)}; {probe_error}')


def swipe(up=True):
    width, height = screen_size
    start, end = (height * .72, height * .38) if up else (height * .38, height * .72)
    shell('input', 'swipe', str(width // 2), str(round(start)), str(width // 2), str(round(end)), '410')
    time.sleep(.25)


def tap_after_scroll(label):
    for turn in range(5):
        try:
            tap_label(label, tries=1)
            return
        except ValueError:
            if turn < 4: swipe()
    raise ValueError('Control outside scrollable viewport: ' + label)


def choose_by_touch(variant):
    tap_label('我的')
    tap_after_scroll('切换设计方案')
    tap_label(VARIANT_LABELS[variant])
    visible(lambda n: n.get('checked') == 'true' and VARIANT_LABELS[variant] in labels(n))
    tap_after_scroll('聊天')
    assert_page(variant, 'inbox')


def screenshot_page(variant, screen):
    route(variant, screen)
    capture(('compact-dark-' if compact else '') + variant + '-' + screen)


@contextlib.contextmanager
def record(variant):
    remote = '/sdcard/penlia-pilot-' + variant + '.mp4'
    proc = subprocess.Popen(['adb', 'shell', 'screenrecord', '--time-limit', '170', '--bit-rate', '2400000', remote],
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
    route('original', 'inbox')
    shell('dumpsys', 'gfxinfo', PACKAGE, 'reset')
    with record(variant):
        choose_by_touch(variant)
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
        # Reading older messages preserves the viewport. Verify delivery in the
        # real thread summary and then in the newly opened transcript.
        shell('input', 'keyevent', '4')
        assert_page(variant, 'inbox')
        sent = visible(lambda n: n.get('clickable') == 'true' and
                       any('小满' in v and 'See you' in v for v in labels(n)))
        x, y = points(sent)
        shell('input', 'tap', str(x), str(y))
        assert_page(variant, 'chat')
        visible(lambda n: any('See you' in v for v in labels(n)))
        route(variant, 'moments'); swipe(); swipe(False)
        route(variant, 'world'); swipe(); swipe(False)
        route(variant, 'gathering')
        tap_label('活动操作')
        visible(lambda n: any('预览分享内容' in v for v in labels(n)))
        shell('input', 'keyevent', '4')
        assert_page(variant, 'gathering')
    metrics(variant, 'mixed navigation / IME / system transitions')


def metrics(variant, description):
    stats = shell('dumpsys', 'gfxinfo', PACKAGE)
    keys = ('Total frames rendered:', 'Janky frames:', '90th percentile:', '95th percentile:')
    values = [next((s.strip() for s in stats.splitlines() if s.strip().startswith(key)), '') for key in keys]
    assert all(values), 'Incomplete frame metrics from Android HWUI'
    log(variant + ' | ' + description + ' | ' + ' / '.join(values))
    assert int(values[0].split(':')[-1].strip()) > 0, 'Android reported zero rendered frames'


def scroll_sample(variant):
    # Same photos, fresh feed, same device, same cadence, animations enabled.
    # Gfxinfo is per-app HWUI, not a device benchmark. No accessibility dumps or
    # recording interrupt this measured sequence. Screenshot capture happens separately.
    route(variant, 'moments')
    time.sleep(.6)
    shell('dumpsys', 'gfxinfo', PACKAGE, 'reset')
    started = time.monotonic()
    for up in (True, True, False, False, True, False):
        swipe(up)
    elapsed = time.monotonic() - started
    metrics(variant, f'photo feed only; 6 gestures; {elapsed:.2f}s; x86_64 emulator')



def compact_search():
    route('C', 'inbox')
    search = lambda: visible(lambda n: n.get('class') == 'android.widget.EditText' and '搜索会话' in labels(n))
    initial = points(search())[1]
    swipe()
    middle = points(search())[1]
    swipe()
    final = points(search())[1]
    log(f'C compact inbox search center Y (logical pixels), before / after 1 / after 2 gestures: {initial}, {middle}, {final}')
    tap_label('搜索会话')
    shell('input', 'text', 'xiaoman')
    visible(lambda n: any('小满' in v for v in labels(n)))
    visible(lambda n: n.get('class') == 'android.widget.EditText' and n.get('text') == 'xiaoman')
    assert re.search(r'mInputShown=true|mIsInputViewShown=true', shell('dumpsys', 'input_method'))
    capture('compact-search-C')
    shell('input', 'keyevent', '4')
    tap_label('清空搜索')
    visible(lambda n: any('阿竹' in v for v in labels(n)))


def compact_input(variant):
    route(variant, 'chat')
    editor = visible(lambda n: n.get('class') == 'android.widget.EditText')
    x, y = points(editor)
    shell('input', 'tap', str(x), str(y))
    shell('input', 'text', 'Hello')
    time.sleep(.6)
    assert re.search(r'mInputShown=true|mIsInputViewShown=true', shell('dumpsys', 'input_method')), 'IME is not visible'
    editor = visible(lambda n: n.get('class') == 'android.widget.EditText' and 'Hello' in n.get('text', ''))
    frames = re.findall(r'type=ime frame=\[0,(\d+)\]\[\d+,\d+\] visible=true', shell('dumpsys', 'window', 'displays'))
    if frames: assert points(editor)[1] < int(frames[-1]), 'Editor intersects the IME'
    capture('compact-keyboard-' + variant)
    shell('input', 'keyevent', '4')
    assert_page(variant, 'chat')
    tap_label('表情')
    visible(lambda n: '大哭' in labels(n))
    shell('input', 'keyevent', '4')
    assert_page(variant, 'chat')


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
        assert delta.getbbox() is not None, f'{a} and {b} produced the same content frame'


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
    frame_sizes = set()
    log(f'Build source {os.environ.get("PILOT_SOURCE_SHA", os.environ.get("GITHUB_SHA", "local"))}; harness {os.environ.get("GITHUB_SHA", "local")}; APK SHA256 {hashlib.sha256(config.apk.read_bytes()).hexdigest()}')
    adb('root')
    adb('wait-for-device')
    adb('install', '-r', str(config.apk), timeout=120)
    adb('install', '-r', str(Path(os.environ['RUNNER_TEMP']) / 'design-window-probe.apk'))
    settings_for_device()
    log('Emulator hardware=' + shell('getprop', 'ro.hardware') + '; EGL=' + shell('getprop', 'ro.hardware.egl') + '; virtual CPUs=' + shell('cat', '/sys/devices/system/cpu/online', check=False) + '; configured GPU host via Mesa software OpenGL, animations enabled')
    for variant in VARIANTS:
        reset_fixture()
        for screen in SCREENS:
            case(variant + '-' + screen, lambda s=screen: screenshot_page(variant, s))
        if not compact: case(variant + '-same-feed-frame-sample', lambda: scroll_sample(variant))
        if variant != 'original':
            if compact:
                if variant == 'C': case('C-compact-search-after-scroll', compact_search)
                case(variant + '-compact-input', lambda: compact_input(variant))
            else:
                case(variant + '-interaction', lambda: interact(variant))
    if not compact:
        def verify_persistence():
            shell('am', 'force-stop', PACKAGE)
            shell('am', 'start', '-W', '-n', PACKAGE + '/.MainActivity')
            assert_page('D', 'inbox')
        case('last-choice-survives-cold-start', verify_persistence)
    for screen in SCREENS:
        case(screen + '-comparison', lambda s=screen: compare_frames(s))
    adb('uninstall', PROBE, check=False)
    if failures:
        raise SystemExit('Incomplete checks: ' + ', '.join(failures))
