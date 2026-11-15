"""Editorial corrections after the initial Gemini authoring pass."""
import json,pathlib
root=pathlib.Path(__file__).resolve().parent.parent
p=root/'data'/'papers.json';papers=json.loads(p.read_text(encoding='utf-8'))
for item in papers:
    if item['id']=='grammar-002':
        item['passage']=item['passage'].replace('members gather to record [3] the local insects interact with various native plants.','members gather to record their observations of local insects [3] a shared notebook.')
        q=item['questions'][2];q.update(answer='in',explanation='表示把观察记录写在笔记本中，用介词 in：record observations in a notebook。这里考查介词搭配，不再使用可能有 how/whether/when 等多种理解的开放宾语从句。',knowledge='介词搭配：in a notebook',evidence='record their observations of local insects [3] a shared notebook')
    if item['id']=='grammar-003':item['passage']=item['passage'].replace('in China over two thousand years ago','in China many centuries ago')
    if item['id']=='seven-002':
        item['passage']=item['passage'].replace('Because these species have evolved alongside local insects and climate conditions, they require minimal watering and no chemical fertilizers.','Plants suited to the local climate can often manage with less extra watering once they are established.')
        item['options'][4]='E. As a result, these species can be a practical choice for a garden that needs less maintenance.'
        item['questions'][1]['explanation']='空前谈适应本地气候的植物在成活后往往需要较少的额外浇水，E 项以 As a result 承接这一优点，指出它们可用于维护需求较少的花园。these species 指前文 native plants。这里表达条件性的常见优势，并非声称所有本地植物都不需浇水或施肥。'
    if item['id']=='grammar-004':
        item['passage']=item['passage'].replace('Recently, many schools','Over the past few years, many schools').replace('participants form small teams [2] members','participants form small support groups in [2] members').replace('taking part in group activities reduces stress more','taking part in group activities can help some students manage stress more')
        item['questions'][1].update(answer='which',explanation='空前已有介词 in，先行词 support groups 指事物，组成 in which 引导定语从句，相当于 where。介词后不能用 that；whose 不能单独作介词宾语。',knowledge='介词 + which 引导定语从句',evidence='small support groups in [2] members share daily fitness goals')
    item['source']='原创模拟 · 教学情境创作 · Gemini 编写 · Codex 复核'
