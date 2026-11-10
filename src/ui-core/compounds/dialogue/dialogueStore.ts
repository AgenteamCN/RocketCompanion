import { useState, useEffect } from 'react';
import { DialogueStackItem, StackedDialogueOptions } from './dialogueTypes';

export type { DialogueStackItem, StackedDialogueOptions };

type StackListener = (items: DialogueStackItem[]) => void;
let stackListeners: StackListener[] = [];
let activeDialogueStack: DialogueStackItem[] = [];
let stackCounter = 1;

export const dialogue = {
  /**
   * Spawn a new dialogue on top of the stack.
   * Generates at the top layer with an incremented z-index and no background darkening.
   */
  show: (options: StackedDialogueOptions): string => {
    const id = options.id || `dialogue-${Date.now()}-${stackCounter++}`;
    const existingIdx = activeDialogueStack.findIndex((item) => item.id === id);
    if (existingIdx !== -1) {
      const updatedItem: DialogueStackItem = {
        ...activeDialogueStack[existingIdx],
        ...options,
        id,
      };
      activeDialogueStack = [
        ...activeDialogueStack.slice(0, existingIdx),
        updatedItem,
        ...activeDialogueStack.slice(existingIdx + 1),
      ];
      stackListeners.forEach((fn) => fn(activeDialogueStack));
      return id;
    }
    const baseZIndex = 800 + activeDialogueStack.length * 10;
    const newItem: DialogueStackItem = {
      ...options,
      id,
      zIndex: baseZIndex,
    };
    activeDialogueStack = [...activeDialogueStack, newItem];
    stackListeners.forEach((fn) => fn(activeDialogueStack));
    return id;
  },

  /** Dismiss a specific dialogue by ID */
  dismiss: (id: string) => {
    activeDialogueStack = activeDialogueStack.filter((item) => item.id !== id);
    stackListeners.forEach((fn) => fn(activeDialogueStack));
  },

  /** Clear all stacked dialogues */
  clear: () => {
    activeDialogueStack = [];
    stackListeners.forEach((fn) => fn(activeDialogueStack));
  },

  /** Get current stack count */
  getCount: () => activeDialogueStack.length,
};

/**
 * Hook to subscribe to dialogue stack updates
 */
export const useDialogueStack = () => {
  const [stack, setStack] = useState<DialogueStackItem[]>(activeDialogueStack);

  useEffect(() => {
    const listener: StackListener = (newStack) => setStack(newStack);
    stackListeners.push(listener);
    return () => {
      stackListeners = stackListeners.filter((fn) => fn !== listener);
    };
  }, []);

  return {
    stack,
    show: dialogue.show,
    dismiss: dialogue.dismiss,
    clear: dialogue.clear,
  };
};

