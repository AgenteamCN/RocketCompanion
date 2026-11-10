import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createGithubAppJwt } from './githubAppAuthPipeline.mjs';

export const DEFAULT_PUBLIC_PROFILE = Object.freeze({
  profileSource: 'default',
  signaling: {
    defaultSignalingUrl: '',
    roomPrefix: '',
    topicNamespace: '',
    relays: [],
  },
  turn: {
    iceServers: [],
  },
});

export function canonicalizeProfileNode(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeProfileNode);
  }
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      if (key === 'profileHash' || key === 'profileSource') {
        continue;
      }
      sorted[key] = canonicalizeProfileNode(value[key]);
    }
    return sorted;
  }
  return value;
}

export function computeProfileContentHash(profile) {
  if (!profile || typeof profile !== 'object') {
    return '';
  }
  const canonicalJson = JSON.stringify(canonicalizeProfileNode(profile));
  return crypto.createHash('sha256').update(canonicalJson).digest('hex').slice(0, 16);
}

export function normalizeFetchedProfile(fetchedProfile) {
  const merged = {
    profileSource: fetchedProfile?.profileSource || 'private',
    signaling: {
      defaultSignalingUrl: fetchedProfile?.signaling?.defaultSignalingUrl || '',
      roomPrefix: fetchedProfile?.signaling?.roomPrefix || '',
      topicNamespace: fetchedProfile?.signaling?.topicNamespace || '',
      ...(fetchedProfile?.signaling?.edgeBridgeUrl
        ? { edgeBridgeUrl: fetchedProfile.signaling.edgeBridgeUrl }
        : {}),
      ...(fetchedProfile?.signaling?.edgeFunctionBridgeUrl
        ? { edgeFunctionBridgeUrl: fetchedProfile.signaling.edgeFunctionBridgeUrl }
        : {}),
      relays: Array.isArray(fetchedProfile?.signaling?.relays)
        ? fetchedProfile.signaling.relays
        : [],
    },
    turn: {
      iceServers: Array.isArray(fetchedProfile?.turn?.iceServers)
        ? fetchedProfile.turn.iceServers
        : [],
    },
    ...(fetchedProfile?.configSync && typeof fetchedProfile.configSync === 'object'
      ? {
          configSync: {
            brokerUrl: fetchedProfile.configSync.brokerUrl || '',
            topicNamespace: fetchedProfile.configSync.topicNamespace || '',
            clientUsername: fetchedProfile.configSync.clientUsername || '',
            clientPassword: fetchedProfile.configSync.clientPassword || '',
            ...(fetchedProfile.configSync.devUsername
              ? { devUsername: fetchedProfile.configSync.devUsername }
              : {}),
            ...(fetchedProfile.configSync.devPassword
              ? { devPassword: fetchedProfile.configSync.devPassword }
              : {}),
          },
        }
      : {}),
  };
  return {
    ...merged,
    profileHash: computeProfileContentHash(merged),
  };
}

