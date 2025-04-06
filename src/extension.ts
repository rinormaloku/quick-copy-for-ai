import * as fs from 'fs';
import { createReadStream } from 'fs';
import ignore from 'ignore';
import * as path from 'path';
import { pipeline } from 'stream';
import * as tmp from 'tmp-promise';
import { promisify } from 'util';
import * as vscode from 'vscode';

const pipelineAsync = promisify(pipeline);
const readFileAsync = promisify(fs.readFile);
const readDirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);
const existsAsync = promisify(fs.exists);

const skipDotDirs = [
	'.git',
	'.github',
	'.vscode',
	'.idea',
	'.vs',
	'.svn',
	'.hg',
	'node_modules',  // Not a dot dir but commonly excluded
	'.next',
	'.nuxt',
	'.cache',
	'dist',          // Common build output
	'build',         // Common build output
	'.DS_Store',     // macOS specific
	'__pycache__',   // Python specific
	'.Trash',        // macOS trash folder
	'.npm',
	'.gradle',
	'.m2'            // Maven repository
];


const skipFiles = [
	'package-lock.json',
	'yarn.lock',
	'pnpm-lock.yaml',
	'npm-shrinkwrap.json',
	'composer.lock',      // PHP
	'Gemfile.lock',       // Ruby
	'poetry.lock',        // Python
	'Cargo.lock',         // Rust
	'go.sum',             // Go
	'.terraform.lock.hcl',// Terraform
	'flake.lock',         // Nix
	'pubspec.lock',       // Dart/Flutter
	'mix.lock',           // Elixir
	'Podfile.lock',       // iOS/macOS
	'.gradle.lockfile',   // Gradle
	'yarn-error.log',
	'npm-debug.log',
	'.env',               // Environment variables (often contains secrets)
	'.env.local',
	'.env.development',
	'.env.test',
	'.env.production',
	'.venv',
	'.coverage',          // Code coverage reports
	'coverage.xml',
	'coverage.json',
	'lcov.info'
];


