import type { Metadata } from "next";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { cn } from "@/lib/utils";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Kairos",
  description: "Catch the puddle. Clear the storm. A weather and water dashboard for Boston Dynamics Spot, built as an Orbit plugin. Built for NextEra's Spot.",
};

// note: demo-video recording hook, inert unless the URL has ?rec=1. It puts the page clock (performance.now, requestAnimationFrame,
// setInterval, CSS animations) under window.__rec, so scripts/render-demo.mjs can step it one video frame at a time.
// __rec.free() lets the clock run in real time while the script waits on real work (model, Neon), so measured ms stay true.
const REC_CLOCK = `(()=>{if(!/[?&]rec=1/.test(location.search))return;
const real=performance.now.bind(performance),rI=window.clearInterval.bind(window),raf=[],ivs=new Map(),seen=new WeakMap();
let v=real()+1000,free=null,id=1e9;const now=()=>free===null?v:v+real()-free;
performance.now=now;
window.requestAnimationFrame=(cb)=>(raf.push([++id,cb]),id);
window.cancelAnimationFrame=(h)=>{const i=raf.findIndex((r)=>r[0]===h);if(i>=0)raf.splice(i,1);};
window.setInterval=(fn,ms,...a)=>{ms=Math.max(Number(ms)||0,1);ivs.set(++id,{fn:()=>fn(...a),ms,next:now()+ms});return id;};
window.clearInterval=(h)=>(ivs.has(h)?ivs.delete(h):rI(h));
window.__rec={step(ms){if(free!==null){v=now();free=null;}v+=ms;
for(const[h,t]of ivs)while(t.next<=v&&ivs.has(h)){t.next+=t.ms;t.fn();}
for(const[,cb]of raf.splice(0))cb(v);
for(const a of document.getAnimations()){if(!seen.has(a)){seen.set(a,v-(Number(a.currentTime)||0));a.pause();}a.currentTime=v-seen.get(a);}},
free(){if(free===null)free=real();}};})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("font-sans antialiased", sans.variable, mono.variable)}>
      <body>
        {children}
        <Script id="rec-clock" strategy="beforeInteractive">
          {REC_CLOCK}
        </Script>
      </body>
    </html>
  );
}
