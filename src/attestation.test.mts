import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  FIRST_ATTESTED_VERSION,
  VerificationError,
  classifyGhFailure,
  explainUnverifiable,
  findSubjectDigest,
  isMissingExecutable,
  sha256File,
} from './attestation.ts'

const ASSET = 'editorconfig-checker-linux-amd64.tar.gz'

function attestation(subjects: unknown[]) {
  return JSON.stringify({ verificationResult: { statement: { subject: subjects } } })
}

test('classifyGhFailure separates unverifiable from failed', () => {
  const cases: [string, string][] = [
    ['unknown command "verify" for "gh release"', 'gh-unavailable'],
    [
      'no attestations for tag v3.8.0 (sha1:6fa6539948897d1dceee75b6680d7e9688b5c9e9)',
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

test('findSubjectDigest returns the digest bound to the asset name', () => {
  const json = attestation([
    { uri: 'pkg:github/o/r@v4.0.1', digest: { sha1: 'aaa' } },
    { name: 'checksums.txt', digest: { sha256: 'BBB' } },
    { name: ASSET, digest: { sha256: 'CCC' } },
  ])
  assert.equal(findSubjectDigest(json, ASSET), 'ccc')
})

test('findSubjectDigest ignores a matching digest under another name', () => {
  // 'gh release verify-asset' matches on digest alone and would accept this.
  // Binding name to digest is precisely what this function adds.
  const json = attestation([
    { name: 'editorconfig-checker-windows-amd64.tar.gz', digest: { sha256: 'ccc' } },
  ])
  assert.throws(() => findSubjectDigest(json, ASSET), {
    name: 'VerificationError',
    message: /does not cover an asset named/,
  })
})

test('findSubjectDigest rejects malformed attestations', () => {
  const cases: [string, RegExp][] = [
    ['not json at all', /Could not parse/],
    [attestation([]), /lists no subjects/],
    ['{}', /lists no subjects/],
    [attestation([{ name: ASSET, digest: { sha1: 'aaa' } }]), /no sha256 digest/],
    [attestation([{ name: ASSET }]), /no sha256 digest/],
  ]
  for (const [json, message] of cases) {
    assert.throws(() => findSubjectDigest(json, ASSET), { name: 'VerificationError', message }, json)
  }
})

test('VerificationError is thrown as a distinguishable type', () => {
  assert.throws(() => findSubjectDigest('{}', ASSET), (error: unknown) => {
    assert.ok(error instanceof VerificationError)
    return true
  })
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

test('sha256File digests the file as written', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ecc-attestation-'))
  try {
    const filePath = path.join(directory, 'archive.tar.gz')
    // Larger than one stream chunk, so a single-chunk implementation would fail.
    const contents = randomBytes(128 * 1024)
    await fs.writeFile(filePath, contents)
    const expected = createHash('sha256').update(contents).digest('hex')
    assert.equal(await sha256File(filePath), expected)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