export function activate(context: vscode.ExtensionContext) {
	console.log('Copy for AI extension is now active');

	// Register the copyForAI command
	const copyForAICommand = vscode.commands.registerCommand('copy-for-ai.copyForAI', async (resource, selectedResources) => {
		try {
			// Handle multiple selections
			const uris = getSelectedResources(resource, selectedResources);
			if (!uris || uris.length === 0) {
				vscode.window.showErrorMessage('No resources selected.');
				return;
			}

			// Create a set of explicitly selected paths
			const explicitlySelectedPaths = new Set<string>();
			uris.forEach(uri => explicitlySelectedPaths.add(uri.fsPath));

			// Show progress indicator
			vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Copying files for AI...',
					cancellable: true
				},
				async (progress, token) => {
					// Create a temporary file to handle large content
					const tempFile = await tmp.file();

					try {
						// Process all resources
						const fileStream = fs.createWriteStream(tempFile.path, { encoding: 'utf8' });
						let totalFiles = 0;

						// Get workspace root to handle .gitignore
						const workspaceRoot = getWorkspaceRoot(uris[0]);
						const ignoreFilter = await getGitignoreFilter(workspaceRoot);

						// Process each selected resource
						for (const uri of uris) {
							const relativePath = workspaceRoot ? path.relative(workspaceRoot.fsPath, uri.fsPath) : path.basename(uri.fsPath);

							if (token.isCancellationRequested) {
								break;
							}

							if (await isDirectory(uri.fsPath)) {
								const processedFiles = await processDirectory(
									uri.fsPath,
									workspaceRoot ? workspaceRoot.fsPath : path.dirname(uri.fsPath),
									fileStream,
									ignoreFilter,
									progress,
									token,
									explicitlySelectedPaths  // Pass the set of explicitly selected paths
								);
								totalFiles += processedFiles;
							} else {
								// Check if the file should be ignored
								if (workspaceRoot && ignoreFilter && ignoreFilter.ignores(relativePath)) {
									continue;
								}

								await processFile(uri.fsPath, relativePath, fileStream);
								totalFiles++;

								// Update progress
								progress.report({
									message: `Processed ${totalFiles} files`,
									increment: 1
								});
							}
						}

						// Close the file stream
						fileStream.end();

						// Read the content from the temporary file
						const content = await readFileAsync(tempFile.path, 'utf8');

						// Copy to clipboard
						await vscode.env.clipboard.writeText(content);

						vscode.window.showInformationMessage(`Copied ${totalFiles} files to clipboard for AI context.`);
					} finally {
						// Clean up the temporary file
						tempFile.cleanup();
					}
				}
			);
		} catch (error) {
			vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	// Register the copyFileTreeForAI command
	const copyFileTreeCommand = vscode.commands.registerCommand('copy-for-ai.copyFileTreeForAI', async (resource, selectedResources) => {
		try {
			// Handle multiple selections
			const uris = getSelectedResources(resource, selectedResources);
			if (!uris || uris.length === 0) {
				vscode.window.showErrorMessage('No directories selected.');
				return;
			}

			// Show progress indicator
			vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Copying file tree for AI...',
					cancellable: true
				},
				async (progress, token) => {
					try {
						// Build file tree for all selected directories
						let fileTree = '';

						// Get workspace root to handle .gitignore
						const workspaceRoot = getWorkspaceRoot(uris[0]);
						const ignoreFilter = await getGitignoreFilter(workspaceRoot);

						for (const uri of uris) {
							if (token.isCancellationRequested) {
								break;
							}

							if (await isDirectory(uri.fsPath)) {
								const dirPath = uri.fsPath;
								const baseName = path.basename(dirPath);
								fileTree += `Directory tree for:\n${baseName}\n`;

								const tree = await buildFileTree(
									dirPath,
									workspaceRoot ? workspaceRoot.fsPath : path.dirname(uri.fsPath),
									ignoreFilter,
									0,
									progress,
									token
								);

								fileTree += tree + '\n\n';
							}
						}

						// Copy to clipboard
						await vscode.env.clipboard.writeText(fileTree);

						vscode.window.showInformationMessage('File tree copied to clipboard for AI context.');
					} catch (error) {
						vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
					}
				}
			);
		} catch (error) {
			vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	context.subscriptions.push(copyForAICommand, copyFileTreeCommand);
}

// Helper function to get the selected resources
function getSelectedResources(resource?: vscode.Uri, selectedResources?: vscode.Uri[]): vscode.Uri[] {
	if (selectedResources && selectedResources.length > 0) {
		return selectedResources;
	} else if (resource) {
		return [resource];
	}
	return [];
}

// Helper function to get the workspace root
function getWorkspaceRoot(uri: vscode.Uri): vscode.Uri | undefined {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		return undefined;
	}

	// Find the workspace folder that contains the uri
	for (const folder of workspaceFolders) {
		if (uri.fsPath.startsWith(folder.uri.fsPath)) {
			return folder.uri;
		}
	}

	// If not found, return the first workspace folder
	return workspaceFolders[0].uri;
}

// Helper function to get gitignore filter
async function getGitignoreFilter(workspaceRoot?: vscode.Uri): Promise<any | null> {
	if (!workspaceRoot) {
		return null;
	}

	const gitignorePath = path.join(workspaceRoot.fsPath, '.gitignore');

	if (await existsAsync(gitignorePath)) {
		const gitignoreContent = await readFileAsync(gitignorePath, 'utf8');
		return ignore().add(gitignoreContent);
	}

	return null;
}

// Helper function to check if a path is a directory
async function isDirectory(fsPath: string): Promise<boolean> {
	try {
		const stats = await statAsync(fsPath);
		return stats.isDirectory();
	} catch (error) {
		return false;
	}
}

// Process a directory recursively
async function processDirectory(
	dirPath: string,
	rootPath: string,
	outputStream: fs.WriteStream,
	ignoreFilter: any | null,
	progress: vscode.Progress<{ message?: string; increment?: number }>,
	token: vscode.CancellationToken,
	explicitlySelectedPaths: Set<string> = new Set()  // New parameter
): Promise<number> {
	let processedFiles = 0;


	try {
		const entries = await readDirAsync(dirPath, { withFileTypes: true });

		// Check if this directory was explicitly selected by the user

		for (const entry of entries) {
			if (token.isCancellationRequested) {
				break;
			}

			const fullPath = path.join(dirPath, entry.name);
			const relativePath = path.relative(rootPath, fullPath);
			const isExplicitlySelected = explicitlySelectedPaths.has(relativePath);

			// Skip common dot directories ONLY if this directory wasn't explicitly selected by the user
			if (!isExplicitlySelected &&
				entry.isDirectory() &&
				((entry.name.startsWith('.') && skipDotDirs.includes(entry.name)) ||
					skipDotDirs.includes(entry.name))) {
				continue;
			}

			// Check if the path should be ignored
			if (ignoreFilter && ignoreFilter.ignores(relativePath)) {
				continue;
			}

			if (entry.isDirectory()) {
				// Process subdirectory
				const subDirFiles = await processDirectory(
					fullPath,
					rootPath,
					outputStream,
					ignoreFilter,
					progress,
					token,
					explicitlySelectedPaths  // Pass the explicitly selected paths to subdirectories
				);
				processedFiles += subDirFiles;
			} else if (entry.isFile()) {
				// Process file
				await processFile(fullPath, relativePath, outputStream);
				processedFiles++;

				// Update progress
				progress.report({
					message: `Processed ${processedFiles} files`,
					increment: 1
				});
			}
		}
	} catch (error) {
		console.error(`Error processing directory ${dirPath}:`, error);
	}

	return processedFiles;
}

// Process a single file
async function processFile(filePath: string, relativePath: string, outputStream: fs.WriteStream): Promise<void> {
	try {
		// Skip very large files or binary files
		const stats = await statAsync(filePath);

		// Skip package lock files and other files not valuable to LLMs

		if (skipFiles.includes(path.basename(filePath))) {
			return;
		}

		// Skip files larger than 64KB
		const MAX_FILE_SIZE = 64 * 1024; // 64KB
		if (stats.size > MAX_FILE_SIZE) {
			outputStream.write(`================\nFile: ${relativePath} (SKIPPED - SIZE ${(stats.size / 1024).toFixed(2)}KB) ---\n================\n\n`);
			return;
		}

		// Skip binary files based on extension
		const binaryExtensions = ['.exe', '.dll', '.so', '.dylib', '.bin', '.jar', '.war', '.zip', '.tar', '.gz', '.rar', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.tif', '.tiff', '.pdf'];
		if (binaryExtensions.some(ext => filePath.toLowerCase().endsWith(ext))) {
			outputStream.write(`================\nFile: ${relativePath} (SKIPPED - BINARY FILE)\n================\n\n`);
			return;
		}

		// Write file header with description
		outputStream.write(`================\nFile: ${relativePath}\n================\n\n`);

		// Stream file content to avoid memory issues with large files
		await pipelineAsync(
			createReadStream(filePath, { encoding: 'utf8' }),
			outputStream,
			{ end: false }
		);

		// Add three new lines after file content
		outputStream.write('\n\n\n');
	} catch (error) {
		outputStream.write(`================\nFile: ${relativePath} (ERROR: ${error instanceof Error ? error.message : String(error)})\n================\n\n`);
	}
}

// Build a file tree
async function buildFileTree(
	dirPath: string,
	rootPath: string,
	ignoreFilter: any | null,
	level: number = 0,
	progress: vscode.Progress<{ message?: string; increment?: number }>,
	token: vscode.CancellationToken,
	prefixes: string[] = [],
	explicitlySelectedPaths: Set<string> = new Set()  // New parameter
): Promise<string> {
	let result = '';

	try {
		const entries = await readDirAsync(dirPath, { withFileTypes: true });
		let dirs: fs.Dirent[] = [];
		let files: fs.Dirent[] = [];

		// Check if this directory was explicitly selected by the user
		const isExplicitlySelected = explicitlySelectedPaths.has(dirPath);

		// Sort entries: directories first, then files
		for (const entry of entries) {
			// Skip common dot directories ONLY if this directory wasn't explicitly selected by the user
			if (!isExplicitlySelected &&
				entry.isDirectory() &&
				((entry.name.startsWith('.') && skipDotDirs.includes(entry.name)) ||
					skipDotDirs.includes(entry.name))) {
				continue;
			}

			if (entry.isDirectory()) {
				dirs.push(entry);
			} else {
				files.push(entry);
			}
		}

		// Sort alphabetically
		dirs.sort((a, b) => a.name.localeCompare(b.name));
		files.sort((a, b) => a.name.localeCompare(b.name));

		// Combine both for easier iteration
		const sortedEntries = [...dirs, ...files];

		// Process all entries
		for (let i = 0; i < sortedEntries.length; i++) {
			if (token.isCancellationRequested) {
				break;
			}

			const entry = sortedEntries[i];
			const isLast = i === sortedEntries.length - 1;
			const fullPath = path.join(dirPath, entry.name);
			const relativePath = path.relative(rootPath, fullPath);

			// Check if the entry should be ignored
			if (ignoreFilter && ignoreFilter.ignores(relativePath)) {
				continue;
			}

			// Create current line prefixes
			let currentPrefix = '';
			for (const prefix of prefixes) {
				currentPrefix += prefix;
			}

			// Add current item
			if (isLast) {
				result += `${currentPrefix}└── `;
			} else {
				result += `${currentPrefix}├── `;
			}

			// Add name with trailing slash for directories
			if (entry.isDirectory()) {
				result += `${entry.name}\n`;

				// Calculate the prefix for the next level
				const nextLevelPrefixes = [...prefixes];
				if (isLast) {
					nextLevelPrefixes.push('    ');
				} else {
					nextLevelPrefixes.push('│   ');
				}

				// Recursively process subdirectory
				const subtree = await buildFileTree(
					fullPath,
					rootPath,
					ignoreFilter,
					level + 1,
					progress,
					token,
					nextLevelPrefixes,
					explicitlySelectedPaths  // Pass the explicitly selected paths to subdirectories
				);

				result += subtree;
			} else {
				// Just add filename for files
				result += `${entry.name}\n`;

				// Update progress for files
				progress.report({ increment: 1 });
			}
		}
	} catch (error) {
		console.error(`Error building file tree for ${dirPath}:`, error);
		const currentPrefix = prefixes.join('');
		result += `${currentPrefix}ERROR: ${error instanceof Error ? error.message : String(error)}\n`;
	}

	return result;
}

// This method is called when your extension is deactivated
export function deactivate() { }