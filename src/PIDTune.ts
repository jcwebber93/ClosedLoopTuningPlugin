/* eslint-disable  no-unused-vars */
/* eslint-disable  no-empty */

import Path from "@/utils/path";
import CSV from "@/utils/csv";

const maxPTerm = 500;
const maxPTime = 4;
const maxDTerm = 0.4;
const maxITerm = 50000;

export class AxisParameters {
	letter: string;
	acceleration: number;
	maxSpeed: number;
	stepsPerMM: number;
	microstepping: number;

	constructor(letter: string, acceleration: number, maxSpeed: number, stepsPerMM: number, microstepping: number) {
		this.letter = letter;
		this.acceleration = acceleration;
		this.maxSpeed = maxSpeed;
		this.stepsPerMM = stepsPerMM;
		this.microstepping = microstepping;
	}

	/*
	G91 G1 H2 Xxx Fyyy G90
	Replace X in each command by the axis that the motor is assigned to. Value xx should be calculated so that the movement is 4 full steps. yyy should be the maximum allowed by M203. We may want to allow the M203 and M201 parameters to be temporarily overridden too. I am using M201 X10000 and M203 X50000 in testing.
	*/
}

// Autotune is currently disabled in the UI (Recorder.vue's Auto Tune button is commented out), so
// this class is kept compiling against the current sendCode/getFileList/download signatures but is
// not wired up or exercised anywhere
export default class PIDTune {
	pTerm = 100;
	iTerm = 0;
	dTerm = 0;
	aTerm = 0;
	vTerm = 0;
	jTerm = 0;
	lTerm = 0;
	warningValue = 0;
	errorValue = 0;
	selectedDriver: string;
	sendCode: (code: string, fromInput?: boolean, logReply?: boolean) => Promise<string>;
	getFileList: (directory: string) => Promise<Array<{ isDirectory: boolean; name: string; lastModified: Date | null }>>;
	downloadFile: (filename: string, showProgress?: boolean, showSuccess?: boolean, showError?: boolean) => Promise<string>;
	updateGraphCallback: ((filename: string, p: number, i: number, d: number) => void) | null;
	updateAutotuneStatusCallback: ((text: string) => void) | null;
	cancelled = false;
	axisParams: AxisParameters;
	lastFile = "";

	constructor(
		sendCode: (code: string, fromInput?: boolean, logReply?: boolean) => Promise<string>,
		getFileList: (directory: string) => Promise<Array<{ isDirectory: boolean; name: string; lastModified: Date | null }>>,
		downloadFile: (filename: string, showProgress?: boolean, showSuccess?: boolean, showError?: boolean) => Promise<string>,
		driver: string,
		updateGraphCallback: ((filename: string, p: number, i: number, d: number) => void) | null,
		updateAutotuneTextCallback: ((text: string) => void) | null,
		axisParams: AxisParameters
	) {
		this.selectedDriver = driver;
		this.sendCode = sendCode;
		this.getFileList = getFileList;
		this.downloadFile = downloadFile;
		this.updateGraphCallback = updateGraphCallback;
		this.updateAutotuneStatusCallback = updateAutotuneTextCallback;
		this.axisParams = axisParams;
	}

	cancel() {
		this.cancelled = true;
	}

	async getPID() {
		const queryResults = await this.sendCode(`M569.1 P${this.selectedDriver}`, false, false);
		if (queryResults) {
			this.pTerm = Number(queryResults.match(/P=[0-9.]+/)![0].substring(2));
			this.iTerm = Number(queryResults.match(/I=[0-9.]+/)![0].substring(2));
			this.dTerm = Number(queryResults.match(/D=[0-9.]+/)![0].substring(2));
			this.aTerm = Number(queryResults.match(/A=[0-9.]+/)![0].substring(2));
			this.vTerm = Number(queryResults.match(/V=[0-9.]+/)![0].substring(2));
			this.jTerm = Number(queryResults.match(/J=[0-9.]+/)![0].substring(2));
			this.lTerm = Number(queryResults.match(/L=[0-9.]+/)![0].substring(2));

			const match = /Warning\/error threshold ([0-9.]+)\/([0-9.]+)/.exec(queryResults);
			this.warningValue = Number(match![1]);
			this.errorValue = Number(match![2]);
		}
	}

	async updatePID() {
		const code = `M569.1 P${this.selectedDriver} R${this.pTerm} I${this.iTerm} D${this.dTerm} A${this.aTerm} V${this.vTerm} J${this.jTerm} L${this.lTerm} E0:0`;
		await this.sendCode(code, false, false);
		await this.sendCode(`M569.1 P${this.selectedDriver}`, false, false);
	}

