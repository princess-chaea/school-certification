import re, sys, json, zipfile, os
from xml.sax.saxutils import escape
src_dir, orig_zip, out_path, map_path, photos_path = sys.argv[1:6]
R = json.load(open(map_path, encoding="utf-8"))
PH = json.load(open(photos_path, encoding="utf-8"))
sec = os.path.join(src_dir, "Contents/section0.xml")
s = open(sec, encoding="utf-8").read()
# 1) 글자 바꾸기 (같은 순번의 글자 조각)
ms = list(re.finditer(r"<hp:t>(.*?)</hp:t>", s, re.S))
out, last = [], 0
for i, m in enumerate(ms):
    out.append(s[last:m.start()])
    out.append("<hp:t>" + escape(R[str(i)]) + "</hp:t>" if str(i) in R else m.group(0))
    last = m.end()
out.append(s[last:]); s = "".join(out)
# 2) 빈 사진 칸에 '어떤 장면을 넣을지' 작은 회색 글씨
SMALL = "122"
cells = []
for m in re.finditer(r"<hp:tc [^>]*>(?:(?!<hp:tc ).)*?</hp:tc>", s, re.S):
    b = m.group(0)
    if "<hp:t>" in b or "<hp:pic" in b or "<hp:tbl" in b: continue
    sz = re.search(r'<hp:cellSz width="(\d+)" height="(\d+)"', b)
    if sz and int(sz.group(2)) > 3000 and int(sz.group(1)) > 4000: cells.append(m)
assert len(cells) == len(PH), (len(cells), len(PH))
for m, text in reversed(list(zip(cells, PH))):
    b = m.group(0)
    nb, n = re.subn(r'<hp:run charPrIDRef="\d+"\s*/>', f'<hp:run charPrIDRef="{SMALL}"><hp:t>{escape(text)}</hp:t></hp:run>', b, count=1)
    if n == 0:
        nb, n = re.subn(r"(<hp:p [^>]*>)", rf'\1<hp:run charPrIDRef="{SMALL}"><hp:t>{escape(text)}</hp:t></hp:run>', b, count=1)
    s = s[:m.start()] + nb + s[m.end():]
s = re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", s, flags=re.S)
open(sec, "w", encoding="utf-8").write(s)
# 3) 작은 회색 글자 모양 추가 (그림 설명 글자 92번을 복사: 7pt, 회색)
hp = os.path.join(src_dir, "Contents/header.xml")
h = open(hp, encoding="utf-8").read()
if 'charPr id="122"' not in h:
    base = re.search(r'<hh:charPr id="92".*?</hh:charPr>', h, re.S).group(0)
    new = base.replace('id="92"', 'id="122"', 1)
    new = re.sub(r'height="\d+"', 'height="700"', new, count=1)
    new = re.sub(r'textColor="#[0-9A-Fa-f]+"', 'textColor="#7F7F7F"', new, count=1)
    new = new.replace("<hh:bold/>", "")
    h = h.replace("</hh:charProperties>", new + "</hh:charProperties>", 1)
    h = re.sub(r'<hh:charProperties itemCnt="(\d+)"', lambda m: f'<hh:charProperties itemCnt="{int(m.group(1))+1}"', h, count=1)
    open(hp, "w", encoding="utf-8").write(h)
texts = [re.sub(r"<[^>]+>", "", t) for t in re.findall(r"<hp:t>(.*?)</hp:t>", s, re.S)]
open(os.path.join(src_dir, "Preview/PrvText.txt"), "w", encoding="utf-8").write("\n".join(t for t in texts if t.strip())[:4000])
with zipfile.ZipFile(orig_zip) as zin, zipfile.ZipFile(out_path, "w") as zout:
    for info in zin.infolist():
        zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
        zi.compress_type = info.compress_type; zi.external_attr = info.external_attr
        zout.writestr(zi, open(os.path.join(src_dir, info.filename), "rb").read())
print("ok", len(cells), "photo slots")
