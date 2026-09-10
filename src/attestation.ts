import { info, warning } from '@actions/core'
import { getExecOutput } from '@actions/exec'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

// This module deliberately imports nothing from the rest of src/. Node's test
// runner resolves TypeScript imports as ESM, which would require explicit
// '.ts' extensions on relative imports, and reading action inputs at import
// time would make the module untestable. Everything it needs is passed in.

/**
 * The first editorconfig-checker release published as an immutable release,
 * and so the first one GitHub signed a release attestation for. Releases up to
 * and including v3.8.0 have no attestation and cannot be verified.
 */
export const FIRST_ATTESTED_VERSION = 'v3.9.0'

/**
 * Why verification could not be carried out at all. Distinct from verification
 * being carried out and failing, which is never acceptable.
 */
export type UnverifiableReason = 'gh-unavailable' | 'no-attestation'

export class VerificationError extends Error {
  override name = 'VerificationError'
}

interface AttestationSubject {
  name?: string
  digest?: { sha256?: string }
}

interface ReleaseVerifyOutput {
  verificationResult?: {
    statement?: {
      subject?: AttestationSubject[]
    }
  }
}

export interface VerifyAssetOptions {
  /** Release tag the asset was downloaded from, already resolved from 'latest'. */
  tag: string
  /** Asset file name, as published on the release. */
  assetName: string
  /** Local path of the downloaded archive. */
  archivePath: string
  /** Repository publishing the release, as 'owner/repo'. */
  repository: string
  /** Token passed to the GitHub CLI. */
  githubToken: string
  /** Whether an unverifiable release may be installed anyway. */
  allowUnverified: boolean
}

/**
 * Verify a downloaded release archive against the GitHub release attestation
 * for its tag, and throw unless it matches.
 *
 * `allowUnverified` downgrades to a warning only when verification cannot be
 * performed at all. A verification that runs and fails always throws, so a
 * tampered archive is never installed regardless of how the action is
 * configured.
 */
export async function verifyAsset(options: VerifyAssetOptions) {
  const { tag, assetName, archivePath, allowUnverified } = options

  const attestation = await loadAttestation(options)
  if (attestation === 'gh-unavailable' || attestation === 'no-attestation') {
    const explanation = explainUnverifiable(attestation, tag)
    if (!allowUnverified) {
      throw new VerificationError(
        `${explanation} Set 'allow-unverified: true' to install it anyway, ` +
          'accepting that the download is not verified.',
      )
    }
    warning(`${explanation} Continuing because 'allow-unverified' is set.`)
    return
  }

  const expectedDigest = findSubjectDigest(attestation, assetName)
  const actualDigest = await sha256File(archivePath)
  if (actualDigest !== expectedDigest) {
    throw new VerificationError(
      `'${assetName}' does not match the ${tag} release attestation: ` +
        `expected sha256:${expectedDigest}, got sha256:${actualDigest}. ` +
        "This is not bypassable with 'allow-unverified'.",
    )
  }

  info(`Verified against the ${tag} release attestation (sha256:${actualDigest})`)
}

async function loadAttestation(options: VerifyAssetOptions) {
  const { tag, repository, githubToken } = options
  const args = ['release', 'verify', tag, '--repo', repository, '--format', 'json']

  let result
  try {
    result = await getExecOutput('gh', args, {
      ignoreReturnCode: true,
      silent: true,
      env: { ...process.env, GH_TOKEN: githubToken } as Record<string, string>,
    })
  } catch (error) {
    if (isMissingExecutable(error)) {
      return 'gh-unavailable' satisfies UnverifiableReason
    }
    throw error
  }

  if (result.exitCode === 0) {
    return result.stdout
  }

  const reason = classifyGhFailure(result.stderr)
  if (reason === 'failed') {
    throw new VerificationError(
      `'gh release verify ${tag}' failed: ${result.stderr.trim()}`,
    )
  }
  return reason
}

/**
 * Decide whether a failed 'gh release verify' means verification could not be
 * performed, or means it was performed and did not pass.
 */
export function classifyGhFailure(stderr: string): UnverifiableReason | 'failed' {
  if (/unknown command/i.test(stderr)) {
    return 'gh-unavailable'
  }
  if (/no attestations for/i.test(stderr)) {
    return 'no-attestation'
  }
  return 'failed'
}

export function explainUnverifiable(reason: UnverifiableReason, tag: string) {
  if (reason === 'gh-unavailable') {
    return (
      `Cannot verify ${tag}: the GitHub CLI is unavailable on this runner, or ` +
      "is too old to support 'gh release verify'. It is preinstalled on " +
      'GitHub-hosted runners; container jobs and some self-hosted runners have ' +
      'to install it.'
    )
  }
  return (
    `Cannot verify ${tag}: it has no GitHub release attestation. ` +
    `editorconfig-checker publishes one from ${FIRST_ATTESTED_VERSION} onwards.`
  )
}

/**
 * Pick the digest the attestation records for one named asset.
 *
 * Matching on the name matters: 'gh release verify-asset' matches on digest
 * alone, which accepts any asset belonging to the release. Binding the name to
 * the digest is what makes this check specific to the archive we downloaded.
 */
export function findSubjectDigest(attestation: string, assetName: string) {
  let parsed: ReleaseVerifyOutput
  try {
    parsed = JSON.parse(attestation)
  } catch {
    throw new VerificationError('Could not parse the output of gh release verify')
  }

  const subjects = parsed.verificationResult?.statement?.subject
  if (!subjects?.length) {
    throw new VerificationError('The release attestation lists no subjects')
  }

  const subject = subjects.find(({ name }) => name === assetName)
  if (!subject) {
    throw new VerificationError(
      `The release attestation does not cover an asset named '${assetName}'`,
    )
  }

  const digest = subject.digest?.sha256
  if (!digest) {
    throw new VerificationError(
      `The release attestation records no sha256 digest for '${assetName}'`,
    )
  }
  return digest.toLowerCase()
}

export function isMissingExecutable(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }
  return (
    (error as NodeJS.ErrnoException).code === 'ENOENT' ||
    /unable to locate executable file/i.test(error.message)
  )
}

export async function sha256File(filePath: string) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(filePath), hash)
  return hash.digest('hex')
}
