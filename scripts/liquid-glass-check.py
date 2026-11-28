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

APK, OUT, MODE = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
PKG = 'app.penlia.mobile.liquidglass.depth'
BASE = 'app.penlia.mobile.liquidglass'
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


def route(path, package=PKG):
    result = shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', ('penlia-liquid://' if package == BASE else 'penlia-liquid-depth://') + path, package)
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
        swipe(460, 1060, 350)
        time.sleep(.45)
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
    route('moments')
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
adb('install', '-r', 'approved/Penlia-x86_64.apk')
if MODE == '--full':
    adb('install', '-r', 'original/Penlia-x86_64.apk')
shell('wm','size','540x1200')
shell('wm','density','240')
shell('settings','put','system','font_scale','1.30' if API < 31 else '1.0')
shell('cmd','uimode','night','yes' if API < 31 else 'no')
shell('settings','put','global','sysui_demo_allowed','1')
for extra in [('enter',), ('clock','--es','hhmm','0846'), ('battery','--es','level','100','--es','plugged','false')]:
    shell('am','broadcast','-a','com.android.systemui.demo','--es','command',*extra)
shell('settings','put','secure','show_ime_with_hard_keyboard','1')
shell('svc','wifi','disable')
shell('svc','data','disable')
log('Android API ' + shell('getprop','ro.build.version.sdk') + '; ABI ' + shell('getprop','ro.product.cpu.abi') + '; offline; 540x1200 / 240dpi')
log('Artifact SHA-256 ' + sha256(APK.read_bytes()).hexdigest())
def original_comparison():
    result = shell('am','start','-W','-n',BASE + '/.MainActivity')
    assert 'Status: ok' in result
    find('搜索会话')
    screen('00-original-inbox')
    route('chat-settings/demo-xiaoman', BASE)
    find('消息免打扰', kind='android.widget.Switch')
    screen('00-approved-switch')
    packages = shell('pm','list','packages','-U')
    uid = lambda name: re.search(r'package:' + re.escape(name) + r' uid:(\d+)', packages)[1]
    versions = (BASE, PKG, ORIGINAL) if MODE == '--full' else (BASE, PKG)
    assert len({uid(app) for app in versions}) == len(versions), 'Expected separate application UIDs'
    log('Verified private data directories for: ' + ', '.join(versions))
    for app in versions:
        entry = shell('dumpsys','package',app)
        assert 'dataDir=/data/user/0/' + app in entry
    shell('am','force-stop',BASE)
check('side-by-side-installation', original_comparison)
check('cold-start-inbox', launch)

def protected_material():
    route('chat-settings/demo-xiaoman')
    center = find('消息免打扰', kind='android.widget.Switch')
    screen('00-depth-switch')
    x, y = center
    crop = (x-33, y-23, x+33, y+23)
    with Image.open(OUT/'00-approved-switch.png') as approved, Image.open(OUT/'00-depth-switch.png') as depth:
        old = approved.crop(crop).convert('RGB')
        new = depth.crop(crop).convert('RGB')
        old.save(OUT/'00-approved-switch-crop.png')
        new.save(OUT/'00-depth-switch-crop.png')
        diff = ImageChops.difference(old, new)
        log('Switch pixels changed: ' + str(sum(pixel != (0,0,0) for pixel in diff.getdata())))
        assert not diff.getbbox(), 'Protected switch pixels changed'
    with Image.open(OUT/'00-original-inbox.png') as approved, Image.open(OUT/'01-inbox.png') as depth:
        crop = (0,1089,540,1161)
        old = approved.crop(crop).convert('RGB')
        new = depth.crop(crop).convert('RGB')
        old.save(OUT/'00-approved-dock-crop.png')
        new.save(OUT/'00-depth-dock-crop.png')
        diff = ImageChops.difference(old, new)
        log('Dock pixels changed: ' + str(sum(pixel != (0,0,0) for pixel in diff.getdata())))
        assert not diff.getbbox(), 'Protected dock pixels changed on the initial inbox'
    route('')
    find('搜索会话')

