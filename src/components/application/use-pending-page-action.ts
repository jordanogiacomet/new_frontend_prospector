"use client";

import { useEffect } from "react";

interface PageNavigateEvent extends Event {
  readonly destination: { readonly url: string; readonly sameDocument: boolean };
}

/** Leaving a page-owned request cannot promise continuity. */
export function usePendingPageAction(
  pending: boolean,
  formRef: React.RefObject<HTMLFormElement | null>,
  onBlockedNavigation: () => void,
): void {
  useEffect(() => {
    if (!pending) return;
    const pageUrl = window.location.href;
    const pageHistoryState: unknown = window.history.state;
    const navigation = (window as Window & { readonly navigation?: EventTarget }).navigation;
    function beforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = "";
    }
    function block(event: Event): void {
      event.preventDefault();
      event.stopImmediatePropagation();
      onBlockedNavigation();
    }
    function click(event: MouseEvent): void {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey ||
        event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const destination = new URL(link.href);
      const current = new URL(pageUrl);
      if (destination.origin === current.origin && destination.pathname === current.pathname &&
        destination.search === current.search) return;
      block(event);
    }
    function submit(event: SubmitEvent): void {
      if (event.target !== formRef.current) block(event);
    }
    function popstate(event: PopStateEvent): void {
      // Capture before the router restores another page; keep the request owner mounted.
      event.stopImmediatePropagation();
      window.history.pushState(pageHistoryState, "", pageUrl);
      onBlockedNavigation();
    }
    function navigate(event: Event): void {
      const navigationEvent = event as PageNavigateEvent;
      if (!event.cancelable || !navigationEvent.destination.sameDocument) return;
      const destination = new URL(navigationEvent.destination.url);
      const current = new URL(pageUrl);
      if (destination.pathname === current.pathname && destination.search === current.search) return;
      event.preventDefault();
      onBlockedNavigation();
    }
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", popstate, true);
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    navigation?.addEventListener("navigate", navigate);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", popstate, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
      navigation?.removeEventListener("navigate", navigate);
    };
  }, [pending, formRef, onBlockedNavigation]);
}