export async function githubApiRequest(url, token, method = 'GET') {
  const hasProxyEnv = Boolean(
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy
  );

  if (!hasProxyEnv) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'rocket-companion-profile-sync',
        },
      });
      if (!response.ok) {
        throw new Error(`GitHub API ${method} ${url} returned ${response.status}`);
      }
      return await response.json();
    } catch {
      // Fall through to curl
    }
  }

  const out = execFileSync(
    'curl',
    [
      '-fsSL',
      '-X',
      method,
      '-H',
      `Authorization: Bearer ${token}`,
      '-H',
      'Accept: application/vnd.github+json',
      '-H',
      'User-Agent: rocket-companion-profile-sync',
      url,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return JSON.parse(out);
}

export async function resolveAccessToken(authInfo) {
  if (authInfo.type === 'token') {
    return authInfo.token;
  }

  const jwt = createGithubAppJwt(authInfo.appId, authInfo.pem);
  let targetInstallationId = authInfo.installationId;

  if (!targetInstallationId) {
    const installations = await githubApiRequest(
      'https://api.github.com/app/installations',
      jwt,
      'GET'
    );
    if (Array.isArray(installations) && installations.length > 0) {
      targetInstallationId = String(installations[0].id);
    }
  }

  if (!targetInstallationId) {
    throw new Error('Could not determine GitHub App installation ID');
  }

  const tokenData = await githubApiRequest(
    `https://api.github.com/app/installations/${targetInstallationId}/access_tokens`,
    jwt,
    'POST'
  );
  return tokenData.token;
}

export function resolveMatchingSiblingProfileByGitHistory(
  siblingRepoDir,
  targetHash,
  pinnedRef = ''
) {
  try {
    if (!fs.existsSync(path.join(siblingRepoDir, '.git'))) {
      return null;
    }
    const refsToInspect = [];
    if (pinnedRef) {
      refsToInspect.push(pinnedRef);
    }
    const logOut = execFileSync(
      'git',
      ['-C', siblingRepoDir, 'log', '--format=%H', '-n', '30', '--', 'profile.json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    for (const sha of logOut
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (!refsToInspect.includes(sha)) {
        refsToInspect.push(sha);
      }
    }

    for (const ref of refsToInspect) {
      try {
        const rawJson = execFileSync('git', ['-C', siblingRepoDir, 'show', `${ref}:profile.json`], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        const parsed = JSON.parse(rawJson);
        const normalized = normalizeFetchedProfile(parsed);
        if (normalized.profileHash === targetHash) {
          return normalized;
        }
      } catch {
        // Ignore invalid ref or parse error
      }
    }
  } catch {
    // Ignore git history fallback failure
  }
  return null;
}

export function resolveMatchingSiblingProfile(rootDir, targetHash, pinnedRef = '') {
  try {
    const parentDir = path.resolve(rootDir, '..');
    const rootBaseName = path.basename(path.resolve(rootDir));
    const entries = fs.readdirSync(parentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === rootBaseName || entry.name.startsWith('.')) {
        continue;
      }
      const candidateDir = path.join(parentDir, entry.name);
      const candidateProfilePath = path.join(candidateDir, 'profile.json');
      if (!fs.existsSync(candidateProfilePath)) {
        continue;
      }
      try {
        const parsed = JSON.parse(fs.readFileSync(candidateProfilePath, 'utf8'));
        const normalized = normalizeFetchedProfile(parsed);
        if (normalized.profileHash === targetHash) {
          return normalized;
        }
      } catch {
        // Fall through to git history inspection
      }
      const historical = resolveMatchingSiblingProfileByGitHistory(
        candidateDir,
        targetHash,
        pinnedRef
      );
      if (historical && historical.profileHash === targetHash) {
        return historical;
      }
    }
  } catch {
    // Ignore sibling directory scan failure
  }
  return null;
}

export async function fetchRepoProfileMatchingHash(
  repoFullName,
  accessToken,
  targetHash,
  pinnedRef = ''
) {
  const fetchAtRef = async (ref) => {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const fileData = await githubApiRequest(
      `https://api.github.com/repos/${repoFullName}/contents/profile.json${query}`,
      accessToken,
      'GET'
    );
    if (fileData && typeof fileData.content === 'string') {
      const rawJson = Buffer.from(fileData.content.replace(/\s+/g, ''), 'base64').toString('utf8');
      return normalizeFetchedProfile(JSON.parse(rawJson));
    }
    return null;
  };

  let headProfile = null;
  if (pinnedRef) {
    try {
      const pinnedProfile = await fetchAtRef(pinnedRef);
      if (pinnedProfile && pinnedProfile.profileHash === targetHash) {
        return pinnedProfile;
      }
    } catch {
      // Fall through to HEAD and commit history
    }
  }

  headProfile = await fetchAtRef('');
  if (headProfile && headProfile.profileHash === targetHash) {
    return headProfile;
  }

  // If HEAD moved forward and no longer matches targetHash, walk recent commits touching profile.json
  try {
    const commits = await githubApiRequest(
      `https://api.github.com/repos/${repoFullName}/commits?path=profile.json&per_page=25`,
      accessToken,
      'GET'
    );
    if (Array.isArray(commits)) {
      for (const commit of commits) {
        const sha = typeof commit?.sha === 'string' ? commit.sha : '';
        if (!sha) continue;
        try {
          const candidate = await fetchAtRef(sha);
          if (candidate && candidate.profileHash === targetHash) {
            console.log(
              `[profile-sync] Resolved historical profile revision matching hash ${targetHash}.`
            );
            return candidate;
          }
        } catch {
          // Try next commit
        }
      }
    }
  } catch {
    // Ignore commit history walk failure
  }

  return headProfile;
}

export async function fetchPrivateProfileJson(
  accessToken,
  preferredRepo,
  targetHash,
  pinnedRef = ''
) {
  if (preferredRepo) {
    try {
      const resolved = await fetchRepoProfileMatchingHash(
        preferredRepo,
        accessToken,
        targetHash,
        pinnedRef
      );
      if (resolved) {
        return resolved;
      }
    } catch {
      // Fall through to repository discovery
    }
  }

  const reposResp = await githubApiRequest(
    'https://api.github.com/installation/repositories?per_page=100',
    accessToken,
    'GET'
  );
  const allRepos = Array.isArray(reposResp?.repositories) ? reposResp.repositories : [];
  let fallbackCandidate = null;

  for (const repo of allRepos) {
    if (!repo?.private || !repo?.full_name) {
      continue;
    }
    try {
      const resolved = await fetchRepoProfileMatchingHash(
        repo.full_name,
        accessToken,
        targetHash,
        pinnedRef
      );
      if (resolved) {
        if (!targetHash || resolved.profileHash === targetHash) {
          return resolved;
        }
        if (!fallbackCandidate) {
          fallbackCandidate = resolved;
        }
      }
    } catch {
      // Try next candidate
    }
  }

  if (fallbackCandidate) {
    return fallbackCandidate;
  }

  throw new Error('Private profile.json not found in accessible repositories');
}
