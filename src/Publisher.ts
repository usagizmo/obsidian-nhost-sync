import { gql, GraphQLClient } from 'graphql-request';
import { NhostClient } from '@nhost/nhost-js';
import MyPlugin from 'main';
import { DataAdapter, FileSystemAdapter, Notice, TFile } from 'obsidian';
import { join } from 'path';
import { readFile } from 'fs/promises';
import FormData from 'form-data';
import mime from 'mime/lite';
import matter from 'front-matter';
import { MDNote } from './models/MDNote';
import { FileNote } from './models/FileNote';
import { INote } from './models/INote';

type FileByName = { [name: string]: TFile | undefined };

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
  }

  async publish() {
    const { fileByName, mdNotes } = await this.getVaultData();

    await this.uploadNotes(mdNotes);

    const attachmentNotes = await this.getRelatedAttachmentNotes(fileByName, mdNotes);
    await this.uploadAttachmentNotes(attachmentNotes);

    await this.deleteUnusedDBNotes(mdNotes.concat(mdNotes));
    await this.deleteUnusedDBFiles();

    new Notice('Published');
  }

  private async getVaultData(): Promise<{
    fileByName: FileByName;
    mdNotes: TFile[];
  }> {
    const { vault } = app;

    const mdNotes: TFile[] = [];
    const fileByName: FileByName = {};

    await Promise.all(
      vault.getFiles().map(async (note) => {
        // overwrite if same name
        fileByName[note.name] = note;
        if (note.name.endsWith('.md') === false) return;

        // get publishable notes
        const mattered = matter<{ publish?: boolean }>(await vault.cachedRead(note));
        if (!mattered.attributes.publish) return;
        mdNotes.push(note);
      })
    );

    return {
      fileByName,
      mdNotes,
    };
  }

  private async uploadNotes(notes: TFile[]) {
    const { settings } = this.plugin;

    const shouldUploadNotes = notes.filter(
      (note) => settings.cache.noteByPath[note.path] !== note.stat.mtime
    );

    const mdNotes = await Promise.all(
      shouldUploadNotes.map(async (note) => {
        const content = await app.vault.cachedRead(note);
        return new MDNote(note, content);
      })
    );

    this.insertNotes('Note', mdNotes);
  }

  private async getRelatedAttachmentNotes(
    fileByName: FileByName,
    notes: TFile[]
  ): Promise<TFile[]> {
    const { vault } = app;
    const relatedAttachmentNoteSet = new Set<TFile>();

    await Promise.all(
      notes.map(async (note) => {
        const content = await vault.cachedRead(note);

        for (const match of content.matchAll(/!\[\[([^\]]+?(?:png|jpg|mp4))\|?(\d+)?\]\]/g)) {
          const note = fileByName[match[1]] ?? '';
          note && relatedAttachmentNoteSet.add(note);
        }
      })
    );

    return [...relatedAttachmentNoteSet];
  }

  private async uploadAttachmentNotes(notes: TFile[]) {
    const { settings } = this.plugin;

    const intermediateShouldUploadNotes = notes.filter(
      (note) => settings.cache.noteByPath[note.path] !== note.stat.mtime
    );

    if (!intermediateShouldUploadNotes.length) {
      console.log(`File: No files to upload.`);
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

    const attachmentNotes = await Promise.all(
      shouldUploadNotes.map(async (note, i) => {
        const fileId = fileIdOrNulls[i] as string;
        return new FileNote(note, fileId);
      })
    );

    this.insertNotes('File', attachmentNotes);
  }

  private async uploadToStorage(note: TFile): Promise<string | null> {
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

  private async deleteUnusedDBNotes(notes: TFile[]) {
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

    console.log(`Notes: local [${notes.length}], DB [${dbNotePaths.length}]`);

    const notePathSet = new Set(notes.map((note) => note.path));
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
