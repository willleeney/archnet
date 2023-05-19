import { App, Plugin, MarkdownView, TFile,  Notice, TFolder, TAbstractFile, PluginSettingTab, Setting } from 'obsidian';
import { CanvasData, CanvasTextData } from "obsidian/canvas";
import { Configuration, OpenAIApi } from "openai";
import {NextApiRequest, NextApiResponse} from 'next';

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

function generateOffsetArray(n: number): number[] {
	if (n === 1) {
		return [0];
	  }
	
	  const result: number[] = [];
	
	  if (n % 2 === 1) {
		const middleIndex = Math.floor(n / 2);
		for (let i = 0; i < n; i++) {
		  const value = (i - middleIndex) * 500;
		  result.push(value);
		}
	  } else {
		const middleIndex = n / 2;
		for (let i = -middleIndex; i <= middleIndex; i++) {
			if (i !== 0) {
				result.push(i*500);
			}
		}
	}	
	
	  return result;
}


function getAllTextFromParentNodes(canvasContents: CanvasData, nodeID: string): string {
	const nodeTexts = [''];
	let currentParentSearching = true; 

	do {
		// Iterate through `canvasContents.edges`

		const connectEdge = canvasContents.edges.find(edge => edge.toNode === nodeID);
		if (connectEdge) {
			const fromNode = canvasContents.nodes.find(node => node.id === connectEdge.fromNode);
			if (fromNode) {
				nodeTexts.push(fromNode.text);
				nodeID = fromNode.id
			} else {
				currentParentSearching = false;
			}

		} else {
			currentParentSearching = false;
		}
		
	} while (currentParentSearching === true);
  	
	const promptHistory = nodeTexts.reduceRight((accumulator, currentValue) => {
		return accumulator + ' ' + currentValue;
	  });

    return promptHistory;
}


export default class ArchnetPlugin extends Plugin {
	settings: ArchnetSettings;

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
	await this.loadSettings();
	// This adds a settings tab so the user can configure various aspects of the plugin
	this.addSettingTab(new ArchnetSettingTab(this.app, this));
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

    const activeFile = this.app.workspace.getActiveFile();
	if (activeFile && this.activeFileIsCanvas(activeFile)) {

		// get the content of the canvas
		let canvasContents = await this.getCanvasContents(activeFile);

		// get the current selected node
		const selectedNode = this.getActiveNode();

		// aggregates all the text from the parent nodes 
		let promptHistory = getAllTextFromParentNodes(canvasContents, selectedNode.id)
		promptHistory += selectedNode.text



		const configuration = new Configuration({
			apiKey: this.settings.secretKey,
		});

		const openai = new OpenAIApi(configuration);
		new Notice("generating completions...")

		let res: NextApiResponse = await openai.createCompletion({
			model: "text-davinci-002",
			prompt: promptHistory,
			max_tokens: this.settings.maxTokens,
			top_p: 1.0,
			frequency_penalty: this.settings.frequencyPenalty,
			presence_penalty: this.settings.presencePenalty,
			n: this.settings.nCompletions,
		}).catch((err) => {console.error(err)});
		
		const choices = res.data.choices;
		const completions = choices.map(choice => choice.text);

		console.log(generateOffsetArray(1)); // Output: [0]
		console.log(generateOffsetArray(2)); // Output: [-250, 250]
		console.log(generateOffsetArray(3)); // Output: [-500, 0, 500]
		console.log(generateOffsetArray(4)); // Output: [-750, -250, 250, 750]

		const xOffset = generateOffsetArray(this.settings.nCompletions)
		for (let i = 0; i < xOffset.length; i++) {
			// create new node and add to canvas
			const targetNode = this.createNode(selectedNode.x - xOffset[i], selectedNode.y + 500, completions[i]);
			new Notice('created node');
			canvasContents.nodes = canvasContents.nodes.concat(targetNode);
			new Notice('added node');

			// Create a connection between the selected node and the new node
			const newConnection = {
				id: makeid(20),
				fromNode: selectedNode.id,
				toNode: targetNode.id,
				fromSide: 'bottom',
				toSide: 'top',
				color: "6"
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

  onunload() {
	
  }

  async loadSettings() {
	  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
	  await this.saveData(this.settings);
  }

}

interface ArchnetSettings {
	secretKey: string;
	maxTokens: number;
	temperature: number;
	frequencyPenalty: number;
	presencePenalty: number;
	nCompletions: number;
}

const DEFAULT_SETTINGS: ArchnetSettings = {
	secretKey: '',
	maxTokens: 64,
	temperature: 1.0,
	frequencyPenalty: 0.0,
	presencePenalty: 0.0,
	nCompletions: 3,
}


class ArchnetSettingTab extends PluginSettingTab {
	plugin: ArchnetPlugin;

	constructor(app: App, plugin: ArchnetPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for my awesome plugin.'});

		new Setting(containerEl)
			.setName('Secret Key')
			.setDesc('Your openAI secret key')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.secretKey)
				.onChange(async (value) => {
					console.log('Secret: ' + value);
					this.plugin.settings.secretKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
		.setName('Max Tokens')
		.setDesc('Specifies the maximum number of tokens in the generated completion')
		.addText(text => text
			.setPlaceholder('Enter the maximum number of tokens')
			.setValue(this.plugin.settings.maxTokens)
			.onChange(async (value) => {
				console.log('Max Tokens: ' + value);
				this.plugin.settings.maxTokens = value;
			await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
		.setName('Temperature')
		.setDesc('Controls the randomness of the output')
		.addText(text => text
			.setPlaceholder('Enter the temperature value')
			.setValue(this.plugin.settings.temperature)
			.onChange(async (value) => {
				console.log('Temperature: ' + value);
				this.plugin.settings.temperature = value;
			await this.plugin.saveSettings();
			}));
		
		new Setting(containerEl)
		.setName('Frequency Penalty')
		.setDesc('Controls the likelihood of generating repetitive phrases')
		.addText(text => text
			.setPlaceholder('Enter the frequency penalty value')
			.setValue(this.plugin.settings.frequencyPenalty)
			.onChange(async (value) => {
				console.log('Frequency Penalty: ' + value);
				this.plugin.settings.frequencyPenalty = value;
			await this.plugin.saveSettings();
			}));
		
		new Setting(containerEl)
		.setName('Presence Penalty')
		.setDesc('Controls the likelihood of introducing new topics or concepts')
		.addText(text => text
			.setPlaceholder('Enter the presence penalty value')
			.setValue(this.plugin.settings.presencePenalty)
			.onChange(async (value) => {
				console.log('Presence Penalty: ' + value);
				this.plugin.settings.presencePenalty = value;
			await this.plugin.saveSettings();
			}));
		
		new Setting(containerEl)
		.setName('N Completions')
		.setDesc('Number of different threads to generate')
		.addText(text => text
			.setPlaceholder('enter a number3')
			.setValue(this.plugin.settings.nCompletions)
			.onChange(async (value) => {
				console.log('nCompletions: ' + value);
				this.plugin.settings.nCompletions = value;
			await this.plugin.saveSettings();
			}));
	}
}