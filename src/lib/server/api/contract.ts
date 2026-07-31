export type SchemaName =
  | "AuditQuery"
  | "ClaimCreateInput"
  | "ClaimListQuery"
  | "ClaimUpdateInput"
  | "DeviceApproveInput"
  | "DeviceStartInput"
  | "DeviceTokenInput"
  | "DocumentListQuery"
  | "ImageFromUrlInput"
  | "ImageContentQuery"
  | "ImageSuggestionInput"
  | "NoteListQuery"
  | "NoteInput"
  | "PaperlessLinkInput"
  | "PaperlessSearchQuery"
  | "ProductInput"
  | "ProductRecordInput"
  | "ProductRecordUpdateInput"
  | "ProductSearchQuery"
  | "ProductUpdateInput"
  | "StreamedDocumentUploadQuery"
  | "WarrantyInput"
  | "WarrantyUpdateInput";

type RequestDescription = {
  schema?: SchemaName;
  contentType?: string;
  binary?: boolean;
  required?: boolean;
};

export type ApiRouteContract = {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  operationId: string;
  summary: string;
  tag: string;
  permissions?: string[];
  query?: SchemaName;
  request?: RequestDescription;
  success?: number;
  auth?: "public" | "browser" | "api";
  idempotent?: boolean;
  rateLimit?: string;
  claimScoped?: boolean;
  description?: string;
  responseContentType?: string;
};
