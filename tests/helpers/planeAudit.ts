import type { GGBApi } from "../../src/types/geogebra";
type Point = { x: number; y: number };
/** Independent measurements of engine geometry; does not trust the AI's checks or prose. */
export function auditPlane(api: GGBApi, id: number) {
  const failures = new Set<string>(), names = api.getAllObjectNames();
  const check = (ok: boolean, description: string) => { if (!ok) failures.add(description); };
  const near = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-5 * Math.max(1, Math.abs(a), Math.abs(b));
  const raw = (n: string): Point => ({ x: api.getXcoord(n), y: api.getYcoord(n) });
  const point = (n: string) => {
    check(api.exists(n) && api.isDefined(n) && api.getObjectType(n) === "point", `Thiếu điểm ${n}`);
    check(api.getVisible(n), `Điểm ${n} bị ẩn`);
    check(/<show[^>]*label="true"/.test(api.getXML(n)), `Thiếu nhãn điểm ${n}`);
    return raw(n);
  };
  const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);
  const d = (a: string, b: string) => dist(raw(a), raw(b));
  const mid = (a: Point, b: Point): Point => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const same = (a: Point,b: Point) => near(dist(a,b),0);
  const dot = (a: Point,b: Point,c: Point) => (a.x-b.x)*(c.x-b.x)+(a.y-b.y)*(c.y-b.y);
  const doc = (n: string) => new DOMParser().parseFromString(api.getXML(n),"application/xml");
  const coeff = (n: string) => { const c=doc(n).querySelector("element > coords"); return {a:Number(c?.getAttribute("x")),b:Number(c?.getAttribute("y")),c:Number(c?.getAttribute("z"))}; };
  const onLine = (p: Point,n: string) => { const l=coeff(n);return near((l.a*p.x+l.b*p.y+l.c)/Math.hypot(l.a,l.b),0); };
  const lineObjects = names.filter(n=>["line","segment","ray"].includes(api.getObjectType(n))&&api.getVisible(n));
  const connected = (a: string,b: string) => { check(lineObjects.some(n=>onLine(raw(a),n)&&onLine(raw(b),n)),`Thiếu đường/đoạn ${a}${b}`); };
  const triangle = (vertices = ["A","B","C"]) => {
    const [a,b,c]=vertices.map(point);
    check(Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))>1e-5,`Tam giác ${vertices.join("")} suy biến`);
    vertices.forEach((n,i)=>connected(n,vertices[(i+1)%3]));
  };
  const acute = () => { triangle(); const [a,b,c]=["A","B","C"].map(raw);check([dot(a,b,c),dot(b,c,a),dot(c,a,b)].every(v=>v>1e-5),"Tam giác không nhọn"); };
  const foot = (p: Point,a: Point,b: Point): Point => { const t=((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/dist(a,b)**2;return{x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)}; };
  const right = (a: string,b: string,c: string) => check(near(dot(raw(a),raw(b),raw(c)),0),`Góc ${a}${b}${c} không vuông`);
  const angleRefs = (n: string) => (api.getCommandString(n,false).match(/[A-Za-z][A-Za-z0-9_]*'*/g)??[]).slice(1);
  const angles = names.filter(n=>api.getObjectType(n)==="angle"&&api.getVisible(n));
  const rightMark = (at: Point,label: string) => check(angles.some(n=>{const refs=angleRefs(n);return refs.length>=3&&same(raw(refs[1]),at)&&near(api.getValue(n),Math.PI/2);}),`Thiếu dấu góc vuông tại ${label}`);
  const circles = names.filter(n=>api.getObjectType(n)==="circle"&&api.getVisible(n)).map(n=>{const m=doc(n).querySelector("element > matrix"),a=Number(m?.getAttribute("A0")),x=-Number(m?.getAttribute("A4"))/a,y=-Number(m?.getAttribute("A5"))/a;return{name:n,center:{x,y},radius:Math.sqrt(x*x+y*y-Number(m?.getAttribute("A2"))/a)};});
  const onCircle = (p: Point,c: typeof circles[number]) => near(dist(p,c.center),c.radius);
  const circleThrough = (points: Point[],label: string) => {const c=circles.find(c=>points.every(p=>onCircle(p,c)));check(!!c,`Thiếu đường tròn qua ${label}`);return c;};
  const circleAt = (center: string,radius?: number) => {point(center);const c=circles.find(c=>same(c.center,raw(center))&&(radius===undefined||near(c.radius,radius)));check(!!c,`Thiếu đường tròn tâm ${center}${radius===undefined?"":` bán kính ${radius}`}`);return c;};
  const pointAt = (p: Point,label: string) => { const found=names.find(n=>api.getObjectType(n)==="point"&&api.getVisible(n)&&same(raw(n),p));check(!!found,`Thiếu ${label}`);return found;};
  const midNamed = (m: string,a: string,b: string) => check(same(point(m),mid(raw(a),raw(b))),`${m} không là trung điểm ${a}${b}`);
  const altitude = (vertex: string,at: string,b: string,c: string) => {check(same(point(at),foot(raw(vertex),raw(b),raw(c))),`${at} không là chân đường cao từ ${vertex}`);connected(vertex,at);};
  const orthocenter = (h: string) => {point(h);const H=raw(h), A=raw("A"),B=raw("B"),C=raw("C");check(near((H.x-A.x)*(C.x-B.x)+(H.y-A.y)*(C.y-B.y),0)&&near((H.x-B.x)*(C.x-A.x)+(H.y-B.y)*(C.y-A.y),0),`${h} không là trực tâm`);};
  const lengthLabel = (a: string,b: string) => check(names.some(n=>api.getObjectType(n)==="segment"&&api.getVisible(n)&&/<show[^>]*label="true"/.test(api.getXML(n))&&api.getCaption(n,true).startsWith([a,b].sort().join("")+" = ")),`Thiếu nhãn độ dài ${a}${b}`);
  const expectedLength = (a: string,b: string,value: number) => check(near(d(a,b),value),`${a}${b} = ${d(a,b)}, phải bằng ${value}`);
  if(id===1){triangle();for(const [a,b]of[["A","B"],["A","C"],["B","C"]])lengthLabel(a,b);}
  if(id===2){triangle();expectedLength("A","B",3);expectedLength("A","C",4);right("B","A","C");rightMark(raw("A"),"A");for(const [a,b]of[["A","B"],["A","C"],["B","C"]])lengthLabel(a,b);}
  if(id===3){point("A");point("B");connected("A","B");expectedLength("A","B",8);midNamed("M","A","B");lengthLabel("A","M");lengthLabel("M","B");}
  if(id===4){acute();altitude("A","H","B","C");rightMark(raw("H"),"H");}
  if(id===5){point("A");point("B");connected("A","B");midNamed("M","A","B");check(api.exists("d")&&api.getVisible("d")&&onLine(raw("M"),"d"),"Trung trực d thiếu hoặc không qua M");const l=coeff("d"),a=raw("A"),b=raw("B");check(near(l.a*(b.y-a.y)-l.b*(b.x-a.x),0),"d không vuông góc AB");}
  if(id===6){triangle();point("D");connected("A","D");check(near(d("B","D")+d("D","C"),d("B","C")),"D không thuộc BC");check(near(d("B","D")/d("D","C"),d("A","B")/d("A","C")),"AD không là phân giác trong");const selected=angles.filter(n=>angleRefs(n)[1]==="A");check(selected.length>=2&&selected.some((a,i)=>selected.some((b,j)=>i!==j&&near(api.getValue(a),api.getValue(b)))),"Thiếu hai dấu góc BAD, DAC bằng nhau");}
  if(id===7){triangle();check(api.exists("d")&&api.getVisible("d")&&onLine(raw("C"),"d"),"d không đi qua C");const l=coeff("d"),a=raw("A"),b=raw("B");check(near(l.a*(b.x-a.x)+l.b*(b.y-a.y),0),"d không song song AB");}
  if(id===8){const c=circleAt("O",4);for(const n of["A","B"]){point(n);connected("O",n);if(c)check(onCircle(raw(n),c),`${n} không nằm trên đường tròn`);}check(d("A","B")>1e-5,"A và B trùng nhau");}
  if(id===9){triangle();const c=circleAt("O");if(c)check(["A","B","C"].every(n=>onCircle(raw(n),c)),"Ngoại tiếp không qua ba đỉnh");}
  if(id===10){triangle();const c=circleAt("I");for(const v of["A","B","C"])connected(v,"I");if(c)for(const [a,b]of[["A","B"],["B","C"],["C","A"]])check(near(dist(c.center,foot(c.center,raw(a),raw(b))),c.radius),`Nội tiếp không tiếp xúc ${a}${b}`);}
  if(id===11){acute();for(const [v,m,b,c]of[["A","M","B","C"],["B","N","A","C"],["C","P","A","B"]]){midNamed(m,b,c);connected(v,m);}const [a,b,c]=["A","B","C"].map(raw);check(same(point("G"),{x:(a.x+b.x+c.x)/3,y:(a.y+b.y+c.y)/3}),"G không là trọng tâm");}
  if(id===12){acute();for(const [v,h,b,c]of[["A","H","B","C"],["B","K","A","C"],["C","L","A","B"]])altitude(v,h,b,c);orthocenter("T");}
  if(id===13){triangle();expectedLength("A","B",5);expectedLength("A","C",5);expectedLength("B","C",6);midNamed("M","B","C");altitude("A","M","B","C");check(near(d("B","M")/d("M","C"),d("A","B")/d("A","C")),"AM không là phân giác");}
  if(id===14){const c1=circleAt("O1",5),c2=circleAt("O2",5);expectedLength("O1","O2",6);for(const n of["A","B"]){point(n);if(c1&&c2)check(onCircle(raw(n),c1)&&onCircle(raw(n),c2),`${n} không là giao hai đường tròn`);}check(d("A","B")>1e-5,"Hai giao điểm trùng nhau");connected("A","B");}
  if(id===15){const c=circleAt("O",3);point("A");expectedLength("O","A",6);for(const n of["B","C"]){point(n);connected("A",n);if(c)check(onCircle(raw(n),c),`${n} không là tiếp điểm`);right("O",n,"A");}check(d("B","C")>1e-5,"Hai tiếp điểm trùng nhau");}
  if(id===16){const v=["A","B","C","D","E","F"];v.forEach(point);v.forEach((n,i)=>{expectedLength(n,v[(i+1)%6],4);connected(n,v[(i+1)%6]);connected("O",n);});const c=circleAt("O",4);if(c)check(v.every(n=>onCircle(raw(n),c)),"Lục giác không nội tiếp đường tròn");}
  if(id===17){triangle();triangle(["A'","B'","C'"]);check(api.exists("d")&&api.getVisible("d"),"Thiếu trục d");const l=coeff("d"),norm=l.a*l.a+l.b*l.b;const sides=["A","B","C"].map(n=>l.a*raw(n).x+l.b*raw(n).y+l.c);check(sides.every(x=>x>1e-5)||sides.every(x=>x< -1e-5),"d không nằm ngoài tam giác");for(const n of["A","B","C"]){const p=raw(n),t=(l.a*p.x+l.b*p.y+l.c)/norm;check(same(raw(n+"'"),{x:p.x-2*l.a*t,y:p.y-2*l.b*t}),`Ảnh ${n}' sai`);connected(n,n+"'");rightMark(mid(p,raw(n+"'")),`${n}${n}' ∩ d`);}}
  if(id===18){const v=["A","B","C","D"];v.forEach(point);const o=point("O");v.forEach((n,i)=>{point(n+"'");expectedLength(n,v[(i+1)%4],4);right(n,v[(i+1)%4],v[(i+2)%4]);connected(n,v[(i+1)%4]);connected(n+"'",v[(i+1)%4]+"'");const p=raw(n),x=p.x-o.x,y=p.y-o.y;check(same(raw(n+"'"),{x:o.x+x/2-y*Math.sqrt(3)/2,y:o.y+x*Math.sqrt(3)/2+y/2}),`Ảnh quay ${n}' sai hướng/góc`);});const cross=v.map((n,i)=>{const a=raw(n),b=raw(v[(i+1)%4]);return(b.x-a.x)*(o.y-a.y)-(b.y-a.y)*(o.x-a.x);});check(!(cross.every(x=>x>=0)||cross.every(x=>x<=0)),"O không nằm ngoài hình vuông");}
  if(id===19){acute();const sides=[d("A","B"),d("A","C"),d("B","C")];check(!near(sides[0],sides[1])&&!near(sides[1],sides[2])&&!near(sides[0],sides[2]),"Tam giác cân thay vì không cân");orthocenter("H");point("O");check(near(d("O","A"),d("O","B"))&&near(d("O","A"),d("O","C")),"O không là tâm ngoại tiếp");const points: Point[]=[];for(const [a,b,c]of[["A","B","C"],["B","C","A"],["C","A","B"]]){const m=mid(raw(b),raw(c)),h=foot(raw(a),raw(b),raw(c));pointAt(m,`trung điểm ${b}${c}`);pointAt(h,`chân đường cao từ ${a}`);points.push(m,h);}circleThrough(points,"ba trung điểm và ba chân đường cao");}
  if(id===20){acute();point("O");const outer=circleAt("O");if(outer)check(["A","B","C"].every(n=>onCircle(raw(n),outer)),"(O) không ngoại tiếp ABC");for(const [v,h,b,c]of[["A","D","B","C"],["B","E","A","C"],["C","F","A","B"]]){altitude(v,h,b,c);rightMark(raw(h),h);}orthocenter("H");midNamed("M","B","C");circleThrough(["D","E","F","M"].map(raw),"D,E,F,M");}
  const movable=names.filter(n=>api.getObjectType(n)==="point"&&api.getVisible(n)&&api.isMoveable(n));
  check(movable.length>=2,"Cần ít nhất 2 điểm điều khiển hiển thị để kéo chỉnh");
  return {failures:[...failures],facts:{objects:names.length,movable,circles,angles:angles.map(n=>({name:n,refs:angleRefs(n),value:api.getValue(n)}))}};
}
