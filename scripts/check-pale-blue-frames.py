import json
import subprocess
import sys
from pathlib import Path

source, video, expected = sys.argv[1:]
video = Path(video)

def ffmpeg(parts):
    return subprocess.check_output(['ffmpeg', '-v', 'error', *parts])

probe = subprocess.check_output([
    'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
    '-of', 'json', str(video),
])
stream = json.loads(probe)['streams'][0]
width, height = stream['width'], stream['height']
thumb_width, thumb_height = width // 4, height // 4
thumb = f'scale={thumb_width}:{thumb_height}:flags=area'
fit = f'scale={width}:{height}:force_original_aspect_ratio=decrease:flags=bilinear'
pad = f'pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=0x010103'
reference = ffmpeg([
    '-i', source, '-vf', ','.join((fit, pad, thumb)), '-frames:v', '1',
    '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-',
])
recording = ffmpeg([
    '-i', str(video), '-vf', 'fps=30,' + thumb, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-',
])
frame_size = len(reference)
assert recording and len(recording) % frame_size == 0, video.name
offsets = [
    (y * thumb_width + x) * 3
    for y in range(thumb_height // 9, thumb_height * 9 // 10, 2)
    for x in range(5, thumb_width - 5, 2)
]
channels = [offset + c for offset in offsets for c in range(3)]
frames = [memoryview(recording)[i:i + frame_size] for i in range(0, len(recording), frame_size)]
errors = [sum(abs(frame[i] - reference[i]) for i in channels) / len(channels) for frame in frames]
best = min(range(len(errors)), key=errors.__getitem__)

def pink(frame):
    return sum(
        abs(frame[i] - 248) <= 12 and abs(frame[i + 1] - 217) <= 12 and abs(frame[i + 2] - 226) <= 12
        for i in offsets
    ) / len(offsets)

if expected == 'art':
    assert errors[best] < 10, (video.name, 'no matching aspect-fit artwork frame', round(errors[best], 2))
    matching = [i for i, error in enumerate(errors) if error < 10]
    assert all(pink(frames[i]) < 0.35 for i in range(matching[-1] + 1)), (video.name, 'old pink background')
    subprocess.run([
        'ffmpeg', '-v', 'error', '-y', '-ss', f'{best / 30:.3f}', '-i', str(video),
        '-frames:v', '1', str(video.with_suffix('.png')),
    ], check=True)
    print(f'{video.name}: artwork matched at {len(matching)} sampled frames, best RGB error {errors[best]:.2f}')
elif expected == 'warm':
    assert errors[best] > 14, (video.name, 'artwork reappeared on resume', round(errors[best], 2))
    print(f'{video.name}: no artwork on resume, closest RGB error {errors[best]:.2f}')
else:
    raise ValueError(expected)
