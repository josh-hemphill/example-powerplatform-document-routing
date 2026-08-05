import { PiniaColada } from '@pinia/colada';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { getApiBaseUrl } from './api/base-url';
import App from './App.vue';
import { client } from './client/client.gen';
import { vuetify } from './plugins/vuetify';
import { router } from './router';
import './styles/main.css';

client.setConfig({
	baseUrl: getApiBaseUrl(),
});

const app = createApp(App);

app.use(createPinia());
app.use(PiniaColada, {
	queryOptions: {
		// Keep inbox fresh while authors and approvers collaborate.
		staleTime: 10_000,
	},
});
app.use(router);
app.use(vuetify);

app.mount('#app');
