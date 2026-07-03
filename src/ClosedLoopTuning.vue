<template>
	<div>
		<v-row>
			<v-col cols="12">
				<Recorder
					ref="recorder"
					@recordingFinished="recordingFinished"
				/>
			</v-col>
		</v-row>
		<v-row>
			<v-col cols="12" sm="6" lg="auto" order="1" order-lg="0">
				<FileSelector
					ref="selector"
					@fileSelect="selected($event)"
				/>
			</v-col>

			<v-col cols="12" lg="auto" order="0" order-lg="0" class="flex-grow-1 pa-1 pa-sm-3">
				<Chart
					:data="loadedData"
					:variables="variablesToView"
					class="content flex-grow-1 px-2 py-0"
				/>
			</v-col>

			<v-col cols="12" sm="6" lg="auto" order="1" order-lg="0">
				<VariableSelector
					v-model="variablesToView"
					:available-variables="availableVariables"
				/>
			</v-col>
		</v-row>
	</div>
</template>

<script setup lang="ts">
import { ref } from "vue";

import { useMachineStore } from "@/stores/machine";

import Chart from "./Chart.vue";
import Recorder from "./Recorder.vue";
import FileSelector from "./FileSelector.vue";
import VariableSelector from "./VariableSelector.vue";
import { variables } from "./config";

const machineStore = useMachineStore();

const loadedData = ref<Record<string, Array<number>> | null>(null);
const variablesToView = ref<Array<typeof variables[number]>>([]);
const availableVariables = ref<Array<string>>([]);

const selector = ref<InstanceType<typeof FileSelector> | null>(null);

function parseClosedLoopCSV(inputText: string) {
	const lines = inputText.split("\n");
	const header = lines[0].split(",");
	const data: Record<string, Array<number>> = {};
	for (const variable of header) {
		data[variable] = [];
	}
	lines.slice(1).forEach(row => {
		if (row === "") {
			return;
		}
		const cells = row.split(",");
		for (let i = 0; i < cells.length; i++) {
			data[Object.keys(data)[i]].push(parseFloat(cells[i]));
		}
	});
	return data;
}

async function selected(file: string | null) {
	if (!file) {
		loadedData.value = null;
	} else {
		const data = parseClosedLoopCSV(await machineStore.download({ filename: file, type: "text" }, false, false, false));

		availableVariables.value = Object.keys(data).filter(x => x !== "Sample");
		loadedData.value = data;
	}
}

function recordingFinished() {
	selector.value?.selectMostRecentFile();
}
</script>
