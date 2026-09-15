import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FIRST_ATTESTED_VERSION,
  classifyGhFailure,
  explainUnverifiable,
  isMissingExecutable,
  type execFunction,
  verifyFile,
} from './attestation.ts'
import type { ExecOptions, ExecOutput } from '@actions/exec'

const ASSET = 'editorconfig-checker-linux-amd64.tar.gz'

function attestation(subjects: unknown[]) {
  return JSON.stringify({ verificationResult: { statement: { subject: subjects } } })
}

test('classifyGhFailure separates unverifiable from failed', () => {
  const cases: [string, string][] = [
    ['unknown command "verify-asset" for "gh release"', 'gh-unavailable'],
    [
      'no attestations found for tag v3.8.0 (sha1:6fa6539948897d1dceee75b6680d7e9688b5c9e9)',
      'no-attestation',
    ],
    ['release not found', 'failed'],
    ['attestation for v4.0.1 does not contain subject sha256:abc', 'failed'],
    ['HTTP 401: Bad credentials', 'failed'],
    ['', 'failed'],
  ]
  for (const [stderr, expected] of cases) {
    assert.equal(classifyGhFailure(stderr), expected, stderr)
  }
})

test('explainUnverifiable names the remedy for each reason', () => {
  assert.match(explainUnverifiable('gh-unavailable', 'v4.0.1'), /GitHub CLI/)
  assert.match(explainUnverifiable('no-attestation', 'v3.7.0'), /v3\.7\.0/)
  assert.match(
    explainUnverifiable('no-attestation', 'v3.7.0'),
    new RegExp(FIRST_ATTESTED_VERSION.replace('.', '\\.')),
  )
})

test('isMissingExecutable recognises a missing gh, not other errors', () => {
  const enoent: NodeJS.ErrnoException = new Error('spawn gh ENOENT')
  enoent.code = 'ENOENT'
  assert.equal(isMissingExecutable(enoent), true)
  assert.equal(isMissingExecutable(new Error('Unable to locate executable file: gh')), true)
  assert.equal(isMissingExecutable(new Error('HTTP 500')), false)
  assert.equal(isMissingExecutable('not an error'), false)
  assert.equal(isMissingExecutable(undefined), false)
})

function getMockedExecOutput(stderr: string, stdout = '', rc = 0): GetExecOutputFn {
  return async (
    commandLine: string,
    args?: string[],
    options?: ExecOptions
  ): Promise<ExecOutput> => {
    return {
      exitCode: rc,
      stdout: stdout,
      stderr: stderr
    };
  };
}

test('verifyFile behaviour against gh release verify-asset output', () => {
  const cases: [name: string, stderr: string, result: string][] = [
    ['tampered archive', 'attestation for v4.0.1 does not contain subject sha256:34a6251a…', 'throws'],
    ['unattested tag', 'no attestations found for tag v3.8.0 (sha1:6fa65399…)', 'no-attestation'],
    ['bad tag', 'release not found', 'throws'],
    ['gh too old', 'unknown command "verify-asset" for "gh release"', 'gh-unavailable']
  ]
  const options = {tag: 'n/a', repository: 'n/a', githubToken: 'n/a', archivePath: 'n/a'}

  for (const [name, stderr, expected] of cases) {
    test(name, async () => {
      if( expected == 'throws' ){
        assert.throws(() => {
          verifyFile(options, getMockedExecOutput(stderr))
        })
      } else {
        assert.equal(await verifyFile(options, getMockedExecOutput(stderr)), expected)
      }
    })
  }
})
