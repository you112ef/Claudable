import { spawn } from 'node:child_process'

function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += String(d)))
    child.stderr.on('data', (d) => (err += String(d)))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(out.trim())
      else reject(new Error(err || `git ${args.join(' ')} failed with code ${code}`))
    })
  })
}

export type Commit = {
  commit_sha: string
  parent_sha: string | null
  author: string | null
  date: string | null
  message: string
}

export async function listCommits(repoPath: string, limit: number = 50): Promise<Commit[]> {
  const fmt = '%H%x01%P%x01%an%x01%ad%x01%s'
  const args = ['log', `-n${limit}`, `--pretty=format:${fmt}`, '--date=iso']
  const out = await runGit(repoPath, args).catch(() => '')
  if (!out) return []
  const commits: Commit[] = []
  for (const line of out.split(/\r?\n/)) {
    const [sha, parents, author, date, subject] = line.split('\x01')
    commits.push({
      commit_sha: sha,
      parent_sha: parents ? parents.split(' ')[0] : null,
      author: author || null,
      date: date || null,
      message: subject || '',
    })
  }
  return commits
}

export async function showDiff(repoPath: string, commitSha: string): Promise<string> {
  return runGit(repoPath, ['show', '--format=', commitSha])
}

export async function hardReset(repoPath: string, commitSha: string): Promise<void> {
  await runGit(repoPath, ['reset', '--hard', commitSha])
}

