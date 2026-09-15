import { info, warning } from '@actions/core'
import { getExecOutput } from '@actions/exec'
import type { ExecOptions, ExecOutput } from '@actions/exec'

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

export interface VerifyAssetOptions {
  /** Release tag the asset was downloaded from, already resolved from 'latest'. */
  tag: string
  /** Local path of the downloaded archive. */
  archivePath: string
  /** Repository publishing the release, as 'owner/repo'. */
  repository: string
  /** Token passed to the GitHub CLI. */
  githubToken: string
  /** Whether an unverifiable release may be installed anyway. */
  allowUnverified: boolean
}

type execFunction = (
  commandLine: string,
  args?: string[],
  options?: ExecOptions
) => Promise<ExecOutput>

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
  const { tag, allowUnverified } = options

  const result = await verifyFile(options)
  if (result === 'gh-unavailable' || result === 'no-attestation') {
    const explanation = explainUnverifiable(result, tag)
    if (!allowUnverified) {
      throw new VerificationError(
        `${explanation} Set 'allow-unverified: true' to install it anyway, ` +
          'accepting that the download is not verified.',
      )
    }
    warning(`${explanation} Continuing because 'allow-unverified' is set.`)
    return
  }

  info(`Verified against the ${tag} release attestation`)
}

export async function verifyFile(options: VerifyAssetOptions, geo: execFunction = getExecOutput) {
  const { tag, repository, githubToken, archivePath } = options
  const args = ['release', 'verify-asset', tag, archivePath, '--repo', repository]

  let result
  try {
    result = await geo('gh', args, {
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
      `'gh "${args.join('" "')}"' failed: ${result.stderr.trim()}`,
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
  if (/no attestations found/i.test(stderr)) {
    return 'no-attestation'
  }
  return 'failed'
}

export function explainUnverifiable(reason: UnverifiableReason, tag: string) {
  if (reason === 'gh-unavailable') {
    return (
      `Cannot verify ${tag}: the GitHub CLI is unavailable on this runner, or ` +
      "is older than v2.81.0, where 'gh release verify-asset' landed. It is " +
      'preinstalled on GitHub-hosted runners; container jobs and some ' +
      'self-hosted runners have to install it.'
    )
  }
  return (
    `Cannot verify ${tag}: it has no GitHub release attestation. ` +
    `editorconfig-checker publishes one from ${FIRST_ATTESTED_VERSION} onwards.`
  )
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