	async resetErrorThreshold() {
		await this.sendCode(`M569.1 P${this.selectedDriver} E${this.warningValue}:${this.errorValue}`, false, false);
	}

	sleep(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async findP_Test() {
		let solved = false;
		let count = 0;

		this.pTerm = 100; // Reset P to 100 as a start point
		this.iTerm = 0;
		this.dTerm = 0;
		await this.updatePID();

		while (!solved && count < 10) {
			count++;
			const data = await this.runStepManouver();
			const processedData = this.processData(data);

			if (processedData.periods.length < 8) {
				this.pTerm += 50;
				this.iTerm = 0;
				this.dTerm = 0;
				await this.updatePID();
			} else {
				const avg = processedData.periods.slice(1, 7).reduce((a, b) => a + b, 0) / 6;
				const under = processedData.periods.slice(1, 7).filter((period) => period < avg * 0.95);
				const over = processedData.periods.slice(1, 7).filter((period) => period > avg * 1.05);
				if (under.length > 1) {
					this.pTerm += 50;
					await this.updatePID();
				} else if (over.length > 1) {
					this.pTerm -= 25;
					await this.updatePID();
				} else {
					solved = true;
				}
			}

			if (this.pTerm > 700) {
				return;
			}

			await this.sleep(2000);
		}
	}

	async findP() {
		let solved = false;
		let currentTarget = 0;
		this.pTerm = 10;
		this.iTerm = 0;
		this.dTerm = 0;
		await this.updatePID();
		await this.runStepManouver();

		let peakTime = 1000;
		let repeat = 0;

		while (!solved && this.pTerm < maxPTerm) {
			if (this.cancelled) {
				return false;
			}

			this.updateStatus(`Autotune: Testing P${this.pTerm}`);
			await this.updatePID();
			const data = await this.runStepManouver();
			const processedData = this.processData(data);
			const measurement = processedData.peaks[0].time;
			if (measurement < peakTime && Math.abs(measurement - peakTime) > maxPTime) {
				peakTime = measurement;
				this.pTerm += this.pTerm < 100 ? 10 : 25;
				currentTarget = this.pTerm;
				repeat = 0;
			} else {
				if (repeat < 1) {
					repeat++;
					this.pTerm += this.pTerm < 100 ? 10 : 25;
				} else {
					solved = true;
					this.pTerm = currentTarget;
					await this.updatePID();
					this.updateStatus(`Autotune: P${this.pTerm} found`);
				}
			}
		}
		return solved;
	}

	async findD() {
		let solved = false;
		this.iTerm = 0;
		this.dTerm = 0;
		while (!solved && this.dTerm < maxDTerm) {
			if (this.cancelled) {
				return false;
			}
			await this.updatePID();
			this.updateStatus(`Autotune: Testing D${this.dTerm}`);
			const data = await this.runStepManouver();
			const processedData = this.processData(data);
			const overshoots = processedData.peaks.filter((peak) => peak.step - processedData.stepTarget > 0.05);

			if (overshoots.length > 0) {
				this.dTerm += this.dTerm < 0.5 ? 0.01 : 0.025;
				this.dTerm = Number(this.dTerm.toPrecision(3));
			} else {
				solved = true;
			}
			await this.sleep(1000);
		}
		return solved;
	}

	async findI() {
		let solved = false;
		let count = 0;
		let stableTime = 999999;
		let currentTerm = 0;
		this.iTerm = 1000;
		while (!solved && this.iTerm < maxITerm) {
			if (this.cancelled) {
				return false;
			}

			this.updateStatus(`Autotune: Testing I${this.iTerm}`);
			await this.updatePID();
			const data = await this.runStepManouver(true);
			const processedData = this.processData(data);
			const unstableTimes = processedData.error.filter((p) => Math.abs(p.error) > 0);
			const currentTime = unstableTimes[unstableTimes.length - 1].time;
			if (currentTime < stableTime - 25) {
				stableTime = currentTime;
				this.iTerm += 1000;
				currentTerm = this.iTerm;
				this.iTerm = Math.trunc(this.iTerm);
				count = 0;
			} else {
				count++;
				this.iTerm += 500;
				if (count > 1) {
					this.iTerm = currentTerm;
					await this.updatePID();
					solved = true;
					this.updateStatus(`Autotune: Testing I${this.iTerm}`);
				}
			}
			await this.sleep(2000);
		}
		return solved;
	}

	processData(csv: { data: CSV; timeStamp: number; measuredIndex: number; targetIndex: number }) {
		const peaks: Array<{ time: number; step: number }> = [];
		const valleys: Array<{ time: number; step: number }> = [];
		const currentError: Array<{ time: number; error: number }> = [];

		if (csv.measuredIndex == -1 || csv.targetIndex == -1) {
			return { peaks, valleys, periods: [] as Array<number>, averagePeriod: NaN, stepTarget: 0, error: currentError };
		}

		let stepTarget = 0;
		let rising = true;

		const initialOffset = Number(csv.data.content[0][csv.measuredIndex]) - Number(csv.data.content[0][csv.targetIndex]);

		for (let idx = 0; idx < csv.data.content.length - 1; idx++) {
			const current = csv.data.content[idx].map(Number);
			current[csv.targetIndex] -= initialOffset;
			const next = csv.data.content[idx + 1].map(Number);

			stepTarget = current[csv.targetIndex] > stepTarget ? current[csv.targetIndex] : stepTarget;
			if (current[csv.measuredIndex] > next[csv.measuredIndex] && rising) {
				peaks.push({ time: current[csv.timeStamp], step: current[csv.measuredIndex] });
				rising = false;
			}
			if (current[csv.measuredIndex] < next[csv.measuredIndex] && !rising) {
				valleys.push({ time: current[csv.timeStamp], step: current[csv.measuredIndex] });
				rising = true;
			}
			if (current[csv.timeStamp] > 10) {
				currentError.push({ time: Number(current[csv.timeStamp]), error: current[csv.measuredIndex] - current[csv.targetIndex] });
			}
		}

		const periods: Array<number> = [];
		for (let idx = 0; idx < peaks.length - 1; idx++) {
			periods.push(peaks[idx + 1].time - peaks[idx].time);
		}
		const averagePeriod = periods.reduce((a, b) => a + b, 0) / periods.length;

		return { peaks, valleys, periods, averagePeriod, stepTarget, error: currentError };
	}

	fetchCSV(csvText: string) {
		const csvData = new CSV(csvText);
		const timeStamp = csvData.headers.indexOf("Timestamp");
		const measuredIndex = csvData.headers.indexOf("Measured Motor Steps");
		const targetIndex = csvData.headers.indexOf("Target Motor Steps");
		return { data: csvData, timeStamp, measuredIndex, targetIndex };
	}

	async runStepManouver(iTermTest = false) {
		if (this.selectedDriver == null) {
			return this.fetchCSV("");
		}
		if (iTermTest) {
			await this.sendCode(`M569.5 P${this.selectedDriver} S500 R250 D6 A0`, false, true);
			await this.sendCode(this.generateFourFullStepsGCode(), false, true);
			await this.sleep(3000);
		} else {
			await this.sendCode(`M569.5 P${this.selectedDriver} S1000 R2000 D6 A0`, false, true);
			await this.sendCode(this.generateFourFullStepsGCode(), false, true);
			await this.sleep(3000);
		}

		const files = (await this.getFileList(Path.closedLoop)).filter((file) => !file.isDirectory && file.name.endsWith(".csv")).sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0));
		const data = await this.downloadFile(`${Path.closedLoop}/${files[0].name}`, false, false, true);
		if (data === "") {
			throw new Error("Could not read data from CSV");
		}
		if (this.updateGraphCallback !== null) {
			this.updateGraphCallback(`${Path.closedLoop}/${files[0].name}`, this.pTerm, this.iTerm, this.dTerm);
		}

		if (!files || files.length === 0 || this.lastFile === files[0].name) {
			throw new Error("No new data found");
		}

		this.lastFile = files[0].name;

		return this.fetchCSV(data);
	}

	async execute() {
		this.cancelled = false;
		let success = true;
		await this.getPID();

		success = await this.findP();
		if (success) {
			success = await this.findD();
		}
		if (success) {
			success = await this.findI();
		}

		await this.resetErrorThreshold();

		await this.sendCode(`M117 ${this.selectedDriver}: Tuning Complete `, false, true);
		this.updateStatus("");
		return true;
	}

	updateStatus(text: string) {
		if (this.updateAutotuneStatusCallback) {
			this.updateAutotuneStatusCallback(text);
		}
	}

	getFullStep() {
		return (1 / this.axisParams.stepsPerMM) * this.axisParams.microstepping;
	}

	generateFourFullStepsGCode() {
		return `G91 G1 H2 ${this.axisParams.letter}${this.getFullStep() * -16} F${this.axisParams.maxSpeed} G90`;
	}
}
