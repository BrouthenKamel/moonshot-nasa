/**
 * Lets three.js's GLTFExporter run in Node: it reads Blobs through FileReader,
 * which only browsers have. Import this before exporting.
 */
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { Object3D } from 'three'

class NodeFileReader {
  result: ArrayBuffer | string | null = null
  onloadend: (() => void) | null = null
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((buf) => {
      this.result = buf
      this.onloadend?.()
    })
  }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`
      this.onloadend?.()
    })
  }
}

const g = globalThis as { FileReader?: unknown }
g.FileReader ??= NodeFileReader

/** Export an object tree to a binary glTF (.glb) buffer */
export async function exportGlb(root: Object3D): Promise<Buffer> {
  const out = await new GLTFExporter().parseAsync(root, { binary: true })
  return Buffer.from(out as ArrayBuffer)
}
