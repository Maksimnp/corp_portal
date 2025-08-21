// models/documentModels.ts
export enum DocumentStatus {
  PENDING = "PENDING",
  VIEWED = "VIEWED",
  EDITED = "EDITED"
}

export enum DocumentPermission {
  VIEW = "VIEW",
  EDIT = "EDIT",
  REVIEW = "REVIEW"
}

export interface Document {
  id: string;
  title: string;
  owner: string;
  file_path: string;
  created_at: string;
  status: DocumentStatus;
}

export interface SharedDocument {
  document_id: string;
  recipient: string;
  permission: DocumentPermission;
  shared_at: string;
  status: DocumentStatus;
}