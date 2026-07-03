<template>
   <v-card class="fill-height">
      <v-card-title class="pt-2 pb-1">
         <v-icon class="mr-2">mdi-record-rec</v-icon>
         Record
      </v-card-title>

      <v-card-text>
         <v-row>
            <v-col v-for="colNo in [0, 1, 2]" :key="colNo" cols="2">
               <v-checkbox dense hide-details v-for="variable in nthThirdOfVariables(colNo)" :key="variable.id" v-model="selectedVariables" :label="variable.title" :value="variable" :color="settingsStore.darkTheme ? variable.colour.dark : variable.colour.light" />
            </v-col>
            <v-col cols="3">
               <v-select v-model="selectedDriver" :items="drivers" hint="Only one motor will be driven, axis should be re-homed after tuning" item-title="name" item-value="value" label="Select a driver" single-line persistent-hint class="pb-4" />
               <v-form @submit.prevent="updatePID" v-on:keyup.enter="updatePID">
                  <v-row dense>
                     <v-col cols="4">
                        <v-text-field label="P Value" type="number" v-model.number="pTerm"></v-text-field>
                     </v-col>
                     <v-col cols="4">
                        <v-text-field label="I Value" type="number" v-model.number="iTerm"></v-text-field>
                     </v-col>
                     <v-col cols="4">
                        <v-text-field label="D Value" type="number" v-model.number="dTerm"></v-text-field>
                     </v-col>
                     <v-col cols="4">
                        <v-text-field label="A Value" type="number" v-model.number="aTerm"></v-text-field>
                     </v-col>
                     <v-col cols="4">
                        <v-text-field label="V Value" type="number" v-model.number="vTerm"></v-text-field>
                     </v-col>
                     <v-col cols="4">
                        <v-text-field label="J Value" type="number" v-model.number="jTerm"></v-text-field>
                     </v-col>
                     <v-col cols="4">
                        <v-btn type="submit" :loading="updatingPIDValue">Update</v-btn>
                     </v-col>
                  </v-row>
               </v-form>
               <v-row>
                  <v-col cols="6">
                     <v-text-field label="Samples to collect" v-model="sampleCount" :rules="[(v: any) => !!v || $t('dialog.inputRequired'), (v: any) => isNumber(parseFloat(v)) || $t('dialog.numberRequired')]" required autofocus>
                        <template #append> samples </template>
                     </v-text-field>
                  </v-col>
                  <v-col cols="6">
                     <v-radio-group v-model="sampleRateContinuous">
                        <v-radio label="As fast as possible" :value="true" density="compact" hide-details />
                        <v-radio :value="false" density="compact" hide-details>
                           <template v-slot:label>
                              <v-text-field label="At a fixed rate" v-model="sampleRate" :rules="[(v: any) => !!v || $t('dialog.inputRequired'), (v: any) => isNumber(parseFloat(v)) || $t('dialog.numberRequired')]" required autofocus :hint="sampleRateContinuous ? '' : `(total ${totalTime} seconds)`" persistent-hint>
                                 <template #append> /second </template>
                              </v-text-field>
                           </template>
                        </v-radio>
                     </v-radio-group>
                  </v-col>
               </v-row>
            </v-col>
            <v-col cols="3">
               <v-radio-group class="mt-0 pt-0" label="Movement" v-model="calibrationMovement">
                  <v-radio :value="64" label="Step Manoeuvre" density="compact" hide-details> </v-radio>
                  <v-row v-show="calibrationMovement === 64" dense>
                     <v-col cols="12"> Step Manoeuvre Parameters </v-col>
                     <v-col cols="6">
                        <v-text-field label="Speed" persistent-hint v-model="moveSpeed" :rules="[(v: any) => !!v || $t('dialog.inputRequired'), (v: any) => isNumber(parseFloat(v)) || $t('dialog.numberRequired')]" required autofocus>
                           <template #append> mm/s </template>
                        </v-text-field>
                     </v-col>
                     <v-col cols="6">
                        <v-text-field label="Distance" v-model="moveDistance" :rules="[(v: any) => !!v || $t('dialog.inputRequired'), (v: any) => isNumber(parseFloat(v)) || $t('dialog.numberRequired')]" required autofocus>
                           <template #append> mm </template>
                        </v-text-field>
                     </v-col>
                     <v-col cols="6">
                        <v-text-field label="Acceleration" v-model="moveAcceleration" :rules="[(v: any) => !!v || $t('dialog.inputRequired'), (v: any) => isNumber(parseFloat(v)) || $t('dialog.numberRequired')]" required autofocus>
                           <template #append> mm/s^2 </template>
                        </v-text-field>
                     </v-col>
                  </v-row>
                  <v-radio :value="0" hide-details label="Custom G-Code" />
                  <v-row v-show="calibrationMovement === 0" dense >
                     <v-col cols="12">
                        <v-text-field  class="pt-1" label="G-Code" persistent-hint v-model="customGCODE" hint="Enter custom g-code to record" />
                     </v-col>
                  </v-row>
               </v-radio-group>

               <v-select
                  :items="[
                     { text: 'Immediately', value: 0 },
                     { text: 'On next move', value: 1 }
                  ]"
                  item-title="text"
                  item-value="value"
                  label="Collect data"
                  v-model="activateMode"
               ></v-select>
            </v-col>
         </v-row>
         <v-row>
            <v-col cols="auto">
               <v-btn :disabled="!ready || recording" @click="record()" color="info">
                  <v-icon class="mr-2">mdi-record</v-icon>
                  Record
               </v-btn>
               <div class="mt-1">{{ autoTuneText }}</div>
            </v-col>
            <v-col cols="10">
               <div v-if="ready" :class="{ 'pt-2': !error && !warning && recordingProgress == null && calibrationMovement != 0 }" class="font-weight-black info--text">{{ GCODECommand }}</div>
               <div v-if="ready && calibrationMovement == 0" class="font-weight-black info--text">{{ customGCODE }}</div>
               <div v-if="error" class="font-weight-black error--text">{{ error }}</div>
               <div v-if="warning" class="font-weight-black warning--text">{{ warning }}</div>
               <v-progress-linear v-if="recordingProgress != null" :indeterminate="recordingProgress == -1" :model-value="recordingProgress == -1 ? 0 : recordingProgress" class="mb-4" />
            </v-col>
         </v-row>
      </v-card-text>

      <v-dialog v-model="showDialog" persistent width="480">
         <v-card>
            <v-card-title>
               <span class="headline"> Confirm </span>
            </v-card-title>

            <v-card-text>
               You have chosen to perform a tuning manoeuvre which will move the axis.
               <div class="text-center py-2 font-weight-black error--text">This movement may not respect endstops.</div>
               Please ensure the axis is in a safe position (usually the center) before proceeding.
            </v-card-text>

            <v-card-actions>
               <v-btn color="error darken-1" text @click="dialogResult(false)">
                  {{ $t('generic.cancel') }}
               </v-btn>
               <v-spacer />
               <v-checkbox v-model="dontShowModal" class="pr-2">
                  <template v-slot:label>
                     <span style="font-size: 0.7em">Don't show this again</span>
                  </template>
               </v-checkbox>
               <v-btn color="blue darken-1" text @click="dialogResult(true)">
                  {{ $t('generic.ok') }}
               </v-btn>
            </v-card-actions>
         </v-card>
      </v-dialog>
   </v-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";
