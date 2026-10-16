"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { usePrivateCapabilities } from "../auth/private-capabilities";
import styles from "./import-company-notices.module.css";

interface ProcessedCompany {
  readonly source_row: number;
  readonly processedAt: string;
}

interface CompanyNotice extends ProcessedCompany {
  readonly submissionId: string;
}

interface ImportObservation {
  readonly seenRows: Set<number>;
  seeded: boolean;
  complete: boolean;
  includeExisting: boolean;
}

interface WatchedImport {
  readonly submissionId: string;
  readonly subscriptions: number;
}

type WatchImport = (submissionId: string, includeExisting?: boolean) => () => void;
const ImportCompanyNoticesContext = createContext<WatchImport>(() => () => undefined);
const pageSize = 100;
const refreshMilliseconds = 5_000;

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function visibleSnapshot(): boolean {
  return document.visibilityState === "visible";
}

function serverVisibleSnapshot(): boolean {
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function processedCompaniesPage(value: unknown, submissionId: string, page: number): {
  readonly companies: readonly ProcessedCompany[];
  readonly total: number;
  readonly complete: boolean;
} | null {
  if (!isRecord(value) || !isRecord(value.data) || value.data.submissionId !== submissionId || !isRecord(value.meta)) return null;
  const result = value.meta.processedCompanies;
  if (!isRecord(result) || result.available !== true || result.factSource !== "producer_current_company_results_v1" || result.page !== page || result.pageSize !== pageSize ||
      !Number.isSafeInteger(result.total) || Number(result.total) < 0 || Number(result.total) > 1_000 ||
      !Array.isArray(result.data) || result.data.length > pageSize) return null;
  const expectedRows = Math.min(pageSize, Math.max(0, Number(result.total) - (page - 1) * pageSize));
  if (result.data.length !== expectedRows) return null;

  const companies: ProcessedCompany[] = [];
  for (const company of result.data) {
    if (!isRecord(company) || !Number.isSafeInteger(company.source_row) || Number(company.source_row) <= 0 ||
        typeof company.processedAt !== "string" || !Number.isFinite(Date.parse(company.processedAt))) return null;
    companies.push({ source_row: Number(company.source_row), processedAt: company.processedAt });
  }
  return {
    companies, total: Number(result.total),
    complete: typeof value.data.workflowReportedClosedAt === "string" &&
      Number.isFinite(Date.parse(value.data.workflowReportedClosedAt)) &&
      Number.isSafeInteger(value.data.workflowReportedRowCount) &&
      Number(value.data.workflowReportedRowCount) > 0 &&
      result.total === value.data.workflowReportedRowCount,
  };
}

export function ImportCompanyNoticesProvider({ children }: { readonly children: ReactNode }) {
  const { hasPermission } = usePrivateCapabilities();
  const canReadImports = hasPermission("imports:read");
  const pathname = usePathname();
  const inImportArea = pathname === "/imports" || pathname?.startsWith("/imports/") === true;
  const [imports, setImports] = useState<readonly WatchedImport[]>([]);
  const [notices, setNotices] = useState<readonly CompanyNotice[]>([]);
  const [accessDenied, setAccessDenied] = useState(false);
  const blockedImports = useRef(new Set<string>());
  const observations = useRef(new Map<string, ImportObservation>());

  const watchImport = useCallback<WatchImport>((submissionId, includeExisting = true) => {
    if (!canReadImports || accessDenied || blockedImports.current.has(submissionId) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)) return () => undefined;
    let observation = observations.current.get(submissionId);
    if (observation === undefined) {
      observation = { seenRows: new Set(), seeded: false, complete: false, includeExisting };
      observations.current.set(submissionId, observation);
    }
    observation.includeExisting ||= includeExisting;
    setImports((previous) => previous.some((item) => item.submissionId === submissionId)
      ? previous.map((item) => item.submissionId === submissionId ? { ...item, subscriptions: item.subscriptions + 1 } : item)
      : [...previous, { submissionId, subscriptions: 1 }]);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setImports((previous) => previous.flatMap((item) => item.submissionId !== submissionId
        ? [item] : item.subscriptions > 1 ? [{ ...item, subscriptions: item.subscriptions - 1 }] : []));
    };
  }, [canReadImports, accessDenied]);

  const observationComplete = useCallback((submissionId: string) =>
    observations.current.get(submissionId)?.complete === true, []);

  const observeCompanies = useCallback((submissionId: string, companies: readonly ProcessedCompany[], complete: boolean, total: number): boolean => {
    const snapshot = observations.current.get(submissionId);
    if (snapshot === undefined) return false;
    const fresh: CompanyNotice[] = [];
    for (const company of companies) {
      if (snapshot.seenRows.has(company.source_row)) continue;
      snapshot.seenRows.add(company.source_row);
      if (snapshot.seeded || snapshot.includeExisting) fresh.push({ ...company, submissionId });
    }
    snapshot.seeded = true;
    if (fresh.length > 0) setNotices((previous) => [...previous, ...fresh]);
    snapshot.complete = complete && new Set(companies.map((company) => company.source_row)).size === total;
    return snapshot.complete;
  }, []);

  const stopWatching = useCallback((submissionId: string, denied: boolean) => {
    if (denied) {
      setAccessDenied(true);
      setImports([]);
      setNotices([]);
      return;
    }
    blockedImports.current.add(submissionId);
    setImports((previous) => previous.filter((item) => item.submissionId !== submissionId));
    setNotices((previous) => previous.filter((item) => item.submissionId !== submissionId));
  }, []);

  const dismiss = useCallback(() => setNotices((previous) => previous.slice(1)), []);
  const notice = canReadImports && !accessDenied ? notices[0] : undefined;

  return (
    <ImportCompanyNoticesContext.Provider value={watchImport}>
      {children}
      {imports.map((item) => (
        <ImportCompanyWatcher key={item.submissionId} {...item} active={canReadImports && !accessDenied && inImportArea} isComplete={observationComplete} onObserve={observeCompanies} onStop={stopWatching} />
      ))}
      {notice ? (
        <CompanyProcessedNotice key={`${notice.submissionId}:${notice.source_row}`} notice={notice} remaining={notices.length - 1} onDismiss={dismiss} />
      ) : null}
    </ImportCompanyNoticesContext.Provider>
  );
}

