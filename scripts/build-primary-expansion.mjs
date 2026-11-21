/** Build authored vocabulary and limited, reviewed textbook membership facts. No textbook text is downloaded or copied by this script. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
// Git may check text files out as CRLF on Windows; generated content is compared as LF.
const read=path=>readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const baseText=read('data/primary-words.json'),base=JSON.parse(baseText);
const canon=value=>value.normalize('NFKC').trim().toLowerCase();
const posLabels={noun:'n.',verb:'v.',adjective:'adj.',adverb:'adv.',number:'num.',preposition:'prep.',conjunction:'conj.',pronoun:'pron.',determiner:'det.',phrase:'phr.',other:''};
const known=new Map(base.map(word=>[canon(word.word),word.id]));
const ids=new Set(base.map(word=>word.id));
const spellingPairs=[['colour','color'],['colourful','colorful'],['favourite','favorite'],['mum','mom'],['maths','math'],['neighbour','neighbor'],['centre','center'],['practice','practise'],['hard-working','hardworking'],['email','e-mail']];
const acceptedFor=word=>spellingPairs.find(pair=>pair.includes(canon(word)));
const words=read('data/primary-expanded-source.tsv').split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map((line,index)=>{
  const cells=line.split('|');assert.equal(cells.length,7,`source row ${index+1}`);
  const [rawGrade,topic,word,rawPos,meaning,example,exampleZh]=cells,grade=Number(rawGrade),pos=rawPos.split(',');
  assert.ok([3,4,5,6].includes(grade),word);assert.ok(pos.length>0&&pos.every(value=>Object.hasOwn(posLabels,value)),word);
  assert.ok(!known.has(canon(word)),`duplicate spelling: ${word}`);
  const id='px-'+canon(word).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  assert.ok(id.length>3&&!ids.has(id),`duplicate ID: ${id}`);ids.add(id);known.set(canon(word),id);
  const accepted=acceptedFor(word);
  return {id,word,translation:`${pos.map(value=>posLabels[value]).join('/')} ${meaning}`.trim(),example,exampleZh,grade,topic,pos,...(accepted?{accepted}: {})};
});
const evidence=JSON.parse(read('data/primary-textbook-evidence.json'));
const index={schemaVersion:1,verifiedAt:evidence.verifiedAt,editions:evidence.editions,sources:evidence.sources,note:evidence.note,books:evidence.books.map(book=>{
  const units=book.units.map(unit=>{
    const selected=[...unit.words].sort((a,b)=>a.localeCompare(b,'en'));
    const wordIds=selected.map(word=>{const id=known.get(canon(word));assert.ok(id,`Missing authored word ${book.id}/${unit.id}: ${word}`);return id;});
    assert.equal(new Set(wordIds).size,wordIds.length,`${book.id}/${unit.id}: duplicate membership`);
    const {words:_words,...rest}=unit;
    return {...rest,wordIds,verifiedCount:wordIds.length};
  });
  return {...book,units,verifiedCount:new Set(units.flatMap(unit=>unit.wordIds)).size};
})};
function save(path,value){const output=JSON.stringify(value,null,2)+'\n';if(process.argv.includes('--check'))assert.equal(read(path),output,`${path} needs rebuilding`);else writeFileSync(path,output);}
const spellingVariants=Object.fromEntries([...base,...words].flatMap(word=>{const accepted=acceptedFor(word.word);return accepted?[[word.id,accepted]]:[];}));
save('data/primary-expanded-words.json',words);save('data/primary-textbook-index.json',index);save('data/primary-spelling-variants.json',spellingVariants);
const csvAt=process.argv.indexOf('--csv');
if(csvAt>=0){
  assert.ok(process.argv[csvAt+1],'--csv requires an output filename');
  const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  const all=new Map([...base,...words].map(word=>[word.id,word]));
  const rows=[['edition','book','unit','wordId','word','meaning','originalExample','exampleZh','coverage']];
  for(const book of index.books)for(const unit of book.units)for(const id of unit.wordIds){const word=all.get(id);rows.push([book.editionId,book.title,unit.title,id,word.word,word.translation,word.example,word.exampleZh,'部分已核词；非完整教材词表']);}
  writeFileSync(process.argv[csvAt+1],'\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n');
}
console.log(JSON.stringify({baseWords:base.length,baseSha256:createHash('sha256').update(baseText).digest('hex'),added:words.length,total:base.length+words.length,byGrade:[3,4,5,6].map(grade=>({grade,added:words.filter(word=>word.grade===grade).length})),books:index.books.map(book=>({id:book.id,status:book.status,words:book.verifiedCount}))},null,2));
