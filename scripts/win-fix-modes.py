"""Give Windows-built ipk packages the POSIX modes a macOS/Linux build gets from umask 022.

NTFS has no execute bit, so ares-package on Windows stores every entry as 0666: the helper's
native executables would not start and every file would be world-writable on the TV.
Only world-writable entries are changed, so modes set by fix-package-data.py (0770) are kept.
"""
import io, pathlib, sys, tarfile

EXECUTABLES = {'detach', 'relay', 'resume'}


def read_ar(b):
    assert b[:8] == b'!<arch>\n', 'not an ar archive'
    i, members = 8, []
    while i < len(b):
        h = b[i:i + 60]; size = int(h[48:58])
        members.append([h[:16].decode().strip().rstrip('/'), h, b[i + 60:i + 60 + size]])
        i += 60 + size + (size & 1)
    return members


def write_ar(members):
    out = bytearray(b'!<arch>\n')
    for name, h, data in members:
        out += h[:48] + str(len(data)).ljust(10).encode() + h[58:] + data + (b'\n' if len(data) & 1 else b'')
    return bytes(out)


def fix(path):
    members = read_ar(path.read_bytes())
    data = next(m for m in members if m[0] == 'data.tar.gz')
    out, changed, executables = io.BytesIO(), 0, []
    with tarfile.open(fileobj=io.BytesIO(data[2]), mode='r:gz') as src, tarfile.open(fileobj=out, mode='w:gz') as dst:
        for entry in src:
            name = entry.name.rstrip('/')
            if entry.mode & 0o002:
                is_exec = entry.isfile() and name.rsplit('/', 1)[-1] in EXECUTABLES
                entry.mode = 0o755 if entry.isdir() or is_exec else 0o644
                changed += 1
                if is_exec: executables.append(name.split('/')[-1])
            dst.addfile(entry, src.extractfile(entry) if entry.isfile() else None)
    if changed:
        data[2] = out.getvalue(); path.write_bytes(write_ar(members))
    print(f'{path.name}: normalized {changed} entries' + (f', executable: {", ".join(sorted(executables))}' if executables else ''))


for arg in sys.argv[1:]:
    fix(pathlib.Path(arg).resolve())
