import { Plugin, MarkdownView, TFile, WorkspaceLeaf, Notice } from 'obsidian';
import { CanvasData, CanvasTextData } from "obsidian/canvas";

// function to create a random identifier
function makeid(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
}


export default class ArchnetPlugin extends Plugin {

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

	// creates a new node at 0,0 with text hello world
	createNode = () => {

		const fileNode: CanvasTextData = {
			id: makeid(20),
			x: 0,
			y: 0,
			width: 100,
			height: 100,
			type: "text",
			text: "hello world?"
		};

		return fileNode;
	};

	// overwrites the file contexts with the new data
	writeCanvasFile = async (file: TFile, canvasData: CanvasData) => {
		const fileContents = JSON.stringify(canvasData);
		await this.app.vault.modify(file, fileContents);
	};

	// checks that the active file is a canvas
	activeFileIsCanvas = (file: TFile) => {
		return file.extension === "canvas";
	};

	getActiveCanvas(): any {
		const maybeCanvasView = this.app.workspace.getLeaf().view
		return maybeCanvasView ? (maybeCanvasView as any)['canvas'] : null
	}

	getActiveNode(): any {
		const theactiveCanvas = this.getActiveCanvas();
		const selectedNodes = theactiveCanvas.selection
		if (selectedNodes.size === 1) {
			return selectedNodes[0].value

		} else {
			new Notice('need to select a single node')
			return null
		}

	}
	


  async onload() {
    console.log('ArchnetPlugin loaded');

    this.addCommand({
      id: 'create-new-card',
      name: 'Create New Card',
      callback: () => {
        this.createNewCard();
      },
	  hotkeys: [
        {
          modifiers: ["Mod"],
          key: "d",
        },
      ],
    });


  }

  async createNewCard() {
	new Notice('active .');

    const activeFile = this.app.workspace.getActiveFile();
	if (activeFile && this.activeFileIsCanvas(activeFile)) {

		// get the content of the canvas
		let canvasContents = await this.getCanvasContents(activeFile);
		new Notice('got content of canvas');

		// get the current selected node
		const selectedNode = this.getActiveNode()
		new Notice(selectedNode.id);

		
		// create new node and add to canvas
		const targetNode = this.createNode();
		new Notice('created node');
		canvasContents.nodes = canvasContents.nodes.concat(targetNode);
		new Notice('added node');

		// Create a connection between the selected node and the new node
		const newConnection = {
			source: selectedNode.id,
			target: targetNode.id,
			type: 'arrow',
		};
		canvasContents.edges = canvasContents.edges.concat(newConnection)

		// write the updates to the file
		await this.writeCanvasFile(activeFile, canvasContents);
		new Notice('wrote contents');
  		}
	else {
		new Notice("No active canvas file.", 5000);
	}
  };

}