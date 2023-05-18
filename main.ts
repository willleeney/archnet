import { Plugin, MarkdownView, TFile, WorkspaceLeaf, Notice } from 'obsidian';
import { CanvasData, CanvasTextData } from "obsidian/canvas";


export default class NewNotePlugin extends Plugin {

	// gets the contents of the canvas
	getCanvasContents = async (file: TFile): Promise<CanvasData> => {
		const fileContents = await this.app.vault.read(file);
		if (!fileContents) {
			return this.handleEmptyCanvas();
		}
		const canvasData = JSON.parse(fileContents) as CanvasData;
		return canvasData;
	};

	// if theres no file contents then returns blank CanvasData
	handleEmptyCanvas = () => {
		const data: CanvasData = {
			nodes: [],
			edges: [],
		};
		return data;
	};

	createNode = (canvasData: CanvasData) => {

		const fileNode: CanvasTextData = {
			id: 'smtwavrwarb',
			x: 0,
			y: 0,
			width: 100,
			height: 100,
			type: "text",
			text: "hello world?"
		};

		canvasData.nodes = canvasData.nodes.concat(fileNode);
		return canvasData;
	};

	writeCanvasFile = async (file: TFile, canvasData: CanvasData) => {
		const fileContents = JSON.stringify(canvasData);
		await this.app.vault.modify(file, fileContents);
	};

	// checks that the active file is a canvas
	activeFileIsCanvas = (file: TFile) => {
		return file.extension === "canvas";
	};


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
		modifiers: ['Opt'],
		action: 'create-new-card',
	  });

  }

  async createNewCard() {
	new Notice('active .');

    const activeFile = this.app.workspace.getActiveFile();
	if (activeFile && this.activeFileIsCanvas(activeFile)) {

		let canvasContents = await this.getCanvasContents(activeFile);
		new Notice('created node');
    
		const newContents = this.createNode(canvasContents);
		new Notice('created node');


		await this.writeCanvasFile(activeFile, newContents);
		new Notice('wrote contents');
  		}
	else {
		new Notice("No active canvas file.", 5000);
	}
  };

}