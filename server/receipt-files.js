import { createHash } from "node:crypto";

// Hash decoded bytes so a different data-URL prefix or base64 wrapping cannot hide reuse.
export function attachmentHash(data) {
  if (!data || !data.includes(",")) return null;
  return createHash("sha256").update(Buffer.from(data.slice(data.indexOf(",") + 1), "base64")).digest("hex");
}

export const ledgerPaths = {
  general: "/general-ledger", unofficial: "/unofficial-ledger",
  association: "/student-association", departmental: "/department-ledger",
};
