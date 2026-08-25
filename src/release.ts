import os from 'node:os'
import { checkerName, octokit, repo } from './shared'

export async function findRelease(version: string) {
  const release = await getRelease(version)
  const assetPrefixes = getAssetPrefixes(os.platform(), os.arch())
  const matchedAsset = findFirstMatchingAsset(release.data.assets, assetPrefixes)
  if (!matchedAsset) {
    throw new Error(`The binary '${assetPrefixes.join("*' or '")}*' not found`)
  }
  return matchedAsset
}

function getRelease(version: string) {
  const { getLatestRelease, getReleaseByTag } = octokit.rest.repos
  if (version === 'latest') {
    return getLatestRelease(repo({}))
  }
  return getReleaseByTag(repo({ tag: version }))
}

export function findFirstMatchingAsset<Asset extends { name: string }>(
  assets: ReadonlyArray<Asset>,
  assetPrefixes: string[],
) {
  for (const assetPrefix of assetPrefixes) {
    const matchedAsset = assets.find(({ name }) => {
      return name.startsWith(assetPrefix) && name.endsWith('.tar.gz')
    })
    if (matchedAsset) {
      return matchedAsset
    }
  }
  return undefined
}

export function getAssetPrefixes(platform: string, arch: string) {
  if (platform === 'win32') {
    platform = 'windows'
  }
  if (arch === 'x32') {
    arch = '386'
  } else if (arch === 'x64') {
    arch = 'amd64'
  }
  const currentAssetPrefixes = [`${checkerName}-${platform}-${arch}`]
  if (platform === 'darwin') {
    currentAssetPrefixes.push(`${checkerName}-darwin-all`)
  }
  const legacyAssetPrefix = `ec-${platform}-${arch}`
  return [...currentAssetPrefixes, legacyAssetPrefix]
}
