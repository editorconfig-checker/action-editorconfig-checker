import { getInput } from '@actions/core'
import { getOctokit } from '@actions/github'

export const checkerName = 'editorconfig-checker'

export const githubToken = getInput('github-token', {
  required: true,
  trimWhitespace: true,
})

export const version = getInput('version', {
  required: true,
  trimWhitespace: true,
})

export const octokit = getOctokit(githubToken)

export function repo<T>(input: T): { owner: string; repo: string } & T {
  return { owner: checkerName, repo: checkerName, ...input }
}
