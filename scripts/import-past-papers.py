"""Convert licensed GAOKAO-Bench records; preserve attribution and reject ambiguous imports."""
import json,pathlib,re,hashlib,urllib.request
root=pathlib.Path(__file__).resolve().parent.parent
base='https://raw.githubusercontent.com/OpenLMLab/GAOKAO-Bench/main/'
files={'2010-2022_English_Reading_Comp':'reading','2010-2022_English_Fill_in_Blanks':'cloze','2012-2022_English_Cloze_Test':'seven'}
papers=[]; rejected=[];seen=set()
def clean(s):
    s=re.sub(r'[ \t\u3000]+',' ',s)
    return s.strip()
def options(s,letters='ABCD'):
    marks=list(re.finditer(r'(?<!\w)(['+letters+r'])[.．、]\s*',s))
    if ''.join(m[1] for m in marks)!=letters:raise ValueError('option boundaries')
    return [m[1]+'. '+clean(s[m.end():marks[i+1].start() if i+1<len(marks) else len(s)]) for i,m in enumerate(marks)]
def analysis_parts(text,nums):
    sections=list(re.finditer(r'【\s*(\d+)\s*题详解】',text))
    if not sections:sections=list(re.finditer(r'(?m)^\s*(\d+)\s*[．.、：:]+\s*[A-G]?',text))
    by={m[1]:clean(text[m.end():sections[i+1].start() if i+1<len(sections) else len(text)]) for i,m in enumerate(sections)}
    if not all(n in by for n in nums):raise ValueError('missing per-question analysis')
    return by
for name,kind in files.items():
    path=root/'work'/'exam-cache'/(name+'.json')
    records=json.loads(path.read_text(encoding='utf-8'))['example']
    for idx,r in enumerate(records):
        # Older OCR extracts contain missing figures and broken text; retain newer records only.
        if int(r['year'])<2016:continue
        try:
            text=r['question'];answers=r['answer'];rawhash=hashlib.sha256(text.encode()).hexdigest()
            if rawhash in seen:raise ValueError('duplicate')
            if re.search(r'<img|!\[|ADMISSION|admission for a family',text,re.I):raise ValueError('figure-dependent extract')
            shared=None
            if kind=='seven':
                marks=list(re.finditer(r'(?m)^\s*A[.．、]\s*',text))
                if not marks:raise ValueError('shared options missing')
                split=marks[-1].start();passage=clean(text[:split]);shared=options(text[split:],'ABCDEFG')
                numbered=re.findall(r'_{2,}\s*(\d{1,2})\s*_{2,}|(?<=[ \u3000])\s{2,}(\d{2})\s{2,}',passage)
                nums=[a or b for a,b in numbered]
                if len(nums)!=5: # A small number use one space around numbered blanks.
                    nums=re.findall(r'(?<!\d)\b(3[6-9]|40|7[1-5]|1[6-9]|20)\b',passage)
                nums=list(dict.fromkeys(nums))
                if len(nums)!=5:raise ValueError('blank boundaries')
                parts=[(n,f'第 {n} 空',None) for n in nums]
            else:
                marks=list(re.finditer(r'(?m)^\s*(\d{1,2})[.．]\s*',text))
                if len(marks)!=len(answers):raise ValueError('question boundaries')
                passage=clean(text[:marks[0].start()]);parts=[]
                for i,m in enumerate(marks):
                    block=text[m.end():marks[i+1].start() if i+1<len(marks) else len(text)]
                    op=re.search(r'(?<!\w)A[.．、]\s*',block)
                    if not op:raise ValueError('choice missing')
                    parts.append((m[1],clean(block[:op.start()]) or f'第 {m[1]} 空',options(block[op.start():])))
                nums=[n for n,_,_ in parts]
            if len(parts)!=len(answers) or len(set(nums))!=len(nums):raise ValueError('answer count')
            ap=analysis_parts(r.get('analysis',''),nums)
            questions=[]
            for (n,prompt,opts),answer in zip(parts,answers):
                if answer not in ('ABCDEFG' if kind=='seven' else 'ABCD'):raise ValueError('invalid answer')
                conclusions=re.findall(r'故\s*选\s*([A-G])',ap[n])
                if conclusions and any(c!=answer for c in conclusions):raise ValueError('answer conflicts with explanation')
                if len(ap[n])<35:raise ValueError('incomplete explanation')
                q={'id':n,'prompt':prompt,'answer':answer,'points':float(r.get('score',2)),'explanation':ap[n],'knowledge':'历年真题 · 结合语境与原文证据'}
                if opts:q['options']=opts
                questions.append(q)
            if kind!='reading':
                for n in nums:
                    passage=re.sub(r'_+\s*'+re.escape(n)+r'\s*_+',f' [{n}] ',passage)
                    passage=re.sub(r'(?<![\d\[])\b'+re.escape(n)+r'\b(?![\d\]])',f'[{n}]',passage)
            titlekind={'reading':'阅读理解','cloze':'完形填空','seven':'七选五'}[kind]
            paper={'id':f'past-{kind}-{idx:03d}','title':f"{r['year']} {r['category']} · {titlekind} {idx+1}",'type':kind,'level':'标准','topic':'历年高考','passage':passage,'instructions':'历年真题公开数据转录，保留原题号与原分值；仅作学习参考，排版和答案请以原卷为准。','questions':questions,'minutes':max(8,len(questions)),'source':f"GAOKAO-Bench · {r['year']} {r['category']} · Apache-2.0 · 已做格式及答案/解析一致性筛查",'origin':'past'}
            if shared:paper['options']=shared
            papers.append(paper);seen.add(rawhash)
        except ValueError as e:rejected.append({'file':name,'index':idx,'year':r['year'],'reason':str(e)})
(root/'data'/'past-papers.json').write_text(json.dumps(papers,ensure_ascii=False,indent=2),encoding='utf-8')
(root/'work'/'past-paper-import-report.json').write_text(json.dumps({'accepted':len(papers),'questions':sum(len(p['questions']) for p in papers),'rejected':rejected},ensure_ascii=False,indent=2),encoding='utf-8')
urllib.request.urlretrieve(base+'LICENSE',root/'public'/'licenses'/'GAOKAO-Bench.txt')
(root/'public'/'licenses'/'NOTICE.txt').write_text('Gaokao English excerpts and analyses: OpenLMLab/GAOKAO-Bench, https://github.com/OpenLMLab/GAOKAO-Bench, Apache-2.0. Modified for LexiGo: normalized spacing and blank notation, split questions/options/analyses, filtered incomplete or contradictory records. Exam year/category preserved. Dataset transcription is not an official new exam release.\nDictionary subset: skywind3000/ECDICT, https://github.com/skywind3000/ECDICT, MIT; filtered gk entries and added corpus-based frequency bands.\n',encoding='utf-8')
print(json.dumps({'papers':len(papers),'questions':sum(len(p['questions']) for p in papers),'rejected':len(rejected),'reasons':{s:sum(x['reason']==s for x in rejected) for s in set(x['reason'] for x in rejected)}}))
