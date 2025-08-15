// types/onlyoffice.d.ts
interface OnlyOfficeDocsAPI {
  DocEditor: new (
    elementId: string,
    config: any,
    token?: string
  ) => any;
}

declare global {
  interface Window {
    DocsAPI?: OnlyOfficeDocsAPI;
  }
}

export {};
