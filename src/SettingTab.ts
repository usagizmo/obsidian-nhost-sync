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

    containerEl.createEl('h2', { text: 'Nhost Sync - Settings' });

    new Setting(containerEl).setHeading().setName('Nhost').setDesc('Used in the `Publish` command');

    new Setting(containerEl).setName('Subdomain').addText((cb) =>
      cb.setValue(String(this.plugin.settings.subdomain)).onChange(async (value) => {
        this.plugin.settings.subdomain = value;
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl).setName('Region').addText((cb) =>
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

    new Setting(containerEl).setHeading().setName('Server [optional]');

    new Setting(containerEl)
      .setName('Deploy hook URL')
      .setDesc('Used in the `Deploy` command and is called with POST')
      .addText((cb) =>
        cb
          .setPlaceholder('https://api.vercel.com/v1/integrations/deploy/prj_*')
          .setValue(String(this.plugin.settings.deployHook))
          .onChange(async (value) => {
            this.plugin.settings.deployHook = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setHeading().setName('Caches');

    new Setting(containerEl)
      .setName('Clear all caches')
      .setDesc('The next `Publish` will also upload any notes that have already been uploaded')
      .addButton((cb) => {
        cb.setButtonText('Clear').onClick(async () => {
          this.plugin.settings.cache = { noteByPath: {} };
          new Notice('All caches cleared');
          await this.plugin.saveSettings();
        });
      });
  }
}
