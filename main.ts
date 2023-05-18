import { Plugin, MarkdownView, TFile,  Notice, TFolder, TAbstractFile } from 'obsidian';
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


function getAllTextFromParentNodes(canvasContents: CanvasData, nodeID: string): string {
	const nodeTexts = [''];
	let currentParentSearching = true; 

	do {
		// Iterate through `canvasContents.edges`
		for (const edge of canvasContents.edges) {
			if (edge.toNode === nodeID) {
				const fromNode = canvasContents.nodes.find(node => nodeID === edge.fromNode);
				if (fromNode) {
					nodeTexts.push(fromNode.text);
					break;
				} else {
					currentParentSearching = false;
				}
				
			}
		}
	} while (currentParentSearching === true);
  	
	const promptHistory = nodeTexts.reduceRight((accumulator, currentValue) => {
		return accumulator + ' ' + currentValue;
	  });

    return promptHistory;
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

	createNode = (xcord: number, ycord: number, promptHistory: string) => {

		const fileNode: CanvasTextData = {
			id: makeid(20),
			x: xcord,
			y: ycord,
			width: 400,
			height: 250,
			type: "text",
			text: promptHistory
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
			return Array.from(selectedNodes)[0]

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

		// get the current selected node
		const selectedNode = this.getActiveNode();

		// aggregates all the text from the parent nodes 
		const promptHistory = getAllTextFromParentNodes(canvasContents, selectedNode.id)
		
		
		const xOffset = [-500, 0, 500];
		for (let i = 0; i < xOffset.length; i++) {
			// create new node and add to canvas
			const targetNode = this.createNode(selectedNode.x - xOffset[i], selectedNode.y + 500, promptHistory);
			new Notice('created node');
			canvasContents.nodes = canvasContents.nodes.concat(targetNode);
			new Notice('added node');

			// Create a connection between the selected node and the new node
			const newConnection = {
				id: makeid(20),
				fromNode: selectedNode.id,
				toNode: targetNode.id,
				fromSide: 'bottom',
				toSide: 'top'
			};
			canvasContents.edges = canvasContents.edges.concat(newConnection);
		}

		// write the updates to the file
		await this.writeCanvasFile(activeFile, canvasContents);
  		}
	else {
		new Notice("No active canvas file.", 5000);
	}
  };

}