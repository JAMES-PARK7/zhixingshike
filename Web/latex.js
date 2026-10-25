(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StudyLatex = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const delimiters = [{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false},{left:'$',right:'$',display:false}];
  const options = { throwOnError:true,trust:false,maxExpand:200,maxSize:20,strict:false };
  const legacy = {
    'U_AB = V_A − V_B':'U_{AB} = V_A - V_B',
    '平均电流 I = ΔQ / Δt；1 A = 1 C/s':'I_{\\mathrm{avg}} = \\frac{\\Delta Q}{\\Delta t},\\qquad 1\\,\\mathrm{A}=1\\,\\mathrm{C/s}',
    'U = IR；I = U/R；R = U/I':'U=IR,\\qquad I=\\frac{U}{R},\\qquad R=\\frac{U}{I}',
    'P = UI；电阻 P = I²R = U²/R；恒功率时 E = Pt':'P=UI=I^2R=\\frac{U^2}{R},\\qquad E=Pt',
    'R_总 = R₁ + R₂；I = U/(R₁ + R₂)':'R_{\\mathrm{eq}}=R_1+R_2,\\qquad I=\\frac{U}{R_1+R_2}',
    '无负载：U_out = U_in × R₂/(R₁ + R₂)':'U_{\\mathrm{out}}=U_{\\mathrm{in}}\\frac{R_2}{R_1+R_2}'
  };
  function escaped(text,index) { let n=0;for(let i=index-1;i>=0&&text[i]==='\\';i--)n++;return n%2===1; }
  function tokenize(value) {
    const text=String(value==null?'':value),out=[];let start=0,i=0;
    while(i<text.length){
      const delimiter=delimiters.find(d=>text.startsWith(d.left,i)&&!escaped(text,i));
      if(!delimiter){i++;continue;}
      if(i>start)out.push({type:'text',text:text.slice(start,i)});
      const body=i+delimiter.left.length;let end=body;
      for(;end<text.length;end++)if(text.startsWith(delimiter.right,end)&&!escaped(text,end))break;
      if(end>=text.length)throw new Error('公式分隔符未闭合：'+delimiter.left);
      const tex=text.slice(body,end).trim();if(!tex)throw new Error('公式内容不能为空');
      if(tex.length>4096)throw new Error('单个公式最多 4096 字符，请拆分长推导');
      out.push({type:'math',text:tex,display:delimiter.display});i=end+delimiter.right.length;start=i;
    }
    if(start<text.length)out.push({type:'text',text:text.slice(start)});
    return out;
  }
  function formula(value) {
    let text=String(value||'').trim();if(legacy[text])return legacy[text];
    const tokens=tokenize(text);if(tokens.length===1&&tokens[0].type==='math')return tokens[0].text;
    return text;
  }
  function block(value) { return '\\['+formula(value)+'\\]'; }
  function check(tex,katex) {
    if(tex.length>4096)throw new Error('单个公式超过 4096 字符');
    if(/[\x00-\x08\x0B-\x1F]/.test(tex))throw new Error('公式含控制字符；JSON 中的反斜杠必须写成双反斜杠');
    if(/\\(?:includegraphics|href|url|html\w*|def|gdef|edef|xdef|global|newcommand|renewcommand|let)\b/.test(tex))throw new Error('学习公式不支持外部资源、HTML 或宏定义命令');
    katex.renderToString(tex,Object.assign({},options,{macros:{},output:'html'}));
  }
  function validateCourse(pack,katex) {
    let count=0;const seen=new Set();
    function walk(value,path){
      if(typeof value==='string'){
        let tokens;try{tokens=path.endsWith('.formula')?[{type:'math',text:formula(value)}]:tokenize(value);}catch(error){throw new Error(path+'：'+error.message);}
        for(const token of tokens)if(token.type==='math'){
          count++;if(count>5000)throw new Error('每份课程最多 5000 处公式，请按章节拆分');
          if(!seen.has(token.text)){try{check(token.text,katex);}catch(error){throw new Error(path+'：LaTeX 格式错误。'+error.message);}seen.add(token.text);}
        }
      }else if(Array.isArray(value))value.forEach((x,i)=>walk(x,path+'['+i+']'));
      else if(value&&typeof value==='object')Object.keys(value).forEach(key=>walk(value[key],path+'.'+key));
    }
    walk(pack,'课程');return count;
  }
  function nodes(value,parse,display){
    const tokens=display?[{type:'math',text:formula(value),display:true}]:tokenize(value),out=[];
    tokens.forEach(t=>{
      if(t.type==='text')out.push({type:'text',text:t.text.replace(/\\\$/g,'$')});
      else {
        const rendered=parse(t.text,Object.assign({},options,{macros:{},displayMode:t.display,throwError:true}));
        if(t.display)out.push({name:'div',attrs:{style:'display:block;overflow-x:auto;max-width:100%;padding:0.35em 0;'},children:rendered});
        else out.push.apply(out,rendered);
      }
    });return out;
  }
  function migrateBuiltin(state,previous,next){
    const index=state.courses.findIndex(c=>c.id===next.id);if(index<0)return state;
    if(JSON.stringify(state.courses[index])!==JSON.stringify(previous))return state;
    const result=JSON.parse(JSON.stringify(state));result.courses[index]=next;return result;
  }
  return {delimiters:delimiters,options:options,tokenize:tokenize,formula:formula,block:block,check:check,validateCourse:validateCourse,nodes:nodes,migrateBuiltin:migrateBuiltin};
});
