import { execSync } from 'child_process';
import { join } from 'path';
import { Notice, FileSystemAdapter } from 'obsidian';
import MyPlugin from 'main';

export const publish = async (plugin: MyPlugin) => {
  const { settings } = plugin;
  const { vault } = plugin.app;

  const adapter = vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) return;
  const publicDir = join(adapter.getBasePath(), settings.publicDir);

  new Notice(`Publishing to ${publicDir}`);

  execSync(`cp -r "${publicDir}/" ${settings.publishDir}`);
};
