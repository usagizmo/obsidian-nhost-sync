import { gql, GraphQLClient } from 'graphql-request';
import { NhostClient } from '@nhost/nhost-js';
import MyPlugin from 'main';
import { DataAdapter, FileSystemAdapter, Notice, TFile } from 'obsidian';
import { join } from 'path';
import { readFile } from 'fs/promises';
import FormData from 'form-data';
import mime from 'mime/lite';
import { MDNote } from './models/MDNote';
import { FileNote } from './models/FileNote';
import { INote } from './models/INote';

const getBasePath = (adapter: DataAdapter): string => {
  if (!(adapter instanceof FileSystemAdapter)) {
    throw new Error('Vault adapter is not a FileSystemAdapter');
  }
  return adapter.getBasePath();
};

export class Publisher {
  plugin: MyPlugin;
  nhost: NhostClient;
  client: GraphQLClient;
  notes: TFile[];

  constructor(plugin: MyPlugin) {
    const { settings } = plugin;

    this.plugin = plugin;

    if (!settings.subdomain || !settings.region || !settings.endpoint || !settings.adminSecret) {
      new Notice('Please set all settings.');
    }

    this.nhost = new NhostClient({
      subdomain: settings.subdomain,
      region: settings.region,
      adminSecret: settings.adminSecret,
    });

    this.client = new GraphQLClient(settings.endpoint, {
      headers: {
        'x-hasura-admin-secret': settings.adminSecret,
      },
    });

    this.notes = app.vault.getFiles().filter((file) => file.path.startsWith(settings.publicDir));
  }

  async publish() {
    const notes = this.notes.filter((file) => file.extension === 'md');
    const notesWithFile = this.notes.filter((file) => file.extension !== 'md');

    await this.uploadNotes(notes);
    await this.uploadNotesWithFile(notesWithFile);

    await this.deleteUnusedDBNotes();
    await this.deleteUnusedDBFiles();
  }

  private async uploadNotes(notes: TFile[]) {
    const { settings, app } = this.plugin;

    const shouldUploadNotes = notes.filter(
      (file) => settings.cache.noteByPath[file.path] !== file.stat.mtime
    );

    const mdNotes = await Promise.all(
      shouldUploadNotes.map(async (file) => {
        const content = await app.vault.cachedRead(file);
        return new MDNote(file, content);
      })
    );

    this.insertNotes('Note', mdNotes);
  }

  private async uploadNotesWithFile(notes: TFile[]) {
    const { settings } = this.plugin;

    const intermediateShouldUploadNotes = notes.filter(
      (file) => settings.cache.noteByPath[file.path] !== file.stat.mtime
    );

    if (!intermediateShouldUploadNotes.length) {
      console.log(`File: No notes to sync.`);
      return;
    }

    console.log(`File: Uploading ${intermediateShouldUploadNotes.length} files.`);
    const fileIdOrNulls = await Promise.all(
      intermediateShouldUploadNotes.map((note) => this.uploadToStorage(note))
    );
    console.log(`File: Uploaded ${fileIdOrNulls.filter(Boolean).length} files.`);

    const shouldUploadNotes = intermediateShouldUploadNotes.filter(
      (_, i) => fileIdOrNulls[i] !== null
    );

    const fileNotes = await Promise.all(
      shouldUploadNotes.map(async (file, i) => {
        const fileId = fileIdOrNulls[i] as string;
        return new FileNote(file, fileId);
      })
    );

    this.insertNotes('File', fileNotes);
  }

  private async uploadToStorage(note: TFile): Promise<string | null> {
    const { app } = this.plugin;
    const basePath = getBasePath(app.vault.adapter);

    const fd = new FormData();
    const path = join(basePath, note.path);
    const buffer = await readFile(path);
    const type = mime.getType(note.extension);
    if (!type) {
      new Notice(`Could not determine mime type for ${note.path}`);
      return null;
    }

    const blob = new Blob([buffer], { type });
    fd.append('file', blob);
    const res = await this.nhost.storage.upload({
      formData: fd,
      name: note.name,
    });

    if (!res.fileMetadata) {
      console.error('Could not upload file', res);
      return null;
    }

    const { id: fileId } = res.fileMetadata;
    return fileId;
  }

  private async insertNotes(title: string, iNotes: INote[]) {
    const { settings } = this.plugin;

    if (!iNotes.length) {
      console.log(`${title}: No notes to insert.`);
      return;
    }

    console.log(`${title}: Inserting ${iNotes.length} notes.`);

    const query = gql`
      mutation InsertNotes($objects: [notes_insert_input!]!) {
        insert_notes(
          objects: $objects
          on_conflict: { constraint: notes_pkey, update_columns: [content, size, updatedAt] }
        ) {
          affected_rows
        }
      }
    `;
    const {
      insert_notes: { affected_rows },
    } = await this.client.request(query, { objects: iNotes.map((iNote) => iNote.dbNote) });
    console.log(`${title}: Inserted ${affected_rows} notes.`);

    const nextNoteByPath = iNotes.reduce((acc, iNote) => {
      acc[iNote.dbNote.path] = iNote.mtime;
      return acc;
    }, {} as { [path: string]: number });

    settings.cache.noteByPath = {
      ...settings.cache.noteByPath,
      ...nextNoteByPath,
    };
    await this.plugin.saveSettings();
  }

  private async deleteUnusedDBNotes() {
    const { settings } = this.plugin;

    const notesQuery = gql`
      query Notes {
        notes {
          path
        }
      }
    `;
    const { notes: notesRes } = await this.client.request<{
      notes: { path: string }[];
    }>(notesQuery);
    const dbNotePaths = notesRes.map((note) => note.path);

    console.log(`Notes: local [${this.notes.length}], DB [${dbNotePaths.length}]`);

    const notePathSet = new Set(this.notes.map((note) => note.path));
    const shouldDeleteNotePaths = dbNotePaths.filter((path) => !notePathSet.has(path));

    const deleteNotesMutation = gql`
      mutation DeleteNotes($paths: [String!]) {
        delete_notes(where: { path: { _in: $paths } }) {
          affected_rows
        }
      }
    `;
    const {
      delete_notes: { affected_rows },
    } = await this.client.request(deleteNotesMutation, {
      paths: shouldDeleteNotePaths,
    });

    shouldDeleteNotePaths.forEach((path) => delete settings.cache.noteByPath[path]);
    await this.plugin.saveSettings();

    if (affected_rows) {
      console.log(`Deleted ${affected_rows} notes.`);
    } else {
      console.log(`No notes to delete.`);
    }
  }

  private async deleteUnusedDBFiles() {
    const filesQuery = gql`
      query Files {
        notes {
          fileId
        }
        files {
          id
        }
      }
    `;
    const { notes: notesRes, files: filesRes } = await this.client.request<{
      notes: { fileId: string | null }[];
      files: { id: string }[];
    }>(filesQuery);
    const dbNoteFileIdSet = new Set(notesRes.map((note) => note.fileId).filter(Boolean));
    const dbFileIds = filesRes.map((file) => file.id);

    console.log(`Files: notes [${dbNoteFileIdSet.size}], files [${dbFileIds.length}]`);

    const shouldDeleteFileIds = dbFileIds.filter((fileId) => !dbNoteFileIdSet.has(fileId));

    const storageDeleteRes = await Promise.all(
      shouldDeleteFileIds.map((fileId) => this.nhost.storage.delete({ fileId }))
    );

    if (storageDeleteRes.length) {
      console.log(`Deleted ${storageDeleteRes.length} files.`);
    } else {
      console.log(`No files to delete.`);
    }
  }
}
