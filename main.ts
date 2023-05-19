import { App, Plugin, MarkdownView, TFile,  Notice, TFolder, TAbstractFile, PluginSettingTab, Setting } from 'obsidian';
import { CanvasData, CanvasTextData } from "obsidian/canvas";
import { Configuration, OpenAIApi } from "openai";
import {NextApiRequest, NextApiResponse} from 'next';
import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as os from "os";
import axios from "axios";

type GPTArguments = {
	seed?: number; // RNG seed (default: -1)
    threads?: number; // number of threads to use during computation (default: 4)
    n_predict?: number; // number of tokens to predict (default: 128)
    top_k?: number; // top-k sampling (default: 40)
    top_p?: number; // top-p sampling (default: 0.9)
    repeat_last_n?: number; // last n tokens to consider for penalize (default: 64)
    repeat_penalty?: number; // penalize repeat sequence of tokens (default: 1.3)
    ctx_size?: number; // size of the prompt context (default: 2048)
    temp?: number; // temperature (default: 0.1)
    batch_size?: number; // batch size for prompt processing (default: 8)
    model?: string; // model path (default: gpt4all-lora-quantized.bin)
}

 const ArchnetArguments: GPTArguments = {
	seed: 42,
	repeat_penalty: 0.0,
	temp: 1.2,
}


export class GPT4All {
  private bot: ReturnType<typeof spawn> | null = null;
  private model: string;
  private decoderConfig: Partial<GPTArguments>;
  private executablePath: string;
  private modelPath: string;

  constructor(
    model: string = "gpt4all-lora-quantized",
    forceDownload: boolean = false,
    decoderConfig: Partial<GPTArguments> = ArchnetArguments,
  ) {
    this.model = model;
    this.decoderConfig = decoderConfig;
    /* 
    allowed models: 
    M1 Mac/OSX: cd chat;./gpt4all-lora-quantized-OSX-m1
Linux: cd chat;./gpt4all-lora-quantized-linux-x86
Windows (PowerShell): cd chat;./gpt4all-lora-quantized-win64.exe
Intel Mac/OSX: cd chat;./gpt4all-lora-quantized-OSX-intel
    */
    if (
      "gpt4all-lora-quantized" !== model &&
      "gpt4all-lora-unfiltered-quantized" !== model
    ) {
      throw new Error(`Model ${model} is not supported. Current models supported are: 
                gpt4all-lora-quantized
                gpt4all-lora-unfiltered-quantized`);
    }

    this.executablePath = `${os.homedir()}/.nomic/gpt4all`;
    this.modelPath = `${os.homedir()}/.nomic/${model}.bin`;
  }

  async init(forceDownload: boolean = false): Promise<void> {
    const downloadPromises: Promise<void>[] = [];

    if (forceDownload || !fs.existsSync(this.executablePath)) {
      downloadPromises.push(this.downloadExecutable());
    }

    if (forceDownload || !fs.existsSync(this.modelPath)) {
      downloadPromises.push(this.downloadModel());
    }

    await Promise.all(downloadPromises);
  }

  public async open(): Promise<void> {
    if (this.bot !== null) {
      this.close();
    }

    let spawnArgs = [this.executablePath, "--model", this.modelPath];

    for (let [key, value] of Object.entries(this.decoderConfig)) {
      spawnArgs.push(`--${key}`, value.toString());
    }

    this.bot = spawn(spawnArgs[0], spawnArgs.slice(1), {
      stdio: ["pipe", "pipe", "ignore"],
    });
    // wait for the bot to be ready
    await new Promise((resolve) => {
      this.bot?.stdout?.on("data", (data) => {
        if (data.toString().includes(">")) {
          resolve(true);
        }
      });
    });
  }

  public close(): void {
    if (this.bot !== null) {
      this.bot.kill();
      this.bot = null;
    }
  }

  private async downloadExecutable(): Promise<void> {
    let upstream: string;
    const platform = os.platform();

    if (platform === "darwin") {
      // check for M1 Mac
      const { stdout } = await promisify(exec)("uname -m");
      if (stdout.trim() === "arm64") {
        upstream =
          "https://github.com/nomic-ai/gpt4all/raw/main/gpt4all-training/chat/gpt4all-lora-quantized-OSX-m1";
      } else {
        upstream =
          "https://github.com/nomic-ai/gpt4all/raw/main/gpt4all-training/chat/gpt4all-lora-quantized-OSX-intel";
      }
    } else if (platform === "linux") {
      upstream =
        "https://github.com/nomic-ai/gpt4all/raw/main/gpt4all-training/chat/gpt4all-lora-quantized-linux-x86";
    } else if (platform === "win32") {
      upstream =
        "https://github.com/nomic-ai/gpt4all/raw/main/gpt4all-training/chat/gpt4all-lora-quantized-win64.exe";
    } else {
      throw new Error(
        `Your platform is not supported: ${platform}. Current binaries supported are for OSX (ARM and Intel), Linux and Windows.`
      );
    }

    await this.downloadFile(upstream, this.executablePath);

    await fs.chmod(this.executablePath, 0o755, (err) => {
      if (err) {
        throw err;
      }
    });

    console.log(`File downloaded successfully to ${this.executablePath}`);
  }

