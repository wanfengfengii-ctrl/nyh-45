import { createApp } from 'vue'
import {
  create,
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
  NNotificationProvider,
  NModal,
  NList,
  NListItem,
  NEmpty,
  NProgress,
  NDropdown,
  NRadio,
  NRadioGroup,
  NDatePicker,
  NForm,
  NFormItem,
  NUpload,
  NUploadDragger
} from 'naive-ui'
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
    NNotificationProvider,
    NModal,
    NList,
    NListItem,
    NEmpty,
    NProgress,
    NDropdown,
    NRadio,
    NRadioGroup,
    NDatePicker,
    NForm,
    NFormItem,
    NUpload,
    NUploadDragger
  ]
})

const app = createApp(App)
app.use(pinia)
app.use(naive)
app.mount('#app')
