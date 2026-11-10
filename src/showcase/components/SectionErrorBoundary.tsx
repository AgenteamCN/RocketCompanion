import React from 'react';
import { ShieldAlert, RotateCcw } from 'lucide-react';
import { syncBridge as crossClientSync } from '../../ui-core/stores/syncBridge';

export interface SectionErrorBoundaryProps {
  children: React.ReactNode;
  /** Label shown in the isolated recovery card if this subtree throws */
  title?: string;
  /** Optional crossClientSync scope prefix to reset when the user clicks Recover */
  scopePrefix?: string;
  /** Optional key that automatically resets the boundary when changed (e.g., activeTab) */
  resetKey?: string | number;
  isLight?: boolean;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Fault-isolation boundary that prevents an uncaught render error in a single
 * control deck, widget, or sandbox from unmounting sibling sections or the entire app.
 */
export class SectionErrorBoundary extends React.Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  state: SectionErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: unknown): SectionErrorBoundaryState {
    const msg =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error ?? 'Unknown render error');
    return {
      hasError: true,
      errorMessage: msg,
    };
  }

  componentDidUpdate(prevProps: SectionErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  handleRecover = (): void => {
    const { scopePrefix } = this.props;
    if (scopePrefix) {
      crossClientSync.resetAll({ scopePrefix });
    }
    this.setState({ hasError: false, errorMessage: '' });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { title = 'Isolated Sub-Module', isLight = true } = this.props;

    return (
      <div
        role="alert"
        className={`p-4 rounded-2xl border flex flex-col gap-2.5 font-mono text-xs ${
          isLight
            ? 'bg-red-50/90 border-red-300 text-red-950'
            : 'bg-red-950/30 border-red-800/70 text-red-200'
        }`}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 font-bold text-red-600 dark:text-red-400">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>Module fault isolated ({title}) · Remaining components continue running normally</span>
          </div>
          <button
            type="button"
            onClick={this.handleRecover}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[11px] cursor-pointer transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset and Recover Module</span>
          </button>
        </div>
        {this.state.errorMessage && (
          <div className="p-2 rounded-lg bg-black/10 dark:bg-black/40 text-[11px] break-all opacity-85">
            {this.state.errorMessage}
          </div>
        )}
      </div>
    );
  }
}
