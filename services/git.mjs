import { simpleGit } from 'simple-git';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS_DIR = path.resolve(__dirname, '..', 'repos');

// Ensure repos directory exists
if (!fs.existsSync(REPOS_DIR)) {
  fs.mkdirSync(REPOS_DIR, { recursive: true });
}

export function getRepoDir(pm2Name) {
  return path.join(REPOS_DIR, pm2Name);
}

export async function cloneOrPull(repoUrl, pm2Name) {
  const dest = getRepoDir(pm2Name);

  if (fs.existsSync(path.join(dest, '.git'))) {
    // Repo already cloned — pull latest
    const git = simpleGit(dest);
    await git.pull();
    return dest;
  }

  // Fresh clone
  await simpleGit().clone(repoUrl, dest);
  return dest;
}

