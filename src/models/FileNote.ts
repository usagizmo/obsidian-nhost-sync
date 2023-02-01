import { TFile } from 'obsidian';
import { INote } from './INote';

export class FileNote implements INote {
  file: TFile;
  fileId: string;

  constructor(file: TFile, fileId: string) {
    this.file = file;
    this.fileId = fileId;
  }

  get mtime() {
    return this.file.stat.mtime;
  }

  get dbNote() {
    const {
      basename,
      extension,
      name,
      path,
      stat: { size, ctime, mtime },
    } = this.file;
    return {
      basename,
      extension,
      name,
      path,
      size,
      createdAt: new Date(ctime).toISOString(),
      updatedAt: new Date(mtime).toISOString(),
      fileId: this.fileId,
    };
  }
}
