import MyPlugin from 'main';
import { App, PluginSettingTab, Setting } from 'obsidian';

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

    new Setting(containerEl).setName('Public Directory').addText((text) =>
      text
        .setPlaceholder('Public')
        // .setDesc("It's a secret")
        .setValue(this.plugin.settings.publicDir)
        .onChange(async (value) => {
          this.plugin.settings.publicDir = value.replace(/\/$/, '');
          await this.plugin.saveSettings();
        })
    );

    new Setting(containerEl).setName('Publish Directory').addText((text) =>
      text
        .setPlaceholder('/Users/username/Desktop')
        .setValue(String(this.plugin.settings.publishDir))
        .onChange(async (value) => {
          this.plugin.settings.publishDir = value.replace(/\/$/, '');
          await this.plugin.saveSettings();
        })
    );
  }
}
