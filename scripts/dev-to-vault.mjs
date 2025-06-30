#!/usr/bin/env node

import { spawn } from 'child_process';
import { copyFileSync, mkdirSync, existsSync, watch } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const vaultPath = process.argv[2];

if (!vaultPath) {
    console.error('❌ Error: Please provide the path to your Obsidian vault');
    console.error('Usage: npm run dev-to-vault <vault-path>');
    console.error('Example: npm run dev-to-vault "C:\\Users\\username\\Documents\\MyVault"');
    process.exit(1);
}

const resolvedVaultPath = resolve(vaultPath);
const pluginDir = join(resolvedVaultPath, '.obsidian', 'plugins', 'supernote-obsidian-plugin');

console.log('🔨 Starting development mode...');
console.log(`📁 Target vault: ${resolvedVaultPath}`);
console.log(`📦 Plugin directory: ${pluginDir}`);

try {
    if (!existsSync(resolvedVaultPath)) {
        throw new Error(`Vault path does not exist: ${resolvedVaultPath}`);
    }

    const obsidianDir = join(resolvedVaultPath, '.obsidian');
    if (!existsSync(obsidianDir)) {
        throw new Error(`Not a valid Obsidian vault: ${resolvedVaultPath}`);
    }

    if (!existsSync(pluginDir)) {
        mkdirSync(pluginDir, { recursive: true });
    }

    function copyToVault() {
        const files = ['main.js', 'manifest.json', 'styles.css'];

        for (const file of files) {
            const srcPath = join(__dirname, '..', file);
            const destPath = join(pluginDir, file);

            if (existsSync(srcPath)) {
                copyFileSync(srcPath, destPath);
                console.log(`✅ Copied: ${file}`);
            }
        }
        console.log('🎉 Files updated in vault!');
    }

    // Start esbuild in watch mode
    const buildProcess = spawn('node', ['esbuild.config.mjs'], {
        stdio: 'inherit',
        cwd: join(__dirname, '..')
    });

    // Watch for file changes
    const watcher = watch(join(__dirname, '..'), { recursive: false }, (eventType, filename) => {
        if (filename && ['main.js', 'manifest.json', 'styles.css'].includes(filename)) {
            setTimeout(() => copyToVault(), 100); // Small delay to ensure file is written
        }
    });

    copyToVault(); // Initial copy

    process.on('SIGINT', () => {
        console.log('\n🛑 Stopping...');
        buildProcess.kill();
        watcher.close();
        process.exit(0);
    });

} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
} 