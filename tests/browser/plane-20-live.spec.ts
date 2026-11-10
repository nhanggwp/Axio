import { mkdir, writeFile } from "node:fs/promises";
import { test, expect } from "../fixtures";
import { planeCases } from "../helpers/planeCases";
import { completedAgentReply, observeAgent } from "../helpers/agent";
import type { auditPlane } from "../helpers/planeAudit";
type Audit = ReturnType<typeof auditPlane>;
for (const item of planeCases) test(`plane ${String(item.id).padStart(2,"0")}: ${item.title}`, async ({ page }) => {
  test.skip(process.env.RUN_LIVE_AI !== "1", "Enable explicitly; uses paid DeepSeek API.");
  test.setTimeout(420000);
  const directory=`docs/plane-20/${process.env.PLANE_RUN ?? "baseline"}`;
  await mkdir(directory,{recursive:true});
  const report: Record<string,unknown>={...item,passed:false};
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  try {
    await page.goto("/");
    await page.waitForFunction(()=>!!window.axio,undefined,{timeout:60000});
    await expect(page.locator(".session-loading")).toBeHidden();
    await observeAgent(page);
    await page.getByRole("textbox",{name:"Yêu cầu hình học"}).fill(item.prompt);
    await page.getByRole("button",{name:"Gửi yêu cầu"}).click();
    const reply=await completedAgentReply(page,0);
    report.reply=reply.plan;report.calls=reply.nextIndex;
    expect(reply.plan.status,reply.plan.message).toBe("ready_to_preview");
    await expect(page.getByRole("button",{name:"Áp dụng",exact:true})).toBeEnabled();
    await page.getByRole("button",{name:"Áp dụng",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.axio!.objects.length)).toBeGreaterThan(0);
    const audit=async()=>page.evaluate(async id=>{
      const modulePath="/tests/helpers/planeAudit.ts";
      const {auditPlane}=await import(/* @vite-ignore */ modulePath);
      return auditPlane(window.axio!.adapter.api,id);
    },item.id) as Promise<Audit>;
    const before=await audit(); report.before=before;
    await page.screenshot({path:`${directory}/${String(item.id).padStart(2,"0")}.png`});
    const controls=before.facts.movable.slice(0,2);
    if(controls.length){
      await page.evaluate(ns=>{const a=window.axio!.adapter.api;for(const n of ns){const scale=Math.max(1,Math.abs(a.getXcoord(n)),Math.abs(a.getYcoord(n)));a.setCoords(n,a.getXcoord(n)+.007*scale,a.getYcoord(n)+.011*scale);}window.axio!.sync();},controls);
      report.after=await audit();
    }
    report.geometry=await page.evaluate(()=>window.axio!.objects);
    const failures=[...before.failures,...((report.after as Audit|undefined)?.failures??[]).map(f=>`Sau khi kéo: ${f}`),...errors];
    report.failures=failures;report.passed=failures.length===0;
  }catch(error){report.error=String(error);report.errors=errors;
    report.streams=await page.evaluate(()=> (window as typeof window&{agentStreams?:string[]}).agentStreams).catch(()=>[]);
    await page.screenshot({path:`${directory}/${String(item.id).padStart(2,"0")}-error.png`}).catch(()=>{});
  }finally{await writeFile(`${directory}/${String(item.id).padStart(2,"0")}.json`,JSON.stringify(report,null,2));}
  expect(report.passed,JSON.stringify({error:report.error,failures:report.failures},null,2)).toBe(true);
});
