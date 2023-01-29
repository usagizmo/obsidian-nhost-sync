type DBNote = {
  basename: string;
  extension: string;
  name: string;
  path: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  content?: string;
  fileId?: string;
};

export interface INote {
  get mtime(): number;
  get dbNote(): DBNote;
}
