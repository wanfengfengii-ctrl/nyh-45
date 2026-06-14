import { createApp } from 'vue'
import { create, NButton, NCard, NInput, NSelect, NCheckbox, NIcon, NSpace, NBadge, NTooltip, NSlider, NInputNumber, NDivider, NTag, NAlert, NDialogProvider, NMessageProvider, NNotificationProvider } from 'naive-ui'
import pinia from './stores'
import App from './App.vue'
import './style.css'

const naive = create({
  components: [
    NButton,
    NCard,
    NInput,
    NSelect,
    NCheckbox,
    NIcon,
    NSpace,
    NBadge,
    NTooltip,
    NSlider,
    NInputNumber,
    NDivider,
    NTag,
    NAlert,
    NDialogProvider,
    NMessageProvider,
    NNotificationProvider
  ]
})

const app = createApp(App)
app.use(pinia)
app.use(naive)
app.mount('#app')
