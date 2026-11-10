import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverLocalGithubCredentials,
  readJsonFileSafe,
  writeFileIfChanged,
} from './privateProfile/githubAppAuthPipeline.mjs';
import {
  DEFAULT_PUBLIC_PROFILE,
  canonicalizeProfileNode,
  computeProfileContentHash,
  fetchPrivateProfileJson,
  resolveAccessToken,
  resolveMatchingSiblingProfile,
} from './privateProfile/profileRepositoryResolver.mjs';
import {
  decryptRctbnspibBundleNode,
  encryptRctbnspibBundleNode,
} from './privateProfile/rctbnspibBundleCliPipeline.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const RESOLVED_PROFILE_PATH = path.join(ROOT_DIR, '.cache', 'resolvedProfile.json');

export const PRIVATE_PROFILE_HASH = 'f44ce56d5e4f817d';
export {
  canonicalizeProfileNode,
  computeProfileContentHash,
  decryptRctbnspibBundleNode,
  encryptRctbnspibBundleNode,
};

function verifyProfileHashOrThrow(profile, sourceLabel) {
  const computedHash = computeProfileContentHash(profile);
  if (computedHash !== PRIVATE_PROFILE_HASH) {
    throw new Error(
      `[profile-sync] HASH MISMATCH in ${sourceLabel}: expected PRIVATE_PROFILE_HASH="${PRIVATE_PROFILE_HASH}", but computed "${computedHash}". Please verify if remote credentials were modified and update PRIVATE_PROFILE_HASH.`
    );
  }
}

export async function syncPrivateProfile({ force = false } = {}) {
  const existingResolved = readJsonFileSafe(RESOLVED_PROFILE_PATH);

  // Zero-network fast path: if cached private profile exists and matches PRIVATE_PROFILE_HASH, return immediately!
  if (!force && existingResolved && existingResolved.profileSource === 'private') {
    const localHash = computeProfileContentHash(existingResolved);
    if (localHash === PRIVATE_PROFILE_HASH) {
      return existingResolved;
    }
    console.log(
      `[profile-sync] Cached .cache/resolvedProfile.json hash "${localHash}" differs from PRIVATE_PROFILE_HASH "${PRIVATE_PROFILE_HASH}". Re-syncing automatically...`
    );
  }

  const authInfo = discoverLocalGithubCredentials(ROOT_DIR);
  const pinnedRef = authInfo?.pinnedRef || '';

  // Check local sibling directories for a profile.json matching PRIVATE_PROFILE_HASH before hitting network
  if (!force) {
    const siblingProfile = resolveMatchingSiblingProfile(ROOT_DIR, PRIVATE_PROFILE_HASH, pinnedRef);
    if (siblingProfile) {
      writeFileIfChanged(RESOLVED_PROFILE_PATH, `${JSON.stringify(siblingProfile, null, 2)}\n`);
      console.log(
        `[profile-sync] Hydrated private configuration from sibling repo (${siblingProfile.profileHash}).`
      );
      return siblingProfile;
    }
  }

  if (!authInfo) {
    writeFileIfChanged(
      RESOLVED_PROFILE_PATH,
      `${JSON.stringify(DEFAULT_PUBLIC_PROFILE, null, 2)}\n`
    );
    return DEFAULT_PUBLIC_PROFILE;
  }

  const preferredRepo = (process.env.RC_PRIVATE_PROFILE_REPO || '').trim();
  const accessToken = await resolveAccessToken(authInfo);
  const normalized = await fetchPrivateProfileJson(
    accessToken,
    preferredRepo,
    PRIVATE_PROFILE_HASH,
    pinnedRef
  );

  verifyProfileHashOrThrow(normalized, 'remote GitHub private profile.json');
  writeFileIfChanged(RESOLVED_PROFILE_PATH, `${JSON.stringify(normalized, null, 2)}\n`);
  console.log(`[profile-sync] Hydrated private configuration (${normalized.profileHash}).`);
  return normalized;
}

function parseCliFlagValue(args, flagName) {
  const idx = args.indexOf(flagName);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

async function runCli(argv) {
  const force = argv.includes('--force');
  const exportBundleArg = parseCliFlagValue(argv, '--export-bundle');
  const pinCode = parseCliFlagValue(argv, '--pin');
  const windowMinutesRaw = parseCliFlagValue(argv, '--window');

  const profile = await syncPrivateProfile({ force });

  if (exportBundleArg !== undefined || argv.includes('--export-bundle')) {
    if (!profile || profile.profileSource !== 'private') {
      throw new Error(
        '[profile-sync] Cannot export .rctbnspib bundle: active profile is not a hydrated private profile.'
      );
    }
    const windowMinutes = windowMinutesRaw ? Number(windowMinutesRaw) : undefined;
    const exported = encryptRctbnspibBundleNode(profile, { pinCode, windowMinutes });
    const outPath =
      exportBundleArg && !exportBundleArg.startsWith('--')
        ? path.resolve(process.cwd(), exportBundleArg)
        : path.join(ROOT_DIR, '.cache', exported.suggestedFileName);
    writeFileIfChanged(outPath, exported.serializedJson);
    console.log(
      `[profile-sync] Exported encrypted bundle to ${path.relative(ROOT_DIR, outPath)} (PIN: ${exported.pinCode}, valid for ${exported.windowMinutes}m).`
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runCli(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
