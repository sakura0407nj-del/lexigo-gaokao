"""Reproducible ECDICT gk subset; corpus bands are not exam occurrence statistics."""
import csv, hashlib, io, json, pathlib, re, urllib.request
root = pathlib.Path(__file__).resolve().parent.parent
cache = root / 'work' / 'dictionary-cache'
cache.mkdir(parents=True, exist_ok=True)
url = 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv'
target = cache / 'ecdict.csv'
if not target.exists():
    urllib.request.urlretrieve(url, target)
raw = target.read_bytes()
rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
selected = [r for r in rows if 'gk' in r.get('tag','').split()]
def rank(r):
    ranks = [int(r[k]) for k in ('bnc','frq') if r.get(k,'').isdigit() and int(r[k]) > 0]
    return min(ranks) if ranks else 999999
selected.sort(key=lambda r:(rank(r),r['word'].lower()))
words=[]; seen=set()
core_overrides={
    'a':'art. 一个；一（用于可数名词单数前，元音音素前用 an）',
    'an':'art. 一个；一（用于以元音音素开头的可数名词单数前）',
    'the':'art. 这（些），那（些）；用于特指或双方已知的人或事物',
    'be':'v. 是；成为；处于；构成进行时或被动语态的助动词（am/is/are/was/were/been/being）',
}
def translation(r):
    original=r.get('translation','').replace('\\n','\n').replace('\\r','\n')
    lines=[line.strip() for line in original.splitlines() if line.strip() and not re.match(r'^\[[^\]]+\]',line.strip())]
    return core_overrides.get(r['word'].lower(), '\n'.join(lines) or original.strip())
for r in selected:
    key=r['word'].strip().lower()
    if key in seen: continue
    seen.add(key)
    n=rank(r)
    words.append(dict(id=key,word=r['word'].strip(),phonetic=r.get('phonetic',''),translation=translation(r),frequency='high' if n<=2000 else 'medium' if n<=5000 else 'low',rank=n if n<999999 else 0))
(root/'data').mkdir(exist_ok=True)
(root/'public'/'licenses').mkdir(parents=True,exist_ok=True)
(root/'data'/'words.json').write_text(json.dumps(words,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
urllib.request.urlretrieve('https://raw.githubusercontent.com/skywind3000/ECDICT/master/LICENSE', root/'public'/'licenses'/'ECDICT.txt')
meta=dict(count=len(words),source=url,sha256=hashlib.sha256(raw).hexdigest(),selection='All unique entries carrying the gk tag in ECDICT',frequency='min(positive BNC rank, positive frq rank): high <=2000; medium 2001–5000; low >5000 or missing. General corpus proxy, not Gaokao exam counts.',counts={b:sum(w['frequency']==b for w in words) for b in ['high','medium','low']})
(root/'data'/'vocabulary-meta.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(meta,ensure_ascii=False))
