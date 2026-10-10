import re, sys, json, shutil, zipfile, os
from xml.sax.saxutils import escape
src_dir, orig_zip, out_path, map_path = sys.argv[1:5]
R = json.load(open(map_path, encoding="utf-8"))
p = os.path.join(src_dir, "Contents/section0.xml")
s = open(p, encoding="utf-8").read()
ms = list(re.finditer(r"<hp:t>(.*?)</hp:t>", s, re.S))
out, last = [], 0
for i, m in enumerate(ms):
    out.append(s[last:m.start()])
    k = str(i)
    out.append("<hp:t>" + escape(R[k]) + "</hp:t>" if k in R else m.group(0))
    last = m.end()
out.append(s[last:])
s = "".join(out)
EBSE = "https://home.ebse.co.kr/cartoonenglish/replay/3/list?courseId=40046012&amp;stepId=60049013&amp;lectId=60294397"
APP = "https://school-certification.vercel.app"
s = s.replace(r"https\://bit.ly/화북", APP.replace("https://", r"https\://")).replace("https://bit.ly/화북", APP)
s = s.replace(r"https\://bit.ly/건강바구니", EBSE.replace("https://", r"https\://")).replace("https://bit.ly/건강바구니", EBSE)
# 바뀐 글자 길이에 맞게 한글이 줄을 다시 계산하도록 저장된 줄 배치 정보를 지움
s = re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", s, flags=re.S)
open(p, "w", encoding="utf-8").write(s)
# 미리보기 글자도 갱신
prv = os.path.join(src_dir, "Preview/PrvText.txt")
texts = [re.sub(r"<[^>]+>", "", t) for t in re.findall(r"<hp:t>(.*?)</hp:t>", s, re.S)]
open(prv, "w", encoding="utf-8").write("\n".join(t for t in texts if t.strip())[:4000])
# 원본과 같은 순서·압축 방식으로 다시 묶기 (mimetype 은 맨 앞, 무압축)
with zipfile.ZipFile(orig_zip) as zin, zipfile.ZipFile(out_path, "w") as zout:
    for info in zin.infolist():
        data = open(os.path.join(src_dir, info.filename), "rb").read()
        zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
        zi.compress_type = info.compress_type
        zi.external_attr = info.external_attr
        zout.writestr(zi, data)
print("ok", out_path)
