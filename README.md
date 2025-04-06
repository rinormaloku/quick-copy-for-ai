# Quick AI Copy: Context Builder

This VS Code extension helps you collect file contents into a single context for use with AI/LLM tools. It makes it easy to gather code from multiple files or directories and copy them to your clipboard, ready to paste into AI chat interfaces like Claude, ChatGPT, or other LLM tools.

## Features

### Copy for AI
Right-click on files or directories in the Explorer view and select "Copy for AI" to collect their contents:
- Works with single files
- Works with multiple selected files
- Works with directories (recursively collects all files)
- Works with a combination of files and directories
- Respects `.gitignore` rules to skip files that should be ignored

### Copy for AI: File Tree
Right-click on directories and select "Copy for AI: File Tree" to generate a directory structure:
- Creates a text representation of your file tree
- Works with multiple selected directories
- Respects `.gitignore` rules to skip files that should be ignored

## Installation

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Quick AI Copy: Context Builder"
4. Click Install

### From VSIX file
1. Download the VSIX file
2. Open VS Code
3. Go to Extensions (Ctrl+Shift+X)
4. Click the "..." menu in the top-right of the Extensions view
5. Select "Install from VSIX..."
6. Navigate to and select the downloaded VSIX file

### Manual Installation
1. Clone this repository
2. Run `npm install`
3. Run `npm run compile`
4. Press F5 to start debugging (this will open a new VS Code window with the extension loaded)

## Usage

### Collecting File Contents
1. In the Explorer view, right-click on a file or directory
2. Select "Copy for AI"
3. Wait for the process to complete (a notification will appear)
4. Paste the collected context into your AI tool

### Generating File Tree
1. In the Explorer view, right-click on a directory
2. Select "Copy File Tree for AI"
3. Wait for the process to complete (a notification will appear)
4. Paste the file tree into your AI tool

### Selecting Multiple Files or Directories
1. Hold Ctrl (or Cmd on macOS) and click on multiple files or directories
2. Right-click on one of the selected items
3. Select "Copy for AI" or "Copy File Tree for AI"

## Performance Considerations

The extension is designed to be fast, even for large directories:
- File contents are written to a temporary file first to minimize memory usage
- Progress indicators show the status of the collection process
- The operation can be cancelled if it's taking too long

## License

MIT