p.write_text(json.dumps(papers,ensure_ascii=False,indent=2),encoding='utf-8')
k=root/'data'/'knowledge.json';cards=json.loads(k.read_text(encoding='utf-8'))
bodies={
'card_01':'判断定语从句的关系词，先找先行词，再分析从句缺少的成分。关系代词 who/whom/which/that 可在从句中作主语、宾语等；whose 表所属关系，在名词前作定语，例如 a student whose work is excellent。若空缺承担时间、地点或原因状语，可根据语境使用 when/where/why，或合适的“介词 + which”。不要仅因先行词是地点就填 where：the school that I visited 中 visited 缺宾语，应使用关系代词。非限制性从句不用 that；介词提前时，指物常用 which、指人用 whom。',
'card_02':'判断时态要结合动作发生的时间、参照点和说话者想强调的意义。若叙述过去事件之前已经完成的动作，常用过去完成时 had done；若强调过去动作与现在的联系，可用现在完成时。have been doing 更突出持续的活动过程。since 和 over the past few years 常与完成时连用，但不能脱离整句机械判断。客观事实通常用一般现在时；固定时刻表也可用一般现在时表达未来安排。题目若存在不止一种符合语境的时态，应说明各自表达重点。',
'card_03':'主语承受动作，而且动词在该用法中可以带宾语时，通常可用被动语态“be + 过去分词”。还要匹配时间与主语单复数，如 is being repaired、has been completed。happen、occur、take place、break out 等不及物用法不用被动；belong to 表归属时也不用被动。look、sound、prove 等作系动词时不用被动，但同一个词换成及物用法后规则可能改变：The theory has been proved correct 是正确句子。sell well、wash easily 描述物品特性时常用主动形式表达被动含义，不能据此断言这些动词永远不能用被动。',
'card_04':'先判断空格所在结构需要谓语还是非谓语，不要仅凭“句中出现了一个动词”就决定。确定为非谓语后，分析它在句中作定语、状语、宾语还是补语，再找逻辑主语并判断主动、被动及时间关系。不定式常表达目的或尚未发生的动作；现在分词常有主动、进行的意味；过去分词常表示被动或完成，但这些是常见用法而非万能等式。having done 可突出先于谓语的动作，being done 表示进行中的被动。作状语时还应避免逻辑主语悬垂，如 Seeing the result, I smiled。',
'card_06':'选择冠词先看名词是否可数、单复数及语境是泛指还是特指。可数名词单数表示“一个”时常用 a/an；a/an 的选择取决于后一个词的起始音素，因此是 an hour、a university。the 常指双方已知、前文提及或语境中可唯一确定的事物。带有定语不等于一定特指，例如 I need a book that explains grammar 中仍可用 a。复数和不可数名词表泛指时常用零冠词。抽象名词表示某个具体的人或事时可能转为可数用法，如 The show was a great success，不能把这种变化机械推广到所有抽象名词。',
'card_07':'先根据句法位置判断空格需要的词性，再考虑具体词形：修饰名词常用形容词；修饰动词、形容词或整句常用副词；缺少主语或宾语中心词时常需名词，但还要留意动名词等结构。确定词性后检查意义是否需要否定前缀，以及名词的单复数。派生规律应按词族积累，例如 contribute→contribution、possible→possibly、different→difference；不能把个别词的变化概括为“所有以 t 结尾的词都改成 ce”。词尾相似也不意味着词性和拼写变化相同。',
'card_08':'七选五和写作中的衔接，要同时看语义与形式。代词 it/they/this 等常回指前文，但也可能指向后文或语境，不宜机械规定只能指前面的名词。做题时核对单复数、指代对象和语义是否连贯。连接词可提示转折、因果、递进或例证，如 however、therefore、moreover、for instance；同一个语段可能有多种合适的连接方式，仍须把选项代入全文检查。不能只因选项含有 however 就选它，还应看空前后是否真的存在转折。',
'card_09':'推理判断题要求结论有文本依据，推导幅度与题目相符。先定位证据，再区分作者明确说了什么、合理暗示了什么，以及自己额外想象了什么。干扰项常偷换对象或因果、扩大适用范围，或加入文本没有支持的细节。must/never/all 等绝对词需要强证据，但并非看到它们就一定排除。正确选项可能是同义改写，也可能保留原文措辞，不能按“照抄原文就错”判断。最后将选项与问题一起读，确认回答的是所问内容而非仅仅陈述了文中某个事实。',
'card_12':'读后续写首先要读懂原文的事件、人物关系、叙述视角和情感变化，再分析给定的两个段首句。第一段的发展应能自然衔接第二段开头，第二段则推进事件并作合乎情境的收束。细节描写可结合动作、对话、感受与环境，不必每句都用复杂结构或夸张情绪。结局应符合原文逻辑和题目要求，不要强加与故事无关的道德说教。语言准确、内容连贯比堆砌“高级句型”更重要；保留原人物性格，也要注意时态和代词指代的一致。'
}
categories={'relative clauses':'定语从句','tense':'时态','passive':'被动语态','non-finite verbs':'非谓语动词','agreement':'主谓一致','articles':'冠词','word forms':'词形变化','cohesion':'语篇衔接','inference evidence':'阅读推断','cloze':'完形填空','application writing':'应用文','continuation':'读后续写'}
for c in cards:
    if c['id'] in bodies:c['body']=bodies[c['id']]
    c['category']=categories.get(c['category'],c['category'])
    if c['id']=='card_02':c['practice']="题目：I ______ (look) for my lost key all morning, but I still haven't found it. 参考：have been looking 强调一直寻找的过程；have looked 在强调已经作过寻找时也可能成立。应结合完整时间语境判断，不把开放语境当成只有一种形式。"
    if c['id']=='card_11':c['practice']='题目：礼貌提醒外教 Smith 先生周六上午九点有讲座。示例：Just a friendly reminder that the lecture begins at 9 a.m. this Saturday. We look forward to seeing you there. 信息明确、语气友好即可，不必堆叠客套话。'
    if c['id']=='card_12':c['title']='读后续写：情节衔接、人物一致与有效细节'
k.write_text(json.dumps(cards,ensure_ascii=False,indent=2),encoding='utf-8')
print('Reviewed16 original units and12 knowledge cards; corrected grammar ambiguities and overgeneralized rules.')
