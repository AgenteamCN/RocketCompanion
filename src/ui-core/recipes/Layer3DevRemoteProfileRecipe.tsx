import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Download,
  GitCommitHorizontal,
  IdCard,
  Info,
  RefreshCw,
  Sliders,
  UserCog,
  Users,
} from 'lucide-react';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { UnderlineTabs, type TabItem } from '../primitives/UnderlineTabs';
import { UnderConstructionPlaceholder } from '../primitives/UnderConstructionPlaceholder';
import { useAppStore } from '../stores/appStore';
import { useCloudProfileSyncStore } from '../stores/cloudProfileSyncStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useScopedStore } from '../stores/storeSnapshotScope';
import { DEFAULT_PANEL_SIZING } from '../tokens/menuLayoutTokens';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { DevManageAccountsSection } from './dev/DevManageAccountsSection';

export type DevRemoteProfileTabId = 'set-profile' | 'manage-accounts';
export type Layer3DevRemoteProfileRecipeProps = StandardSurfaceProps;

export const SURFACE_META: SurfaceMeta = {
  id: 'layer3-dev-remote-profile',
  title: 'REMOTE PROFILE MANAGEMENT',
  subtitle: 'Cloud Account Directory & Live Remote Profile Tuning',
  description:
    'Manage cloud user accounts (immutable User ID, login username, password, #alias, Display Name), export JSON backups, and remotely tune profiles in real time.',
  icon: 'user-cog',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    mode: 'adaptive',
    width: DEFAULT_PANEL_SIZING['layer3-dev-remote-profile'].width,
    height: DEFAULT_PANEL_SIZING['layer3-dev-remote-profile'].targetHeight,
    minHeight: DEFAULT_PANEL_SIZING['layer3-dev-remote-profile'].minHeight,
    maxHeight: DEFAULT_PANEL_SIZING['layer3-dev-remote-profile'].maxHeight,
  },
  variants: [
    { variantId: 'set-profile', label: 'Set Others Profile' },
    { variantId: 'manage-accounts', label: 'Manage Accounts' },
  ],
};

export const Layer3DevRemoteProfileRecipe: React.FC<
  Layer3DevRemoteProfileRecipeProps
