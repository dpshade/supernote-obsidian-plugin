# Supernote Obsidian Plugin - Enhanced

**Enhanced Supernote by Ratta Integration for Obsidian**

*Originally created by [Brandon Philips](https://github.com/philips), enhanced by [Dylan Shade](https://github.com/dpshade)*

This enhanced version adds powerful batch file management capabilities to the original Supernote Obsidian plugin, allowing you to efficiently manage multiple files at once.

## Features

### Single File Operations
- **Attach Supernote file from device**: Download and attach individual files from your Supernote device
- **Upload file to Supernote**: Upload the current file to your Supernote device
- **Export Supernote note as files**: Convert Supernote notes to markdown and PNG files
- **Export Supernote note as PDF**: Convert Supernote notes to PDF format
- **Insert screen mirror image**: Capture and insert the current Supernote screen as an image

### 🆕 Batch File Management
- **Batch File Pane**: Dedicated pane for browsing and managing multiple Supernote files
- **Multi-file Selection**: Select multiple files with checkboxes for batch operations
- **Concurrent Downloads**: Download multiple files simultaneously with progress tracking
- **Batch PDF Generation**: Create a single PDF containing multiple Supernote notes
- **One-Click Attachment**: Attach all selected files as a single PDF to the current note

## Installation

1. Download the latest release from the releases page
2. Extract the files to your Obsidian vault's `.obsidian/plugins/supernote-obsidian-plugin/` folder
3. Enable the plugin in Obsidian settings

## Configuration

### Direct Connect Setup
1. Enable Direct Connect on your Supernote device
2. Note the IP address displayed on your Supernote
3. In Obsidian, go to Settings → Community Plugins → Supernote
4. Enter the IP address in the "Direct Connect IP" field

### Plugin Settings
- **Direct Connect IP**: Your Supernote device's IP address
- **Custom Dictionary**: Enable custom text replacement for recognized text
- **Invert Colors When Dark**: Invert image colors in dark mode
- **Note Image Max Dimension**: Maximum display size for note images
- **Show Export Buttons**: Display export buttons in the Supernote view
- **Show Table of Contents**: Show page navigation in the Supernote view
- **Collapse Recognized Text**: Collapse text recognition results by default

## Usage

### Single File Operations

#### Download a File from Supernote
1. Use the command palette: `Ctrl/Cmd + Shift + P`
2. Search for "Attach Supernote file from device"
3. Browse and select the file you want to download
4. The file will be downloaded and attached to your current note

#### Upload a File to Supernote
1. Open the file you want to upload in Obsidian
2. Use the command palette: `Ctrl/Cmd + Shift + P`
3. Search for "Upload the current file to a Supernote device"
4. Navigate to the desired folder on your Supernote
5. Select "[UPLOAD HERE]" to upload the file

#### Export Supernote Notes
1. Open a `.note` file in Obsidian
2. Use the command palette to access export options:
   - "Export this Supernote note as a markdown and PNG files as attachments"
   - "Export this Supernote note as PDF"
   - "Export this Supernote note as a markdown file attachment"

### 🆕 Virtual Folder Integration

#### Accessing the Virtual Folder
1. The "Supernote Device" folder appears in your file explorer sidebar
2. Click to expand and browse your Supernote files
3. No separate pane needed - everything is integrated into the file explorer

#### Using the Virtual Folder
1. **Navigation**: Click on folders to navigate through your Supernote directory structure
2. **File Selection**: 
   - Click checkboxes to select multiple files
   - Use Ctrl/Cmd + click for individual selection
   - Use Shift + click for range selection
3. **Context Menus**: Right-click on files or folders for additional options
4. **Batch Operations**:
   - **Convert to PDF**: Convert selected files to PDF format
   - **Convert to PNG**: Convert selected files to PNG images
   - **Download Originals**: Download the original .note files

#### Batch Operations Workflow
1. Expand the "Supernote Device" folder in the file explorer
2. Navigate to the folder containing your Supernote files
3. Select files using checkboxes or multi-select
4. Right-click and choose your desired operation:
   - **Convert to PDF**: Creates PDF files in your vault
   - **Convert to PNG**: Creates PNG image files in your vault
   - **Download Originals**: Downloads the original .note files

### 🔧 Available Commands

Use the command palette (`Ctrl/Cmd + Shift + P`) to access these Supernote commands:

#### Connection Management
- **Connect to Supernote Device**: Manually initiate connection to your Supernote
- **Check Supernote Connection Status**: Display current connection state and any errors
- **Refresh Supernote Virtual Folder**: Reload the file list from your device

#### Virtual Folder Control
- **Expand Supernote Virtual Folder**: Automatically expand the virtual folder in file explorer
- **Clear Supernote File Selections**: Clear all selected files in the virtual folder
- **Show Selected Supernote Files Count**: Display how many files are currently selected

#### Settings & Configuration
- **Open Supernote Plugin Settings**: Quickly access plugin configuration

#### File Operations
- **Upload the current file to a Supernote device**: Upload active file to Supernote
- **Insert a Supernote screen mirroring image as attachment**: Capture and insert current screen
- **Export this Supernote note as a markdown and PNG files as attachments**: Convert .note to markdown + images
- **Export this Supernote note as PDF**: Convert .note to PDF
- **Export this Supernote note as a markdown file attachment**: Convert .note to markdown only

## File Format Support

- **`.note` files**: Full support with text recognition and image conversion
- **Other file types**: Basic download and attachment support

## Troubleshooting

### Connection Issues
- Ensure Direct Connect is enabled on your Supernote
- Verify the IP address is correct in plugin settings
- Check that both devices are on the same network
- Try refreshing the connection using the refresh button in the virtual folder

### File Processing Issues
- Large files may take longer to process
- Ensure sufficient storage space on both devices
- Check that the Supernote device is not in sleep mode

### Performance Tips
- Use the virtual folder for multiple files instead of individual downloads
- Close other applications to free up system resources
- Consider processing files in smaller batches for very large collections

## Development

### Building from Source
```bash
npm install
npm run build
```

### Building Directly to Obsidian Vault
For development and testing, you can build the plugin directly to your Obsidian vault:

```bash
# One-time build to vault
npm run build-to-vault "C:\Users\username\Documents\MyVault"

# Development mode with auto-rebuild on changes
npm run dev-to-vault "C:\Users\username\Documents\MyVault"
```

**Usage:**
- Replace the path with your actual Obsidian vault path
- Use quotes around the path if it contains spaces
- The plugin will be installed to `.obsidian/plugins/supernote-obsidian-plugin/`
- After installation, disable and re-enable the plugin in Obsidian settings

**Development Workflow:**
1. Run `npm run dev-to-vault <vault-path>` 
2. Make changes to the source code
3. Files are automatically built and copied to your vault
4. Reload the plugin in Obsidian to see changes

### Testing
```bash
npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Attribution

This enhanced version is based on the original [Supernote Obsidian Plugin](https://github.com/philips/supernote-obsidian-plugin) by [Brandon Philips](https://github.com/philips). 

### Original Contributors
- **Brandon Philips** - Original plugin author and maintainer
- **Community Contributors** - Various improvements and bug fixes

### Enhanced Version
- **Dylan Shade** - Batch file management, UI improvements, and development tooling

## License

MIT License - see LICENSE file for details

## Changelog

### Version 2.9.0 - Enhanced by Dylan Shade
- 🆕 Added virtual folder integration in file explorer
- 🆕 Multi-file selection with checkboxes and keyboard shortcuts
- 🆕 Context menu operations for batch processing
- 🆕 Concurrent batch downloads with progress tracking
- 🆕 Batch PDF and PNG conversion for multiple notes
- 🆕 Native Obsidian file tree navigation
- 🆕 Improved UI following Obsidian design patterns
- 🆕 Enhanced command palette with connection management and folder control
- 🆕 Development build tools for direct vault installation

### Previous Versions (Original Plugin)
- Single file operations
- Direct Connect support
- Text recognition and custom dictionaries
- Image conversion and PDF export
- Screen mirroring functionality

## Thank You

Thank you to [Tiemen Schuijbroek](https://gitlab.com/Tiemen/supernote) for developing the initial supernote Typescript library I forked.

## FAQ

**Q** Why isn't there a table of contents in the generated Markdown file? 

**A** Because the [Obsidian Outline](https://help.obsidian.md/Plugins/Outline) sidebar accomplishes this same feature.

## Other Helpful Plugins

These are not endorsements but might be useful to pair with this plugin.

- [Mousewheel Image Zoom](https://obsidian.md/plugins?id=mousewheel-image-zoom)
- [Image Toolkit](https://obsidian.md/plugins?id=obsidian-image-toolkit)

## Relevant Resources

- [Obsidian and Supernote by Organizing for Change](https://www.youtube.com/watch?v=2zKD79e-V_U)
- [E-Ink notes in Obsidian / Notion? by Brandon Boswell](https://www.youtube.com/watch?v=kW8I8B-eCRk)
- [Academic HANDWRITTEN notes in OBSIDIAN ft. Supernote by pixel leaves](https://www.youtube.com/watch?v=lzYCPkVnqIM)

## Funding

I personally don't accept funding or donations for this project. However, if you feel inclined, consider donating to the [Signal Foundation](https://signal.org/donate/).

## Developer Notes

- Make sure your NodeJS is at least v16 (`node --version`).
- Clone this repo.
- Setup the deps

```
git submodule init
git submodule update
cd supernote-typescript/
npm run build
npm link
cd ..
npm link supernote-typescript/
```

- `npm i` or `yarn` to install dependencies.
- `npm run dev` to start compilation in watch mode.

**Android Debugging**

- Ensure `npm run dev` is running above
- Create a vault called "SupernoteTest"
- Install the supernote plugin from the community store
- Run `npm run push-android` to push main.js to the device
- Run "Reload App without Saving" on Obsidian command palette 
