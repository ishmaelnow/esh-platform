"use client";

import { useEffect, useRef, useState } from "react";

export function DriverDocumentView({ token, evidenceType, label, applicationId }: {
  token: string; evidenceType: string; label: string; applicationId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<{ url: string; fileName: string; mimeType: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, [token, applicationId, evidenceType]);
  useEffect(() => {
    if (!file) return;
    dialog.current?.showModal();
    window.history.pushState({ ...window.history.state, driverDocument: true }, "");
    const back = () => { dialog.current?.close(); setFile(null); };
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      requestAnimationFrame(() => button.current?.focus());
    };
  }, [file]);
  function close() {
    dialog.current?.close();
    setFile(null);
    if ((window.history.state as { driverDocument?: boolean } | null)?.driverDocument) window.history.back();
  }
  async function open() {
    setBusy(true); setMessage("");
    const current = ++generation.current;
    try {
      const response = await fetch("/api/documents", { method: "POST", cache: "no-store",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceType, applicationId }) });
      const result = await response.json() as { url?: string; fileName?: string; mimeType?: string; message?: string };
      if (!response.ok || !result.url || !result.fileName || !["image/jpeg", "image/png", "application/pdf"].includes(result.mimeType ?? ""))
        throw new Error(result.message ?? "Document could not be opened. Try again.");
      if (current === generation.current) setFile({ url: result.url, fileName: result.fileName, mimeType: result.mimeType! });
    } catch (error) { if (current === generation.current) setMessage(error instanceof Error ? error.message : "Document could not be opened."); }
    finally { if (current === generation.current) setBusy(false); }
  }
  return <div className="driver-document-view">
    <button ref={button} type="button" className="secondary" disabled={busy}
      aria-label={`View ${label}`} onClick={() => void open()}>{busy ? "Opening…" : "View document"}</button>
    {message ? <p role="alert">{message}</p> : null}
    {file ? <dialog ref={dialog} className="driver-document-dialog" aria-label={label}
      onCancel={(event) => { event.preventDefault(); close(); }}>
      <header><strong>{file.fileName}</strong><button type="button" onClick={close}>Close</button></header>
      <p>Private preview. If it expires, close and open it again.</p>
      {file.mimeType === "application/pdf" ? <iframe title={label} src={file.url} referrerPolicy="no-referrer" />
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={file.url} alt={label} referrerPolicy="no-referrer" onError={() => setMessage("Preview unavailable. Close and open it again.")} />}
      {message ? <p role="alert">{message}</p> : null}
    </dialog> : null}
  </div>;
}