> = ({
  isLight = false,
  activeTab: controlledTab,
  onTabChange,
  onBack: propOnBack,
}) => {
  const storeGoBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
  const onBack = propOnBack ?? storeGoBack;

  const sizing = useMenuLayoutStore(
    (s) =>
      s.panels?.['layer3-dev-remote-profile'] ??
      DEFAULT_PANEL_SIZING['layer3-dev-remote-profile']
  );
  const panelBodyPaddingX = useMenuLayoutStore((s) => s.panelBodyPaddingX ?? 18);

  const cloudSync = useScopedStore('cloudProfileSyncStore', useCloudProfileSyncStore);
  const {
    available,
    canManageAccounts,
    accounts,
    isLoadingAccounts,
    syncStatus,
    statusMessage,
    errorMessage,
    refreshAccounts,
    upsertAccount,
    deleteAccount,
    startRemoteTuningSession,
    exportRemoteAccountProfileBackup,
  } = cloudSync;

  const [internalTab, setInternalTab] = useState<DevRemoteProfileTabId>('set-profile');
  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

  const activeTab: DevRemoteProfileTabId =
    controlledTab === 'manage-accounts' || controlledTab === 'set-profile'
      ? controlledTab
      : internalTab;

  const handleSelectTab = (nextTab: DevRemoteProfileTabId) => {
    setInternalTab(nextTab);
    onTabChange?.(nextTab);
  };

  useEffect(() => {
    if (available) {
      void refreshAccounts();
    }
  }, [available, refreshAccounts]);

  const tabs: TabItem[] = [
    {
      id: 'set-profile',
      label: 'Set Others Profile',
      icon: <UserCog className="h-3.5 w-3.5" />,
    },
    {
      id: 'manage-accounts',
      label: 'Manage Accounts',
      icon: <Users className="h-3.5 w-3.5" />,
    },
  ];

  const neutralBadgeClass = `font-mono px-1.5 py-0.5 rounded border ${
    isLight
      ? 'bg-neutral-100 border-neutral-300 text-neutral-600'
      : 'bg-neutral-950/70 border-neutral-800 text-neutral-300'
  }`;

  const actionBtnClass = `px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition active:scale-95 ${
    isLight
      ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
      : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
  }`;

  return (
    <PanelContainer isLight={isLight} sizing={sizing} className="w-full">
      <PanelHeader
        title="REMOTE PROFILE MANAGEMENT"
        onBack={onBack}
        isLight={isLight}
      />

      <div
        style={{
          paddingLeft: `${panelBodyPaddingX}px`,
          paddingRight: `${panelBodyPaddingX}px`,
        }}
        className="pt-2 w-full shrink-0"
        data-panel-section="tabs"
      >
        <UnderlineTabs
          items={tabs}
          activeId={activeTab}
          onChange={(id) => handleSelectTab(id as DevRemoteProfileTabId)}
          isLight={isLight}
          size="sm"
          fullWidth={true}
        />
      </div>

      <PanelContent scrollable>
        {!available || !canManageAccounts ? (
          <UnderConstructionPlaceholder
            title="Developer Cloud Profile Credentials Required"
            description="Remote Profile Management requires developer private profile credentials to inspect and push user dev slots."
            badge="DEV CREDENTIALS REQUIRED"
            isLight={isLight}
          />
        ) : activeTab === 'set-profile' ? (
          <div className="flex flex-col gap-2.5 w-full">
            <div className="flex items-center justify-between gap-2">
              <div className={`text-xs ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
                Select an account below to sync their latest uploaded profile and enter{' '}
                <span className={`font-mono font-bold ${isLight ? 'text-neutral-900' : 'text-white'}`}>
                  SETTINGS # &lt;alias&gt;
                </span>{' '}
                remote tuning mode, or export a JSON backup.
              </div>
              <button
                type="button"
                onClick={() => void refreshAccounts()}
                disabled={isLoadingAccounts}
                className={`${actionBtnClass} !py-1 shrink-0`}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingAccounts ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {accounts.length === 0 ? (
              <div
                className={`rounded-xl border p-6 text-center flex flex-col items-center gap-2 ${
                  isLight
                    ? 'bg-neutral-50 border-neutral-200 text-neutral-600'
                    : 'bg-neutral-900/50 border-neutral-800 text-neutral-400'
                }`}
              >
                <Users className="h-6 w-6 opacity-60" />
                <div className="text-xs font-semibold">
                  {isLoadingAccounts
                    ? 'Scanning cloud account directory...'
                    : 'No cloud accounts found yet.'}
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectTab('manage-accounts')}
                  className="mt-1 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs cursor-pointer transition"
                >
                  Create Account in Manage Accounts
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {accounts.map((acc) => (
                  <div
                    key={acc.userId}
                    onMouseEnter={() =>
                      setHoveredDesc(
                        `Tune #${acc.alias || acc.username} (@${acc.username}, ID: ${acc.userId}): Automatically pulls the user's latest uploaded snapshot first, stashes your local settings, and deploys live updates.`
                      )
                    }
                    onMouseLeave={() => setHoveredDesc(null)}
                    className={`rounded-xl border px-3.5 py-2.5 flex items-center justify-between gap-3 transition-all ${
                      isLight
                        ? 'bg-white/90 hover:bg-neutral-50 border-neutral-200/90 text-neutral-900'
                        : 'bg-neutral-900/70 hover:bg-neutral-800/75 border-neutral-800/90 text-neutral-100'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0 font-mono font-bold text-xs">
                        #{(acc.alias || acc.username || acc.userId).slice(0, 3)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-sm tracking-tight">
                            # {acc.alias || acc.username}
                          </span>
                          <span className={`${neutralBadgeClass} text-xs`} title="Login Username">
                            @{acc.username || acc.userId}
                          </span>
                          <span className={`${neutralBadgeClass} text-[10px]`} title="Immutable User ID">
                            ID: {acc.userId}
                          </span>
                          <span
                            className={`font-mono text-[11px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1 bg-amber-500/10 border-amber-500/30 ${
                              isLight ? 'text-amber-800' : 'text-amber-300'
                            }`}
                            title="User Multiplayer Display Name Card"
                          >
                            <IdCard className="h-3 w-3" />
                            {acc.displayName || acc.alias}
                          </span>
                        </div>
                        <div
                          className={`text-[11px] font-mono mt-0.5 flex items-center gap-2 ${
                            isLight ? 'text-neutral-500' : 'text-neutral-400'
                          }`}
                        >
                          <span className="inline-flex items-center gap-1">
                            <GitCommitHorizontal className="h-3 w-3 opacity-70" />
                            user #{acc.userRevHash}
                          </span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <GitCommitHorizontal className="h-3 w-3 opacity-70" />
                            dev #{acc.devRevHash}
                          </span>
                          {acc.password && (
                            <>
                              <span>·</span>
                              <span>pw: {acc.password}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void exportRemoteAccountProfileBackup(acc)}
                        onMouseEnter={() =>
                          setHoveredDesc(
                            `Export Backup JSON for #${acc.alias} (@${acc.username}): Downloads their full cloud profile snapshot as a structured JSON backup.`
                          )
                        }
                        onMouseLeave={() => setHoveredDesc(null)}
                        className={actionBtnClass}
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Export JSON</span>
                      </button>

                      <button
                        type="button"
                        disabled={syncStatus === 'syncing'}
                        onClick={() => void startRemoteTuningSession(acc)}
                        className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition active:scale-95"
                      >
                        <Sliders className="h-3.5 w-3.5" />
                        <span>Tune Profile</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(errorMessage || statusMessage) && (
              <div
                className={`px-3 py-1.5 rounded-lg border text-xs ${
                  errorMessage
                    ? 'bg-rose-500/15 border-rose-500/35 text-rose-400'
                    : isLight
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-800'
                      : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                }`}
              >
                {errorMessage || statusMessage}
              </div>
            )}
          </div>
        ) : (
          <DevManageAccountsSection
            isLight={isLight}
            accounts={accounts}
            onUpsertAccount={upsertAccount}
            onDeleteAccount={deleteAccount}
            onStartRemoteTuning={startRemoteTuningSession}
            onExportAccountBackup={exportRemoteAccountProfileBackup}
            onHoverDesc={setHoveredDesc}
          />
        )}
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Manage cloud user accounts (immutable User ID, login username, password, #alias, Display Name), export JSON backups, and remotely tune profiles in real time."
        hoveredDescription={hoveredDesc}
        icon={<Info className="h-3.5 w-3.5 text-neutral-400 shrink-0" />}
      />
    </PanelContainer>
  );
};
