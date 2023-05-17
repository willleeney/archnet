import { Plugin, MarkdownView, TFile, WorkspaceLeaf, Notice } from 'obsidian';

export default class NewNotePlugin extends Plugin {
  async onload() {
    console.log('NewNotePlugin loaded');

    this.addCommand({
      id: 'create-new-note',
      name: 'Create New Note',
      callback: () => {
        this.createNewCard();
      },
    });

	this.addHotkey({
		key: 'D',
		modifiers: ['Mod', 'Alt'],
		action: 'create-new-card',
	  });

  }

  async createNewCard() {
	new Notice('active .')


    const activeFile = this.app.workspace.getActiveFile();
	if (activeFile && this.activeFileIsCanvas(activeFile)) {
    
			const newContents = '';
			new Notice('write to canvas')
			await this.writeCanvasFile(activeFile, newContents);
			new Notice('wro wve anvas')
  		}
  }

  async activeFileIsCanvas(file: TFile) {
    return file.extension === 'canvas';
  }

  async writeCanvasFile(file: TFile, contents: string) {
    const app = this.app;
    const oldMarkdownString = await app.vault.read(file);
    const newMarkdownString = `${oldMarkdownString}\n\n${contents}`;
    await app.vault.modify(file, newMarkdownString);
  }
}