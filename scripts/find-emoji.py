import re,sys,pathlib
pat=re.compile('[\U0001F300-\U0001FAFF☀-➿⭐⬆⬇⏳⌛✅❌✔✖↺▶◀⏹]')
for f in sys.argv[1:]:
    for p in pathlib.Path(f).rglob('*.ts*'):
        for i,l in enumerate(p.read_text(encoding='utf-8').splitlines(),1):
            if pat.search(l): print(f'{p}:{i}: {l.strip()[:110]}')