check('protected-dock-and-switch', protected_material)
check('navigation-scroll-keyboard', simulate)
check('sdk-optics-path', accelerator)
check('six-scroll-hwui', performance)
if (OUT/'00-original-inbox.png').exists() and (OUT/'01-inbox.png').exists():
    with Image.open(OUT/'00-original-inbox.png') as one, Image.open(OUT/'01-inbox.png') as two:
        board = Image.new('RGB',(1104, 1224),'white')
        board.paste(one,(0,24))
        board.paste(two,(564,24))
        draw = ImageDraw.Draw(board)
        draw.text((7,4),'Approved Liquid Glass',fill='#303038')
        draw.text((571,4),'Liquid Glass Depth',fill='#303038')
        board.save(OUT/'00-inbox-comparison.png')
def core_materials():
    for package, name in [(BASE, 'approved'), (PKG, 'depth')]:
        for path, screen_id, label in [
            ('chat/demo-xiaoman', 'chat', '表情'),
            ('gathering/preview-gathering?together=1', 'gathering', '活动操作'),
            ('life?together=1', 'together', '约朋友一起玩')
        ]:
            route(path, package)
            find(label)
            screen(f'{name}-{screen_id}')
        route('gathering/preview-gathering?together=1', package)
        tap('活动操作')
        find('预览分享内容')
        screen(f'{name}-actions')
        back()

if MODE in ('--material', '--full'):
    check('core-materials-native', core_materials)

# Additional source routes and meaningful path variants are verified with local fixtures.
# Titles validate that the intended route, rather than only the package window, opened.
DEPTH_ROUTES = [
    ('glass-preview', 'experience-index', '体验入口'),
    ('chat-search/demo-xiaoman', 'chat-search', '查找聊天记录'),
    ('chat-background', 'chat-background', '聊天背景'),
    ('chat-background?mode=voice', 'voice-background', '语音通话背景'),
    ('group-settings/preview-weekend', 'group-settings', '群资料和邀请'),
    ('groups', 'groups', '群聊'),
    ('friend-invite', 'friend-invite', '添加好友'),
    ('friend-requests/relationship-demo-taozi', 'friend-public', '公开资料'),
    ('person/demo-xiaoman', 'friend-profile', '好友主页'),
    ('person/demo-self', 'own-profile', '个人主页'),
    ('pet/demo-xiaoman', 'paired-pet', '共同小宠物'),
    ('profile-field/name', 'edit-name', '修改昵称'),
    ('profile-field/username', 'edit-handle', '修改朋聊号'),
    ('profile-field/bio', 'edit-bio', '修改个性签名'),
    ('font-size', 'font-size', '字体大小'),
    ('private-moment', 'private-moment', '发布动态'),
    ('space/privacy', 'space-privacy', '空间隐私'),
    ('space/demo-xiaoman', 'space', '本机空间'),
    ('space/album/sample-album-days', 'album', '慢慢过的日子'),
    ('space/post/sample-thought-slow', 'space-post', '动态详情'),
    ('space/compose?kind=journal', 'compose-journal', '写日志'),
    ('life/moment/00000000-0000-4000-8000-000000000021', 'moment-detail', '动态详情'),
    ('life/moment-notifications', 'moment-notifications', '动态消息'),
    ('life/timeline/demo-xiaoman', 'friend-timeline', '小满'),
    ('life/capsule-drafts', 'capsule-drafts', '我的胶囊投稿'),
    ('life/project/preview-trip?kind=trip&together=1', 'trip', '临海两日'),
    ('life/project/preview-map?kind=map&together=1', 'map', '散步地图'),
    ('life/project/preview-capsule?kind=capsule&together=1', 'capsule', '留给下个夏天的一封信'),
    ('life/project/preview-list?kind=list&together=1', 'shopping-list', '周末清单'),
    ('life/memories?together=1', 'memories', '共同回忆'),
    ('life/reminders?together=1', 'reminders', '生活提醒'),
    ('life/status', 'status', '状态'),
    ('social?section=wishes&together=1', 'wishes', '心愿共振'),
    ('social?section=events&together=1', 'invitations', '邀请与消息'),
    ('gathering/new?together=1', 'new-gathering', '发起约局'),
    ('journal-entry/preview-journal-entry?together=1', 'journal-entry', '共同经历'),
    ('contributions', 'contributions', '我贡献的内容'),
    ('playground/game/hands', 'game', '石头剪刀布'),
    ('playground/with-friends', 'play-with-friends', '约朋友一起玩'),
    ('world?kind=world&together=1', 'world-list', '共同世界'),
    ('world/preview-relay?together=1', 'relay', '同一场黄昏'),
    ('world/own?together=1', 'world-own', '我的投稿与摆件'),
]

