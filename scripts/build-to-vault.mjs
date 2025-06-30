#!/usr/bin/env node

import { execSync } from 'child_process';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the vault path from command line arguments
const vaultPath = process.argv[2];

if (!vaultPath) {
    console.error('❌ Error: Please provide the path to your Obsidian vault');
    console.error('Usage: npm run build-to-vault <vault-path>');
    console.error('Example: npm run build-to-vault "C:\\Users\\username\\Documents\\MyVault"');
    process.exit(1);
}

// Resolve the vault path
const resolvedVaultPath = resolve(vaultPath);
const pluginDir = join(resolvedVaultPath, '.obsidian', 'plugins', 'supernote-obsidian-plugin');

console.log('🔨 Building Supernote plugin...');
console.log(`📁 Target vault: ${resolvedVaultPath}`);
console.log(`📦 Plugin directory: ${pluginDir}`);

try {
    // Check if vault path exists
    if (!existsSync(resolvedVaultPath)) {
        throw new Error(`Vault path does not exist: ${resolvedVaultPath}`);
    }

    // Check if .obsidian directory exists
    const obsidianDir = join(resolvedVaultPath, '.obsidian');
    if (!existsSync(obsidianDir)) {
        throw new Error(`Not a valid Obsidian vault (missing .obsidian directory): ${resolvedVaultPath}`);
    }

    // Create plugin directory if it doesn't exist
    if (!existsSync(pluginDir)) {
        console.log('📁 Creating plugin directory...');
        mkdirSync(pluginDir, { recursive: true });
    }

    // Files to copy
    const filesToCopy = [
        { src: 'main.js', dest: 'main.js' },
        { src: 'manifest.json', dest: 'manifest.json' },
        { src: 'styles.css', dest: 'styles.css' }
    ];

    // Copy files
    console.log('📋 Copying plugin files...');
    for (const file of filesToCopy) {
        const srcPath = join(__dirname, '..', file.src);
        const destPath = join(pluginDir, file.dest);

        if (!existsSync(srcPath)) {
            console.warn(`⚠️  Warning: Source file not found: ${file.src}`);
            continue;
        }

        copyFileSync(srcPath, destPath);
        console.log(`✅ Copied: ${file.src} → ${file.dest}`);
    }

    // Update manifest.json with correct plugin ID if needed
    const manifestPath = join(pluginDir, 'manifest.json');
    if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

        // Ensure the plugin ID is correct
        if (manifest.id !== 'supernote-obsidian-plugin') {
            manifest.id = 'supernote-obsidian-plugin';
            writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            console.log('✅ Updated manifest.json with correct plugin ID');
        }
    }

    console.log('\n🎉 Plugin built and installed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Open Obsidian');
    console.log('2. Go to Settings → Community Plugins');
    console.log('3. Disable and re-enable the Supernote plugin');
    console.log('4. Configure your Supernote IP address in the plugin settings');
    console.log('\n🔧 For development:');
    console.log('- Use "npm run dev" for watch mode');
    console.log('- Use "npm run build-to-vault <vault-path>" to rebuild and install');

} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
} 