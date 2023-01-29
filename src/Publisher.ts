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

    this.syncNotes(notes);
    this.syncFiles(files);
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

    this.insertNotes(dbNotes);
  }

  private async syncFiles(files: TFile[]) {
    const { settings } = this.plugin;

    const shouldUpdateFiles = files.filter(
      (file) => settings.cache.noteByPath[file.path] !== file.stat.mtime
    );
    const fileIds = await Promise.all(shouldUpdateFiles.map((file) => this.uploadFile(file)));
    const dbNotes = fileIds
      .map((fileId, i) => {
        if (!fileId) return null;

        const file = shouldUpdateFiles[i];
        return new FileNote(file, fileId);
      })
      .filter(Boolean) as FileNote[];

    this.insertNotes(dbNotes);
  }

  private async uploadFile(file: TFile) {
    const { app } = this.plugin;
    const basePath = getBasePath(app.vault.adapter);

    const fd = new FormData();
    const path = join(basePath, file.path);
    const buffer = await readFile(path);
    const type = mime.getType(file.extension);
    if (!type) {
      new Notice(`Could not determine mime type for ${file.path}`);
      return;
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

    return res.fileMetadata.id;
  }

  private async insertNotes(iNotes: INote[]) {
    const { settings } = this.plugin;

    if (!iNotes.length) {
      console.log('No notes to sync.');
      return;
    }
    console.log(`Syncing ${iNotes.length} notes.`);

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
    console.log(`Updated ${affected_rows} notes.`);

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

  private async deleteUnusedNotes() {
    // TODO: delete unused notes
  }
}
