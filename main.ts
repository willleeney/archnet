import { Plugin, MarkdownView, TFile, WorkspaceLeaf, Notice } from 'obsidian';

export default class NewNotePlugin extends Plugin {
  async onload() {
    console.log('NewNotePlugin loaded');

    this.addCommand({
      id: 'create-new-note',
      name: 'Create New Note',
      callback: () => {
        this.addNewCard();
      },
    });

	this.addHotkey({
		key: 'D',
		modifiers: ['Mod', 'Alt'],
		action: 'create-new-card',
	  });
	  
  }

  async createNewCard() {
    const activeLeaf = this.getActiveLeaf();
    if (!activeLeaf || !(activeLeaf.view instanceof MarkdownView)) {
      return;
    }

    const activeFile = activeLeaf.view.file;
    if (!this.activeFileIsCanvas(activeFile)) {
      new Notice('Please open a canvas file.');
      return;
    }

    const newContents = '';
    await this.writeCanvasFile(activeFile, newContents);
  }

  activeFileIsCanvas(file: TFile) {
    return file.extension === 'canvas';
  }

  getActiveLeaf(): WorkspaceLeaf | null {
    return this.app.workspace.activeLeaf;
  }

  async writeCanvasFile(file: TFile, contents: string) {
    const app = this.app;
    const oldMarkdownString = await app.vault.read(file);
    const newMarkdownString = `${oldMarkdownString}\n\n${contents}`;
    await app.vault.modify(file, newMarkdownString);
  }
}