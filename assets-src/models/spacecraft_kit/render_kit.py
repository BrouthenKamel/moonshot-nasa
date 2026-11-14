#!/usr/bin/env python3
"""Render GLB parts headlessly (three.js + PBR room environment) for visual review.

    python3 render_kit.py <kit_dir> <out_dir> [part_id ...]
Produces <out_dir>/<id>.png  (4 views: hero 3/4, front, top, back 3/4) and <id>_hero.png.
Requires: playwright + a Chrome binary, and three@0.160.0 (npm) in ./t/node_modules.
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

KIT, OUTD = sys.argv[1], sys.argv[2]
ONLY = sys.argv[3:]
THREE = os.environ.get("THREE_DIR", "/home/claude/t/node_modules/three/")
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")

PAGE = r"""<!DOCTYPE html><html><body style="margin:0;background:#888">
<script type="importmap">{"imports":{"three":"http://kit.local/three/build/three.module.js","three/addons/":"http://kit.local/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const W=1200,H=900;
const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
r.setSize(W,H); r.outputColorSpace=THREE.SRGBColorSpace; r.toneMapping=THREE.ACESFilmicToneMapping; r.toneMappingExposure=1.0;
r.shadowMap.enabled=true;
document.body.appendChild(r.domElement);
const scene=new THREE.Scene();
const pm=new THREE.PMREMGenerator(r); scene.environment=pm.fromScene(new RoomEnvironment(),0.04).texture;
scene.background=new THREE.Color(0x2b2e34);
const key=new THREE.DirectionalLight(0xffffff,1.6); key.position.set(3,5,4); scene.add(key);
const fill=new THREE.DirectionalLight(0xc8d0ff,0.4); fill.position.set(-4,2,-3); scene.add(fill);
window.renderPart = async (url, hero) => {
  const g = await new GLTFLoader().loadAsync(url);
  const obj=g.scene; scene.add(obj);
  const box=new THREE.Box3().setFromObject(obj); const c=box.getCenter(new THREE.Vector3()); const s=box.getSize(new THREE.Vector3());
  const R=s.length()/2;
  const cam=new THREE.PerspectiveCamera(30,1,R/100,R*100);
  const views = hero ? [[1,0.7,1.25]] : [[1,0.7,1.25],[0,0,1],[0,1,0.0001],[-1.1,0.5,-1]];
  const cells = hero ? [[0,0,W,H]] : [[0,H/2,W/2,H/2],[W/2,H/2,W/2,H/2],[0,0,W/2,H/2],[W/2,0,W/2,H/2]];
  r.setScissorTest(true);
  views.forEach((v,i)=>{
    const [x,y,w,h]=cells[i]; r.setViewport(x,y,w,h); r.setScissor(x,y,w,h);
    cam.aspect=w/h; cam.updateProjectionMatrix();
    const d=new THREE.Vector3(...v).normalize();
    const dist=R/Math.sin(THREE.MathUtils.degToRad(15))*1.02;
    cam.position.copy(c).addScaledVector(d,dist); cam.up.set(0, v[1]>0.99?0:1, v[1]>0.99?-1:0); cam.lookAt(c);
    r.render(scene,cam);
  });
  r.setScissorTest(false);
  scene.remove(obj);
  return true;
};
window.ready=true;
</script></body></html>"""


async def main():
    os.makedirs(OUTD, exist_ok=True)
    parts = json.load(open(os.path.join(KIT, "parts.json")))["parts"]
    ids = [p["id"] for p in parts if not ONLY or p["id"] in ONLY]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1200, "height": 900})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

        async def route(rt):
            u = rt.request.url.replace("http://kit.local/", "")
            if u == "page.html":
                return await rt.fulfill(body=PAGE, content_type="text/html")
            if u.startswith("three/"):
                return await rt.fulfill(path=os.path.join(THREE, u[6:]), content_type="application/javascript")
            return await rt.fulfill(path=os.path.join(KIT, u), content_type="model/gltf-binary")
        await pg.route("http://kit.local/**", route)
        await pg.goto("http://kit.local/page.html")
        await pg.wait_for_function("window.ready===true")
        for pid in ids:
            for hero in (False, True):
                await pg.evaluate(f"renderPart('http://kit.local/{pid}.glb', {str(hero).lower()})")
                await pg.screenshot(path=os.path.join(OUTD, f"{pid}{'_hero' if hero else ''}.png"))
            print("rendered", pid, flush=True)
        if errs:
            print("ERRORS:", errs[:10])
        await b.close()

asyncio.run(main())
