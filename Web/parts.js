(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.StudyParts=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function accept(pending,input,validate) {
    if(input.format!=='zhixing-study-part'||input.schemaVersion!==2)throw new Error('不是 v2 分卷文件');
    const {header,partIndex,totalParts}=input;
    if(!header || header.format!=='zhixing-study-pack' || header.schemaVersion!==2 || !/^[a-zA-Z0-9_-]{1,64}$/.test(header.id)||['__proto__','constructor','prototype'].includes(header.id)||!Number.isInteger(header.revision)||header.revision<1)throw new Error('分卷 header 无效');
    if(!Number.isInteger(totalParts)||totalParts<1||totalParts>100||!Number.isInteger(partIndex)||partIndex<1||partIndex>totalParts)throw new Error('分卷序号必须为 1 到 totalParts，最多 100 卷');
    if(!Array.isArray(input.chapters)||!Array.isArray(input.questions))throw new Error('分卷缺少 chapters / questions');
    const next=JSON.parse(JSON.stringify(pending||{})),key=header.id+'@'+header.revision;
    const entry=next[key]||{header,totalParts,parts:{}};
    if(entry.totalParts!==totalParts||JSON.stringify(entry.header)!==JSON.stringify(header))throw new Error('分卷总数或锁定课程大纲不一致');
    if(entry.parts[partIndex]&&JSON.stringify(entry.parts[partIndex])!==JSON.stringify(input))throw new Error('同序号分卷内容不同；请先清除此暂存课程再重新导入');
    entry.parts[partIndex]=input;next[key]=entry;
    if(Object.keys(entry.parts).length<totalParts)return {pending:next,pack:null,received:Object.keys(entry.parts).length,total:totalParts};
    const chapters=[],questions=[],pointIds=new Set(),questionIds=new Set();
    for(let i=1;i<=totalParts;i++){
      const part=entry.parts[i];
      for(const ch of part.chapters){
        let target=chapters.find(c=>c.id===ch.id);
        if(target&&(target.title!==ch.title||target.summary!==ch.summary))throw new Error('章节定义不一致：'+ch.id);
        if(!target){target={...ch,points:[]};chapters.push(target);}
        if(!Array.isArray(ch.points))throw new Error('章节缺少知识点数组');
        for(const p of ch.points){if(pointIds.has(p.id))throw new Error('分卷知识点重复：'+p.id);pointIds.add(p.id);target.points.push(p);}
      }
      for(const q of part.questions){if(questionIds.has(q.id))throw new Error('分卷题目重复：'+q.id);questionIds.add(q.id);questions.push(q);}
    }
    const pack={...header,chapters,questions};validate(pack);delete next[key];
    return {pending:next,pack,received:totalParts,total:totalParts};
  }
  return {accept};
});
