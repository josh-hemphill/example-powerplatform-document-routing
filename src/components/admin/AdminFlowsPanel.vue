<script setup lang="ts">
import { useQuery } from '@pinia/colada';
import { computed } from 'vue';
import { listFlowRunsQuery } from '@/client/@pinia/colada.gen';

const { data: flowRunsData } = useQuery(() => listFlowRunsQuery());
const flowRuns = computed(() => flowRunsData.value?.items ?? []);
</script>

<template>
	<v-card class="pa-4">
		<p class="text-body-2 text-medium-emphasis mb-3">
			Read-only Flow health (mock log; hosted environments store runs on
			appsetting / flowrun).
		</p>
		<p
			v-if="flowRuns.length === 0"
			class="text-body-2 text-medium-emphasis py-8 text-center mb-0"
		>
			No Flow runs recorded yet. SLA sweeps and publish jobs will appear here when they execute.
		</p>
		<v-table
			v-else
			density="comfortable"
		>
			<thead>
				<tr>
					<th>When</th>
					<th>Flow</th>
					<th>Status</th>
					<th>Message</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="run in flowRuns" :key="run.id">
					<td>{{ new Date(run.at).toLocaleString() }}</td>
					<td>{{ run.flowName }}</td>
					<td>{{ run.status }}</td>
					<td>{{ run.message }}</td>
				</tr>
			</tbody>
		</v-table>
	</v-card>
</template>
