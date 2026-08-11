import { PiniaColada } from '@pinia/colada';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { assertProductionApiBaseUrl, getApiBaseUrl } from './api/base-url';
import { installPrincipalHeaderInterceptor } from './api/principal-header';
import App from './App.vue';
import { client } from './client/client.gen';
import { vuetify } from './plugins/vuetify';
import { router } from './router';
import { useIdentityStore } from './stores/identity';
import './styles/main.css';

const apiBaseUrl = getApiBaseUrl();
assertProductionApiBaseUrl(apiBaseUrl);

client.setConfig({
	baseUrl: apiBaseUrl,
});

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(PiniaColada, {
	queryOptions: {
		// Collaborative lists stay reasonably fresh without refetch storms.
		staleTime: 30_000,
	},
});
app.use(router);
app.use(vuetify);

installPrincipalHeaderInterceptor();
void useIdentityStore(pinia).ensureLoaded();

app.mount('#app');
