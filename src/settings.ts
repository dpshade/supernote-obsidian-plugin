import { createCustomDictionarySettingsUI, CUSTOM_DICTIONARY_DEFAULT_SETTINGS, CustomDictionarySettings } from "./customDictionary";
import SupernotePlugin from "./main";
import { App, ExtraButtonComponent, PluginSettingTab, Setting } from 'obsidian';

export const IP_VALIDATION_PATTERN = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/;


export interface SupernotePluginSettings extends CustomDictionarySettings {
    directConnectIP: string;
    invertColorsWhenDark: boolean;
    showTOC: boolean;
    showExportButtons: boolean;
    collapseRecognizedText: boolean,
    noteImageMaxDim: number;
    defaultDisplayMode: 'png' | 'pdf';
}

export const DEFAULT_SETTINGS: SupernotePluginSettings = {
    directConnectIP: '',
    invertColorsWhenDark: true,
    showTOC: true,
    showExportButtons: true,
    collapseRecognizedText: false,
    noteImageMaxDim: 800, // Sensible default for Nomad pages to be legible but not too big. Unit: px
    defaultDisplayMode: 'png', // Default to PNG view for better performance
    ...CUSTOM_DICTIONARY_DEFAULT_SETTINGS,
}

export class SupernoteSettingTab extends PluginSettingTab {
    plugin: SupernotePlugin;

    constructor(app: App, plugin: SupernotePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        let alert: ExtraButtonComponent;

        new Setting(containerEl)
            .setName('Supernote IP address')
            .setDesc('(Optional) When using the Supernote "Browse and Access" for document upload/download or "Screen Mirroring" screenshot attachment this is the IP of the Supernote device')
            .addText(text => text
                .setPlaceholder('IP only e.g. 192.168.1.2')
                .setValue(this.plugin.settings.directConnectIP)
                .onChange(async (value) => {
                    if (IP_VALIDATION_PATTERN.test(value) || value === '') {
                        this.plugin.settings.directConnectIP = value;
                        alert.extraSettingsEl.style.display = 'none';
                        await this.plugin.saveSettings();
                    } else {
                        alert.extraSettingsEl.style.display = 'inline';
                    }
                })
                .inputEl.setAttribute('pattern', IP_VALIDATION_PATTERN.source)
            )
            .addExtraButton(btn => {
                btn.setIcon('alert-triangle')
                    .setTooltip('Invalid IP format: must be xxx.xxx.xxx.xxx');
                btn.extraSettingsEl.style.display = 'none';
                alert = btn
                return btn;
            });

        new Setting(containerEl)
            .setName('Invert colors in "Dark mode"')
            .setDesc('When Obsidian is in "Dark mode" increase image visibility by inverting colors of images')
            .addToggle(text => text
                .setValue(this.plugin.settings.invertColorsWhenDark)
                .onChange(async (value) => {
                    this.plugin.settings.invertColorsWhenDark = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Show table of contents and page headings')
            .setDesc(
                'When viewing .note files, show a table of contents and page number headings',
            )
            .addToggle((text) =>
                text
                    .setValue(this.plugin.settings.showTOC)
                    .onChange(async (value) => {
                        this.plugin.settings.showTOC = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Show export buttons')
            .setDesc(
                'When viewing .note files, show buttons for exporting images and/or markdown files to vault. These features can still be accessed via the command pallete.',
            )
            .addToggle((text) =>
                text
                    .setValue(this.plugin.settings.showExportButtons)
                    .onChange(async (value) => {
                        this.plugin.settings.showExportButtons = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Collapse recognized text')
            .setDesc('When viewing .note files, hide recognized text in a collapsible element. This does not affect exported markdown.')
            .addToggle(text => text
                .setValue(this.plugin.settings.collapseRecognizedText)
                .onChange(async (value) => {
                    this.plugin.settings.collapseRecognizedText = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Max image side length in .note files')
            .setDesc('Maximum width and height (in pixels) of the note image when viewing .note files. Does not affect exported images and markdown.')
            .addSlider(text => text
                .setLimits(200, 1900, 100) // Resolution of an A5X/A6X2/Nomad page is 1404 x 1872 px (with no upscaling)
                .setDynamicTooltip()
                .setValue(this.plugin.settings.noteImageMaxDim)
                .onChange(async (value) => {
                    this.plugin.settings.noteImageMaxDim = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Default display mode')
            .setDesc('Choose the default view mode when opening .note files')
            .addDropdown(dropdown => dropdown
                .addOption('png', 'PNG Images (Recommended)')
                .addOption('pdf', 'PDF Document')
                .setValue(this.plugin.settings.defaultDisplayMode)
                .onChange(async (value: 'png' | 'pdf') => {
                    this.plugin.settings.defaultDisplayMode = value;
                    await this.plugin.saveSettings();
                })
            );

        // Add custom dictionary settings to the settings tab
        createCustomDictionarySettingsUI(containerEl, this.plugin);
    }
}
