'use strict';
const fs=require('node:fs'),E=require('../Web/engine'),C=require('../Web/coverage'),P=require('../Web/parts'),L=require('../Web/latex'),katex=require('../Web/vendor/katex.min');
let pending={},count=0;
try{
 const paths=process.argv.slice(2);if(!paths.length)throw Error('用法：node scripts/validate-course.cjs 文件.json [其余分卷.json ...]');
 const validate=p=>{E.validate(p);const formulas=L.validateCourse(p,katex),r=C.report(p);console.log(JSON.stringify({title:p.title,points:E.pointList(p).length,questions:p.questions.length,formulas,coverage:r.verified?'声明大纲结构通过':'旧版未声明大纲',note:r.note},null,2));count++;return p;};
 for(const file of paths){const text=fs.readFileSync(file,'utf8');if(E.bytes(text)>40*1024*1024)throw Error('文件超过 40 MiB');const input=JSON.parse(text.replace(/^\uFEFF/,''));if(input.format==='zhixing-study-part'){const result=P.accept(pending,input,validate);pending=result.pending;}else validate(E.parse(text));}
 if(Object.keys(pending).length)throw Error('分卷尚未收齐：'+Object.values(pending).map(p=>p.header.title+' '+Object.keys(p.parts).length+'/'+p.totalParts).join('；'));
 if(!count)throw Error('没有完整课程');
}catch(e){console.error(e.message);process.exitCode=1;}
