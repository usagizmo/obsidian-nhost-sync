import MyPlugin from 'main';
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';

export class SettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl('h2', { text: 'Settings for my awesome plugin.' });

    new Setting(containerEl).setName('Public Directory').addText((cb) =>
      cb
        .setPlaceholder('Public')
        // .setDesc("It's a secret")
        .setValue(this.plugin.settings.publicDir)
        .onChange(async (value) => {
          this.plugin.settings.publicDir = value.replace(/\/$/, '');
          await this.plugin.saveSettings();
        })
    );

    new Setting(containerEl).setName('Nhost (Subdomain)').addText((cb) =>
      cb.setValue(String(this.plugin.settings.subdomain)).onChange(async (value) => {
        this.plugin.settings.subdomain = value;
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl).setName('Nhost (Region)').addText((cb) =>
      cb.setValue(String(this.plugin.settings.region)).onChange(async (value) => {
        this.plugin.settings.region = value;
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl).setName('Graphql Endpoint').addText((cb) =>
      cb.setValue(String(this.plugin.settings.endpoint)).onChange(async (value) => {
        this.plugin.settings.endpoint = value;
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl).setName('X-HASURA-ADMIN-SECRET').addText((cb) =>
      cb
        .setPlaceholder('****')
        .setValue(String(this.plugin.settings.adminSecret))
        .onChange(async (value) => {
          this.plugin.settings.adminSecret = value;
          await this.plugin.saveSettings();
        })
    );

    new Setting(containerEl).setName('Clear all caches').addButton((cb) => {
      cb.setButtonText('Clear').onClick(async () => {
        this.plugin.settings.cache = { noteByPath: {} };
        new Notice('All caches cleared');
        await this.plugin.saveSettings();
      });
    });
  }
}
