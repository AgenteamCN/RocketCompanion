import React, { useState } from 'react';
import {
  Download,
  GitCommitHorizontal,
  IdCard,
  KeyRound,
  Pencil,
  Plus,
  Sliders,
  Tag,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { type CloudManagedAccountItem } from '../../config/cloudProfileSyncTypes';

export interface DevManageAccountsSectionProps {
  isLight: boolean;
  accounts: CloudManagedAccountItem[];
  onUpsertAccount: (
    username: string,
    password: string,
    alias: string,
    displayName?: string,
    userId?: string
  ) => Promise<boolean>;
  onDeleteAccount: (userId: string) => Promise<boolean>;
  onStartRemoteTuning: (account: CloudManagedAccountItem) => Promise<boolean>;
  onExportAccountBackup: (account: CloudManagedAccountItem) => Promise<boolean>;
  onHoverDesc?: (desc: string | null) => void;
}

export const DevManageAccountsSection: React.FC<DevManageAccountsSectionProps> = ({
  isLight,
  accounts,
  onUpsertAccount,
  onDeleteAccount,
  onStartRemoteTuning,
  onExportAccountBackup,
  onHoverDesc,
}) => {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [aliasInput, setAliasInput] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const resetForm = () => {
    setEditingUserId(null);
    setUsernameInput('');
    setPasswordInput('');
    setAliasInput('');
    setDisplayNameInput('');
  };

  const handleLoadForEdit = (acc: CloudManagedAccountItem) => {
    setEditingUserId(acc.userId);
    setUsernameInput(acc.username || acc.userId);
    setPasswordInput(acc.password || '');
    setAliasInput(acc.alias || acc.username || acc.userId);
    setDisplayNameInput(acc.displayName || acc.alias || acc.username || acc.userId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim() || !passwordInput.trim()) return;
    setIsSaving(true);
    try {
      const ok = await onUpsertAccount(
        usernameInput,
        passwordInput,
        aliasInput,
        displayNameInput,
        editingUserId || undefined
      );
      if (ok) {
        resetForm();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <form
        onSubmit={handleSubmit}
        className={`rounded-xl border p-3 flex flex-col gap-2 ${
          isLight
            ? 'bg-white/90 border-neutral-200/90'
            : 'bg-neutral-900/70 border-neutral-800/90'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            <span>
              {editingUserId
                ? `Edit Cloud Account (Immutable ID: ${editingUserId})`
                : 'Create or Update Cloud Account'}
            </span>
          </div>

          {editingUserId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-2 py-0.5 rounded border text-[10px] font-mono flex items-center gap-1 bg-neutral-800/80 hover:bg-neutral-700 border-neutral-600 text-neutral-300 cursor-pointer"
            >
              <X className="h-3 w-3" />
              <span>Cancel Edit</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-12 gap-2 items-center">
          <div className="col-span-3 relative flex items-center">
            <UserCheck
              className={`h-3.5 w-3.5 absolute left-2.5 pointer-events-none ${
                isLight ? 'text-neutral-400' : 'text-neutral-500'
              }`}
            />
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="Login Username"
              onMouseEnter={() =>
                onHoverDesc?.(
                  'Login Username: Mutable login handle used by the player to sign in.'
                )
              }
              onMouseLeave={() => onHoverDesc?.(null)}
              className={`w-full pl-8 pr-2 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                isLight
                  ? 'bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-sky-500'
                  : 'bg-neutral-950/80 border-neutral-800 text-neutral-100 focus:border-sky-500'
              }`}
            />
          </div>

          <div className="col-span-3 relative flex items-center">
            <KeyRound
              className={`h-3.5 w-3.5 absolute left-2.5 pointer-events-none ${
                isLight ? 'text-neutral-400' : 'text-neutral-500'
              }`}
            />
            <input
              type="text"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Password"
              onMouseEnter={() =>
                onHoverDesc?.('Password: Login passphrase for this account.')
              }
              onMouseLeave={() => onHoverDesc?.(null)}
              className={`w-full pl-8 pr-2 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                isLight
                  ? 'bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-sky-500'
                  : 'bg-neutral-950/80 border-neutral-800 text-neutral-100 focus:border-sky-500'
              }`}
            />
          </div>

          <div className="col-span-2 relative flex items-center">
            <Tag
              className={`h-3.5 w-3.5 absolute left-2.5 pointer-events-none ${
                isLight ? 'text-neutral-400' : 'text-neutral-500'
              }`}
            />
            <input
              type="text"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              placeholder="Dev Alias"
              onMouseEnter={() =>
                onHoverDesc?.(
                  'Developer Alias (#alias): Developer-assigned tag for identifying this player in Remote Profile Management.'
                )
              }
              onMouseLeave={() => onHoverDesc?.(null)}
              className={`w-full pl-8 pr-2 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                isLight
                  ? 'bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-sky-500'
                  : 'bg-neutral-950/80 border-neutral-800 text-neutral-100 focus:border-sky-500'
              }`}
            />
          </div>

          <div className="col-span-2 relative flex items-center">
            <IdCard
              className={`h-3.5 w-3.5 absolute left-2.5 pointer-events-none ${
                isLight ? 'text-neutral-400' : 'text-neutral-500'
              }`}
            />
            <input
              type="text"
              value={displayNameInput}
              onChange={(e) => setDisplayNameInput(e.target.value)}
              placeholder="Display Name"
              onMouseEnter={() =>
                onHoverDesc?.(
                  'Display Name: User Multiplayer Name Card (usually set by the user, but editable here if needed).'
                )
              }
              onMouseLeave={() => onHoverDesc?.(null)}
              className={`w-full pl-8 pr-2 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                isLight
                  ? 'bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-amber-500'
                  : 'bg-neutral-950/80 border-neutral-800 text-neutral-100 focus:border-amber-500'
              }`}
            />
          </div>

          <div className="col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-1.5 px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-neutral-950 font-bold text-xs cursor-pointer transition active:scale-95"
            >
              {isSaving ? 'Saving...' : editingUserId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </form>

      {/* Account Directory List */}
      <div className="flex flex-col gap-1.5">
        {accounts.map((acc) => (
          <div
            key={acc.userId}
            className={`rounded-xl border px-3 py-2 flex items-center justify-between gap-2 text-xs font-mono ${
              editingUserId === acc.userId
                ? isLight
                  ? 'bg-sky-50 border-sky-400 text-neutral-900'
                  : 'bg-sky-950/30 border-sky-500/60 text-neutral-100'
                : isLight
                  ? 'bg-white/90 border-neutral-200 text-neutral-900'
                  : 'bg-neutral-900/70 border-neutral-800 text-neutral-100'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="font-bold text-sky-400">#{acc.alias || acc.username}</span>
              <span
                className={`px-1.5 py-0.5 rounded border text-[11px] ${
                  isLight
                    ? 'bg-neutral-100 border-neutral-300 text-neutral-700'
                    : 'bg-neutral-950/80 border-neutral-800 text-neutral-300'
                }`}
                title="Mutable Login Username"
              >
                @{acc.username || acc.userId}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded border text-[10px] ${
                  isLight
                    ? 'bg-neutral-100 border-neutral-300 text-neutral-500'
                    : 'bg-neutral-950/60 border-neutral-800 text-neutral-400'
                }`}
                title="Immutable Unique User ID"
              >
                ID: {acc.userId}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded border text-[11px] inline-flex items-center gap-1 ${
                  isLight
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-800'
                    : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
                }`}
                title="Multiplayer Name Card (Display Name)"
              >
                <IdCard className="h-3 w-3" />
                {acc.displayName || acc.alias}
              </span>
              <span className="text-emerald-400 text-[11px]">
                pw: {acc.password || '(hash-only)'}
              </span>
              <span className="text-neutral-500 text-[10px] inline-flex items-center gap-1">
                <GitCommitHorizontal className="h-3 w-3" />
                u:{acc.userRevHash} / d:{acc.devRevHash}
              </span>
            </div>

            <div className="flex items-center justify-end gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleLoadForEdit(acc)}
                title="Edit username, password, #alias, or Display Name (preserves immutable User ID)"
                className={`p-1.5 rounded-lg border cursor-pointer transition ${
                  isLight
                    ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
                }`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void onExportAccountBackup(acc)}
                title={`Export JSON backup for #${acc.alias}`}
                className={`p-1.5 rounded-lg border cursor-pointer transition ${
                  isLight
                    ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
                }`}
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void onStartRemoteTuning(acc)}
                title={`Tune #${acc.alias || acc.username}`}
                className="px-2 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-sans font-bold text-[11px] flex items-center gap-1 cursor-pointer transition"
              >
                <Sliders className="h-3 w-3" />
                <span>Tune</span>
              </button>
              <button
                type="button"
                onClick={() => void onDeleteAccount(acc.userId)}
                title={`Delete ${acc.username} (${acc.userId})`}
                className="p-1.5 rounded-lg border bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/35 text-rose-400 cursor-pointer transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
