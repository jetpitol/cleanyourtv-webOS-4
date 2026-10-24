#!/usr/bin/env python3
"""Stage an isolated Root UI preview locally. Never connects to or activates a TV."""
import argparse
import hashlib
import json
from pathlib import Path

APP_ID = 'com.cleanyourtv.root.preview'
SOURCE = Path(__file__).resolve().parents[1] / 'launcher'
# Explicit public-source inventory: never recursively copy a developer workspace.
FILES = (
    'appinfo.json', 'index.html', 'app.js', 'style.css', 'tvos26.css',
    'brand-v2-icon.png', 'brand-v2-largeIcon.png', 'splash.png',
    'fonts/outfit.ttf', 'fonts/OFL.txt',
    'fonts/inter-400.ttf', 'fonts/inter-500.ttf', 'fonts/inter-600.ttf', 'fonts/inter-700.ttf', 'fonts/Inter-OFL.txt',
)
UI = Path(__file__).resolve().parent / 'ui'
UI_FILES = ('root-exit.js', 'root-settings.js', 'root-settings.css')


def prepare():
    files = {}
    for name in FILES:
        path = SOURCE / name
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(SOURCE.resolve()):
            raise ValueError('Missing or indirect source: ' + name)
        files[name] = path.read_bytes()
    info = json.loads(files['appinfo.json'])
    if (info.get('id'), info.get('type'), info.get('main')) != ('com.gathin.tvhome', 'web', 'index.html'):
        raise ValueError('Unexpected launcher manifest')
    info.update(id=APP_ID, title='Home Root Preview', version='0.0.1', appCategory=['home'])
    for field in ('icon', 'largeIcon', 'splashBackground'):
        if info.get(field) not in files:
            raise ValueError('Unpackaged manifest resource: ' + field)
    html = files['index.html'].decode()
    tags = ['<script src="' + name + '"></script>' for name in (
        'native-bootstrap.js', 'helper-control.js', 'renewal-panel.js',
        'user-data.js', 'update-panel.js')]
    tags.append('<link rel="stylesheet" href="renewal-panel.css">')
    for tag in tags:
        if html.count(tag) != 1:
            raise ValueError('Unexpected launcher HTML: ' + tag)
        html = html.replace(tag, '')
    # Root preview must not restore production profiles or send updater health signals.
    entry = '<script src="profile-bootstrap.js"></script>'
    if html.count(entry) != 1:
        raise ValueError('Unexpected launcher entry')
    files['index.html'] = html.replace(entry, '<link rel="stylesheet" href="root-settings.css">\n  <script src="root-exit.js"></script>\n  <script src="root-settings.js"></script>\n  <script src="app.js"></script>').encode()
    files['appinfo.json'] = (json.dumps(info, indent=2) + '\n').encode()
    for name in UI_FILES:
        path = UI / name
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(UI.resolve()):
            raise ValueError('Missing or indirect Root UI: ' + name)
        files[name] = path.read_bytes()
    files['apps.js'] = b'window.TV_APPS = {apps: [], inputs: []};\n'
    config = {'columns': 5, 'dockApps': [], 'hiddenApps': ['com.gathin.tvhome', 'com.local.nativehome', APP_ID]}
    files['config.js'] = ('window.CONFIG = ' + json.dumps(config) + ';\n').encode()
    return files


def stage(output):
    files = prepare()
    # Exclusive creation: a previous build or user data is never overwritten.
    output.mkdir(parents=False, exist_ok=False)
    for name, data in files.items():
        path = output / 'app' / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    inventory = {
        'application_id': APP_ID,
        'public_release_ready': False,
        'activates_system_home': False,
        'files': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())},
    }
    (output / 'inventory.json').write_text(json.dumps(inventory, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='New directory; parent must exist')
    args = parser.parse_args()
    try:
        stage(args.output)
    except (ValueError, OSError) as exc:
        parser.exit(1, 'Preview staging failed: ' + str(exc) + '\n')
    print('Staged UI only. No installer, services, profile changes or startup hooks.')


if __name__ == '__main__':
    main()
