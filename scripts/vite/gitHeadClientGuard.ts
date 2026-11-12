/** Builds the dev-only browser guard that reloads the page after a Git HEAD switch. */
export function buildGitHeadClientGuardScript(initialSignature: string): string {
  return `<script type="module">
(() => {
  let bootSig = ${JSON.stringify(initialSignature)};
  let reloading = false;
  const checkGitHead = async () => {
    if (reloading) return;
    try {
      const res = await fetch('/__rc_git_head', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.signature && bootSig && data.signature !== bootSig) {
        reloading = true;
        window.location.reload();
      } else if (data && data.signature && !bootSig) {
        bootSig = data.signature;
      }
    } catch {
      // Server is restarting; next poll will catch new signature
    }
  };
  if (import.meta.hot) {
    import.meta.hot.on('vite:ws:connect', checkGitHead);
    import.meta.hot.on('rc:git-head-changed', () => {
      if (!reloading) {
        reloading = true;
        window.location.reload();
      }
    });
  }
  setInterval(checkGitHead, 1500);
})();
</script>`;
}
