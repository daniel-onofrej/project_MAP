import { readFileSync } from 'node:fs'

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function fail(message) {
  console.error(`version check failed: ${message}`)
  process.exitCode = 1
}

const rootPackage = readJson('package.json')
const rootLock = readJson('package-lock.json')
const releaseManifest = readJson('.release-please-manifest.json')
const mcpPackage = readJson('mcp-server/package.json')
const mcpLock = readJson('mcp-server/package-lock.json')
const workerPackage = readJson('deployment-worker/package.json')
const changelog = readFileSync('CHANGELOG.md', 'utf8')

const version = rootPackage.version
const semver = /^\d+\.\d+\.\d+$/

if (!semver.test(version)) fail(`package.json version "${version}" is not x.y.z semver`)

const checks = [
  ['package-lock.json version', rootLock.version],
  ['package-lock.json root package version', rootLock.packages?.['']?.version],
  ['.release-please-manifest.json root version', releaseManifest['.']],
  ['mcp-server/package.json version', mcpPackage.version],
  ['mcp-server/package-lock.json version', mcpLock.version],
  ['mcp-server/package-lock.json root package version', mcpLock.packages?.['']?.version],
  ['deployment-worker/package.json version', workerPackage.version],
]

for (const [label, actual] of checks) {
  if (actual !== version) fail(`${label} is "${actual}", expected "${version}"`)
}

if (!changelog.includes(`## [${version}]`)) {
  fail(`CHANGELOG.md does not contain an entry for ${version}`)
}

if (!rootPackage.repository?.url?.includes('github.com/daniel-onofrej/project_MAP')) {
  fail('package.json repository.url does not point at daniel-onofrej/project_MAP')
}

if (!process.exitCode) {
  console.log(`version check passed: ${version}`)
}
