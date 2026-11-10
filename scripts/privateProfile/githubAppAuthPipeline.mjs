import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_IDENTIFIER = 'com.antigravity.previewinstant';
const PEM_KEY_FINGERPRINT = '44fbe329caf4122b';
const PEM_ENCRYPTED_METADATA_HEX = '5025d692992ba4ad9dee979cdfae89cc8b';
// Optional XOR-masked commit ref (derived with PEM public SPKI SHA-256 keyHash) so no plaintext commit SHA is exposed.
const PRIVATE_PROFILE_ENCRYPTED_REF_HEX = '';

export function readJsonFileSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function writeFileIfChanged(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing === content) {
      return false;
    }
  }
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

export function xorHexBufferWithKeyHash(cipherHex, keyHash) {
  if (!cipherHex || !keyHash) return '';
  const cipherBuf = Buffer.from(cipherHex, 'hex');
  const plainBuf = Buffer.alloc(cipherBuf.length);
  for (let i = 0; i < cipherBuf.length; i++) {
    plainBuf[i] = cipherBuf[i] ^ keyHash[i % keyHash.length];
  }
  return plainBuf.toString('utf8').trim();
}

export function deriveAppMetadataFromPem(pemText) {
  try {
    const pubDer = crypto.createPublicKey(pemText).export({ type: 'spki', format: 'der' });
    const keyHash = crypto.createHash('sha256').update(pubDer).digest();
    const fingerprint = crypto.createHash('sha256').update(keyHash).digest('hex').slice(0, 16);
    if (fingerprint !== PEM_KEY_FINGERPRINT) {
      return null;
    }
    const decoded = xorHexBufferWithKeyHash(PEM_ENCRYPTED_METADATA_HEX, keyHash);
    const [appId, installationId] = decoded.split(':');
    const pinnedRef = PRIVATE_PROFILE_ENCRYPTED_REF_HEX
      ? xorHexBufferWithKeyHash(PRIVATE_PROFILE_ENCRYPTED_REF_HEX, keyHash)
      : '';
    if (appId && installationId) {
      return {
        appId: appId.trim(),
        installationId: installationId.trim(),
        pinnedRef,
      };
    }
  } catch {
    // Ignore PEM metadata derivation failure
  }
  return null;
}

function getCandidateOsConfigDirs() {
  const home = os.homedir();
  const dirs = [];
  if (process.env.XDG_CONFIG_HOME) {
    dirs.push(path.join(process.env.XDG_CONFIG_HOME, APP_IDENTIFIER));
  }
  if (process.env.APPDATA) {
    dirs.push(path.join(process.env.APPDATA, APP_IDENTIFIER));
  }
  if (process.env.LOCALAPPDATA) {
    dirs.push(path.join(process.env.LOCALAPPDATA, APP_IDENTIFIER));
  }
  if (home) {
    dirs.push(
      path.join(home, 'Library', 'Application Support', APP_IDENTIFIER),
      path.join(home, '.config', APP_IDENTIFIER),
      path.join(home, 'AppData', 'Roaming', APP_IDENTIFIER),
      path.join(home, 'AppData', 'Local', APP_IDENTIFIER)
    );
  }
  return dirs;
}

export function discoverLocalGithubCredentials(rootDir) {
  const envToken = (
    process.env.RC_PROFILE_GITHUB_TOKEN ||
    process.env.AGY_PROFILE_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    ''
  ).trim();
  if (envToken) {
    return {
      type: 'token',
      token: envToken,
      pinnedRef: (process.env.RC_PRIVATE_PROFILE_REF || '').trim(),
    };
  }

  const configDirs = getCandidateOsConfigDirs();
  let storedCreds = null;
  for (const dir of configDirs) {
    const credsCandidate = readJsonFileSafe(path.join(dir, 'agy_credentials.json'));
    if (credsCandidate) {
      storedCreds = credsCandidate;
      break;
    }
  }

  let resolvedPem = '';
  let sourcePath = '';

  if (
    process.env.AGY_GITHUB_PRIVATE_KEY &&
    process.env.AGY_GITHUB_PRIVATE_KEY.includes('PRIVATE KEY')
  ) {
    resolvedPem = process.env.AGY_GITHUB_PRIVATE_KEY.trim();
    sourcePath = 'env:AGY_GITHUB_PRIVATE_KEY';
  } else {
    const candidatePemPaths = [];
    if (process.env.AGY_GITHUB_PEM_PATH) {
      candidatePemPaths.push(process.env.AGY_GITHUB_PEM_PATH.trim());
    }
    if (rootDir) {
      candidatePemPaths.push(path.join(rootDir, 'github_app.pem'));
    }
    for (const dir of configDirs) {
      candidatePemPaths.push(path.join(dir, 'github_app.pem'));
    }

    for (const pemPath of candidatePemPaths) {
      try {
        if (fs.existsSync(pemPath)) {
          const text = fs.readFileSync(pemPath, 'utf8').trim();
          if (text.includes('PRIVATE KEY')) {
            resolvedPem = text;
            sourcePath = pemPath;
            break;
          }
        }
      } catch {
        // Ignore read error
      }
    }
  }

  if (!resolvedPem) {
    return null;
  }

  const derivedMeta = deriveAppMetadataFromPem(resolvedPem);
  const appId =
    (process.env.AGY_GITHUB_APP_ID || '').trim() ||
    (storedCreds?.githubAppId || '').trim() ||
    (derivedMeta?.appId || '').trim();
  const installationId =
    (process.env.AGY_GITHUB_INSTALLATION_ID || '').trim() ||
    (storedCreds?.githubInstallationId || '').trim() ||
    (derivedMeta?.installationId || '').trim();
  const pinnedRef =
    (process.env.RC_PRIVATE_PROFILE_REF || '').trim() || (derivedMeta?.pinnedRef || '').trim();

  if (!appId) {
    return null;
  }

  return {
    type: 'app_pem',
    pem: resolvedPem,
    appId,
    installationId,
    pinnedRef,
    sourcePath,
  };
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function createGithubAppJwt(appId, pem) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: now - 60,
      exp: now + 540,
      iss: String(appId),
    })
  );
  const signingInput = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(pem);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}