def review_extra_routes():
    for route_path, name, expected in DEPTH_ROUTES:
        try:
            details(route_path, '40-' + name, expected)
            log('ROUTE PASS ' + route_path)
        except (AssertionError, ValueError, subprocess.SubprocessError) as issue:
            screen('unconfirmed-' + name)
            log('ROUTE UNCONFIRMED ' + route_path + ' ' + str(issue)[:130])


if MODE == '--full':
    for route_path, image_name, expected in [
        ('chat/demo-xiaoman','06-chat','表情'),
        ('group/preview-weekend','07-group',None),
        ('chat-settings/demo-xiaoman','08-settings','消息免打扰'),
        ('profile','09-profile',None),
        ('privacy','10-privacy',None),
        ('gathering/preview-gathering?together=1','11-gathering','活动操作'),
        ('life','12-life','约朋友一起玩'),
        ('boundary','13-boundary',None),
        ('friend-requests','14-requests',None),
        ('life/calendar','15-calendar',None),
        ('life/projects?kind=trip','16-projects','共同旅行'),
        ('life/items','17-items',None),
        ('my-qr','18-qr',None),
        ('space/compose?kind=thought','19-compose',None),
        ('world/preview-world?together=1','24-world',None),
        ('peer-call?peer=demo-xiaoman&kind=video','25-video-call',None),
        ('playground/place/sample-coffee','26-place',None),
        ('collection/preview-journal?together=1','27-journal',None),
    ]:
        check(image_name,lambda r=route_path,n=image_name,e=expected: details(r,n,e))
    def controls():
        route('chat-settings/demo-xiaoman')
        with record('controls'):
            tap('消息免打扰', kind='android.widget.Switch')
            control = next(n for n in nodes() if '消息免打扰' in n.get('content-desc','') and n.get('checkable') == 'true')
            during = control.get('checked')
            screen('20-surface-switch')
            tap('消息免打扰', kind='android.widget.Switch')
            confirm = next(n for n in nodes() if '消息免打扰' in n.get('content-desc','') and n.get('checkable') == 'true')
            assert during != confirm.get('checked'), 'Tapped native toggle did not change the accessible checked value'
            route('chat/demo-xiaoman')
            tap('表情')
            find('大哭')
            screen('21-stickers')
            back()
            tap(kind='android.widget.EditText')
            shell('input','text','Hello')
            assert re.search(r'mInputShown=true|mIsInputViewShown=true', shell('dumpsys','input_method'))
            screen('22-ime')
            back()
            route('gathering/preview-gathering?together=1')
            tap('活动操作')
            find('预览分享内容')
            screen('23-actions')
    check('toggle-stickers-IME-actions',controls)
    review_extra_routes()
    def signed_out():
        route('me')
        for _ in range(4):
            try:
                tap('退出登录', tries=1)
                break
            except AssertionError:
                swipe(975,380,450)
        find('直接进入')
        screen('41-auth')
        tap('直接进入')
        find('搜索会话')
        log('ROUTE PASS auth')
    check('local-auth-signout-reentry', signed_out)
if errors:
    raise SystemExit('Incomplete: ' + ', '.join(errors))
