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

type NoteMeta = { path: string; fileId: string | null };

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
  files: TFile[];

  constructor(plugin: MyPlugin) {
    const { settings } = plugin;
    const endpoint = `https://${settings.subdomain}.hasura.${settings.region}.nhost.run/v1/graphql`;

    this.plugin = plugin;

    if (!settings.subdomain || !settings.region || !settings.adminSecret) {
      new Notice('Please set all settings.');
      return;
    }

    this.nhost = new NhostClient({
      subdomain: settings.subdomain,
      region: settings.region,
      adminSecret: settings.adminSecret,
    });

    this.client = new GraphQLClient(endpoint, {
      headers: {
        'x-hasura-admin-secret': settings.adminSecret,
      },
    });

    this.files = app.vault.getFiles().filter((file) => file.path.startsWith(settings.publicDir));
  }

  async publish() {
    const notes = this.files.filter((file) => file.extension === 'md');
    const files = this.files.filter((file) => file.extension !== 'md');

    await this.syncNotes(notes);
    await this.syncFiles(files);
    await this.deleteUnusedNotes({
      notes,
      files,
    });
  }

  private async syncNotes(notes: TFile[]) {
    const { settings, app } = this.plugin;

    const shouldUpdateNotes = notes.filter(
      (file) => settings.cache.noteByPath[file.path] !== file.stat.mtime
    );

    const dbNotes = await Promise.all(
      shouldUpdateNotes.map(async (file) => {
        const content = await app.vault.cachedRead(file);
        return new MDNote(file, content);
      })
    );

    this.insertNotes('Note', dbNotes);
  }

  private async syncFiles(files: TFile[]) {
    const { settings } = this.plugin;

    const intermediateShouldUpdateFiles = files.filter(
      (file) => settings.cache.noteByPath[file.path] !== file.stat.mtime
    );

    if (!intermediateShouldUpdateFiles.length) {
      console.log(`File: No notes to sync.`);
      return;
    }

    console.log(`File: Uploading ${intermediateShouldUpdateFiles.length} files.`);
    const fileIdOrNulls = await Promise.all(
      intermediateShouldUpdateFiles.map((file) => this.uploadFile(file))
    );
    console.log(`File: Uploaded ${fileIdOrNulls.filter(Boolean).length} files.`);

    const shouldUpdateNotes = intermediateShouldUpdateFiles.filter(
      (_, i) => fileIdOrNulls[i] !== null
    );

    const dbNotes = await Promise.all(
      shouldUpdateNotes.map(async (file, i) => {
        const fileId = fileIdOrNulls[i] as string;
        return new FileNote(file, fileId);
      })
    );

    this.insertNotes('File', dbNotes);
  }

  private async uploadFile(file: TFile) {
    const { app, settings } = this.plugin;
    const basePath = getBasePath(app.vault.adapter);

    const fd = new FormData();
    const path = join(basePath, file.path);
    const buffer = await readFile(path);
    const type = mime.getType(file.extension);
    if (!type) {
      new Notice(`Could not determine mime type for ${file.path}`);
      return null;
    }

    const blob = new Blob([buffer], { type });
    fd.append('file', blob);
    const res = await this.nhost.storage.upload({
      formData: fd,
      name: file.name,
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
      console.log(`${title}: No notes to sync.`);
      return;
    }

    console.log(`${title}: Syncing ${iNotes.length} notes.`);

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
    console.log(`${title}: Updated ${affected_rows} notes.`);

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

  private async deleteUnusedNotes({ notes, files }: { notes: TFile[]; files: TFile[] }) {
    const { settings } = this.plugin;

    const cachedNoteByPath = settings.cache.noteByPath;

    const noteMetaListQuery = gql`
      query NoteMetaList {
        notes {
          fileId
          path
        }
        files {
          id
        }
      }
    `;
    const { notes: noteMetaList, files: filesRes } = await this.client.request<{
      notes: NoteMeta[];
      files: { id: string }[];
    }>(noteMetaListQuery);

    console.log(`DB count: notes [${noteMetaList.length}], files [${filesRes.length}]`);

    const dbNotePaths = noteMetaList.map((note) => note.path);
    const dbNoteFileIdsSet = new Set(
      noteMetaList.map((note) => note.fileId).filter(Boolean) as string[]
    );
    const dbFileIds = filesRes.map((file) => file.id);

    const shouldDeleteNotePaths = dbNotePaths.filter((path) => !cachedNoteByPath[path]);
    const shouldDeleteNoteFileIds = dbFileIds.filter((fileId) => !dbNoteFileIdsSet.has(fileId));

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

    const storageDeleteRes = await Promise.all(
      shouldDeleteNoteFileIds.map((fileId) => this.nhost.storage.delete({ fileId }))
    );

    if (storageDeleteRes.length) {
      console.log(`Deleted ${storageDeleteRes.length} files.`);
    } else {
      console.log(`No files to delete.`);
    }
  }
}
