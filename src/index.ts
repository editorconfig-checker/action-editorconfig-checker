import { addPath, info, setFailed } from '@actions/core'
import { downloadTool, extractTar } from '@actions/tool-cache'
import fs from 'node:fs/promises'
import path from 'node:path'
import { findRelease } from './release'
import { checkerName, version } from './shared'

async function main() {
  info(`Find '${version}' release`)
  const release = await findRelease(version)
  info(`Downloading '${release.name}'`)
  const archivePath = await downloadTool(release.browser_download_url)
  info(`Extracting '${release.name}'`)
  const extractedPath = await extractTar(archivePath, process.env.HOME)
  const cwd = path.join(extractedPath, 'bin')
  const [name] = await fs.readdir(cwd)
  const renamedName = path.format({
    name: checkerName,
    ext: path.extname(name),
  })
  info(`Rename '${name}' to '${renamedName}'`)
  await fs.chmod(path.join(cwd, name), 0o755)
  await fs.rename(path.join(cwd, name), path.join(cwd, renamedName))
  info('Add to PATH')
  addPath(cwd)
}

main().catch(setFailed)
