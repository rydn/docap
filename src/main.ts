import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { setupServiceWorker } from './registerSW'
import './assets/main.css'

setupServiceWorker()
createApp(App).use(createPinia()).mount('#app')
