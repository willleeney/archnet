import { Plugin, MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';

export default class NewNotePlugin extends Plugin {
  async onload() {
    console.log('NewNotePlugin loaded');

    // Add a button to the toolbar
    this.addRibbonIcon('dice', 'Create New Note', () => {
      this.createNewNote();
    });
  }

  createNewNote() {
    const activeLeaf = this.getActiveLeaf();
    if (!activeLeaf || !(activeLeaf.view instanceof MarkdownView)) {
      return;
    }

    const newNote = this.app.workspace.createMarkdownNote();
    activeLeaf.view.sourceMode.cmEditor.replaceSelection(`[[${newNote.basename}]]`);
  }


  getActiveLeaf(): WorkspaceLeaf | null {
    return this.app.workspace.activeLeaf;
  }
}