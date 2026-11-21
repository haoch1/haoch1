import fs from 'node:fs';
import path from 'node:path';

const USERNAME = 'haoch1';
const MAX_REPOS = 6;
const START_MARKER = '<!-- RECENT_PROJECTS:START -->';
const END_MARKER = '<!-- RECENT_PROJECTS:END -->';

const headers = {
  'User-Agent': `${USERNAME}-profile-updater`,
  Accept: 'application/vnd.github+json',
};

if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

async function fetchRecentRepos() {
  const url = `https://api.github.com/users/${USERNAME}/repos?type=owner&sort=pushed&per_page=50`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }
  const repos = await res.json();

  return repos
    .filter((repo) => {
      if (repo.fork || repo.archived || repo.private) return false;
      if (repo.name.toLowerCase() === USERNAME.toLowerCase()) return false;
      if (!repo.description || !repo.description.trim()) return false;
      return true;
    })
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
    .slice(0, MAX_REPOS);
}

function cleanText(text) {
  return String(text ?? '')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function formatDate(iso) {
  return new Date(iso).toISOString().slice(0, 10).replace(/-/g, '/');
}

function buildList(repos) {
  return repos
    .map((repo) => {
      const name = `[**${cleanText(repo.name)}**](${repo.html_url})`;
      const lang = repo.language ? ` · \`${cleanText(repo.language)}\`` : '';
      const updated = `<sub>${formatDate(repo.pushed_at)}</sub>`;
      const desc = cleanText(repo.description);
      return `- ${name}${lang} · ${updated}<br /><sub>${desc}</sub>`;
    })
    .join('\n');
}

function updateFile(filePath, content) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const startIdx = raw.indexOf(START_MARKER);
  const endIdx = raw.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`Markers not found in ${filePath}`);
  }

  const next =
    raw.slice(0, startIdx + START_MARKER.length) +
    '\n' +
    content +
    '\n' +
    raw.slice(endIdx);

  if (next !== raw) {
    fs.writeFileSync(filePath, next, 'utf8');
    console.log(`Updated ${path.basename(filePath)}`);
  } else {
    console.log(`No changes in ${path.basename(filePath)}`);
  }
}

async function main() {
  const repos = await fetchRecentRepos();
  if (repos.length === 0) {
    console.log('No eligible repositories found; skipping update.');
    return;
  }

  const list = buildList(repos);
  const root = process.cwd();
  updateFile(path.join(root, 'README.md'), list);
  updateFile(path.join(root, 'README.en.md'), list);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
