(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StudyEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FORMAT = 'zhixing-study-pack';
  const DAY = 86400000;
  const MAX_PACK_BYTES = 8 * 1024 * 1024;
  const MAX_STATE_BYTES = 32 * 1024 * 1024;
  const TYPES = ['single', 'multiple', 'true_false', 'short'];
  function fail(message) { throw new Error(message); }
  function bytes(text) {
    let n = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 128) n++; else if (c < 2048) n += 2;
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xDC00 && text.charCodeAt(i + 1) <= 0xDFFF) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }
  function obj(v, label) { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(label + '必须是对象'); }
  function str(v, label, max) { if (typeof v !== 'string' || !v.trim() || v.length > (max || 12000)) fail(label + '缺失或超长'); }
  function id(v, label) {
    if (typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(v) || ['__proto__', 'constructor', 'prototype'].includes(v)) fail(label + '须为 1–64 位字母、数字、下划线或短横线');
  }
  function arr(v, label, min, max) { if (!Array.isArray(v) || v.length < min || v.length > max) fail(label + '数量应在 ' + min + '–' + max + ' 之间'); }
  function texts(v, label, min, max) { arr(v, label, min, max); v.forEach(x => str(x, label, 3000)); }
  function unique(list, label) { if (new Set(list).size !== list.length) fail(label + '不能重复'); }
  function validate(pack) {
    obj(pack, '课程');
    if (bytes(JSON.stringify(pack)) > MAX_PACK_BYTES) fail('单份课程文件不能超过 8 MiB');
    if (pack.format !== FORMAT || ![1, 2].includes(pack.schemaVersion)) fail('不是受支持的知行课程文件，请使用 format=zhixing-study-pack、schemaVersion=1 或 2');
    id(pack.id, '课程 ID'); str(pack.title, '课程标题', 120); str(pack.summary, '课程简介', 3000);
    if (!Number.isInteger(pack.revision) || pack.revision < 1) fail('revision 必须是正整数');
    texts(pack.objectives, '学习目标', 1, 20); texts(pack.tags, '标签', 0, 12);
    arr(pack.chapters, '章节', 1, 300); arr(pack.questions, '题目', 1, 12000);
    const chapterIds = [], pointIds = [], points = [], questionIds = [];
    pack.chapters.forEach(ch => {
      obj(ch, '章节'); id(ch.id, '章节 ID'); str(ch.title, '章节标题', 120); str(ch.summary, '章节简介', 3000);
      chapterIds.push(ch.id); arr(ch.points, '章节知识点', 1, 300);
      ch.points.forEach(p => {
        obj(p, '知识点'); id(p.id, '知识点 ID'); pointIds.push(p.id); points.push(p);
        str(p.title, '知识点标题', 120); str(p.summary, '一句话概括', 1500); str(p.explanation, '知识讲解');
        if (p.analogy !== undefined) str(p.analogy, '通俗理解', 3000);
        if (p.formula !== undefined) str(p.formula, '公式', 3000);
        if (!Number.isInteger(p.minutes) || p.minutes < 1 || p.minutes > 120) fail('知识点 minutes 应为 1–120 的整数');
        texts(p.pitfalls, '易错点', 1, 12); arr(p.prerequisites, '前置知识点', 0, 30); p.prerequisites.forEach(x => id(x, '前置知识点 ID')); unique(p.prerequisites, '前置知识点');
        obj(p.example, '例题'); str(p.example.prompt, '例题题干'); texts(p.example.steps, '例题步骤', 1, 30); str(p.example.answer, '例题答案');
      });
    });
    if (points.length > 3000) fail('每份课程最多 3000 个知识点');
    unique(chapterIds, '章节 ID'); unique(pointIds, '知识点 ID');
    const order = {};
    pointIds.forEach((x, i) => { order[x] = i; });
    points.forEach(p => p.prerequisites.forEach(ref => {
      if (!pointIds.includes(ref)) fail('前置知识点不存在：' + ref);
      if (order[ref] >= order[p.id]) fail('前置知识点必须位于当前知识点之前：' + p.id);
    }));
    pack.questions.forEach(q => {
      obj(q, '题目'); id(q.id, '题目 ID'); questionIds.push(q.id);
      if (!TYPES.includes(q.type)) fail('不支持的题型：' + q.type);
      str(q.prompt, '题干'); str(q.explanation, '答案解析');
      if (!Number.isInteger(q.difficulty) || q.difficulty < 1 || q.difficulty > 3) fail('题目 difficulty 应为 1、2 或 3');
      arr(q.pointIds, '题目关联知识点', 1, 20); unique(q.pointIds, '关联知识点');
      q.pointIds.forEach(ref => { if (!pointIds.includes(ref)) fail('题目关联了不存在的知识点：' + ref); });
      if (q.type === 'short') { str(q.answer, '简答参考答案'); texts(q.rubric, '简答评分要点', 1, 15); }
      else {
        arr(q.options, '选项', q.type === 'true_false' ? 2 : 2, q.type === 'true_false' ? 2 : 8);
        q.options.forEach(o => { obj(o, '选项'); id(o.id, '选项 ID'); str(o.text, '选项内容', 6000); });
        unique(q.options.map(o => o.id), '选项 ID');
        arr(q.answer, '正确答案', 1, q.type === 'multiple' ? q.options.length : 1); unique(q.answer, '正确答案');
        q.answer.forEach(a => { if (!q.options.some(o => o.id === a)) fail('正确答案没有对应选项：' + q.id); });
      }
    });
    unique(questionIds, '题目 ID');
    points.forEach(p => { if (!pack.questions.some(q => q.pointIds.includes(p.id))) fail('知识点没有关联练习题：' + p.id); });
    if (pack.schemaVersion === 2) {
      const C = typeof module === 'object' && module.exports ? require('./coverage.js') : globalThis.StudyCoverage;
      C.assertComplete(pack);
    }
    return pack;
  }
  function parse(text) {
    if (typeof text !== 'string' || bytes(text) > MAX_PACK_BYTES) fail('课程文件过大，最多 8 MiB');
    let p; try { p = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (_) { fail('JSON 格式不正确，请检查是否下载了完整课程文件'); }
    return validate(p);
  }
  function blank() { return { version: 1, courses: [], progress: {} }; }
  function pointList(course) { return course.chapters.reduce((out, ch) => out.concat(ch.points.map(p => Object.assign({ chapterId: ch.id, chapterTitle: ch.title }, p))), []); }
  function getProgress(state, courseId) { return state.progress[courseId] || { read: {}, answers: {} }; }
  function questionSignature(q) { return JSON.stringify([q.type, q.prompt, q.options || [], q.answer, q.explanation, q.rubric || [], q.pointIds, q.solutionSteps || [], q.optionExplanations || {}, q.skill || null, q.primaryPointId || null]); }
  function pointSignature(p) { return JSON.stringify([p.title, p.summary, p.explanation, p.analogy || '', p.formula || '', p.example, p.pitfalls, p.prerequisites]); }
  function importCourse(state, pack) {
    validate(pack);
    const candidate = JSON.parse(JSON.stringify(state));
    const old = candidate.courses.find(c => c.id === pack.id);
    if (old && pack.revision <= old.revision) fail('已存在此课程的第 ' + old.revision + ' 版；更新时请使用相同课程 ID，并增大 revision');
    if (!old && candidate.courses.length >= 100) fail('最多保存 100 门课程，请先备份并移除不用的课程');
    const previous = getProgress(candidate, pack.id), progress = { read: {}, answers: {} };
    if (old) {
      const previousPoints = pointList(old);
      pointList(pack).forEach(p => { const op = previousPoints.find(x => x.id === p.id); if (op && pointSignature(op) === pointSignature(p) && previous.read[p.id]) progress.read[p.id] = true; });
      pack.questions.forEach(q => { const oq = old.questions.find(x => x.id === q.id); if (oq && questionSignature(oq) === questionSignature(q) && previous.answers[q.id]) progress.answers[q.id] = previous.answers[q.id]; });
      candidate.courses[candidate.courses.findIndex(c => c.id === pack.id)] = pack;
    } else candidate.courses.push(pack);
    candidate.progress[pack.id] = progress;
    if (bytes(JSON.stringify(candidate)) > MAX_STATE_BYTES) fail('本地数据总量超过第一版 32 MiB 上限，请备份后移除部分课程');
    return candidate;
  }
  function markRead(state, courseId, pointId) {
    const c = state.courses.find(x => x.id === courseId); if (!c || !pointList(c).some(p => p.id === pointId)) fail('知识点不存在');
    if (!state.progress[courseId]) state.progress[courseId] = { read: {}, answers: {} };
    state.progress[courseId].read[pointId] = true; return state;
  }
  function grade(question, selected) {
    if (question.type === 'short') return null;
    if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length) return false;
    return selected.length === question.answer.length && selected.every(x => question.answer.includes(x));
  }
  function record(state, courseId, questionId, answer, selfRating, now) {
    const c = state.courses.find(x => x.id === courseId), q = c && c.questions.find(x => x.id === questionId);
    if (!q) fail('题目不存在');
    if (q.type === 'short' && typeof selfRating !== 'boolean') fail('请对照评分要点完成自评');
    if (q.type === 'short') { if (typeof answer !== 'string' || answer.length > 12000) fail('简答内容超长'); }
    else if (!Array.isArray(answer) || !answer.length || !answer.every(x => q.options.some(o => o.id === x))) fail('请先选择答案');
    const at = now === undefined ? Date.now() : now;
    const progress = getProgress(state, courseId), prev = progress.answers[questionId] || { attempts: 0, streak: 0, wrongCount: 0 };
    const correct = q.type === 'short' ? selfRating : grade(q, answer);
    const streak = correct ? Math.min(prev.streak + 1, 5) : 0;
    progress.answers[questionId] = {
      correct: correct, attempts: Math.min(prev.attempts + 1, 1000000), streak: streak,
      wrongCount: Math.min(prev.wrongCount + (correct ? 0 : 1), 1000000),
      lastAnswer: answer, lastAt: at, dueAt: correct ? at + [1, 3, 7, 14, 30][streak - 1] * DAY : at,
      mode: q.type === 'short' ? 'self' : 'auto'
    };
    state.progress[courseId] = progress; return { state: state, result: progress.answers[questionId] };
  }
  function stats(state, course, now) {
    const p = getProgress(state, course.id), points = pointList(course), answers = Object.values(p.answers), at = now === undefined ? Date.now() : now;
    const read = points.filter(x => p.read[x.id]).length;
    return { read: read, total: points.length, percent: Math.round(100 * read / points.length), answered: answers.length, correct: answers.filter(x => x.correct).length, wrong: answers.filter(x => !x.correct).length, due: answers.filter(x => x.dueAt <= at).length, attempts: answers.reduce((a, b) => a + b.attempts, 0), minutes: points.reduce((n, x) => n + x.minutes, 0) };
  }
  function queue(state, mode, courseId, pointId, now) {
    const at = now === undefined ? Date.now() : now, out = [];
    state.courses.filter(c => !courseId || c.id === courseId).forEach(c => {
      const p = getProgress(state, c.id);
      c.questions.forEach(q => {
        const a = p.answers[q.id];
        if (pointId && !q.pointIds.includes(pointId)) return;
        if (mode === 'wrong' && (!a || a.correct)) return;
        if (mode === 'due' && (!a || a.dueAt > at)) return;
        out.push({ courseId: c.id, courseTitle: c.title, question: q });
      });
    });
    if (mode === 'due' || mode === 'wrong') out.sort((a, b) => getProgress(state, a.courseId).answers[a.question.id].dueAt - getProgress(state, b.courseId).answers[b.question.id].dueAt);
    return out;
  }
  function restore(text) {
    if (typeof text !== 'string' || bytes(text) > 40 * 1024 * 1024) fail('备份文件过大');
    let b; try { b = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (_) { fail('备份 JSON 不完整'); }
    obj(b, '备份');
    if (b.format !== 'zhixing-progress-backup' || b.schemaVersion !== 1) fail('不是知行进度备份');
    const s = b.state; obj(s, '备份数据'); if (s.version !== 1) fail('不支持的备份版本');
    arr(s.courses, '备份课程', 0, 100); obj(s.progress, '学习进度');
    s.courses.forEach(validate); unique(s.courses.map(c => c.id), '备份课程 ID');
    const clean = blank();
    s.courses.forEach(c => {
      clean.courses.push(c);
      const input = s.progress[c.id] || { read: {}, answers: {} }; obj(input, '课程进度'); obj(input.read, '阅读进度'); obj(input.answers, '答题进度');
      const p = { read: {}, answers: {} };
      pointList(c).forEach(k => { if (input.read[k.id] === true) p.read[k.id] = true; });
      c.questions.forEach(q => {
        const a = input.answers[q.id]; if (!a) return; obj(a, '题目记录');
        if (typeof a.correct !== 'boolean' || !Number.isInteger(a.attempts) || a.attempts < 1 || a.attempts > 1000000 || !Number.isInteger(a.streak) || a.streak < 0 || a.streak > 5 || !Number.isInteger(a.wrongCount) || a.wrongCount < 0 || a.wrongCount > a.attempts || !Number.isFinite(a.lastAt) || !Number.isFinite(a.dueAt) || a.lastAt < 0 || a.dueAt < a.lastAt || !['auto', 'self'].includes(a.mode)) fail('备份中有无效的答题记录');
        if (q.type === 'short') { if (typeof a.lastAnswer !== 'string' || a.lastAnswer.length > 12000 || a.mode !== 'self') fail('简答进度不正确'); }
        else if (!Array.isArray(a.lastAnswer) || !a.lastAnswer.length || new Set(a.lastAnswer).size !== a.lastAnswer.length || !a.lastAnswer.every(x => q.options.some(o => o.id === x)) || a.mode !== 'auto' || grade(q, a.lastAnswer) !== a.correct) fail('客观题进度不正确');
        p.answers[q.id] = { correct: a.correct, attempts: a.attempts, streak: a.streak, wrongCount: a.wrongCount, lastAnswer: a.lastAnswer, lastAt: a.lastAt, dueAt: a.dueAt, mode: a.mode };
      });
      clean.progress[c.id] = p;
    });
    if (bytes(JSON.stringify(clean)) > MAX_STATE_BYTES) fail('备份数据超过 32 MiB 上限');
    return clean;
  }
  function backup(state) { return JSON.stringify({ format: 'zhixing-progress-backup', schemaVersion: 1, exportedAt: new Date().toISOString(), state: state }); }
  return { FORMAT: FORMAT, DAY: DAY, MAX_PACK_BYTES: MAX_PACK_BYTES, MAX_STATE_BYTES: MAX_STATE_BYTES, bytes: bytes, validate: validate, parse: parse, blank: blank, pointList: pointList, getProgress: getProgress, importCourse: importCourse, markRead: markRead, grade: grade, record: record, stats: stats, queue: queue, restore: restore, backup: backup };
});
