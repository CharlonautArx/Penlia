"""Review the isolated Release with real Android UI, screenshot and HWUI evidence."""
import contextlib
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time
from xml.etree import ElementTree
from hashlib import sha256
from PIL import ImageDraw
from PIL import Image, ImageChops

APK, OUT = Path(sys.argv[1]), Path(sys.argv[2])
PKG = 'app.penlia.mobile.liquidglass.targeted'
BASE = 'app.penlia.mobile.liquidglass.depth'
ORIGINAL = 'app.penlia.mobile.preview'
API = int(subprocess.check_output(['adb','shell','getprop','ro.build.version.sdk'],text=True).strip())
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
    tree = list(ElementTree.fromstring(adb('exec-out', 'cat', '/sdcard/glass.xml', binary=True)).iter('node'))
    if any("Quickstep isn't responding" in node.get('text', '') for node in tree):
        log('System launcher Quickstep ANR detected; restarting only com.android.launcher3')
        shell('am', 'force-stop', 'com.android.launcher3')
        raise ValueError('Quickstep system dialog cleared')
    return tree


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


def route(path, package=PKG):
    result = shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', ('penlia-liquid-depth://' if package == BASE else 'penlia-liquid-targeted://') + path, package)
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


def compare(left, right, name):
    with Image.open(OUT / (left + '.png')) as a, Image.open(OUT / (right + '.png')) as b:
        image = Image.new('RGB', (1104,1224), 'white')
        image.paste(a,(0,24))
        image.paste(b,(564,24))
        draw = ImageDraw.Draw(image)
        draw.text((8,4),'Depth baseline',fill='#222222')
        draw.text((572,4),'Targeted preview',fill='#222222')
        image.save(OUT/(name+'.png'))


def separate_installs():
    packages = shell('pm','list','packages','-U')
    uids = set()
    for app in (BASE, PKG, ORIGINAL):
        uid = re.search(r'package:' + re.escape(app) + r' uid:(\d+)', packages)
        assert uid and 'dataDir=/data/user/0/' + app in shell('dumpsys','package',app)
        uids.add(uid[1])
    assert len(uids) == 3


def protection():
    route('chat-settings/demo-xiaoman', BASE)
    x,y = find('消息免打扰', kind='android.widget.Switch')
    screen('baseline-switch')
    route('chat-settings/demo-xiaoman')
    assert find('消息免打扰', kind='android.widget.Switch') == (x,y)
    screen('targeted-switch')
    with Image.open(OUT/'baseline-switch.png') as one, Image.open(OUT/'targeted-switch.png') as two:
        box = (x-33,y-23,x+33,y+23)
        assert not ImageChops.difference(one.crop(box).convert('RGB'),two.crop(box).convert('RGB')).getbbox()
    route('', BASE)
    find('搜索会话')
    screen('baseline-inbox')
    route('')
    find('搜索会话')
    screen('targeted-inbox')
    with Image.open(OUT/'baseline-inbox.png') as one, Image.open(OUT/'targeted-inbox.png') as two:
        box = (0,1089,540,1161)
        diff = ImageChops.difference(one.crop(box).convert('RGB'),two.crop(box).convert('RGB')).getbbox()
        log('Dock crop difference (unread mark recolored) ' + str(diff))
        assert not diff or diff[2] <= 108
    with Image.open(OUT/'targeted-inbox.png') as image:
        assert (255,107,112) in image.convert('RGB').crop((360,110,540,1000)).getdata(), 'unread red not found'
    compare('baseline-inbox','targeted-inbox','inbox-comparison')


def surfaces():
    route('chat/demo-xiaoman', BASE)
    find('表情')
    screen('baseline-peer')
    route('chat/demo-xiaoman')
    find('表情')
    screen('targeted-peer')
    compare('baseline-peer','targeted-peer','peer-comparison')
    tap('表情')
    find('大哭')
    back()
    route('group/preview-weekend', BASE)
    find('表情')
    screen('baseline-group')
    route('group/preview-weekend')
    find('表情')
    tap(kind='android.widget.EditText')
    shell('input', 'text','Hello')
    tap('发送')
    find('Hello')
    screen('targeted-group')
    compare('baseline-group','targeted-group','group-comparison')
    tap('更多群消息选项')
    find('更多群消息选项')
    back()
    route('life/moment/00000000-0000-4000-8000-000000000021')
    find('评论内容', kind='android.widget.EditText')
    swipe(855,420)
    screen('comments-glass')
    tap('评论内容', kind='android.widget.EditText')
    assert re.search(r'mInputShown=true|mIsInputViewShown=true', shell('dumpsys','input_method'))
    screen('comments-keyboard')
    back()
    route('moments', BASE)
    tap('发布动态')
    find('选择发布方式')
    screen('baseline-publish')
    back()
    route('moments')
    tap('发布动态')
    find('选择发布方式')
    screen('targeted-publish')
    compare('baseline-publish','targeted-publish','publish-comparison')
    back()
    route('life/timeline/demo-xiaoman', BASE)
    find('小满')
    screen('baseline-friend-cover')
    route('life/timeline/demo-xiaoman')
    find('小满')
    screen('targeted-friend-cover')
    compare('baseline-friend-cover','targeted-friend-cover','friend-cover-comparison')
    swipe(270,555,380)
    screen('friend-cover-after-pull')


def calls():
    with record('call-history'):
        route('peer-call?peer=demo-xiaoman&kind=voice')
        tap('挂断')
        route('chat/demo-xiaoman')
        find('已取消')
        screen('voice-history')
        route('peer-call?peer=demo-xiaoman&kind=video')
        tap('模拟对方接听')
        find('模拟通话中', prefix=True)
        time.sleep(2)
        tap('挂断')
        route('chat/demo-xiaoman')
        find('通话时长', prefix=True)
        screen('video-history')
        route('peer-call?peer=demo-xiaoman&kind=voice&incoming=1')
        tap('挂断')
        route('chat/demo-xiaoman')
        find('已拒绝')
        shell('am','force-stop',PKG)
        route('chat/demo-xiaoman')
        find('已拒绝')
        find('通话时长', prefix=True)
        assert sum(node.get('text','').startswith('通话时长') for node in nodes()) == 1
        screen('call-history-reopened')


adb('install','-r',str(APK))
adb('install','-r','approved/Penlia-x86_64.apk')
adb('install','-r','original/Penlia-x86_64.apk')
shell('wm','size','540x1200')
shell('wm','density','240')
shell('settings','put','system','font_scale','1.30' if API < 31 else '1.0')
shell('cmd','uimode','night','yes' if API < 31 else 'no')
shell('settings','put','secure','show_ime_with_hard_keyboard','1')
shell('svc','wifi','disable')
shell('svc','data','disable')
if API >= 35:
    shell('am','force-stop','com.android.launcher3')
log('Android API ' + str(API) + '; offline; 540x1200 / 240dpi')
log('Artifact SHA-256 ' + sha256(APK.read_bytes()).hexdigest())
check('side-by-side-installation', separate_installs)
check('cold-start-inbox', launch)
check('protected-switch-and-dock', protection)
check('targeted-native-surfaces', surfaces)
check('simulated-call-history', calls)
if errors:
    raise SystemExit('Incomplete: ' + ', '.join(errors))
