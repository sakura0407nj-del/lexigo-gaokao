"""Use textbook-ordered headwords; correct upstream's approximate/equal unit splits."""
import argparse,json,pathlib,re
root=pathlib.Path(__file__).resolve().parent.parent
books=[]
definitions={
'compulsory-1': [('welcome','Welcome Unit','exchange'),('u1','Unit 1 Teenage Life','teenage'),('u2','Unit 2 Travelling Around','castle'),('u3','Unit 3 Sports and Fitness','fitness'),('u4','Unit 4 Natural Disasters','disaster'),('u5','Unit 5 Languages Around the World','billion')],
'compulsory-2': [('u1','Unit 1 Cultural Heritage','heritage'),('u2','Unit 2 Wildlife Protection','poster'),('u3','Unit 3 The Internet','blog'),('u4','Unit 4 History and Traditions','Confucius'),('u5','Unit 5 Music','classical')],
'compulsory-3': [('u1','Unit 1 Festivals and Celebrations','lantern'),('u2','Unit 2 Morals and Virtues','moral'),('u3','Unit 3 Diverse Cultures','diverse'),('u4','Unit 4 Space Exploration','astronaut'),('u5','Unit 5 The Value of Money','basis')],
'optional-1': [('u1','Unit 1 People of Achievement','physiology'),('u2','Unit 2 Looking into the Future','phrase'),('u3','Unit 3 Fascinating Parks','buffet'),('u4','Unit 4 Body Language','interaction'),('u5','Unit 5 Working the Land','hybrid')],
'optional-2': [('u1','Unit 1 Science and Scientists','cholera'),('u2','Unit 2 Bridging Cultures','complex'),('u3','Unit 3 Food and Culture','cuisine'),('u4','Unit 4 Journey Across a Vast Land','airline'),('u5','Unit 5 First Aid','technique')],
'optional-3': [('u1','Unit 1 Art','precise'),('u2','Unit 2 Healthy Lifestyle','tobacco'),('u3','Unit 3 Environmental Protection','emission'),('u4','Unit 4 Adversity and Courage','adversity'),('u5','Unit 5 Poems','drama')],
'optional-4': [('u1','Unit 1 Science Fiction','fiction'),('u2','Unit 2 Iconic Attractions','iconic'),('u3','Unit 3 Sea Exploration','tale'),('u4','Unit 4 Sharing','parcel'),('u5','Unit 5 Launching Your Career','bounce')],
}
general={w['word'].lower():w for w in json.loads((root/'data'/'words.json').read_text(encoding='utf-8'))}
pairs='colour/color centre/center travelling/traveling travelled/traveled traveller/traveler realise/realize realise/realize organise/organize organisation/organization recognise/recognize analyse/analyze apologise/apologize favour/favor favourite/favorite behaviour/behavior honour/honor labour/labor neighbour/neighbor neighbourhood/neighborhood theatre/theater grey/gray metre/meter kilometre/kilometer programme/program defence/defense licence/license practise/practice'.split()
variants={s:pair.split('/') for pair in pairs for s in pair.split('/')}
overrides={'sex':'n. 性别','female':'adj. 女（性）的；雌性的 n. 女性；雌性动物','male':'adj. 男（性）的；雄性的 n. 男性；雄性动物'}
overrides.update(json.loads((root/'data'/'textbook-glosses.json').read_text(encoding='utf-8')))

def study_translation(word, fallback):
    """Use reviewed meanings; remove unknown upstream POS tags without guessing a POS."""
    value=overrides.get(word.lower(),fallback)
    return re.sub(r'(^|[\n;；])\s*(?:na|un)\.\s*',r'\1',value,flags=re.IGNORECASE).strip()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir',type=pathlib.Path,default=root/'work'/'textbook-cache')
    parser.add_argument('--refresh-existing',action='store_true',help='Apply reviewed glosses without changing any stored headword or ID.')
    args=parser.parse_args()
    if args.refresh_existing:
        out=json.loads((root/'data'/'textbooks.json').read_text(encoding='utf-8'))
        for book in out['books']:
            for unit in book['units']:
                for word in unit['words']:
                    word['translation']=study_translation(word['word'],word['translation'])
    else:
        books=[]
        for key,defs in definitions.items():
            source=json.loads((args.cache_dir/f'pep2019-{key}.json').read_text(encoding='utf-8'))
            allwords=[w for u in source['units'] for w in u['words']]
            starts=[next(i for i,w in enumerate(allwords) if w['en']==start) for _,_,start in defs]
            assert starts[0]==0 and starts==sorted(set(starts)),key
            units=[]
            for j,(uid,title,start) in enumerate(defs):
                selected=allwords[starts[j]:starts[j+1] if j+1<len(starts) else len(allwords)];words=[]
                for i,w in enumerate(selected):
                    word=re.sub(r'\s+',' ',w['en']).strip();base=general.get(word.lower(),{})
                    # Keep source positions (including repeated inflection entries) so old IDs remain valid.
                    words.append({'id':f"{source['id']}:{uid}:{i}",'word':word,'phonetic':w.get('phonetic','').strip('/'),'translation':study_translation(word,base.get('translation') or w['zh']),'frequency':base.get('frequency','low'),'rank':base.get('rank',0),'accepted':variants.get(word.lower(),[word]),'book':source['id'],'unit':uid})
                units.append({'id':uid,'title':title,'count':len(words),'words':words})
            books.append({'id':source['id'],'title':source['title'].replace('人教版高中英语（2019）· ',''),'edition':'人教版 2019','wordCount':len(allwords),'units':units})
        out={'books':books,'note':'适用于人教版（2019）必修一至三、选择性必修一至四；包含单词、短语和专有名词。词目由社区整理，释义用于辅助学习；不同印次请以手中教材为准。','sources':['https://github.com/cyforkk/pep-english-words','https://github.com/lilinji/English','https://github.com/skywind3000/ECDICT']}
    (root/'data'/'textbooks.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    books=out['books']
    print(json.dumps({'books':len(books),'units':sum(len(b['units']) for b in books),'entries':sum(b['wordCount'] for b in books),'counts':[(b['id'],[u['count'] for u in b['units']]) for b in books]}))

if __name__=='__main__':
    main()
