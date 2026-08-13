"use client";

import * as React from "react";
import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 4000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type State = { toasts: ToasterToast[] };

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

function dispatch(action: { type: string; toast?: ToasterToast; toastId?: string }) {
  switch (action.type) {
    case "ADD_TOAST":
      memoryState = {
        toasts: [action.toast!, ...memoryState.toasts].slice(0, TOAST_LIMIT),
      };
      break;
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        memoryState = { toasts: [] };
      } else {
        memoryState = {
          toasts: memoryState.toasts.filter((t) => t.id !== action.toastId),
        };
      }
      break;
  }
  listeners.forEach((listener) => listener(memoryState));
}

function toast(props: Omit<ToasterToast, "id">) {
  const id = genId();
  const dismiss = () => dispatch({ type: "REMOVE_TOAST", toastId: id });

  dispatch({
    type: "ADD_TOAST",
    toast: { ...props, id, open: true, onOpenChange: (open) => { if (!open) dismiss(); } },
  });

  const timeout = setTimeout(dismiss, TOAST_REMOVE_DELAY);
  toastTimeouts.set(id, timeout);
  return { id, dismiss };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) listeners.splice(index, 1);
    };
  }, [state]);

  return { ...state, toast, dismiss: (toastId?: string) => dispatch({ type: "REMOVE_TOAST", toastId }) };
}

export { useToast, toast };
