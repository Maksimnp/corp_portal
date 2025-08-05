export enum DocumentStatus {
  PENDING = "pending",
  VIEWED = "viewed",
  EDITED = "edited"
}

export enum DocumentPermission {
  VIEW = "view",
  EDIT = "edit"
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