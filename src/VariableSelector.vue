<template>
	<v-card class="d-flex flex-column fill-height">
		<v-card-title class="pt-2 pb-1">
			<v-icon small class="mr-2">mdi-function-variant</v-icon>
			Variables
		</v-card-title>

		<v-card-text class="content flex-grow-1 px-2 py-0 pr-4">
			<v-checkbox
				dense
				hide-details
				v-for="variable in chartableVariables"
				:key="variable.id"
				v-model="selectedVariables"
				:label="variable.title"
				:value="variable"
				:disabled="!availableVariables.includes(variable.title)"
				:color="settingsStore.darkTheme ? variable.colour.dark : variable.colour.light"
			/>
		</v-card-text>

		<v-spacer/>

		<v-card-actions class="d-flex">
			<v-btn color="darken-1" @click="selectAll">All</v-btn>
			<v-spacer/>
			<v-btn color="darken-1" @click="selectedVariables = []">None</v-btn>
		</v-card-actions>
	</v-card>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";

import { useSettingsStore } from "@/stores/settings";

import { variables } from "./config";

const props = defineProps<{
	availableVariables: Array<string>;
}>();

const settingsStore = useSettingsStore();

const selectedVariables = defineModel<Array<typeof variables[number]>>({ required: true });

const chartableVariables = computed(() => variables.filter(variable => !variable.hideSelect));

watch(() => props.availableVariables, () => {
	selectedVariables.value = selectedVariables.value.filter(variable => props.availableVariables.includes(variable.title));
});

function selectAll() {
	selectedVariables.value = variables.filter(variable => props.availableVariables.includes(variable.title));
}
</script>
