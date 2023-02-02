import { Plugin } from 'obsidian';
import { deploy } from 'src/deploy';
import { Publisher } from 'src/Publisher';
import { SettingTab } from 'src/SettingTab';

interface MyPluginSettings {
  publicDir: string;
  subdomain: string;
  region: string;
  endpoint: string;
  adminSecret: string;
  deployHook: string;
  cache: {
    noteByPath: { [path: string]: number | undefined };
  };
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  publicDir: 'Public',
  subdomain: '',
  region: '',
  endpoint: '',
  adminSecret: '',
  deployHook: '',
  cache: { noteByPath: {} },
};

export default class MyPlugin extends Plugin {
  settings: MyPluginSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: 'publish',
      name: 'Publish',
      callback: async () => {
        await new Publisher(this).publish();
      },
    });

    this.addCommand({
      id: 'deploy',
      name: 'Deploy',
      callback: async () => {
        const { deployHook } = this.settings;
        await deploy(deployHook);
      },
    });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new SettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
