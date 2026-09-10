import { addPath, info, setFailed } from '@actions/core'
import { downloadTool, extractTar } from '@actions/tool-cache'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { verifyAsset } from './attestation'
import { findProgram } from './program'
import { findRelease } from './release'
import { allowUnverified, checkerName, githubToken, repo, version } from './shared'

const WORKING_DIR = path.join(os.homedir(), 'editorconfig-checker')

async function main() {
  info(`Find '${version}' release`)
  const { tag, asset } = await findRelease(version)

  info(`Downloading '${asset.name}'`)
  const archivePath = await downloadTool(asset.browser_download_url)

  // Verify before anything reads, extracts or executes the downloaded bytes.
  info(`Verifying '${asset.name}'`)
  const { owner, repo: repository } = repo({})
  await verifyAsset({
    tag,
    assetName: asset.name,
    archivePath,
    repository: `${owner}/${repository}`,
    githubToken,
    allowUnverified,
  })

  info(`Create '${WORKING_DIR}' directory`)
  await fs.mkdir(WORKING_DIR, { recursive: true })

  info(`Extracting '${asset.name}'`)
  const extractedPath = await extractTar(archivePath, WORKING_DIR)

  const program = await findProgram(extractedPath, os.platform())
  const cwd = path.dirname(program)
  const name = path.basename(program)
  const renamedName = path.format({
    name: checkerName,
    ext: path.extname(name),
  })

  info(`Rename '${name}' to '${renamedName}'`)
  await fs.chmod(program, 0o755)
  await fs.rename(program, path.join(cwd, renamedName))

  info('Add to PATH')
  addPath(cwd)
}

main().catch(setFailed)