import { useSettingsStore } from "@/stores/settings";
import { isNumber } from "@/utils/numbers";

import { variables, tuningManoeuvres } from "./config";
import { AxisParameters } from "./PIDTune";

const emit = defineEmits<{
   recordingFinished: [];
}>();

const machineStore = useMachineStore();
const settingsStore = useSettingsStore();

const error = ref<string | null>(null);
const warning = ref<string | null>(null);
const sampleRate = ref(100);
const activateMode = ref(0);
const sampleCount = ref(500);
const customGCODE = ref<string | null>(null);
const showDialog = ref(false);
const selectedDriver = ref<string | null>(null);
const dontShowModal = ref(false);
const selectedVariables = ref<Array<typeof variables[number]>>([]);
const calibrationMovement = ref(64);
// null = not recording, -1 = recording but unknown progress, >=0 = recording & known progress
const recordingProgress = ref<number | null>(null);
const sampleRateContinuous = ref(true);
const pTerm = ref(0);
const iTerm = ref(0);
const dTerm = ref(0);
const aTerm = ref(0);
const vTerm = ref(0);
const jTerm = ref(0);
const updatingPIDValue = ref(false);
const recording = ref(false);
const autoTuneText = ref("");
const axisParams = ref<AxisParameters | null>(null);
const moveSpeed = ref(100);
const moveDistance = ref(50);
const moveAcceleration = ref(10000);

