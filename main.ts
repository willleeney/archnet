import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, View } from 'obsidian';
import { CanvasData, CanvasFileData } from "obsidian/canvas";


interface PluginSettings {
	noteWidth: string;
	noteHeight: string;
	noteMargin: string;
	x: string;
	y: string;
}

const DEFAULT_SETTINGS: PluginSettings = {
	noteWidth: "400",
	noteHeight: "500",
	noteMargin: "50",
	x: "0",
	y: "0",
};

class InsertModal extends Modal {
	plugin: ArchnetPlugin;
	confirmed: boolean = false;

	constructor(plugin: ArchnetPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h1", { text: "Canvas RandomNote Settings" });
		const settings = this.plugin.settings;


		new Setting(contentEl).setName("Note Width").addText((text) =>
			text.setValue(settings.noteWidth).onChange(async (value) => {
				settings.noteWidth = value;
				await this.plugin.saveSettings();
			})
		);

		new Setting(contentEl).setName("Note Height").addText((text) =>
			text.setValue(settings.noteHeight).onChange(async (value) => {
				settings.noteHeight = value;
				await this.plugin.saveSettings();
			})
		);

		new Setting(contentEl)
			.setName("Note Margin")
			.setDesc("Margin (horizontal and vertical) between notes")
			.addText((text) =>
				text.setValue(settings.noteMargin).onChange(async (value) => {
					settings.noteMargin = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(contentEl)
			.setName("X-anchor")
			.setDesc("X-coordinate of top-left corner of first note")
			.addText((text) =>
				text.setValue(settings.x).onChange(async (value) => {
					settings.x = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(contentEl)
			.setName("Y-anchor")
			.setDesc("Y-coordinate of top-left corner of first note")
			.addText((text) =>
				text.setValue(settings.y).onChange(async (value) => {
					settings.y = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Add Notes")
				.setCta()
				.onClick(() => {
					this.confirmed = true;
					this.close();
				})
		);
	}
}


function buildGrid(
	xAnchor: number,
	yAnchor: number
): { x: number; y: number }[] {
	const grid = [];
	let x = xAnchor;
	let y = yAnchor;
	grid.push({ x, y });
		
	return grid;
}


export default class ArchnetPlugin extends Plugin {
	settings: PluginSettings;

	// checks that the active file is a canvas
	activeFileIsCanvas = (file: TFile) => {
		return file.extension === "canvas";
	};

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

	// creates the node grid from the positions 

	// i think
	buildFileNodeGrid = (canvasData: CanvasData) => {
		const { noteWidth, noteHeight, x, y } =
			this.settings;
		const grid = buildGrid(
			parseInt(x),
			parseInt(y)
		);
		const fileNodes = grid.map((node, index) => {
			const fileNode: CanvasFileData = {
				id: 'smtwavrwarb',
				x: node.x,
				y: node.y,
				width: parseInt(noteWidth),
				height: parseInt(noteHeight),
				color: "",
				type: "file",
			};
			return fileNode;
		});
		canvasData.nodes = canvasData.nodes.concat(fileNodes);
		return canvasData;
	};

	writeCanvasFile = async (file: TFile, canvasData: CanvasData) => {
		const fileContents = JSON.stringify(canvasData);
		await this.app.vault.modify(file, fileContents);
	};


	awaitModal = async (): Promise<boolean> => {
		return new Promise((resolve, reject) => {
			try {
				const modal = new InsertModal(this);
				modal.onClose = () => {
					resolve(modal.confirmed);
				};
				modal.open();
			} catch (e) {
				reject();
			}
		});
	};

	addNotesHandler = async ( ) => {
		try {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile && this.activeFileIsCanvas(activeFile)) {
				let canvasContents = await this.getCanvasContents(activeFile);
				const confirmed = await this.awaitModal();
				if (!confirmed) {
					return;
				}
				const newContents = this.buildFileNodeGrid(
					canvasContents
				);
				await this.writeCanvasFile(activeFile, newContents);
			} else {
				new Notice("No active canvas file.", 5000);
			}
		} catch (e) {
			console.error(e);
			new Notice(
				"An unexpected error has occurred. It's possible the Obsidian app is out of sync with the canvas file contents. Wait a few moments before running commands.",
				5000
			);
		}
	};


	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		this.addCommand({
			id: "canvas-randomnote-add-notes",
			name: "Add Notes to Canvas",
			callback: async () => {
				this.addNotesHandler();
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
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
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					console.log('Secret: ' + value);
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
