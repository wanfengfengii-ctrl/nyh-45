declare global {
  interface Window {
    message: ReturnType<typeof import('naive-ui')['useMessage']> | null
    dialog: ReturnType<typeof import('naive-ui')['useDialog']> | null
  }
}

export {}