function nthThirdOfVariables(n: number) {
   const filteredVariables = variables.filter((v) => !v.hideRecord);
   const thirdLength = Math.ceil(filteredVariables.length / 3);
   return filteredVariables.slice(n * thirdLength, (n + 1) * thirdLength);
}

function dialogResult(res: boolean) {
   showDialog.value = false;
   if (res) {
      record(true);
   }
}

function stepCommand() {
   return `G91 G1 H2 ${axisParams.value!.letter}${moveDistance.value} F${moveSpeed.value * 60} \n G4 P100 \n G1 H2 ${axisParams.value!.letter}-${moveDistance.value} F${moveSpeed.value * 60} G90`;
}

async function record(force = false) {
   if (axisParams.value === null) {
      error.value = "No axis parameters available for this driver.";
      return;
   }
   recording.value = true;

   // Capture original acceleration
   const originalAcceleration = axisParams.value.acceleration;

   try {
      force = force || dontShowModal.value;
      if (calibrationMovement.value !== -1 && !force) {
         showDialog.value = true;
         return;
      }

      if (!customGCODE.value && calibrationMovement.value === 0) {
         error.value = "Enter a custom GCODE command before recording.";
         return;
      }

      await machineStore.sendCode(`M201 ${axisParams.value.letter}${moveAcceleration.value}`, false, false);
      const gcodeToSend = calibrationMovement.value === 0 ? GCODECommand.value + "\n" + customGCODE.value : GCODECommand.value + "\n" + stepCommand();
      recordingProgress.value = -1;
      const reply = await machineStore.sendCode(gcodeToSend, false);
      if (reply.startsWith("Error: ")) {
         error.value = reply;
         return;
      } else if (reply.startsWith("Warning: ")) {
         warning.value = reply;
      }
      error.value = null;
      warning.value = null;
   } finally {
      // Reset original acceleration
      await machineStore.sendCode(`M201 ${axisParams.value.letter}${originalAcceleration}`, false, false);
      setTimeout(() => {
         recording.value = false;
      }, 1000);
   }
}

function checkTerm(term: number) {
   return (term as unknown as string) !== "" && term >= 0;
}

async function updatePID() {
   if (checkTerm(pTerm.value) && checkTerm(iTerm.value) && checkTerm(dTerm.value) && checkTerm(aTerm.value) && checkTerm(vTerm.value) && checkTerm(jTerm.value)) {
      try {
         updatingPIDValue.value = true;
         await machineStore.sendCode(`M569.1 P${selectedDriver.value}  R${pTerm.value} I${iTerm.value} D${dTerm.value} A${aTerm.value} V${vTerm.value} J${jTerm.value}`, false, true);
      } finally {
         updatingPIDValue.value = false;
      }
   }
}

onBeforeUnmount(() => {
   // Autotune is currently disabled in the UI; no autotuner instance to cancel here
});

const boards = computed(() => machineStore.model.boards);
const axes = computed(() => machineStore.model.move.axes);
const extruders = computed(() => machineStore.model.move.extruders);

const drivers = computed(() => {
   const results: Array<{ name: string; value: string }> = [];
   axes.value.forEach((axis) => {
      axis.drivers.forEach((driver) => {
         if (boards.value.some((board) => board && board.canAddress === parseInt(String(driver.board ?? "")) && board.closedLoop != null)) {
            results.push({
               name: `${axis.letter} axis (driver ${driver.board}.${driver.driver})`,
               value: `${driver.board}.${driver.driver}`
            });
         }
      });
   });
   // Add closed loop extruders to list
   extruders.value.forEach((extruder, extruderIdx) => {
      const driver = extruder.driver;
      if (driver && boards.value.some((board) => board && board.canAddress === parseInt(String(driver.board ?? "")) && board.closedLoop != null)) {
         results.push({
            name: ` Extruder ${extruderIdx} (driver ${driver.board}.${driver.driver})`,
            value: `${driver.board}.${driver.driver}`
         });
      }
   });
   return results;
});

