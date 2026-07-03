<template>
   <v-card class="d-flex flex-column fill-height">
      <v-card-title class="pt-2 pb-1">
         <v-icon small class="mr-2">mdi-file-table-box-multiple</v-icon>
         Data Files
         <v-spacer />
         <v-icon class="ml-2" @click="refresh">mdi-refresh</v-icon>
         <v-icon v-if="!isDeleting" class="ml-2" @click="deleteDialog = true">mdi-delete</v-icon>
         <v-progress-circular class="disable-transition ml-2" size="24" v-else :model-value="deleteProgress"></v-progress-circular>
      </v-card-title>

      <v-card-text class="pb-0">
         <v-list dense :v-if="!loading">
            <div v-if="files.length > 200" class="w-full error--text text-center mb-3">
               Warning: You have {{ files.length }} data files<br />
               You may wish to delete some to save space
            </div>
            <v-list-item v-for="(file, index) in displayedFiles" :key="file.name" :value="index"
                         :active="selectedIndex === index" color="primary" @click="selectedIndex = index">
               <v-list-item-title>
                  <div class="mt-1 float-left">
                     {{ file.name }}
                  </div>
                  <v-icon class="ml-2 float-right" @click.stop="deleteFile(file.name)">mdi-delete</v-icon>
               </v-list-item-title>
            </v-list-item>
         </v-list>
         <v-dialog :model-value="deleteDialog" width="480" persistent>
            <v-card>
               <v-card-title> Delete All Files </v-card-title>
               <v-card-text> Are you sure you want to delete all CSV files? </v-card-text>
               <v-card-actions>
                  <v-spacer />
                  <v-btn class="mr-1" @click="deleteAll()" color="error">Delete</v-btn>
                  <v-btn @click="deleteDialog = false">Cancel</v-btn>
               </v-card-actions>
            </v-card>
         </v-dialog>
      </v-card-text>
      <v-spacer />

      <v-card-actions>
         <v-pagination v-model="page" :length="Math.ceil(files.length / maxFileDisplay)" :total-visible="Math.ceil(files.length / maxFileDisplay) > 4 ? 5 : undefined" class="mx-auto" />
      </v-card-actions>
   </v-card>
</template>

<style lang="scss">
.disable-transition {
   transition: none !important;
   .v-progress-circular__overlay {
      transition: none;
   }
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";
import { useUiStore } from "@/stores/ui";
import i18n from "@/i18n";
import Path from "@/utils/path";

const emit = defineEmits<{
   fileSelect: [file: string | null];
}>();

const machineStore = useMachineStore();
const uiStore = useUiStore();

const page = ref(1);
const files = ref<Array<{ name: string; isDirectory: boolean; lastModified: Date | null }>>([]);
const loading = ref(false);
const selectedIndex = ref(-1);
const maxFileDisplay = 13;
const deleteDialog = ref(false);
const isDeleting = ref(false);
const deleteProgress = ref(0);

const displayedFiles = computed(() => files.value.slice((page.value - 1) * maxFileDisplay, page.value * maxFileDisplay));

async function refresh() {
   if (!machineStore.isConnected) {
      selectedIndex.value = -1;
      files.value = [];
      return;
   }

   if (loading.value) {
      // Don't do multiple actions at once
      return;
   }

   selectedIndex.value = -1;
   loading.value = true;
   try {
      files.value = (await machineStore.getFileList(Path.closedLoop))
         .filter((file) => !file.isDirectory && file.name.endsWith(".csv"))
         .sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0));
   } finally {
      loading.value = false;
   }
}

async function selectMostRecentFile() {
   await refresh();
   page.value = 1;
   selectedIndex.value = 0;
}

async function deleteFile(fileName: string) {
   try {
      await machineStore.delete(Path.combine(Path.closedLoop, fileName));
      await refresh();
   } catch (e) {
      uiStore.notifyError(e, i18n.global.t("notification.delete.errorTitle", [fileName]));
   }
}

async function deleteAll() {
   try {
      deleteDialog.value = false;
      isDeleting.value = true;
      for (let i = 0; i < files.value.length; i++) {
         try {
            deleteProgress.value = (i / files.value.length) * 100;
            await machineStore.delete(Path.combine(Path.closedLoop, files.value[i].name));
         } catch (e) {
            uiStore.notifyError(e, i18n.global.t("notification.delete.errorTitle", [files.value[i].name]));
         }
      }
      await refresh();
   } finally {
      isDeleting.value = false;
      deleteProgress.value = 0;
   }
}

watch(selectedIndex, (to) => {
   emit("fileSelect", to >= 0 && to < files.value.length ? Path.combine(Path.closedLoop, files.value[to].name) : null);
});

onMounted(() => {
   refresh();
});

defineExpose({ selectMostRecentFile });
</script>
