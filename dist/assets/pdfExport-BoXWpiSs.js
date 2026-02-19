const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./jspdf.es.min-BDsjU3Pk.js","./index-CBPv6F-N.js","./index-C-Z0nxSR.css","./jszip.min-C_GtTr4g.js"])))=>i.map(i=>d[i]);
import{c as C,_ as v}from"./index-CBPv6F-N.js";import{c as _}from"./gradeCalc-sZypAYmG.js";/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const D=C("Loader",[["line",{x1:"12",x2:"12",y1:"2",y2:"6",key:"gza1u7"}],["line",{x1:"12",x2:"12",y1:"18",y2:"22",key:"1qhbu9"}],["line",{x1:"4.93",x2:"7.76",y1:"4.93",y2:"7.76",key:"xae44r"}],["line",{x1:"16.24",x2:"19.07",y1:"16.24",y2:"19.07",key:"bxnmvf"}],["line",{x1:"2",x2:"6",y1:"12",y2:"12",key:"89khin"}],["line",{x1:"18",x2:"22",y1:"12",y2:"12",key:"pb8tfm"}],["line",{x1:"4.93",x2:"7.76",y1:"19.07",y2:"16.24",key:"1uxjnu"}],["line",{x1:"16.24",x2:"19.07",y1:"7.76",y2:"4.93",key:"6duxfx"}]]);async function $(){const[e,i,r]=await Promise.all([v(()=>import("./jspdf.es.min-BDsjU3Pk.js").then(l=>l.j),__vite__mapDeps([0,1,2]),import.meta.url),v(()=>import("./html2canvas.esm-CBrSDip1.js"),[],import.meta.url),v(()=>import("./jszip.min-C_GtTr4g.js").then(l=>l.j),__vite__mapDeps([3,1,2]),import.meta.url)]);return{jsPDF:e.jsPDF,html2canvas:i.default,JSZip:r.default}}function w(e,i,r,l){var d;const p=_(e,i.criteria,l),a=i.format;(d=i.criteria[0])==null||d.levels;const t=o=>a.levelOrder==="worst-first"?[...o.levels].reverse():o.levels,c=i.criteria.map(o=>{const n=e.entries.find(s=>s.criterionId===o.id),f=t(o).map(s=>{(n==null?void 0:n.levelId)===s.id||(n==null||n.overridePoints);const h=(n==null?void 0:n.levelId)===s.id;return`<td style="padding:10px 12px;border:1px solid #d1d5db;vertical-align:top;font-size:12px;${h?`background:${a.accentColor}22;border-color:${a.accentColor};font-weight:600;`:""}">
        ${s.description||"–"}
        ${a.showPoints?`<br/><small style="color:${h?a.accentColor:"#6b7280"}">${s.minPoints===s.maxPoints?s.maxPoints:`${s.minPoints}-${s.maxPoints}`}pts</small>`:""}
      </td>`}).join(""),x=n!=null&&n.comment?`<div style="font-size:10px;color:#6b7280;margin-top:4px;font-style:italic">${n.comment}</div>`:"";return`<tr>
      <td style="padding:10px 12px;border:1px solid #d1d5db;font-weight:600;font-size:12px;background:#f8fafc;min-width:${a.criterionColWidth}px">
        ${o.title}
        ${o.description?`<div style="font-size:10px;color:#6b7280;font-weight:400">${o.description}</div>`:""}
        ${x}
        ${a.showWeights?`<div style="font-size:10px;color:#6b7280;margin-top:4px">Weight: ${o.weight}%</div>`:""}
      </td>
      ${f}
    </tr>`}).join(""),m=(i.criteria[0]?t(i.criteria[0]):[]).map(o=>`<th style="padding:12px 14px;text-align:center;min-width:${a.levelColWidth}px;font-size:12px">
      ${o.label}${a.showPoints?` (${o.minPoints===o.maxPoints?o.maxPoints:`${o.minPoints}-${o.maxPoints}`}pts)`:""}
    </th>`).join("");return`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: ${a.fontFamily}; margin: 0; padding: 24px; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
    <div>
      <h1 style="margin:0;font-size:20px">${i.name}</h1>
      ${i.subject?`<div style="color:#6b7280;margin-top:4px;font-size:13px">${i.subject}</div>`:""}
      <div style="margin-top:8px;font-size:14px"><strong>Student:</strong> ${r.name}</div>
      ${r.email?`<div style="font-size:13px;color:#6b7280">${r.email}</div>`:""}
      <div style="font-size:12px;color:#6b7280;margin-top:4px">Graded: ${e.gradedAt?new Date(e.gradedAt).toLocaleDateString():"N/A"}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:42px;font-weight:800;color:${p.gradeColor};line-height:1">${p.letterGrade}</div>
      <div style="font-size:16px;font-weight:600;color:#374151">${p.modifiedPercentage.toFixed(1)}%</div>
      <div style="font-size:12px;color:#6b7280">${p.rawScore}/${p.maxRawScore} pts</div>
      ${e.globalModifier&&e.globalModifier.value!==0?`<div style="font-size:11px;color:#f59e0b;margin-top:4px">Modifier: ${e.globalModifier.value>0?"+":""}${e.globalModifier.value}${e.globalModifier.type==="percentage"?"%":"pts"}
           ${e.globalModifier.reason?`(${e.globalModifier.reason})`:""}</div>`:""}
    </div>
  </div>

  <table>
    <thead>
      <tr style="background:${a.headerColor};color:${a.headerTextColor}">
        <th style="padding:12px 14px;text-align:left;font-size:12px;min-width:${a.criterionColWidth}px">Criterion</th>
        ${m}
      </tr>
    </thead>
    <tbody>${c}</tbody>
  </table>

  ${e.overallComment?`
    <div style="margin-top:18px;padding:14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
      <strong style="font-size:12px;color:#374151">Overall Comment:</strong>
      <p style="margin:6px 0 0;font-size:13px;color:#475569">${e.overallComment}</p>
    </div>`:""}

  <div style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:right">
    Generated by Rubric Maker · ${new Date().toLocaleDateString()}
    ${e.isPeerReview?" · Peer Review":""}
  </div>
</body>
</html>`}async function R(e,i,r,l){const{jsPDF:p,html2canvas:a}=await $(),t=document.createElement("div");t.style.cssText="position:fixed;left:-9999px;top:-9999px;width:900px;background:#fff;",t.innerHTML=w(e,i,r,l),document.body.appendChild(t);try{const c=await a(t,{scale:2,useCORS:!0,logging:!1,backgroundColor:"#ffffff"}),m=c.toDataURL("image/jpeg",.95),d=new p({orientation:"portrait",unit:"mm",format:"a4"}),o=d.internal.pageSize.getWidth(),n=d.internal.pageSize.getHeight(),g=o,f=c.height*g/c.width;let x=0;for(;x<f;)x>0&&d.addPage(),d.addImage(m,"JPEG",0,-x,g,f),x+=n;d.save(`${r.name.replace(/[^a-z0-9]/gi,"_")}_${i.name.replace(/[^a-z0-9]/gi,"_")}.pdf`)}finally{document.body.removeChild(t)}}async function S(e,i,r){const{jsPDF:l,html2canvas:p,JSZip:a}=await $(),t=new a;for(const{sr:o,student:n}of e){const g=document.createElement("div");g.style.cssText="position:fixed;left:-9999px;top:-9999px;width:900px;background:#fff;",g.innerHTML=w(o,i,n,r),document.body.appendChild(g);try{const f=await p(g,{scale:2,useCORS:!0,logging:!1,backgroundColor:"#ffffff"}),x=f.toDataURL("image/jpeg",.95),s=new l({orientation:"portrait",unit:"mm",format:"a4"}),h=s.internal.pageSize.getWidth(),P=s.internal.pageSize.getHeight(),b=h,u=f.height*b/f.width;let y=0;for(;y<u;)y>0&&s.addPage(),s.addImage(x,"JPEG",0,-y,b,u),y+=P;const z=s.output("blob");t.file(`${n.name.replace(/[^a-z0-9]/gi,"_")}_${i.name.replace(/[^a-z0-9]/gi,"_")}.pdf`,z)}finally{document.body.removeChild(g)}}const c=await t.generateAsync({type:"blob"}),m=URL.createObjectURL(c),d=document.createElement("a");d.href=m,d.download=`${i.name.replace(/[^a-z0-9]/gi,"_")}_grades.zip`,d.click(),setTimeout(()=>URL.revokeObjectURL(m),6e4)}function j(e){var a;const i=e.format;(a=e.criteria[0])==null||a.levels;const r=t=>i.levelOrder==="worst-first"?[...t.levels].reverse():t.levels,l=e.criteria.map(t=>{const m=r(t).map(d=>`<td style="padding:10px 12px;border:1px solid #d1d5db;vertical-align:top;font-size:12px;">
        ${d.description||"–"}
        ${i.showPoints?`<br/><small style="color:#6b7280">${d.minPoints===d.maxPoints?d.maxPoints:`${d.minPoints}-${d.maxPoints}`}pts</small>`:""}
      </td>`).join("");return`<tr>
      <td style="padding:10px 12px;border:1px solid #d1d5db;font-weight:600;font-size:12px;background:#f8fafc;min-width:${i.criterionColWidth}px">
        ${t.title}
        ${t.description?`<div style="font-size:10px;color:#6b7280;font-weight:400">${t.description}</div>`:""}
        ${i.showWeights?`<div style="font-size:10px;color:#6b7280;margin-top:4px">Weight: ${t.weight}%</div>`:""}
      </td>
      ${m}
    </tr>`}).join(""),p=(e.criteria[0]?r(e.criteria[0]):[]).map(t=>`<th style="padding:12px 14px;text-align:center;min-width:${i.levelColWidth}px;font-size:12px">
      ${t.label}${i.showPoints?` (${t.minPoints===t.maxPoints?t.maxPoints:`${t.minPoints}-${t.maxPoints}`}pts)`:""}
    </th>`).join("");return`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: ${i.fontFamily}; margin: 0; padding: 24px; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <div style="margin-bottom:18px">
    <h1 style="margin:0;font-size:20px">${e.name}</h1>
    ${e.subject?`<div style="color:#6b7280;margin-top:4px;font-size:13px">${e.subject}</div>`:""}
    ${e.description?`<div style="color:#6b7280;margin-top:4px;font-size:12px">${e.description}</div>`:""}
  </div>

  <table>
    <thead>
      <tr style="background:${i.headerColor};color:${i.headerTextColor}">
        <th style="padding:12px 14px;text-align:left;font-size:12px;min-width:${i.criterionColWidth}px">Criterion</th>
        ${p}
      </tr>
    </thead>
    <tbody>${l}</tbody>
  </table>

  <div style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:right">
    Generated by Rubric Maker · ${new Date().toLocaleDateString()}
  </div>
</body>
</html>`}async function W(e){const{jsPDF:i,html2canvas:r}=await $(),l=document.createElement("div");l.style.cssText="position:fixed;left:-9999px;top:-9999px;width:900px;background:#fff;",l.innerHTML=j(e),document.body.appendChild(l);try{const p=await r(l,{scale:2,useCORS:!0,logging:!1,backgroundColor:"#ffffff"}),a=p.toDataURL("image/jpeg",.95),t=new i({orientation:"portrait",unit:"mm",format:"a4"}),c=t.internal.pageSize.getWidth(),m=t.internal.pageSize.getHeight(),d=c,o=p.height*d/p.width;let n=0;for(;n<o;)n>0&&t.addPage(),t.addImage(a,"JPEG",0,-n,d,o),n+=m;t.save(`${e.name.replace(/[^a-z0-9]/gi,"_")}.pdf`)}finally{document.body.removeChild(l)}}export{D as L,R as a,S as b,W as e};
