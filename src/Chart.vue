<style scoped>
.content > div:last-child {
	position: relative;
}

.content > div:last-child > canvas {
	position: absolute;
}
</style>

<template>
	<v-card class="d-flex flex-column flex-grow-1 fill-height" min-height="40rem">
		<v-card-title class="pt-2 pb-1">
			<v-icon dense class="mr-2">mdi-chart-sankey</v-icon>
			Data Chart
		</v-card-title>

		<v-card-text class="content flex-grow-1 px-2 py-0">
			<div class="text-h4 text--disabled text-center pt-16" v-if="!data">
				Select a file to view
			</div>
			<div class="text-h4 text--disabled text-center pt-16" v-else-if="variables.length === 0">
				Select some variables to plot<br>
			</div>

			<div style="height: 20%;" v-if="data && variables.length > 0">
				<v-row dense align="center" justify="center">
					<v-col cols="3">
						<v-text-field
							dense
							v-model.number="min"
							label="Start"
							type="number"
							min="0"
							:max="data.Sample.length"
						></v-text-field>
					</v-col>
					<v-col cols="3">
						<v-text-field
							dense
							v-model.number="max"
							label="End"
							type="number"
							min="0"
							:max="data.Sample.length"
						></v-text-field>
					</v-col>
					<v-col cols="3">
						<v-btn @click="resetRange">Reset Range</v-btn>
					</v-col>
					<v-col cols="3" >
						<v-checkbox v-model="keepRange" label="Keep Range"></v-checkbox>
					</v-col>
					<v-col cols="12">
						<v-range-slider
							v-model="rangeFilter"
							hide-details
							:max="data.Sample.length"
							min="0"
						/>
					</v-col>
				</v-row>
			</div>

			<div style="height: 80%;" v-show="data && variables.length > 0">
				<canvas ref="canvasRef"></canvas>
			</div>
		</v-card-text>
	</v-card>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Chart, Filler, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip } from "chart.js";

import { useSettingsStore } from "@/stores/settings";

import { yAxes } from "./config";

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Legend, Filler);

// v4 tooltip positioner replacement for the old `Chart.Tooltip.positioners.cursor` (v2)
Tooltip.positioners.cursor = (_chartElements, coordinates) => coordinates;

interface DataRecord {
	Sample: Array<number>;
	Timestamp: Array<number>;
	[key: string]: Array<number>;
}

interface PlotVariable {
	id: string;
	title: string;
	filterValue: number;
	colour: { light: string; dark: string };
	axis: string;
	filter?: (value: number) => number;
	hideSelect?: boolean;
	hideRecord?: boolean;
}

const props = defineProps<{
	data: DataRecord | null;
	variables: Array<PlotVariable>;
}>();

const settingsStore = useSettingsStore();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let chart: Chart<"line"> | null = null;

const xScale = {
	type: "linear" as const,
	title: {
		display: true,
		text: "Time Since Start (ms)"
	}
};

const rangeFilter = ref<[number, number]>([0, 0]);
const keepRange = ref(false);
const min = ref(0);
const max = ref(0);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const debounceTimeout = 500;
let rangeUpdate = 0;

function createChart() {
	if (!canvasRef.value) {
		return;
	}
	chart = new Chart<"line">(canvasRef.value, {
		type: "line",
		options: {
			animation: false,
			interaction: {
				mode: "index",
				intersect: false
			},
			plugins: {
				tooltip: {
					position: "cursor" as any
				}
			},
			maintainAspectRatio: false,
			scales: {
				x: { ...xScale }
			}
		},
		data: {
			datasets: []
		}
	});

	updateChart();
}

function updateChart() {
	if (!chart) {
		return;
	}
	if (props.data) {
		const data = props.data;
		chart.data.datasets = props.variables.map(variable => ({
			borderColor: settingsStore.darkTheme ? variable.colour.dark : variable.colour.light,
			borderWidth: 1,
			data: data[variable.title]
				? data[variable.title]
					.map((val, idx) => ({
						x: data.Timestamp[idx],
						y: variable.filter ? variable.filter(val) : val
					}))
					.slice(rangeFilter.value[0], rangeFilter.value[1])
				: [],
			fill: false,
			label: variable.title,
			pointRadius: 0,
			showLine: true,
			tension: 0,
			yAxisID: variable.axis
		}));

		if (min.value !== data.Timestamp[rangeFilter.value[0]]) {
			min.value = Math.round(data.Timestamp[rangeFilter.value[0]]);
		}

		if (max.value !== Number(data.Timestamp[rangeFilter.value[1]])) {
			max.value = Math.round(data.Timestamp[rangeFilter.value[1]]);
		}

		const axesRequired = props.variables.map(x => x.axis);
		const scales: Record<string, any> = { x: { ...xScale } };
		for (const yAxis of yAxes.filter(yAxis => axesRequired.includes(yAxis.id))) {
			scales[yAxis.id] = { type: yAxis.type, position: yAxis.position };
		}
		chart.options.scales = scales;
	} else {
		chart.data.datasets = [];
		chart.options.scales = { x: { ...xScale } };
	}
	chart.update();
}

function resetRange() {
	if (props.data) {
		rangeFilter.value = [0, props.data.Sample.length - 1];
	}
}

function debounceUpdateChart() {
	if (debounceTimer) {
		clearTimeout(debounceTimer);
	}
	debounceTimer = setTimeout(() => {
		if (props.data) {
			const lo = props.data.Timestamp.findIndex(val => val >= min.value);
			const hi = props.data.Timestamp.findLastIndex(val => val <= max.value);
			rangeFilter.value = [lo, hi];
		}
		debounceTimer = null;
	}, debounceTimeout);
}

onMounted(() => {
	createChart();
});

onBeforeUnmount(() => {
	chart?.destroy();
	chart = null;
});

watch(() => props.variables, () => {
	updateChart();
});

watch(() => props.data, () => {
	if (props.data) {
		if (!keepRange.value) {
			rangeFilter.value = [0, props.data.Sample.length - 1];
		}
		// updateChart() is called by the watcher on rangeFilter
	} else {
		updateChart();
	}
});

watch(rangeFilter, () => {
	rangeUpdate = Date.now();
	updateChart();
});

watch(() => settingsStore.darkTheme, () => {
	updateChart();
});

watch(min, (value) => {
	if (rangeFilter.value[0] !== value && Date.now() - rangeUpdate > 1000) {
		debounceUpdateChart();
	}
});

watch(max, (value) => {
	if (rangeFilter.value[1] !== value && Date.now() - rangeUpdate > 1000) {
		debounceUpdateChart();
	}
});
</script>
