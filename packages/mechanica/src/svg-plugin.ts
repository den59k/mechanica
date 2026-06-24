import { promises as fs } from "fs"
import path from "path"
import type { Plugin } from "vite"

// Recursively collect every *.svg file
async function scanSvgFiles(root: string, dir = root): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...await scanSvgFiles(root, fullPath))
    } else if (entry.isFile() && entry.name.endsWith(".svg")) {
      files.push(path.relative(root, fullPath))
    }
  }

  return files
}

export default function svgGlobPlugin(): Plugin {
  return {
    name: "svg-glob-plugin",

    resolveId(source, importer) {
      if (source.endsWith("?svg-glob")) {
        const resolved = source.slice(0, -"?svg-glob".length)
        const importerDir = path.dirname(importer!)
        const fullPath = path.join(importerDir, resolved)
        return "\0svg-glob:" + fullPath
      }
      return null
    },

    handleHotUpdate({ file, server }) {
      if (!file.endsWith(".svg")) return

      for (const mod of server.moduleGraph.idToModuleMap.values()) {
        if (mod.id?.startsWith('\0svg-glob:')) {
          server.moduleGraph.invalidateModule(mod)
        }
      }

      return []
    },

    async load(id) {
      if (!id.startsWith("\0svg-glob:")) return null

      const dir = id.replace("\0svg-glob:", "")
      const files = await scanSvgFiles(dir)

      let _keys: string[] = []
      let _attrs: string[] = []

      for (const file of files) {
        const filename = path.basename(file, ".svg")
        const full = path.join(dir, file)
        const text = await fs.readFile(full, "utf8")

        const tagInfo = text.match(/^<svg[\s\S]*?>/)?.[0]
        if (!tagInfo) {
          console.warn(`icon ${file} is not SVG icon`)
          continue
        }

        // Parse the root <svg> attributes. Normalize hard-coded colors here too
        // (Figma sometimes puts fill/stroke on the root), and use [\w-]+ so
        // hyphenated attrs like stroke-width / stroke-linecap survive — a plain
        // \w+ would clip "stroke-width" down to "width" and corrupt the icon.
        const cleanTag = tagInfo
          .replace(/"#[0-9A-Za-z]+"/g, '"currentColor"')
          .replace(/"(white|black)"/g, '"currentColor"')

        const attrs: Record<string, string> = {}
        for (const match of cleanTag.matchAll(/([\w-]+)=["']([^"']+)["']/g)) {
          const [, name, value] = match
          if (name === "xmlns") continue
          attrs[name!] = value!
        }

        const icon = text
          .replace(/"#[0-9A-Za-z]+"/g, '"currentColor"')
          .replace(/"white"/g, '"currentColor"')
          .replace(/"black"/g, '"currentColor"')
          .replace(/fill-opacity=".+?"/g, "")
          .replace(/^<svg[\s\S]*?>/, '')
          .replace(/<\/svg>\s*$/, '')
          .trim()

        _keys.push(`"${filename}": \`${icon}\``)
        _attrs.push(`"${filename}": ${JSON.stringify(attrs)}`)
      }

      return `
export const contents = {
${_keys.join(",\n")}
}

export const attrs = {
${_attrs.join(",\n")}
}
`
    }
  }
}