const closedLoopPoints = computed(() => {
   if (selectedDriver.value) {
      const canAddress = selectedDriver.value.split(".")[0];
      const board = boards.value.find((board) => String(board.canAddress) == canAddress);
      if (board && board.closedLoop) {
         return board.closedLoop.points;
      }
   }
   return null;
});

const closedLoopRuns = computed(() => {
   if (selectedDriver.value) {
      const canAddress = selectedDriver.value.split(".")[0];
      const board = boards.value.find((board) => String(board.canAddress) == canAddress);
      if (board && board.closedLoop) {
         return board.closedLoop.runs;
      }
   }
   return null;
});

const totalTime = computed(() => Math.round((sampleCount.value / sampleRate.value) * 100) / 100);

const GCODECommand = computed(() => {
   const pString = `P${selectedDriver.value}`;
   const sString = `S${sampleCount.value}`;
   const aString = `A${activateMode.value}`;
   const rString = `R${sampleRateContinuous.value ? 0 : sampleRate.value}`;
   const dString = `D${selectedVariables.value.reduce((acc, x) => acc + x.filterValue, 0)}`;
   return `M569.5 ${pString} ${sString} ${aString} ${rString} ${dString} V0`;
});

const ready = computed(() => selectedDriver.value !== null && selectedVariables.value.length > 0 && axisParams.value !== null);

watch(selectedDriver, async (to) => {
   if (to) {
      try {
         pTerm.value = 0;
         iTerm.value = 0;
         dTerm.value = 0;
         aTerm.value = 0;
         vTerm.value = 0;
         jTerm.value = 0;
         const queryResults = await machineStore.sendCode(`M569.1 P${to}`, false, false);
         if (queryResults) {
            pTerm.value = Number(queryResults.match(/P=[0-9.]+/)![0].substring(2));
            iTerm.value = Number(queryResults.match(/I=[0-9.]+/)![0].substring(2));
            dTerm.value = Number(queryResults.match(/D=[0-9.]+/)![0].substring(2));
            aTerm.value = Number(queryResults.match(/A=[0-9.]+/)![0].substring(2));
            vTerm.value = Number(queryResults.match(/V=[0-9.]+/)![0].substring(2));
            jTerm.value = Number(queryResults.match(/J=[0-9.]+/)![0].substring(2));
         }

         let selectedAxis = axes.value.filter((axis) => axis.drivers.some((driver) => `${driver.board}.${driver.driver}` === selectedDriver.value));
         if (selectedAxis.length > 0) {
            const axis = selectedAxis[0];
            moveAcceleration.value = axis.acceleration;
            axisParams.value = new AxisParameters(axis.letter, axis.acceleration, axis.speed, axis.stepsPerMm, axis.microstepping.value);
         } else {
            let selectedExtruder = null;
            let extruderLetter = null;
            extruders.value.forEach((extruder, idx) => {
               if (extruder.driver && `${extruder.driver.board}.${extruder.driver.driver}` === selectedDriver.value) {
                  selectedExtruder = extruder;
                  extruderLetter = `E${idx}`;
               }
            });
            if (selectedExtruder !== null) {
               moveAcceleration.value = (selectedExtruder as any).acceleration;
               axisParams.value = new AxisParameters(extruderLetter!, (selectedExtruder as any).acceleration, (selectedExtruder as any).speed, (selectedExtruder as any).stepsPerMm, (selectedExtruder as any).microstepping.value);
            } else {
               axisParams.value = null;
            }
         }
      } catch (e) {
         console.log(e);
      }
   }
});

watch(calibrationMovement, () => {
   activateMode.value = 0;
});

watch(closedLoopPoints, (to) => {
   if (recordingProgress.value !== null && to !== null) {
      recordingProgress.value = (to / sampleCount.value) * 100;
   }
});

watch(closedLoopRuns, () => {
   recordingProgress.value = null;
   emit("recordingFinished");
});
</script>
