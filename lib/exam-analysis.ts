import type {Paper} from './learning-types';
import {gradePaper, normalizeAnswer} from './learning-core';
import {EXAM_TYPES, EXAM_TYPE_LABELS} from './exam-types';
import type {ExamDirection, ExamGradeInput, ExamKnowledgeStats, ExamPlanDay, ExamReport, ExamTypeStats} from './exam-types';

const round = (value: number) => Math.round(value * 100) / 100;
const percent = (part: number, total: number) => total ? round(part / total * 100) : 0;

/** Concrete practice instructions tied to the question's supplied knowledge label. */
function practiceFor(name: string, type: Paper['type']): string[] {
  if (/主旨|大意|标题|写作意图/.test(name)) return ['给每段写一句中文中心句，再合成一句全文主旨。', '逐一标出选项是否过宽、过窄或偏离作者目的，并用首尾段核对。'];
  if (/推理|态度/.test(name)) return ['找到支持判断的原句，写出“原文事实 → 可推出的结论”。', '删去选项中原文没有支持的绝对化词语，区分作者态度与人物观点。'];
  if (/词义|猜词/.test(name)) return ['先判断目标词的词性，再读前后两句找转折、解释或举例。', '把候选词义代回原句，核对语义、搭配和全文语气。'];
  if (/细节/.test(name)) return ['圈出题干的人物、时间和动作，回原文定位对应句并标注同义替换。', '给每个干扰项写出一条排除依据：张冠李戴、范围改变或原文未提及。'];
  if (/定语从句|关系代词|关系副词/.test(name)) return ['标出先行词，检查从句缺主语、宾语还是状语，再选关系词。', '用错题原句写两句同结构新句，对比 that / which / who / where 的作用。'];
  if (/名词性从句|宾语从句|表语从句|主语从句/.test(name)) return ['先判断整个从句在主句中充当的成分，再检查从句内部是否缺成分。', '用原题对比 that / what / whether，写明每个连接词的语法作用。'];
  if (/非谓语|不定式|分词|动名词/.test(name)) return ['找出句中已有的谓语，再判断空格是否需要非谓语。', '标明逻辑主语与动作的主动/被动、先后关系，对比 to do、doing、done。'];
  if (/时态|语态/.test(name)) return ['圈出时间状语与上下文谓语，画一条事件时间线。', '核对主语是动作发出者还是承受者，再检查时态、被动结构和单复数。'];
  if (/主谓一致/.test(name)) return ['划出真正主语，暂时去掉介词短语和插入语，再核对谓语单复数。', '把错句分别改成单数与复数主语，检查动词随之变化。'];
  if (/词性|词形|名词|形容词|副词|复数/.test(name)) return ['判断空格在句中作什么成分，再决定名词、形容词或副词。', '记录该词的词形家族，并复查名词可数性、单复数和常见拼写变化。'];
  if (/冠词/.test(name)) return ['判断名词是否可数、是否单数，并区分首次出现与特指。', '把错题短语放入完整句，解释用 a/an、the 或零冠词的理由。'];
  if (/介词|固定搭配/.test(name)) return ['将正确搭配连同前后词一起摘录，避免只背单个介词。', '用该搭配造两个不同语境的句子，再遮住介词进行回忆。'];
  if (/连词|逻辑|衔接|指代/.test(name) || type === 'seven') return ['标出代词指向、重复词和转折/递进连接词，画出句间关系。', '把所选句代入空格，同时检查前后两句；给干扰句写出衔接失败的位置。'];
  if (type === 'grammar') return ['先判断空格需要实词变化还是虚词，划分句子主干后再填空。', '对照解析写出一条可迁移的规则，用两句新例句验证并检查拼写。'];
  if (type === 'cloze') return ['先用一句话概括情节或论述，再标出人物情绪与逻辑转折。', '逐题比较近义词的搭配和语气，把正确项代回整段验证上下文。'];
  return ['先定位题干对应原文，摘出支持答案的完整句子。', '比较正确项与干扰项的同义替换、信息范围和逻辑关系，写出排除理由。'];
}