export function useImportCompanyNotices(): WatchImport {
  return useContext(ImportCompanyNoticesContext);
}

function ImportCompanyWatcher({ submissionId, active, isComplete, onObserve, onStop }: WatchedImport & {
  readonly active: boolean;
  readonly isComplete: (submissionId: string) => boolean;
  readonly onObserve: (submissionId: string, companies: readonly ProcessedCompany[], complete: boolean, total: number) => boolean;
  readonly onStop: (submissionId: string, denied: boolean) => void;
}) {
  useEffect(() => {
    if (!active || isComplete(submissionId)) return;
    const controller = new AbortController();
    let pending = false;
    let stopped = false;

    async function refresh(): Promise<void> {
      if (pending || stopped || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const companies: ProcessedCompany[] = [];
        let page = 1;
        let total = 0;
        let complete = false;
        do {
          const response = await fetch(`/api/imports/${submissionId}?processedCompaniesPage=${page}&pageSize=${pageSize}`, {
            method: "GET", headers: { Accept: "application/json" }, cache: "no-store", credentials: "same-origin", signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          if (response.status === 401 || response.status === 403 || response.status === 404) {
            stopped = true;
            window.clearInterval(interval);
            onStop(submissionId, response.status !== 404);
            return;
          }
          if (response.status !== 200) return;
          const result = processedCompaniesPage(await response.json(), submissionId, page);
          if (controller.signal.aborted || result === null) return;
          if (page > 1 && result.total !== total) return;
          companies.push(...result.companies);
          total = result.total;
          complete = result.complete;
          page += 1;
        } while ((page - 1) * pageSize < total);

        if (new Set(companies.map((company) => company.source_row)).size !== total) return;
        if (onObserve(submissionId, companies, complete, total)) {
          stopped = true;
          window.clearInterval(interval);
        }
      } catch {
        // A failed observation confirms no processing result; the next GET can recover.
      } finally {
        pending = false;
      }
    }

    const interval = window.setInterval(() => void refresh(), refreshMilliseconds);
    void refresh();
    return () => {
      stopped = true;
      window.clearInterval(interval);
      controller.abort();
    };
  }, [submissionId, active, isComplete, onObserve, onStop]);

  return null;
}

function CompanyProcessedNotice({ notice, remaining, onDismiss }: {
  readonly notice: CompanyNotice;
  readonly remaining: number;
  readonly onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const visible = useSyncExternalStore(subscribeVisibility, visibleSnapshot, serverVisibleSnapshot);
  useEffect(() => {
    if (hovered || focused || !visible) return;
    const timeout = window.setTimeout(onDismiss, 6_000);
    return () => window.clearTimeout(timeout);
  }, [hovered, focused, visible, onDismiss]);

  return (
    <aside aria-label="Confirmação de empresa processada" className={styles.notice}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}>
      <div className={styles.content}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={styles.check}>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path d="m8 12 2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <div role="status" aria-atomic="true">
            <p className={styles.title}>Empresa processada</p>
            <p className={styles.message}>A empresa da linha {notice.source_row} foi processada nesta importação.</p>
          </div>
          {remaining > 0 ? <p className={styles.remaining}>Mais {remaining} {remaining === 1 ? "confirmação" : "confirmações"} na sequência</p> : null}
        </div>
        <button type="button" aria-label="Fechar confirmação" className={styles.close} onClick={onDismiss}>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      </div>
    </aside>
  );
}
