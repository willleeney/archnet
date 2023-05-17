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
  }

  addNewCard() {
    const activeLeaf = this.getActiveLeaf();
    if (!activeLeaf || !(activeLeaf.view instanceof MarkdownView)) {
      return;
    }

    const activeFile = activeLeaf.view.file;
    if (!this.activeFileIsCanvas(activeFile)) {
      new Notice('Please open a canvas file.');
      return;
    }

    const newNote = this.app.workspace.createMarkdownNote();
    const canvasView = activeLeaf.view as MarkdownView;
    canvasView.editor.replaceSelection(`[[${newNote.basename}]]`);
  }

  activeFileIsCanvas(file: TFile) {
    return file.extension === 'canvas';
  }

  getActiveLeaf(): WorkspaceLeaf | null {
    return this.app.workspace.activeLeaf;
  }
}