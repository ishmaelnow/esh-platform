export type WorkspaceAccessRow = {
  workspace_key: string;
  tenant_id: string;
  role_keys: string[];
};

export function eligibleCommunityRows(rows: WorkspaceAccessRow[]) {
  return rows.filter(
    (row) =>
      row.workspace_key === "community" &&
      row.tenant_id.length > 0 &&
      Array.isArray(row.role_keys) &&
      row.role_keys.length > 0,
  );
}
