import { ElectronAPI } from '@electron-toolkit/preload'
import type { TjmApi } from '../shared/contract'

declare global {
  interface Window {
    electron: ElectronAPI
    tjm: TjmApi
  }
}
