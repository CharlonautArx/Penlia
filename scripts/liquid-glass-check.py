"""Review the isolated Release with real Android UI, screenshot and HWUI evidence."""
import contextlib
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time
from xml.etree import ElementTree
from PIL import Image

APK, OUT, MODE = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
PKG = 'app.penlia.mobile.liquidglass'
OUT.mkdir(exist_ok=True)
errors = []


def adb(*args, binary=False):
    result = subprocess.run(['adb', *args], capture_output=True, check=True, timeout=45)
    return result.stdout if binary else result.stdout.decode(errors='replace').strip()


def shell(*args):
    return adb('shell', shlex.join(args))


def log(value):
    with (OUT / 'checks.txt').open('a') as report:
        print(value, file=report)
    print(value, flush=True)


def screen(name):
    file = OUT / (name + '.png')
    file.write_bytes(adb('exec-out', 'screencap', '-p', binary=True))
    with Image.open(file) as image:
        assert image.size == (540, 1200)


def nodes():
    if 'dumped to' not in shell('uiautomator', 'dump', '/sdcard/glass.xml'):
        raise ValueError('UI tree unavailable')
    return list(ElementTree.fromstring(adb('exec-out', 'cat', '/sdcard/glass.xml', binary=True)).iter('node'))


def find(label=None, kind=None, tries=3, prefix=False):
    for _ in range(tries):
        try:
            for node in nodes():
                if kind and node.get('class') != kind:
                    continue
                values = [node.get('text', ''), node.get('content-desc', ''), node.get('resource-id', '')]
                if label and not any(v == label or v.startswith(label + '，') or (prefix and v.startswith(label)) for v in values):
                    continue
                box = [int(n) for n in re.findall(r'\d+', node.get('bounds', ''))]
                if len(box) == 4 and box[0] < box[2] and box[1] < box[3]:
                    return (box[0]+box[2])//2, (box[1]+box[3])//2
        except (ValueError, subprocess.SubprocessError, ElementTree.ParseError):
            pass
        time.sleep(.35)
    raise AssertionError('Visible control: ' + str(label or kind))


def tap(label=None, **kwargs):
    x, y = find(label, **kwargs)
    shell('input', 'tap', str(x), str(y))
    time.sleep(.4)


def route(path):
    result = shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'penlia-liquid://' + path, PKG)
    assert 'Status: ok' in result and 'Error:' not in result
    time.sleep(.8)


def back():
    shell('input', 'keyevent', '4')
    time.sleep(.5)


def swipe(y_from, y_to, ms=500):
    shell('input', 'swipe', '260', str(y_from), '260', str(y_to), str(ms))


@contextlib.contextmanager
def record(name):
    path = '/sdcard/' + name + '.mp4'
    p = subprocess.Popen(['adb','shell','screenrecord','--time-limit','150','--bit-rate','1600000',path],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(.8)
    try:
        yield
    finally:
        if p.poll() is None:
            shell('pkill', '-INT', 'screenrecord')
        p.wait(timeout=12)
        adb('pull', path, str(OUT / (name + '.mp4')))


def check(name, test):
    try:
        test()
        log('PASS ' + name)
    except Exception as error:
        errors.append(name)
        log('INCOMPLETE ' + name + ' ' + str(error)[:160])
        screen('incomplete-' + name)


def launch():
    info = shell('am', 'start', '-W', '-n', PKG + '/.MainActivity')
    assert 'Status: ok' in info
    for line in info.splitlines():
        if line.startswith(('LaunchState:', 'TotalTime:')):
            log(line)
    find('搜索会话')
    find('玩乐')
    screen('01-inbox')


def simulate():
    with record('optics-navigation'):
        tap('好友')
        screen('02-friends')
        tap('玩乐')
        screen('03-play')
        tap('动态')
        screen('04-moments')
        swipe(1020, 370, 700)
        screen('04-scroll')
        tap('我的')
        screen('05-me')
        tap('聊天')
        swipe(1020, 520, 600)
        screen('01-scroll')
        tap(kind='android.widget.EditText')
        shell('input', 'text', 'xiaoman')
        assert re.search(r'mInputShown=true|mIsInputViewShown=true', shell('dumpsys','input_method'))
        screen('01-keyboard')
        back()


def accelerator():
    api = int(shell('getprop', 'ro.build.version.sdk'))
    output = adb('logcat', '-d', '-s', 'PenliaGlass')
    rejected = 'Dock shader unavailable' in output
    log(('AGSL active' if 'Dock AGSL active' in output else 'AGSL absent') + '; fallback triggered ' + str(rejected))
    if api >= 33:
        assert 'Dock AGSL active' in output and not rejected
    else:
        assert 'Dock AGSL active' not in output


def performance():
    route('(tabs)/moments')
    find('动态')
    shell('dumpsys','gfxinfo',PKG,'reset')
    for i in range(6):
        swipe(1000 if i % 2 == 0 else 440, 440 if i % 2 == 0 else 1000, 490)
    output = shell('dumpsys','gfxinfo',PKG)
    keys = ('Total frames rendered:', 'Janky frames:', '90th percentile:', '95th percentile:')
    for key in keys:
        log(next(line.strip() for line in output.splitlines() if line.strip().startswith(key)))
    assert int(re.search(r'Total frames rendered: (\d+)',output)[1]) > 0


def details(path, name, expected=None):
    route(path)
    if expected:
        find(expected)
    assert PKG in shell('dumpsys','window')
    screen(name)


adb('install', '-r', str(APK))
shell('wm','size','540x1200')
shell('wm','density','240')
shell('settings','put','system','font_scale','1.0')
shell('settings','put','secure','show_ime_with_hard_keyboard','1')
shell('svc','wifi','disable')
shell('svc','data','disable')
log('Android API ' + shell('getprop','ro.build.version.sdk') + '; ABI ' + shell('getprop','ro.product.cpu.abi') + '; offline; 540x1200 / 240dpi')
check('cold-start-inbox', launch)
check('navigation-scroll-keyboard', simulate)
check('sdk-optics-path', accelerator)
check('six-scroll-hwui', performance)
if MODE == '--full':
    check('single-chat', lambda: details('chat/demo-xiaoman', '06-chat', '表情'))
    check('profile', lambda: details('profile', '07-profile'))
    check('privacy', lambda: details('privacy', '08-privacy'))
    check('gathering', lambda: details('gathering/preview-gathering?together=1', '09-gathering', '活动操作'))
    check('life-hub', lambda: details('life', '10-life', '约朋友一起玩'))
    check('boundary', lambda: details('boundary', '11-boundary'))
if errors:
    raise SystemExit('Incomplete: ' + ', '.join(errors))
