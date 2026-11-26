"""Exercise the installed local-demo Release on an isolated Android emulator."""
from pathlib import Path
from xml.etree import ElementTree
from subprocess import run, Popen, PIPE, DEVNULL
import re
import struct
import sys
import time

apk, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(exist_ok=True)
pkg = 'app.penlia.mobile.preview'

def adb(*args, binary=False):
    r = run(['adb', *args], stdout=PIPE, stderr=PIPE, check=True, timeout=45)
    return r.stdout if binary else r.stdout.decode(errors='replace').strip()

def shell(*args):
    return adb('shell', *args)

def tree():
    shell('uiautomator','dump','/sdcard/together.xml')
    return ElementTree.fromstring(adb('exec-out','cat','/sdcard/together.xml',binary=True).strip())

def find(label=None, cls=None, key=None, tries=3):
    for _ in range(tries):
        for node in tree().iter('node'):
            if cls and node.get('class') != cls: continue
            if key and key not in node.get('resource-id',''): continue
            vals=[node.get('text',''),node.get('content-desc','')]
            if label and not any(label == v or v.startswith(label+'，') or v.startswith(label+',') for v in vals): continue
            coords=list(map(int,re.findall(r'\d+',node.get('bounds',''))))
            if len(coords)==4 and coords[0]<coords[2] and coords[1]<coords[3]:
                return ((coords[0]+coords[2])//2,(coords[1]+coords[3])//2)
        time.sleep(.35)
    raise ValueError(label or key or cls)

def tap(label):
    x,y=find(label);shell('input','tap',str(x),str(y));time.sleep(.5)

def capture(name):
    (out/(name+'.png')).write_bytes(adb('exec-out','screencap','-p',binary=True))

def route(path):
    shell('am','start','-W','-a','android.intent.action.VIEW','-d',"'penlia-preview://"+path+"'",pkg)
    time.sleep(1)

def log(text):
    with (out/'checks.txt').open('a') as f: print(text,file=f)
    print(text,flush=True)

errors=[]
def check(name,task):
    try: task();log('PASS '+name)
    except Exception as exc:
        errors.append(name);log('INCOMPLETE '+name+' ('+str(type(exc).__name__)+')')
        capture('incomplete-'+name)

def cold():
    shell('am','force-stop',pkg);shell('am','start','-W','-n',pkg+'/.MainActivity')
    tap('直接进入');find('玩乐');capture('00-cold-start')

def hub():
    route('life');find('约朋友一起玩');capture('01-hub')
    tap('周末到河边喝杯咖啡');find('活动操作');capture('02-detail')
    shell('input','swipe','235','978','226','340','550');time.sleep(.2)
    shell('input','swipe','226','340','235','978','550');time.sleep(.3)
    shell('input','keyevent','4');find('约朋友一起玩')

def preview():
    route('gathering/preview-gathering?together=1');tap('活动操作');tap('预览分享内容')
    find('导出邀请卡')

def album_export():
    preview()
    capture('03-share-preview')
    uri = 'content://media/external/images/media'

    def exports():
        rows = shell('content','query','--uri',uri,'--projection','_id:_display_name')
        return set(re.findall(r'_id=(\d+), _display_name=invitation-[^\n]+?\.png',rows))

    original = exports()
    tap('导出邀请卡')
    for _ in range(14):
        new = exports() - original
        if new:
            data = adb('exec-out','content','read','--uri',uri+'/'+new.pop(),binary=True)
            assert data.startswith(b'\x89PNG\r\n\x1a\n') and struct.unpack('>II',data[16:24]) == (600,760)
            (out/'exported-invitation.png').write_bytes(data)
            return
        time.sleep(1)
    shell('input','swipe','230','1002','230','465','440')
    # This emulator contains only the offline fixture. Report the on-screen export result.
    for node in tree().iter('node'):
        text=node.get('text','')
        if text: log('Export screen: '+text[:180])
    raise AssertionError('No new invitation PNG in MediaStore')

def system_share():
    preview()
    tap('分享活动名称')
    current = shell('dumpsys','window')
    assert re.search(r'mCurrentFocus[^\n]*(?:ResolverActivity|ChooserActivity|intentresolver)',current)
    capture('04-system-share')
    shell('input','keyevent','4');find('导出邀请卡')
    capture('04b-return-from-share')

def form():
    route('gathering/new?together=1');find('选择活动封面');capture('05-create')
    x,y=find(cls='android.widget.EditText');shell('input','tap',str(x),str(y));shell('input','text','Together')
    assert re.search(r'mInputShown=true|mIsInputViewShown=true',shell('dumpsys','input_method'))
    capture('06-keyboard');shell('input','keyevent','4');time.sleep(.4)
    find('选择活动封面')

def photo():
    route('gathering/new?together=1');tap('选择活动封面')
    time.sleep(1);capture('07-photo-picker')
    for key in ['icon_thumbnail','thumbnail','album_thumbnail']:
        try: x,y=find(key=key,tries=1);break
        except ValueError: pass
    else: raise ValueError('no picker thumbnail')
    shell('input','tap',str(x),str(y));time.sleep(.7)
    for label in ['Add','Done','添加','完成']:
        try: x,y=find(label,tries=1);shell('input','tap',str(x),str(y));break
        except ValueError: pass
    find('更换封面');capture('08-picked-cover')
    shell('input','swipe','230','940','230','575','700');time.sleep(.5)
    capture('14-glass-scroll')

def page(path,label,name):
    route(path+'?together=1' if '?' not in path else path+'&together=1')
    find(label);capture(name)

adb('install','-r',str(apk))
shell('wm','size','540x1200');shell('wm','density','240')
shell('settings','put','secure','show_ime_with_hard_keyboard','1')
shell('settings','put','global','hide_error_dialogs','1')
adb('push','assets/demo/alley.jpg','/sdcard/Pictures/Together-test.jpg')
shell('am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file:///sdcard/Pictures/Together-test.jpg')
check('cold-start',cold)
# Record the compositor output, including scrolling, transitions and system surfaces.
video=Popen(['adb','shell','screenrecord','--time-limit','178','--bit-rate','3000000','/sdcard/together.mp4'],stdout=DEVNULL,stderr=DEVNULL)
try:
    check('open-scroll-back',hub)
    check('share-album-export',album_export)
    check('system-share-return',system_share)
    check('form-keyboard',form)
    check('select-photo',photo)
    for path,label,name in [
        ('life/calendar','生活日程','09-calendar'),('social?section=events','邀请与消息','10-inbox'),
        ('life/memories','共同回忆','11-memories'),('life/reminders','生活提醒','12-reminders'),
        ('world?kind=world','共同世界','13-world'),
        ('playground/with-friends','约朋友一起玩','16-with-friends'),
        ('life/projects?kind=trip','共同旅行','17-trip'),('life/items?kind=place','愿望地图','18-place'),
        ('world?kind=relay','瞬间共鸣','19-relay'),('social?section=collections','共同记录','20-journal'),
        ('life/projects?kind=capsule','时光胶囊','21-capsule'),('life/projects?kind=list','共同清单','22-list'),
        ('life/items','我的收藏与好友推荐','23-favorites')]:
        check(name,lambda:page(path,label,name))
finally:
    if video.poll() is None: shell('pkill','-INT','screenrecord')
    video.wait(timeout=20)
    adb('pull','/sdcard/together.mp4',str(out/'interaction.mp4'))
log('Android API '+shell('getprop','ro.build.version.sdk')+'; ABI '+shell('getprop','ro.product.cpu.abi'))
if errors: sys.exit(1)
