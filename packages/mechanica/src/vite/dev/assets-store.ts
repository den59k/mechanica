import fs from 'node:fs'
import { join, parse } from 'node:path'

/** Find a non-colliding filename in `dir`, suffixing `_1`, `_2`, … as needed. */
export function getUniqueName(dir: string, fileName: string): string {
  const existing = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  const { name, ext } = parse(fileName)

  let candidate = fileName
  let counter = 1
  while (existing.includes(candidate)) {
    candidate = `${name}_${counter}${ext}`
    counter++
  }
  return candidate
}

const assetsDir = (mechDir: string) => join(mechDir, 'assets')

/** Public URL the dev server serves an asset under. */
const assetUrl = (fileName: string) => `/@mechanica/assets/${fileName}`

/** Persist an uploaded file under `<mechDir>/assets`, returning its public src. */
export async function saveUpload(
  mechDir: string,
  fileName: string,
  data: Buffer,
): Promise<{ src: string; name: string }> {
  const dir = assetsDir(mechDir)
  await fs.promises.mkdir(dir, { recursive: true })
  const unique = getUniqueName(dir, fileName)
  await fs.promises.writeFile(join(dir, unique), data)
  return { src: assetUrl(unique), name: fileName }
}

/** List uploaded images. */
export function listImages(mechDir: string): { id: string; name: string; src: string }[] {
  const dir = assetsDir(mechDir)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).map((name) => ({
    id: name.slice(0, name.lastIndexOf('.')) || name,
    name,
    src: assetUrl(name),
  }))
}
