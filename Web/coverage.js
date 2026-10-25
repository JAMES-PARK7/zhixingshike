(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StudyCoverage = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const skills = ['recall', 'application', 'transfer', 'misconception'];
  const labels = {recall:'基础理解', application:'应用练习', transfer:'迁移变式', misconception:'易错辨析', synthesis:'章节综合'};
  const idOK = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(x) && !['__proto__','constructor','prototype'].includes(x);
  const text = x => typeof x === 'string' && !!x.trim();
  function report(pack) {
    const errors = [], points = (pack.chapters || []).flatMap(ch => ch.points || []), questions = pack.questions || [];
    const rows = points.map(p => {
      const own = questions.filter(q => q.primaryPointId === p.id);
      return {id:p.id, title:p.title, count:own.length, linked:questions.filter(q => q.pointIds?.includes(p.id)).length,
        skills:Object.fromEntries(skills.map(s => [s,own.filter(q=>q.skill===s).length]))};
    });
    if (pack.schemaVersion !== 2) return {verified:false, errors:[], rows, total:points.length, covered:0, note:'旧版课程未提供大纲清单；不声明完整覆盖'};
    const scope = pack.scope;
    if (!scope || !text(scope.title) || !text(scope.boundary)) errors.push('缺少 scope.title 或 scope.boundary，必须明确教材/大纲及范围');
    const sources = Array.isArray(scope?.sources) ? scope.sources : [];
    if (!sources.length) errors.push('scope.sources 不能为空');
    const sourceIds = new Set();
    for (const s of sources) {
      if (!idOK(s.id) || sourceIds.has(s.id) || !text(s.title) || !text(s.locator)) errors.push('来源须有唯一 id、title、locator');
      sourceIds.add(s.id);
    }
    const references = (value,label) => {
      if (!Array.isArray(value) || !value.length || value.some(v=>!sourceIds.has(v)) || new Set(value).size!==value.length) errors.push(label+' 的 sourceRefs 缺失、重复或无效');
    };
    const outline = Array.isArray(scope?.syllabus) ? scope.syllabus : [];
    if (!outline.length) errors.push('scope.syllabus 不能为空；先锁定完整大纲，再生成内容');
    const outlineIds = new Set(), requiredPoints = new Set(), actualPoints = new Set(points.map(p=>p.id));
    outline.forEach(item => {
      if (!idOK(item.id) || outlineIds.has(item.id) || !text(item.title)) errors.push('大纲条目 id 重复/无效或缺少标题');
      outlineIds.add(item.id); references(item.sourceRefs,'大纲 '+item.id);
      if (!Array.isArray(item.pointIds) || !item.pointIds.length || new Set(item.pointIds).size!==item.pointIds.length) errors.push('大纲 '+item.id+' 缺少唯一知识点清单');
      for (const id of item.pointIds || []) {
        requiredPoints.add(id);
        if (!actualPoints.has(id)) errors.push('大纲 '+item.id+' 缺少知识点 '+id);
      }
    });
    points.forEach(p => {
      if (!requiredPoints.has(p.id)) errors.push('知识点未列入锁定大纲：'+p.id);
      references(p.sourceRefs,'知识点 '+p.id);
      if (!Array.isArray(p.syllabusIds) || !p.syllabusIds.length || new Set(p.syllabusIds).size!==p.syllabusIds.length) errors.push('知识点 '+p.id+' 缺少唯一 syllabusIds');
      for (const id of p.syllabusIds || []) if (!outline.some(s=>s.id===id && s.pointIds?.includes(p.id))) errors.push('大纲与知识点对应不一致：'+p.id+' / '+id);
      for (const item of outline.filter(s=>s.pointIds?.includes(p.id))) if (!p.syllabusIds?.includes(item.id)) errors.push('知识点缺少反向大纲引用：'+p.id);
    });
    questions.forEach(q => {
      if (![...skills,'synthesis'].includes(q.skill)) errors.push('题目缺少有效 skill：'+q.id);
      if (!actualPoints.has(q.primaryPointId) || !q.pointIds?.includes(q.primaryPointId)) errors.push('题目 primaryPointId 必须是关联知识点：'+q.id);
      references(q.sourceRefs,'题目 '+q.id);
      if (!Array.isArray(q.solutionSteps) || !q.solutionSteps.length || q.solutionSteps.some(s=>!text(s))) errors.push('题目缺少完整解题步骤：'+q.id);
      if (q.type !== 'short') for (const o of q.options || []) if (!text(q.optionExplanations?.[o.id])) errors.push('选项缺少逐项解析：'+q.id+'/'+o.id);
      if (q.skill==='synthesis' && new Set(q.pointIds||[]).size<2) errors.push('综合题必须涉及至少两个知识点：'+q.id);
    });
    rows.forEach(row => {
      const dedicated = questions.filter(q=>q.primaryPointId===row.id && q.skill!=='synthesis');
      if (dedicated.length<5) errors.push(row.title+'：独立配套题少于 5 道（综合题不计入）');
      for (const s of skills) if (row.skills[s] < (s==='recall'?2:1)) errors.push(row.title+'：缺少'+labels[s]+'题（基础至少 2 道，其余各至少 1 道）');
      const prompts=dedicated.map(q=>q.prompt.replace(/\s/g,''));
      if (new Set(prompts).size!==prompts.length) errors.push(row.title+'：有重复题干，不计作完整配套题');
    });
    (pack.chapters || []).forEach(ch => {
      if (ch.points.length<2) return;
      const ids=new Set(ch.points.map(p=>p.id));
      const composite=questions.filter(q=>q.skill==='synthesis' && ids.has(q.primaryPointId) && q.pointIds.filter(id=>ids.has(id)).length>=2);
      if (composite.length<2) errors.push(ch.title+'：至少需要 2 道章节综合题');
    });
    if (!Array.isArray(scope?.exclusions) || (scope.exclusions || []).some(x=>!text(x.title)||!text(x.reason))) errors.push('scope.exclusions 须是数组；有排除项时逐项写明原因');
    return {verified:errors.length===0, errors, rows, total:requiredPoints.size, covered:rows.filter(r=>r.skills.recall>=2&&skills.every(s=>r.skills[s]>=1)&&r.count>=5).length,
      note:'仅验证声明大纲、知识点及题库的结构对应；未自动核对教材原文，也不证明答案正确'};
  }
  function assertComplete(pack) { const r=report(pack); if(r.errors.length) throw new Error('课程覆盖检查未通过：\n'+r.errors.slice(0,30).join('\n')+(r.errors.length>30?'\n另有 '+(r.errors.length-30)+' 项缺失':'')); return r; }
  return {skills,labels,report,assertComplete};
});
