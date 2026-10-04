"use client";

import { useRef, useState, type InputHTMLAttributes } from "react";
import { reduceApplicationImage } from "../lib/application";
import { captureAndroidDocument, usesAndroidDocumentCamera } from "../lib/document-camera";

export function DriverFileInput({ label, onFile, ...props }: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  onFile?: (file: File) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  async function takePhoto() {
    if (!usesAndroidDocumentCamera()) {
      cameraInput.current?.click();
      return;
    }
    setProcessing(true); setMessage("");
    try {
      const photo = await captureAndroidDocument();
      if (photo) await preparePhoto(photo);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Camera could not take a photo. Choose a file instead.");
    } finally { setProcessing(false); }
  }
  async function preparePhoto(file: File) {
    setProcessing(true); setMessage("");
    try {
      const reduced = await reduceApplicationImage(file);
      if (!fileInput.current) return;
      const files = new DataTransfer();
      files.items.add(reduced);
      fileInput.current.files = files.files;
      onFile?.(reduced);
    } catch { setMessage("Photo could not be prepared. Try again or choose a JPEG/PNG file."); }
    finally { setProcessing(false); }
  }
  return <div className="driver-file-options">
    <input {...props} disabled={props.disabled || processing} ref={fileInput} type="file" onChange={(event) => {
      setMessage("");
      const file = event.target.files?.[0];
      if (file) onFile?.(file);
      props.onChange?.(event);
    }} />
    <button type="button" className="secondary" disabled={props.disabled || processing}
      aria-label={`Take photo for ${label}`} onClick={() => void takePhoto()}>Take photo</button>
    <input ref={cameraInput} type="file" accept="image/*" capture="environment"
      aria-label={`Camera for ${label}`} hidden disabled={props.disabled || processing} onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || !fileInput.current) return;
        void preparePhoto(file);
      }} />
    {processing ? <span role="status">Preparing photo…</span> : null}
    {message ? <p role="alert">{message}</p> : null}
  </div>;
}
