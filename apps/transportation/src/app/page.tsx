import { TransportationEntryApp } from "@/components/workspace-admin/TransportationEntryApp";

// Keep this shell entry explicit: the reusable interface is compiled from the proven Admin source.
// Shared entry changes require a shell checkpoint until the neutral product package is extracted.
export default function TransportationEntryPage() {
  return <TransportationEntryApp />;
}