  private async downloadModel(): Promise<void> {
    const modelUrl = `https://the-eye.eu/public/AI/models/nomic-ai/gpt4all/${this.model}.bin`;

    await this.downloadFile(modelUrl, this.modelPath);

    console.log(`File downloaded successfully to ${this.modelPath}`);
  }

  private async downloadFile(url: string, destination: string): Promise<void> {
    const { data, headers } = await axios.get(url, { responseType: "stream" });
    const totalSize = parseInt(headers["content-length"], 10);
    const dir = new URL(`file://${os.homedir()}/.nomic/`);
    await fs.mkdir(dir, { recursive: true }, (err) => {
      if (err) {
        throw err;
      }
    });

    const writer = fs.createWriteStream(destination);

    data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
  }

  public prompt(prompt: string): Promise<string> {
    if (this.bot === null) {
      throw new Error("Bot is not initialized.");
    }

    this.bot.stdin.write(prompt);

    return new Promise((resolve, reject) => {
      let response: string = "";
      let timeoutId: NodeJS.Timeout;

      const onStdoutData = (data: Buffer) => {
        const text = data.toString();
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (text.includes(">")) {
          // console.log('Response starts with >, end of message - Resolving...'); // Debug log: Indicate that the response ends with "\\f"
          terminateAndResolve(response); // Remove the trailing "\f" delimiter
        } else {
          timeoutId = setTimeout(() => {
            // console.log('Timeout reached - Resolving...'); // Debug log: Indicate that the timeout has been reached
            terminateAndResolve(response);
          }, 4000); // Set a timeout of 4000ms to wait for more data
        }
        // console.log('Received text:', text); // Debug log: Show the received text
        response += text;
        // console.log('Updated response:', response); // Debug log: Show the updated response
      };

      const onStdoutError = (err: Error) => {
        this.bot.stdout.removeListener("data", onStdoutData);
        this.bot.stdout.removeListener("error", onStdoutError);
        reject(err);
      };

      const terminateAndResolve = (finalResponse: string) => {
        this.bot.stdout.removeListener("data", onStdoutData);
        this.bot.stdout.removeListener("error", onStdoutError);
        // check for > at the end and remove it
        if (finalResponse.endsWith(">")) {
          finalResponse = finalResponse.slice(0, -1);
        }
        resolve(finalResponse);
      };

      this.bot.stdout.on("data", onStdoutData);
      this.bot.stdout.on("error", onStdoutError);
    });
  }
}

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

		
		const gpt4all = new GPT4All()
		await gpt4all.init();
		// Open the connection with the model
		await gpt4all.open();
		// Generate a response using a prompt
		//const prompt = 'Tell me about how Open Access to AI is going to help humanity.';
		let completion = await gpt4all.prompt(promptHistory);
		console.log(completion)

		/*
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

		

		const configuration = new Configuration({
            //apiKey: this.settings.secretKey,
            apiKey: "not needed",
            apiBase: "http://localhost:4891/"
        });

        const openai = new OpenAIApi(configuration);
        new Notice("generating completions...")


        let res: NextApiResponse = await openai.createCompletion({
            model: "gpt4all-j-v1.3-groovy",
            prompt: promptHistory,
            max_tokens: this.settings.maxTokens,
            top_p: 1.0,
            frequency_penalty: this.settings.frequencyPenalty,
            presence_penalty: this.settings.presencePenalty,
            n: this.settings.nCompletions,
        }).catch((err) => {console.error(err)});

		const choices = res.data.choices;
		const completions = choices.map(choice => choice.text);
		*/

		const xOffset = generateOffsetArray(this.settings.nCompletions)
		for (let i = 0; i < xOffset.length; i++) {

			// create new node and add to canvas
			let targetNode = this.createNode(selectedNode.x - xOffset[i], selectedNode.y + 500, completion);
			new Notice('created node');
			canvasContents.nodes = canvasContents.nodes.concat(targetNode);
			new Notice('added node');

			// Create a connection between the selected node and the new node
			let newConnection = {
				id: makeid(20),
				fromNode: selectedNode.id,
				toNode: targetNode.id,
				fromSide: 'bottom',
				toSide: 'top',
				color: "6"
			};
			canvasContents.edges = canvasContents.edges.concat(newConnection);
			// write the updates to the file
			await this.writeCanvasFile(activeFile, canvasContents);
		}

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