export function analyzeExam(input: ExamGradeInput, papers: Paper[]): ExamReport {
  const sections = papers.map(paper => {
    const grade = gradePaper(paper, input.answers[paper.id] || {});
    return {paperId: paper.id, title: paper.title, type: paper.type, grade,
      totalQuestions: grade.items.length,
      correctCount: grade.items.filter(item => item.correct).length,
      unansweredCount: grade.items.filter(item => !normalizeAnswer(item.yourAnswer)).length};
  });
  const score = round(sections.reduce((sum, section) => sum + section.grade.score, 0));
  const maxScore = round(sections.reduce((sum, section) => sum + section.grade.maxScore, 0));
  const totalQuestions = sections.reduce((sum, section) => sum + section.totalQuestions, 0);
  const correctCount = sections.reduce((sum, section) => sum + section.correctCount, 0);
  const unansweredCount = sections.reduce((sum, section) => sum + section.unansweredCount, 0);
  const perType: ExamTypeStats[] = EXAM_TYPES.flatMap(type => {
    const selected = sections.filter(section => section.type === type);
    if (!selected.length) return [];
    const total = selected.reduce((sum, section) => sum + section.totalQuestions, 0);
    const correct = selected.reduce((sum, section) => sum + section.correctCount, 0);
    return [{type, label: EXAM_TYPE_LABELS[type], sections: selected.length, totalQuestions: total,
      correctCount: correct, unansweredCount: selected.reduce((sum, section) => sum + section.unansweredCount, 0),
      score: round(selected.reduce((sum, section) => sum + section.grade.score, 0)),
      maxScore: round(selected.reduce((sum, section) => sum + section.grade.maxScore, 0)), accuracy: percent(correct, total)}];
  });

  const groups = new Map<string, ExamKnowledgeStats>();
  const attemptedErrors = new Map<string, {count: number; lostPoints: number; refs: string[]}>();
  papers.forEach((paper, index) => {
    const result = sections[index];
    paper.questions.forEach((question, questionIndex) => {
      const item = result.grade.items[questionIndex];
      const name = question.knowledge?.trim() || `${EXAM_TYPE_LABELS[paper.type]} · 未细分知识点`;
      const key = `${paper.type}\0${name}`;
      const group = groups.get(key) || {name, type: paper.type, totalQuestions: 0, correctCount: 0, unansweredCount: 0, lostPoints: 0, accuracy: 0};
      group.totalQuestions++;
      if (item.correct) group.correctCount++;
      else group.lostPoints = round(group.lostPoints + question.points);
      if (!normalizeAnswer(item.yourAnswer)) group.unansweredCount++;
      else if (!item.correct) {
        const errors = attemptedErrors.get(key) || {count: 0, lostPoints: 0, refs: []};
        errors.count++;
        errors.lostPoints = round(errors.lostPoints + question.points);
        if (errors.refs.length < 2) errors.refs.push(`《${paper.title}》第 ${question.id} 题`);
        attemptedErrors.set(key, errors);
      }
      group.accuracy = percent(group.correctCount, group.totalQuestions);
      groups.set(key, group);
    });
  });
  const knowledge = [...groups.values()].sort((a, b) => b.lostPoints - a.lostPoints || (b.totalQuestions - b.correctCount) - (a.totalQuestions - a.correctCount) || a.name.localeCompare(b.name, 'zh-CN'));
  const answered = totalQuestions - unansweredCount;
  const allowedSeconds = input.minutes * 60;
  const overtimeSeconds = Math.max(0, input.elapsedSeconds - allowedSeconds);
  const pacing = {minutes: input.minutes, elapsedSeconds: input.elapsedSeconds, allowedSeconds,
    remainingSeconds: Math.max(0, allowedSeconds - input.elapsedSeconds), overtimeSeconds,
    secondsPerAnsweredQuestion: answered ? round(input.elapsedSeconds / answered) : null,
    completedWithinTime: unansweredCount === 0 && overtimeSeconds === 0,
    completionRate: percent(answered, totalQuestions),
    message: unansweredCount
      ? `本次有 ${unansweredCount} 题未作答${overtimeSeconds ? `，超过设定时间 ${Math.ceil(overtimeSeconds / 60)} 分钟` : ''}。未作答会按错误计分，不能仅据此判断知识点是否掌握。`
      : overtimeSeconds ? `已完成全部题目，超过设定时间 ${Math.ceil(overtimeSeconds / 60)} 分钟。下一次可练习分段计时。`
      : `已在设定时间内完成全部题目。保持复核习惯，再用同难度新题检验稳定性。`};

  const directions: ExamDirection[] = [];
  const add = (title: string, evidence: string, actions: string[]) => {
    if (directions.length < 3) directions.push({priority: (directions.length + 1) as 1 | 2 | 3, title, evidence, actions});
  };
  if (unansweredCount) {
    const details = perType.filter(row => row.unansweredCount).map(row => `${row.label} ${row.unansweredCount} 题`).join('、');
    add('先补齐未作答，区分不会与来不及', `共 ${unansweredCount}/${totalQuestions} 题未作答：${details}。`,
      ['先不看答案补做这些题，每题标注“不会 / 时间不足 / 漏看”。', '再对照解析区分知识错误与时间安排问题；下一次每完成一段检查一次漏题。']);
  }
  const rankedErrors = [...attemptedErrors.entries()].sort((a, b) => b[1].lostPoints - a[1].lostPoints || b[1].count - a[1].count);
  for (const [key, errors] of rankedErrors) {
    const group = groups.get(key)!;
    add(`优先复习：${group.name}`, `${EXAM_TYPE_LABELS[group.type]}中已作答但答错 ${errors.count} 题，失 ${errors.lostPoints} 分。定位：${errors.refs.join('；')}。`, practiceFor(group.name, group.type));
  }
  if (overtimeSeconds) add('练习分段时间分配', `浏览器记录用时 ${Math.ceil(input.elapsedSeconds / 60)} 分钟，设定 ${input.minutes} 分钟。`,
    ['按各段建议用时分配练习时间，为最后检查预留约十分之一。', '遇到卡住的题先标记再继续；记录卡题原因，结束后单独复盘。']);
  const strongest = [...perType].sort((a, b) => b.accuracy - a.accuracy || b.totalQuestions - a.totalQuestions)[0];
  if (strongest) add(strongest.correctCount ? `复核${strongest.label}中已答对的题` : `建立${strongest.label}的解题步骤`,
    `${strongest.label}本次 ${strongest.correctCount}/${strongest.totalQuestions} 题正确${strongest.unansweredCount ? `，另有 ${strongest.unansweredCount} 题未作答` : ''}；单次练习不代表稳定水平。`,
    strongest.correctCount ? [`抽查${Math.min(2, strongest.correctCount)}道已答对题，遮住解析写出答案依据，排除猜对。`, '换一份同题型、同难度的新题，继续用相同方法验证。'] : practiceFor('', strongest.type));
  add('复盘依据，再做延迟回忆', `本卷 ${correctCount}/${totalQuestions} 题正确；建议保留原答案与订正理由进行比较。`,
    ['每道需复盘的题写出“原来怎么想 / 证据在哪 / 下次如何检查”。', '隔一天遮住答案重做并说明理由；再用错题挑战检查能否迁移。']);
  add('用下一份新题检验稳定性', `本次客观题得分 ${score}/${maxScore}，没有依据推算真实高考分数或保证提分幅度。`,
    ['用同难度新题保持题型和时间设置，记录正确率与漏题数。', '比较两次同题型结果；不要仅凭一次满分提高难度。']);

  const first = directions[0], second = directions[1], third = directions[2];
  const errorCount = totalQuestions - correctCount;
  const focusTypes = [...new Set(rankedErrors.map(([key]) => groups.get(key)!.type))];
  const mix = (focusTypes.length ? focusTypes : perType.map(row => row.type)).map(type => EXAM_TYPE_LABELS[type]).join('、');
  const plan: ExamPlanDay[] = [
    {day: 1, title: '完成订正与原因标记', minutes: 25, actions: [errorCount ? `复盘本卷 ${errorCount} 道未得分题，其中 ${unansweredCount} 道未作答；逐题标注原因。` : '抽查本卷答对题的依据，标出猜测或解释不清的题。', first.actions[0]]},
    {day: 2, title: first.title, minutes: 25, actions: first.actions},
    {day: 3, title: second.title, minutes: 25, actions: second.actions},
    {day: 4, title: '间隔重做与迁移', minutes: 20, actions: [errorCount ? '遮住解析重做本卷错题，写出关键依据；仍错的保留在错题集。' : '选择同题型新题，先独立作答再核对依据。', '从复盘出的规则中选两条，各写一个新例句或解释一个新选项。']},
    {day: 5, title: '同题型新题训练', minutes: 30, actions: [`围绕${mix}选择一至两段新练习，保持本卷难度。`, '如使用针对错题命题，只提交相关知识点；完成后比较同类错误是否再次出现。']},
    {day: 6, title: third.title, minutes: 20, actions: third.actions},
    {day: 7, title: '再次限时检测并比较', minutes: Math.min(45, Math.max(15, input.minutes)), actions: ['按今天可用时间选择同题型、同难度的新卷，独立限时完成。', '比较题型正确率、未作答数与实际用时；仍反复出现的错误列为下一周重点。']},
  ];
  return {examId: input.examId, gradedAt: new Date().toISOString(), score, maxScore, totalQuestions,
    correctCount, unansweredCount, accuracy: percent(correctCount, totalQuestions), sections, perType, knowledge, pacing,
    directions, plan, notes: ['本报告依据本卷实际答案与题目知识点生成，不调用 AI 推测学习能力，不预测高考分数。',
      '仅包含阅读理解、语法填空、七选五、完形填空；不评估听力、作文等未测能力。',
      '题型正确率按题数计算；总分按题目实际分值相加，未折算成完整高考试卷分数。',
      '用时由浏览器记录；平均每题时间包含阅读文章和检查时间，不能代替逐题计时。',
      ...(knowledge.some(row => /未细分|历年真题/.test(row.name)) ? ['部分题目的知识点标注较宽泛，这些统计只能支持相应题型的复盘，不能据此认定具体语法弱点。'] : [])]};
}
