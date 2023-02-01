import { TFile } from 'obsidian';
import { INote } from './INote';

export class MDNote implements INote {
  file: TFile;
  content: string;

  constructor(file: TFile, content: string) {
    this.file = file;
    this.content = content;
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
      content: this.content,
    };
  }
}
